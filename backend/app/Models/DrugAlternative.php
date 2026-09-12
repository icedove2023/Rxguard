<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;



/**
 * DrugAlternative
 *
 * A safer alternative recommendation for a flagged interaction.
 */
class DrugAlternative extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'interaction_id', 'alternative_generic', 'alternative_brands',
        'reason', 'safety_advantage', 'availability',
    ];

    protected $casts = [
        'alternative_brands' => 'array',
        'created_at'         => 'datetime',
    ];

    public function interaction(): BelongsTo
    {
        return $this->belongsTo(DrugInteraction::class, 'interaction_id');
    }
}