<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

/**
 * AuditLog  —  immutable; never soft-deleted
 */
class AuditLog extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'user_id', 'action', 'resource_type', 'resource_id',
        'old_values', 'new_values', 'ip_address', 'user_agent',
        'session_id', 'status', 'metadata',
    ];

    protected $casts = [
        'old_values' => 'array',
        'new_values' => 'array',
        'metadata'   => 'array',
        'created_at' => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Convenience logger called throughout the application.
     */
    public static function record(
        string $action,
        ?int   $userId       = null,
        ?string $resourceType = null,
        ?int   $resourceId   = null,
        array  $metadata     = [],
        string $status       = 'success'
    ): self {
        return self::create([
            'user_id'       => $userId,
            'action'        => $action,
            'resource_type' => $resourceType,
            'resource_id'   => $resourceId,
            'ip_address'    => request()->ip(),
            'user_agent'    => request()->userAgent(),
            'status'        => $status,
            'metadata'      => $metadata,
        ]);
    }
}