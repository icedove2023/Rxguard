<?php

namespace App\Http\Middleware;

use App\Models\User;
use App\Services\SupabaseAuthService;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

/**
 * SupabaseAuth
 *
 * Replaces `auth:sanctum` for API routes now that Supabase Auth is the
 * source of truth for credentials. Verifies the Bearer token as a
 * Supabase access token (JWT), then resolves it to the local `users`
 * row via `supabase_id` so the rest of the app (roles, professional
 * profiles, prescriptions, etc.) keeps working unchanged.
 *
 * Also keeps `is_verified` / `email_verified_at` in sync with Supabase's
 * own confirmation status on every authenticated request.
 */
class SupabaseAuth
{
    public function __construct(private readonly SupabaseAuthService $supabase) {}

    public function handle(Request $request, Closure $next): Response
    {
        $token = $request->bearerToken();

        if (!$token) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Unauthenticated.',
            ], 401);
        }

        $claims = $this->supabase->verifyAccessToken($token);

        if (!$claims || empty($claims['sub'])) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Invalid or expired session. Please log in again.',
            ], 401);
        }

        $user = User::where('supabase_id', $claims['sub'])->first();

        if (!$user) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Account not found.',
            ], 401);
        }

        if (!$user->is_active) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Your account has been deactivated. Contact support@rxguard.ng',
            ], 403);
        }

        $this->syncEmailVerification($user, $claims);

        // Make $request->user() and Auth::user() work as before.
        Auth::setUser($user);
        $request->setUserResolver(fn () => $user);
        $request->attributes->set('supabase_access_token', $token);

        return $next($request);
    }

    private function syncEmailVerification(User $user, array $claims): void
    {
        $confirmedAt = $claims['email_confirmed_at'] ?? null;

        if ($confirmedAt && !$user->is_verified) {
            $user->forceFill([
                'is_verified'       => true,
                'email_verified_at' => $confirmedAt,
            ])->save();
        }
    }
}
