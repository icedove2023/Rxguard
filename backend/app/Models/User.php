<?php

namespace App\Models;


use App\Models\AuditLog;
use App\Models\BmiRecord;
use App\Models\ChatSession;
use App\Models\Notification;
use App\Models\Prescription;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Casts\Attribute;

/**
 * User Model
 *
 * @property int    $id
 * @property string $supabase_id  Links this row to its Supabase Auth identity
 * @property string $name
 * @property string $email
 * @property string $phone
 * @property string $role  consumer|pharmacist|physician|admin
 * @property bool   $is_verified
 * @property bool   $is_active
 */
class User extends Authenticatable
{
    use HasFactory, Notifiable;

    protected $fillable = [
        'supabase_id', 'name', 'email', 'phone', 'password', 'role',
        'avatar', 'is_verified', 'is_active',
        'email_verified_at', 'last_login_at', 'last_login_ip',
    ];

    protected $hidden = [
        'password', 'remember_token', 'supabase_id',
    ];

    protected $casts = [
        'email_verified_at' => 'datetime',
        'last_login_at'     => 'datetime',
        'is_verified'       => 'boolean',
        'is_active'         => 'boolean',
    ];

    // ----------------------------------------------------------------
    // Relationships
    // ----------------------------------------------------------------

    public function professionalProfile(): HasOne
    {
        return $this->hasOne(ProfessionalProfile::class);
    }

    public function prescriptions(): HasMany
    {
        return $this->hasMany(Prescription::class);
    }

    public function chatSessions(): HasMany
    {
        return $this->hasMany(ChatSession::class);
    }

    public function bmiRecords(): HasMany
    {
        return $this->hasMany(BmiRecord::class);
    }

    public function auditLogs(): HasMany
    {
        return $this->hasMany(AuditLog::class);
    }

    public function notifications(): HasMany
    {
        return $this->hasMany(Notification::class);
    }

    // ----------------------------------------------------------------
    // Role helpers
    // ----------------------------------------------------------------

    public function isAdmin(): bool
    {
        return $this->role === 'admin';
    }

    public function isPhysician(): bool
    {
        return $this->role === 'physician';
    }

    public function isPharmacist(): bool
    {
        return $this->role === 'pharmacist';
    }

    public function isConsumer(): bool
    {
        return $this->role === 'consumer';
    }

    public function isProfessional(): bool
    {
        return in_array($this->role, ['pharmacist', 'physician']);
    }

    public function hasVerifiedLicense(): bool
    {
        return $this->isProfessional()
            && $this->professionalProfile?->license_verified === true;
    }

    // ----------------------------------------------------------------
    // Accessors
    // ----------------------------------------------------------------

    protected function avatarUrl(): Attribute
    {
        return Attribute::make(
            get: fn () => $this->avatar
                ? asset('storage/' . $this->avatar)
                : 'https://ui-avatars.com/api/?name=' . urlencode($this->name) . '&background=0A4FA6&color=fff',
        );
    }

    // ----------------------------------------------------------------
    // Scopes
    // ----------------------------------------------------------------

    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }

    public function scopeByRole($query, string $role)
    {
        return $query->where('role', $role);
    }
}