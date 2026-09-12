<?php

namespace App\Services;

use App\Models\User;

/**
 * AuthService
 *
 * Shapes User models into safe API response arrays. Token issuance,
 * password reset, and credential verification are now handled by
 * Supabase Auth — see SupabaseAuthService and AuthController.
 */
class AuthService
{
    /**
     * Shape a User model into a safe API response array.
     * Never exposes password hash, internal flags, or the Supabase ID.
     */
    public function userResource(User $user): array
    {
        $resource = [
            'id'                => $user->id,
            'name'              => $user->name,
            'email'             => $user->email,
            'phone'             => $user->phone,
            'role'              => $user->role,
            'avatar_url'        => $user->avatar_url,
            'is_verified'       => $user->is_verified,
            'is_active'         => $user->is_active,
            'email_verified_at' => $user->email_verified_at?->toISOString(),
            'last_login_at'     => $user->last_login_at?->toISOString(),
            'created_at'        => $user->created_at->toISOString(),
        ];

        if ($user->relationLoaded('professionalProfile') && $user->professionalProfile) {
            $p = $user->professionalProfile;
            $resource['professional_profile'] = [
                'profession'       => $p->profession,
                'license_number'   => $p->license_number,
                'institution'      => $p->institution,
                'specialty'        => $p->specialty,
                'license_verified' => $p->license_verified,
                'verified_at'      => $p->verified_at?->toISOString(),
            ];
        }

        return $resource;
    }
}
