<?php


namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
/**
 * DrugInteraction
 *
 * Detected interaction between two drugs in a prescription.
 * Represents a known interaction between two drugs.
 * Data sourced from EMDEX and OpenFDA.
 */


class DrugInteraction extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'prescription_id', 'drug_a', 'drug_b', 'severity',
        'interaction_type', 'mechanism', 'clinical_effect',
        'recommendation', 'alternatives', 'source', 'evidence_level',
    ];

    protected $casts = [
        'alternatives' => 'array',
        'created_at'   => 'datetime',
    ];

    public function prescription(): BelongsTo
    {
        return $this->belongsTo(Prescription::class);
    }

    public function alternatives(): HasMany
    {
        return $this->hasMany(DrugAlternative::class, 'interaction_id');
    }

    /**
     * Severity badge color for UI rendering.
     */
    public function getSeverityColorAttribute(): string
    {
        return match ($this->severity) {
            'major', 'contraindicated' => 'red',
            'moderate'                 => 'amber',
            'minor'                    => 'green',
            default                    => 'gray',
        };
    }
}
