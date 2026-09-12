<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * PrescriptionDrug
 *
 * One drug line extracted from a prescription.
 * Enriched with EMDEX and OpenFDA data.
 */
class PrescriptionDrug extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'prescription_id', 'drug_name', 'generic_name', 'strength',
        'dosage_form', 'dose_instructions', 'duration', 'quantity',
        'route', 'emdex_drug_id', 'emdex_data', 'atc_code',
        'openfda_brands', 'dosage_valid', 'duration_valid',
        'has_warning', 'warning_text', 'sort_order',
    ];

    protected $casts = [
        'emdex_data'    => 'array',
        'openfda_brands'=> 'array',
        'dosage_valid'  => 'boolean',
        'duration_valid'=> 'boolean',
        'has_warning'   => 'boolean',
        'created_at'    => 'datetime',
    ];

    public function prescription(): BelongsTo
    {
        return $this->belongsTo(Prescription::class);
    }

    /**
     * Return the display name: generic if resolved, else original drug_name.
     */
    public function getDisplayNameAttribute(): string
    {
        return $this->generic_name ?? $this->drug_name;
    }

    /**
     * Return an array of Nigerian brand names from OpenFDA data.
     */
    public function getBrandNamesAttribute(): array
    {
        if (!$this->openfda_brands) return [];
        return array_column($this->openfda_brands, 'brand_name');
    }
}




