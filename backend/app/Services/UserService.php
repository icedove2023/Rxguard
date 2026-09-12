<?php


// ====================================================================
// UserService
// ====================================================================

namespace App\Services;

use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

/**
 * UserService
 *
 * Handles user profile management and avatar operations.
 */
class UserService
{
    /**
     * Build a complete user profile response array.
     */
    public function profile(User $user): array
    {
        $user->loadMissing(['professionalProfile', 'bmiRecords' => fn ($q) => $q->latest('recorded_at')->limit(1)]);

        $latestBmi = $user->bmiRecords->first();

        return [
            'id'          => $user->id,
            'name'        => $user->name,
            'email'       => $user->email,
            'phone'       => $user->phone,
            'role'        => $user->role,
            'avatar_url'  => $user->avatar_url,
            'is_verified' => $user->is_verified,
            'is_active'   => $user->is_active,
            'created_at'  => $user->created_at->toISOString(),
            'last_login'  => $user->last_login_at?->toISOString(),
            'professional' => $user->professionalProfile ? [
                'profession'       => $user->professionalProfile->profession,
                'license_number'   => $user->professionalProfile->license_number,
                'institution'      => $user->professionalProfile->institution,
                'specialty'        => $user->professionalProfile->specialty,
                'license_verified' => $user->professionalProfile->license_verified,
            ] : null,
            'latest_bmi' => $latestBmi ? [
                'bmi_value' => $latestBmi->bmi_value,
                'category'  => $latestBmi->category,
                'date'      => $latestBmi->recorded_at?->toDateString(),
            ] : null,
        ];
    }

    /**
     * Update editable profile fields.
     */
    public function updateProfile(User $user, array $data): User
    {
        $user->update(array_filter($data, fn ($v) => $v !== null));
        return $user->fresh();
    }

    /**
     * Store a new avatar image and update the user record.
     */
    public function updateAvatar(User $user, UploadedFile $file): User
    {
        // Delete old avatar if it exists
        if ($user->avatar) {
            Storage::disk('public')->delete($user->avatar);
        }

        $path = $file->store("avatars/{$user->id}", 'public');
        $user->update(['avatar' => $path]);

        return $user->fresh();
    }
}