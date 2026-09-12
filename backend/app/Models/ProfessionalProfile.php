<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * ProfessionalProfile
 * Extended data for pharmacist and physician users.
 */
class ProfessionalProfile extends Model
{
    protected $fillable = [
        'user_id', 'profession', 'license_number', 'institution',
        'specialty', 'license_verified', 'verified_by',
        'verification_note', 'nafdac_ref', 'mdcn_reg', 'verified_at',
    ];

    protected $casts = [
        'license_verified' => 'boolean',
        'verified_at'      => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function verifiedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'verified_by');
    }
}