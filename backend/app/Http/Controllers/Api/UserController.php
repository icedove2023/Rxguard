<?php

namespace App\Http\Controllers\Api;

use App\Models\AuditLog;
use App\Models\BmiRecord;
use App\Models\ChatSession;
use App\Services\DrugDatabaseService;
use App\Services\ChatbotService;
use App\Services\BmiService;
use App\Services\UserService;
use App\Services\SupabaseAuthService;
use App\Services\SupabaseAuthException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rules\Password;

// ====================================================================
// UserController
// GET    /api/profile            Get current user profile
// PUT    /api/profile            Update profile
// PUT    /api/password           Update password (delegated to Supabase Auth)
// DELETE /api/account            Delete user account (Supabase + local)
// POST   /api/profile/avatar     Update avatar
// GET    /api/notifications      Get notifications
// POST   /api/notifications/read Mark notifications read
// ====================================================================
class UserController extends Controller
{
    public function __construct(
        private readonly UserService $userService,
        private readonly SupabaseAuthService $supabase,
    ) {}

    public function profile(Request $request): JsonResponse
    {
        return response()->json([
            'status' => 'success',
            'data'   => $this->userService->profile($request->user()),
        ]);
    }

    public function updateProfile(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'name'  => ['sometimes', 'string', 'min:2', 'max:120'],
            'phone' => ['sometimes', 'nullable', 'string', 'regex:/^\+?[0-9]{10,15}$/'],
        ]);

        if ($validator->fails()) {
            return response()->json(['status' => 'error', 'errors' => $validator->errors()], 422);
        }

        $user = $this->userService->updateProfile($request->user(), $request->only(['name', 'phone']));

        return response()->json([
            'status'  => 'success',
            'message' => 'Profile updated.',
            'data'    => $this->userService->profile($user),
        ]);
    }

    // ----------------------------------------------------------------
    // PUT /api/password
    // ----------------------------------------------------------------
    /**
     * Change the current user's password via Supabase Auth.
     * Re-verifies the current password by attempting a Supabase sign-in
     * before applying the change (Supabase — not this app — now owns
     * credential storage).
     */
    public function updatePassword(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'current_password' => ['required', 'string'],
            'password' => ['required', 'confirmed', Password::min(8)->letters()->mixedCase()->numbers()],
        ]);

        if ($validator->fails()) {
            return response()->json([
                'status' => 'error',
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        $user = $request->user();

        // Verify current password against Supabase.
        try {
            $this->supabase->signInWithPassword($user->email, $request->current_password);
        } catch (SupabaseAuthException) {
            return response()->json([
                'status' => 'error',
                'message' => 'Current password is incorrect',
            ], 422);
        }

        $accessToken = $request->attributes->get('supabase_access_token') ?? $request->bearerToken();

        try {
            $this->supabase->updateUserPassword($accessToken, $request->password);
        } catch (SupabaseAuthException $e) {
            return response()->json([
                'status'  => 'error',
                'message' => $e->getMessage(),
            ], 422);
        }

        AuditLog::record(
            action: 'user.password.update',
            userId: $user->id,
            resourceType: 'User',
            resourceId: $user->id,
            metadata: ['action' => 'password_changed']
        );

        // Revoke every session (including this one) so a stolen old
        // token can't keep being used. Client must re-authenticate.
        $this->supabase->signOut($accessToken, scope: 'global');

        return response()->json([
            'status' => 'success',
            'message' => 'Password updated successfully. Please log in again.',
        ]);
    }

    // ----------------------------------------------------------------
    // DELETE /api/account
    // ----------------------------------------------------------------
    /**
     * Delete the current user's account: removes the Supabase Auth
     * identity (via the admin API) and the local record.
     */
    public function deleteAccount(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'password' => ['required', 'string'],
            'reason' => ['nullable', 'string', 'max:500'],
        ]);

        if ($validator->fails()) {
            return response()->json([
                'status' => 'error',
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        $user = $request->user();

        // Verify password against Supabase before allowing deletion.
        try {
            $this->supabase->signInWithPassword($user->email, $request->password);
        } catch (SupabaseAuthException) {
            return response()->json([
                'status' => 'error',
                'message' => 'Password is incorrect',
            ], 422);
        }

        AuditLog::record(
            action: 'user.account.deleted',
            userId: $user->id,
            resourceType: 'User',
            resourceId: $user->id,
            metadata: [
                'reason' => $request->reason,
                'email' => $user->email,
                'deleted_at' => now()->toISOString()
            ]
        );

        if ($user->supabase_id) {
            try {
                $this->supabase->adminDeleteUser($user->supabase_id);
            } catch (SupabaseAuthException $e) {
                return response()->json([
                    'status'  => 'error',
                    'message' => 'Could not delete account. Please try again or contact support.',
                ], 500);
            }
        }

        $user->forceDelete();

        return response()->json([
            'status' => 'success',
            'message' => 'Account deleted successfully.',
        ]);
    }

    public function uploadAvatar(Request $request): JsonResponse
    {
        $request->validate([
            'avatar' => ['required', 'image', 'mimes:jpg,jpeg,png,webp', 'max:2048'],
        ]);

        $user = $this->userService->updateAvatar($request->user(), $request->file('avatar'));

        return response()->json([
            'status'    => 'success',
            'message'   => 'Avatar updated.',
            'avatar_url'=> $user->avatar_url,
        ]);
    }

    public function notifications(Request $request): JsonResponse
    {
        $notifications = $request->user()->notifications()
            ->orderByDesc('created_at')
            ->paginate(20);

        return response()->json(['status' => 'success', 'data' => $notifications]);
    }

    public function markNotificationsRead(Request $request): JsonResponse
    {
        $request->user()->notifications()
            ->whereNull('read_at')
            ->update(['read_at' => now()]);

        return response()->json(['status' => 'success', 'message' => 'Notifications marked as read.']);
    }
}