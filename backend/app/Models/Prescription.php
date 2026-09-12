<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Casts\Attribute;

/**
 * Prescription
 *
 * Master record for a prescription scan.
 * Tracks the full pipeline: upload → OCR → validation → report.
 */
class Prescription extends Model
{
    protected $fillable = [
        'user_id', 'reviewed_by', 'scan_path', 'file_type',
        'raw_ocr_text', 'ocr_engine', 'suggested_text', 'suggested_fields',
        'approved_text', 'edit_source', 'approved_at',
        'extracted_fields', 'safety_score',
        'completeness_score', 'status', 'patient_name',
        'patient_age', 'patient_gender', 'prescription_date',
        'prescriber_name', 'prescriber_reg_no', 'prescriber_hospital',
        'prescriber_contact', 'gemini_request_id', 'gemini_model',
        'ocr_confidence', 'has_interactions', 'has_errors',
        'is_archived', 'notes','reviewed_by', 'reviewed_at', 'review_status', 'review_notes',
    'flag_reason', 'flagged_by', 'flagged_at',
    ];

    protected $casts = [
        'extracted_fields'  => 'array',
        'suggested_fields'  => 'array',
        'approved_at'       => 'datetime',
        'prescription_date' => 'date',
        'safety_score'      => 'float',
        'completeness_score'=> 'float',
        'ocr_confidence'    => 'float',
        'has_interactions'  => 'boolean',
        'has_errors'        => 'boolean',
        'is_archived'       => 'boolean',
    ];

    // ----------------------------------------------------------------
    // Relationships
    // ----------------------------------------------------------------

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }

    public function drugs(): HasMany
    {
        return $this->hasMany(PrescriptionDrug::class)->orderBy('sort_order');
    }

    public function interactions(): HasMany
    {
        return $this->hasMany(DrugInteraction::class);
    }

    
        
    public function flagger()
    {
    return $this->belongsTo(User::class, 'flagged_by');
    }
    // ----------------------------------------------------------------
    // Accessors
    // ----------------------------------------------------------------

    protected function safetyLabel(): Attribute
    {
        return Attribute::make(get: function () {
            $score = $this->safety_score;
            if ($score === null) return 'Pending';
            if ($score >= 90) return 'Safe';
            if ($score >= 70) return 'Review Needed';
            return 'Flagged';
        });
    }

    protected function safetyColor(): Attribute
    {
        return Attribute::make(get: function () {
            $score = $this->safety_score;
            if ($score === null) return 'gray';
            if ($score >= 90) return 'green';
            if ($score >= 70) return 'amber';
            return 'red';
        });
    }

    protected function scanUrl(): Attribute
    {
        // The scan lives on the PRIVATE disk (contains PHI) — never a
        // public/storage path. Route through an authenticated,
        // ownership-checked download endpoint instead.
        return Attribute::make(
            get: fn () => route('api.v1.prescriptions.scan', ['id' => $this->id])
        );
    }

    // ----------------------------------------------------------------
    // Scopes
    // ----------------------------------------------------------------

    public function scopeForUser($query, int $userId)
    {
        return $query->where('user_id', $userId);
    }

    public function scopeCompleted($query)
    {
        return $query->where('status', 'completed');
    }

    public function scopeWithInteractions($query)
    {
        return $query->where('has_interactions', true);
    }

    public function scopeRecent($query, int $days = 30)
    {
        return $query->where('created_at', '>=', now()->subDays($days));
    }
}