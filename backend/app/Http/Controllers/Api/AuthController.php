<?php

namespace App\Http\Controllers\Api;

use App\Models\User;
use App\Models\ProfessionalProfile;
use App\Models\AuditLog;
use App\Services\AuthService;
use App\Services\SupabaseAuthService;
use App\Services\SupabaseAuthException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules\Password;
use Illuminate\Support\Facades\DB;

/**
 * AuthController
 *
 * Handles all authentication flows. Credentials, email verification,
 * password reset, and password change are delegated to Supabase Auth
 * (GoTrue) — Supabase sends the actual emails via Resend SMTP configured
 * in the project dashboard. The local `users` table remains the source
 * of truth for app data (role, professional profile, etc.) and is linked
 * to its Supabase identity via `supabase_id`.
 *
 *   POST /api/register
 *   POST /api/login
 *   POST /api/logout
 *   POST /api/logout-all
 *   POST /api/refresh
 *   POST /api/forgot-password
 *   POST /api/reset-password
 *   GET  /api/me
 */
class AuthController extends Controller
{
    public function __construct(
        private readonly AuthService $authService,
        private readonly SupabaseAuthService $supabase,
    ) {}

    // ----------------------------------------------------------------
    // POST /api/register
    // ----------------------------------------------------------------
    public function register(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'name'           => ['required', 'string', 'min:2', 'max:120'],
            'email'          => ['required', 'email:rfc,dns', 'unique:users,email', 'max:180'],
            'phone'          => ['nullable', 'string', 'regex:/^\+?[0-9]{10,15}$/'],
            'password'       => ['required', 'confirmed', Password::min(8)->letters()->mixedCase()->numbers()],
            'role'           => ['required', 'in:consumer,pharmacist,physician'],
            // Professional-only fields
            'license_number' => ['required_if:role,pharmacist,physician', 'string', 'max:60'],
            'institution'    => ['required_if:role,pharmacist,physician', 'string', 'max:255'],
            'specialty'      => ['nullable', 'string', 'max:120'],
            // Which pre-configured redirect URL Supabase should use for the
            // confirmation email link — never a free-form URL from the client.
            'client'         => ['nullable', 'in:web,mobile'],
        ]);

        if ($validator->fails()) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Validation failed',
                'errors'  => $validator->errors(),
            ], 422);
        }

        // Create the identity in Supabase Auth first — this is what
        // triggers the confirmation email (via Resend). If this fails
        // (e.g. email already registered on the Supabase side, weak
        // password per Supabase's own policy), nothing local is created.
        try {
            $signUp = $this->supabase->signUp($request->email, $request->password, [
                'name' => $request->name,
                'role' => $request->role,
            ], $request->input('client', 'web'));
        } catch (SupabaseAuthException $e) {
            return response()->json([
                'status'  => 'error',
                'message' => $e->getMessage(),
            ], $e->getStatusCode() === 400 ? 422 : $e->getStatusCode());
        }

        $supabaseUser = $signUp['user'] ?? null;

        if (!$supabaseUser || empty($supabaseUser['id'])) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Registration failed. Please try again.',
            ], 500);
        }

        try {
            DB::beginTransaction();

            $user = User::create([
                'supabase_id' => $supabaseUser['id'],
                'name'        => $request->name,
                'email'       => $request->email,
                'phone'       => $request->phone,
                // Real credential verification now happens in Supabase.
                // This local hash is random and never used to authenticate.
                'password'    => Hash::make(Str::random(40)),
                'role'        => $request->role,
                'is_verified' => (bool) ($supabaseUser['email_confirmed_at'] ?? false),
            ]);

            if (in_array($request->role, ['pharmacist', 'physician'])) {
                ProfessionalProfile::create([
                    'user_id'        => $user->id,
                    'profession'     => $request->role,
                    'license_number' => $request->license_number,
                    'institution'    => $request->institution,
                    'specialty'      => $request->specialty,
                ]);
            }

            AuditLog::record('user.register', $user->id, 'User', $user->id);

            DB::commit();
        } catch (\Throwable $e) {
            DB::rollBack();
            report($e);

            // Roll back the Supabase-side account too so the person can retry.
            try {
                $this->supabase->adminDeleteUser($supabaseUser['id']);
            } catch (\Throwable) {
                // Non-fatal — worst case an orphaned Supabase user remains.
            }

            return response()->json([
                'status'  => 'error',
                'message' => 'Registration failed. Please try again.',
            ], 500);
        }

        // Supabase's session is only issued immediately if the project has
        // email confirmations disabled. Otherwise the user must click the
        // confirmation link before they can log in.
        $session = $signUp['session'] ?? null;

        if ($session && !empty($session['access_token'])) {
            $user->update(['last_login_at' => now(), 'last_login_ip' => $request->ip()]);

            return response()->json([
                'status'  => 'success',
                'message' => 'Account created successfully.',
                'data'    => [
                    'user'          => $this->authService->userResource($user),
                    'access_token'  => $session['access_token'],
                    'refresh_token' => $session['refresh_token'] ?? null,
                    'token_type'    => 'Bearer',
                    'expires_in'    => $session['expires_in'] ?? null,
                ],
            ], 201);
        }

        return response()->json([
            'status'  => 'success',
            'message' => 'Account created. Please check your email to confirm your address before logging in.',
            'data'    => [
                'user'                => $this->authService->userResource($user),
                'requires_confirmation' => true,
            ],
        ], 201);
    }

    // ----------------------------------------------------------------
    // POST /api/login
    // ----------------------------------------------------------------
    public function login(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'email'    => ['required', 'email'],
            'password' => ['required', 'string'],
        ]);

        if ($validator->fails()) {
            return response()->json([
                'status' => 'error',
                'errors' => $validator->errors(),
            ], 422);
        }

        try {
            $result = $this->supabase->signInWithPassword($request->email, $request->password);
        } catch (SupabaseAuthException $e) {
            AuditLog::record('user.login.failed', null, 'User', null, [
                'email' => $request->email,
            ], 'failure');

            if (str_contains(strtolower($e->getMessage()), 'confirm')) {
                return response()->json([
                    'status'  => 'error',
                    'message' => 'Please confirm your email address before logging in. Check your inbox, or request a new confirmation link.',
                    'code'    => 'email_not_confirmed',
                ], 403);
            }

            $status = in_array($e->getStatusCode(), [400, 401]) ? 401 : $e->getStatusCode();

            return response()->json([
                'status'  => 'error',
                'message' => $status === 401 ? 'Invalid email or password.' : $e->getMessage(),
            ], $status);
        }

        $supabaseUser = $result['user'] ?? null;

        if (!$supabaseUser) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Login failed. Please try again.',
            ], 500);
        }

        // Resolve (or backfill) the matching local user.
        $user = User::where('supabase_id', $supabaseUser['id'])->first();

        if (!$user) {
            // Handles accounts created before Supabase wiring, or edge
            // cases where the two records drifted apart — link by email.
            $user = User::where('email', $request->email)->first();

            if ($user) {
                $user->update(['supabase_id' => $supabaseUser['id']]);
            }
        }

        if (!$user) {
            return response()->json([
                'status'  => 'error',
                'message' => 'No matching account found. Please contact support.',
            ], 404);
        }

        if (!$user->is_active) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Your account has been deactivated. Contact support@rxguard.ng',
            ], 403);
        }

        $emailConfirmed = (bool) ($supabaseUser['email_confirmed_at'] ?? false);

        $user->update([
            'last_login_at'     => now(),
            'last_login_ip'     => $request->ip(),
            'is_verified'       => $emailConfirmed,
            'email_verified_at' => $emailConfirmed ? ($supabaseUser['email_confirmed_at'] ?? now()) : null,
        ]);

        AuditLog::record('user.login', $user->id, 'User', $user->id);

        return response()->json([
            'status'  => 'success',
            'message' => 'Login successful.',
            'data'    => [
                'user'          => $this->authService->userResource($user->fresh()),
                'access_token'  => $result['access_token'],
                'refresh_token' => $result['refresh_token'] ?? null,
                'token_type'    => 'Bearer',
                'expires_in'    => $result['expires_in'] ?? null,
            ],
        ]);
    }

    // ----------------------------------------------------------------
    // POST /api/logout
    // ----------------------------------------------------------------
    public function logout(Request $request): JsonResponse
    {
        $token = $request->attributes->get('supabase_access_token') ?? $request->bearerToken();

        if ($token) {
            $this->supabase->signOut($token);
        }

        AuditLog::record('user.logout', $request->user()->id);

        return response()->json([
            'status'  => 'success',
            'message' => 'Logged out successfully.',
        ]);
    }

    // ----------------------------------------------------------------
    // POST /api/logout-all
    // ----------------------------------------------------------------
    // Signs out every *other* session but keeps the current one active,
    // matching the "Sign Out All Other Devices" button in the UI.
    public function logoutAllDevices(Request $request): JsonResponse
    {
        $token = $request->attributes->get('supabase_access_token') ?? $request->bearerToken();

        if ($token) {
            $this->supabase->signOut($token, scope: 'others');
        }

        AuditLog::record('user.logout.all', $request->user()->id, 'User', $request->user()->id, [
            'action' => 'logged_out_other_devices',
        ]);

        return response()->json([
            'status'  => 'success',
            'message' => 'Signed out of all other devices successfully.',
        ]);
    }

    // ----------------------------------------------------------------
    // POST /api/refresh
    // ----------------------------------------------------------------
    public function refreshToken(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'refresh_token' => ['required', 'string'],
        ]);

        if ($validator->fails()) {
            return response()->json(['status' => 'error', 'errors' => $validator->errors()], 422);
        }

        try {
            $result = $this->supabase->refreshToken($request->refresh_token);
        } catch (SupabaseAuthException $e) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Session expired. Please log in again.',
            ], 401);
        }

        return response()->json([
            'status'  => 'success',
            'message' => 'Token refreshed successfully',
            'data'    => [
                'access_token'  => $result['access_token'],
                'refresh_token' => $result['refresh_token'] ?? null,
                'token_type'    => 'Bearer',
                'expires_in'    => $result['expires_in'] ?? null,
            ],
        ]);
    }

    // ----------------------------------------------------------------
    // GET /api/me
    // ----------------------------------------------------------------
    public function me(Request $request): JsonResponse
    {
        $user = $request->user()->load('professionalProfile');

        return response()->json([
            'status' => 'success',
            'data'   => $this->authService->userResource($user),
        ]);
    }

    // ----------------------------------------------------------------
    // POST /api/forgot-password
    // ----------------------------------------------------------------
    public function forgotPassword(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'email'  => ['required', 'email'],
            'client' => ['nullable', 'in:web,mobile'],
        ]);

        if ($validator->fails()) {
            return response()->json(['status' => 'error', 'errors' => $validator->errors()], 422);
        }

        // Supabase sends the recovery email (via Resend). Fire-and-forget
        // regardless of outcome to avoid leaking whether the email exists.
        $this->supabase->sendPasswordResetEmail($request->email, $request->input('client', 'web'));

        AuditLog::record('user.password.forgot', null, 'User', null, [
            'email' => $request->email,
        ]);

        return response()->json([
            'status'  => 'success',
            'message' => 'If your email exists, a password reset link has been sent.',
        ]);
    }

    // ----------------------------------------------------------------
    // POST /api/auth/resend-confirmation
    // ----------------------------------------------------------------
    public function resendConfirmation(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'email'  => ['required', 'email'],
            'client' => ['nullable', 'in:web,mobile'],
        ]);

        if ($validator->fails()) {
            return response()->json(['status' => 'error', 'errors' => $validator->errors()], 422);
        }

        $this->supabase->resendConfirmation($request->email, $request->input('client', 'web'));

        AuditLog::record('user.email.resend', null, 'User', null, [
            'email' => $request->email,
        ]);

        return response()->json([
            'status'  => 'success',
            'message' => 'If your email exists and is unconfirmed, a new confirmation link has been sent.',
        ]);
    }

    // ----------------------------------------------------------------
    // POST /api/reset-password
    // ----------------------------------------------------------------
    // The frontend's auth-callback page extracts `access_token` from the
    // Supabase recovery link's URL fragment and submits it here along
    // with the new password.
    // ----------------------------------------------------------------
    public function resetPassword(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'access_token' => ['required', 'string'],
            'password'     => ['required', 'confirmed', Password::min(8)->letters()->mixedCase()->numbers()],
        ]);

        if ($validator->fails()) {
            return response()->json(['status' => 'error', 'errors' => $validator->errors()], 422);
        }

        try {
            $this->supabase->updateUserPassword($request->access_token, $request->password);
            $supabaseUser = $this->supabase->getUser($request->access_token);
        } catch (SupabaseAuthException $e) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Invalid or expired reset link. Please request a new one.',
            ], 422);
        }

        $user = User::where('supabase_id', $supabaseUser['id'] ?? null)->first();

        if ($user) {
            AuditLog::record('user.password.reset', $user->id, 'User', $user->id);
        }

        return response()->json([
            'status'  => 'success',
            'message' => 'Password reset successfully. Please log in.',
        ]);
    }
}
