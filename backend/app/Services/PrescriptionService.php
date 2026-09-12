<?php

namespace App\Services;

use App\Models\Prescription;
use App\Models\PrescriptionDrug;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;


/**
 * PrescriptionService
 *
 * Orchestrates the full prescription processing pipeline after OCR:
 *   1. extractFields()      — Gemini parses raw OCR text into structured data
 *   2. enrichDrugs()        — EMDEX + OpenFDA lookups per drug
 *   3. calculateScores()    — Safety score + completeness score
 *   4. fullReport()         — Assemble the complete JSON report
 */
class PrescriptionService
{
    private string $apiKey;
    private string $chatModel;
    private string $apiBase = 'https://generativelanguage.googleapis.com/v1beta';

    public function __construct(
        private readonly DrugDatabaseService $drugDbService
    ) {
        $this->apiKey    = config('services.gemini.api_key');
        $this->chatModel = config('services.gemini.chat_model', 'gemini-flash-latest');
    }

    // ----------------------------------------------------------------
    // 1. Extract structured fields from raw OCR text via Gemini
    // ----------------------------------------------------------------

    /**
     * Parse raw OCR text into a structured prescription object.
     *
     * @return array{
     *   patient_name: ?string,
     *   patient_age: ?int,
     *   patient_gender: ?string,
     *   date: ?string,
     *   prescriber_name: ?string,
     *   prescriber_reg: ?string,
     *   prescriber_hospital: ?string,
     *   drugs: array,
     *   raw_issues: array,
     * }
     */
    public function extractFields(string $ocrText): array
    {
        $prompt = $this->buildExtractionPrompt($ocrText);

        $response = Http::withHeaders(['Content-Type' => 'application/json'])
            ->timeout(45)
            ->post(
                "{$this->apiBase}/models/{$this->chatModel}:generateContent?key={$this->apiKey}",
                [
                    'contents' => [['parts' => [['text' => $prompt]]]],
                    'generationConfig' => [
                        'temperature'     => 0.1,
                        'maxOutputTokens' => 2048,
                        'responseMimeType'=> 'application/json',
                    ],
                ]
            );

        if ($response->failed()) {
            Log::error('Gemini extraction failed', ['status' => $response->status()]);
            return $this->emptyExtraction();
        }

        $raw = $response->json('candidates.0.content.parts.0.text', '{}');

        try {
            return json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            Log::warning('Gemini extraction returned non-JSON', ['raw' => substr($raw, 0, 200)]);
            return $this->emptyExtraction();
        }
    }

    // ----------------------------------------------------------------
    // 1a. Gemini suggests corrections/cleansing of raw Tesseract text
    // ----------------------------------------------------------------

    /**
     * Given noisy raw OCR text, ask Gemini to suggest a cleaned-up
     * version PLUS a structured field preview. This is a *suggestion
     * only* — nothing is validated or persisted as final until the
     * user reviews and approves (see PrescriptionController::confirm).
     *
     * @return array{corrected_text: string, fields: array, notes: array, model: string, request_id: string}
     */
    public function suggestCorrections(string $rawText): array
    {
        $prompt = $this->buildSuggestionPrompt($rawText);

        $response = Http::withHeaders(['Content-Type' => 'application/json'])
            ->timeout(45)
            ->post(
                "{$this->apiBase}/models/{$this->chatModel}:generateContent?key={$this->apiKey}",
                [
                    'contents' => [['parts' => [['text' => $prompt]]]],
                    'generationConfig' => [
                        'temperature'      => 0.1,
                        'maxOutputTokens'  => 2048,
                        'responseMimeType' => 'application/json',
                    ],
                ]
            );

        if ($response->failed()) {
            Log::error('Gemini suggestion failed', ['status' => $response->status()]);
            throw new \RuntimeException('Gemini suggestion service is temporarily unavailable.');
        }

        $raw = $response->json('candidates.0.content.parts.0.text', '{}');
        $requestId = $response->json('responseId') ?? uniqid('gemini_', true);

        try {
            $parsed = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            Log::warning('Gemini suggestion returned non-JSON', ['raw' => substr($raw, 0, 200)]);
            $parsed = [];
        }

        return [
            'corrected_text' => $parsed['corrected_text'] ?? $rawText,
            'fields'         => $parsed['fields'] ?? $this->emptyExtraction(),
            'notes'          => $parsed['notes'] ?? [],
            'model'          => $this->chatModel,
            'request_id'     => (string) $requestId,
        ];
    }

    // ----------------------------------------------------------------
    // 2. Enrich each extracted drug via EMDEX + OpenFDA
    // ----------------------------------------------------------------

    /**
     * For each drug in $drugList:
     *   - Resolve generic name via EMDEX
     *   - Fetch monograph (indications, dosage, contraindications, etc.)
     *   - Fetch Nigerian brands via OpenFDA
     *   - Persist as PrescriptionDrug rows
     */
    public function enrichDrugs(Prescription $prescription, array $drugList): array
    {
        $enriched = [];

        foreach ($drugList as $index => $drug) {
            $drugName = $drug['name'] ?? $drug['drug_name'] ?? null;

            if (!$drugName) continue;

            // Query EMDEX + OpenFDA (uses internal cache)
            $lookup = $this->drugDbService->lookup($drugName);
            $brands = $this->drugDbService->getBrands($drugName);

            $pdrug = PrescriptionDrug::create([
                'prescription_id' => $prescription->id,
                'drug_name'       => $drugName,
                'generic_name'    => $lookup['generic_name'] ?? null,
                'strength'        => $drug['strength'] ?? null,
                'dosage_form'     => $drug['dosage_form'] ?? null,
                'dose_instructions'=> $drug['dose_instructions'] ?? $drug['instructions'] ?? null,
                'duration'        => $drug['duration'] ?? null,
                'quantity'        => $drug['quantity'] ?? null,
                'route'           => $drug['route'] ?? 'oral',
                'emdex_drug_id'   => $lookup['emdex_id'] ?? null,
                'emdex_data'      => $lookup['monograph'] ?? null,
                'atc_code'        => $lookup['atc_code'] ?? null,
                'openfda_brands'  => $brands,
                'sort_order'      => $index,
            ]);

            $enriched[] = $pdrug;
        }

        return $enriched;
    }

    // ----------------------------------------------------------------
    // 3. Calculate safety + completeness scores
    // ----------------------------------------------------------------

    /**
     * Score the prescription on two dimensions:
     *
     * Completeness (0-100): checks for mandatory fields present
     * Safety (0-100): starts at 100, deducted per detected issue severity
     */
    public function calculateScores(Prescription $prescription, array $extracted): array
    {
        // ---- Completeness scoring ----
        $completenessFields = [
            'patient_name'       => 10,
            'date'               => 10,
            'prescriber_name'    => 15,
            'prescriber_reg'     => 15,
            'prescriber_hospital'=> 10,
        ];

        $completenessScore = 0;
        foreach ($completenessFields as $field => $weight) {
            if (!empty($extracted[$field])) {
                $completenessScore += $weight;
            }
        }

        // Drugs present and have instructions
        $drugs = $extracted['drugs'] ?? [];
        if (count($drugs) > 0) {
            $completenessScore += 20;

            $drugsWithInstructions = array_filter($drugs, fn ($d) =>
                !empty($d['dose_instructions']) || !empty($d['instructions'])
            );
            if (count($drugsWithInstructions) === count($drugs)) {
                $completenessScore += 20;
            }
        }

        $completenessScore = min(100, $completenessScore);

        // ---- Safety scoring ----
        $safetyScore   = 100.0;
        $interactions  = $prescription->interactions;

        foreach ($interactions as $interaction) {
            $safetyScore -= match ($interaction->severity) {
                'contraindicated' => 30,
                'major'           => 20,
                'moderate'        => 10,
                'minor'           => 4,
                default           => 2,
            };
        }

        // Deduct for completeness gaps
        $safetyScore -= (100 - $completenessScore) * 0.15;
        $safetyScore  = max(0, round($safetyScore, 2));

        return [
            'safety'       => $safetyScore,
            'completeness' => (float) $completenessScore,
        ];
    }

    // ----------------------------------------------------------------
    // 4. Assemble the full report response
    // ----------------------------------------------------------------

    public function fullReport(Prescription $prescription): array
    {
        $prescription->loadMissing(['drugs', 'interactions.alternatives', 'user:id,name,email']);

        return [
            'id'                 => $prescription->id,
            'status'             => $prescription->status,
            'safety_score'       => $prescription->safety_score,
            'completeness_score' => $prescription->completeness_score,
            'safety_label'       => $prescription->safety_label,
            'safety_color'       => $prescription->safety_color,
            'ocr_confidence'     => $prescription->ocr_confidence,
            'ocr_engine'         => $prescription->ocr_engine,
            'raw_ocr_text'       => $prescription->raw_ocr_text,
            'suggested_text'     => $prescription->suggested_text,
            'suggested_fields'   => $prescription->suggested_fields,
            'approved_text'      => $prescription->approved_text,
            'edit_source'        => $prescription->edit_source,
            'file_type'          => $prescription->file_type,
            'scan_url'           => $prescription->scan_url,

            'patient' => [
                'name'   => $prescription->patient_name,
                'age'    => $prescription->patient_age,
                'gender' => $prescription->patient_gender,
            ],

            'prescriber' => [
                'name'     => $prescription->prescriber_name,
                'reg_no'   => $prescription->prescriber_reg_no,
                'hospital' => $prescription->prescriber_hospital,
                'contact'  => $prescription->prescriber_contact,
            ],

            'prescription_date' => $prescription->prescription_date?->toDateString(),

            'drugs' => $prescription->drugs->map(fn (PrescriptionDrug $d) => [
                'id'               => $d->id,
                'drug_name'        => $d->drug_name,
                'generic_name'     => $d->generic_name,
                'display_name'     => $d->display_name,
                'strength'         => $d->strength,
                'dosage_form'      => $d->dosage_form,
                'dose_instructions'=> $d->dose_instructions,
                'duration'         => $d->duration,
                'quantity'         => $d->quantity,
                'route'            => $d->route,
                'atc_code'         => $d->atc_code,
                'has_warning'      => $d->has_warning,
                'warning_text'     => $d->warning_text,
                'brands'           => $d->brand_names,
                'emdex_summary'    => $this->summarizeMonograph($d->emdex_data),
            ]),

            'interactions' => $prescription->interactions->map(fn ($i) => [
                'id'               => $i->id,
                'drug_a'           => $i->drug_a,
                'drug_b'           => $i->drug_b,
                'severity'         => $i->severity,
                'severity_color'   => $i->severity_color,
                'interaction_type' => $i->interaction_type,
                'mechanism'        => $i->mechanism,
                'clinical_effect'  => $i->clinical_effect,
                'recommendation'   => $i->recommendation,
                'evidence_level'   => $i->evidence_level,
                'source'           => $i->source,
                'alternatives'     => $i->alternatives->map(fn ($a) => [
                    'generic'          => $a->alternative_generic,
                    'brands'           => $a->alternative_brands,
                    'reason'           => $a->reason,
                    'safety_advantage' => $a->safety_advantage,
                    'availability'     => $a->availability,
                ]),
            ]),

            'flags' => [
                'has_interactions' => $prescription->has_interactions,
                'has_errors'       => $prescription->has_errors,
            ],

            'gemini_meta' => [
                'model'      => $prescription->gemini_model,
                'request_id' => $prescription->gemini_request_id,
            ],

            'created_at' => $prescription->created_at->toISOString(),
            'updated_at' => $prescription->updated_at->toISOString(),
        ];
    }

    // ----------------------------------------------------------------
    // Private helpers
    // ----------------------------------------------------------------

    private function buildExtractionPrompt(string $ocrText): string
    {
        return <<<PROMPT
You are a clinical pharmacist AI extracting structured data from a Nigerian prescription.

RAW OCR TEXT:
{$ocrText}

Extract and return ONLY a valid JSON object with this exact structure:
{
  "patient_name": "string or null",
  "patient_age": number_or_null,
  "patient_gender": "male|female|other|null",
  "date": "YYYY-MM-DD or null",
  "prescriber_name": "string or null",
  "prescriber_reg": "string or null",
  "prescriber_hospital": "string or null",
  "prescriber_contact": "string or null",
  "drugs": [
    {
      "name": "drug name as written",
      "strength": "e.g. 500mg",
      "dosage_form": "tablet|capsule|syrup|injection|etc",
      "dose_instructions": "e.g. 1 tab BD x 7 days",
      "duration": "e.g. 7 days",
      "quantity": "e.g. 14 tablets",
      "route": "oral|iv|topical|etc"
    }
  ],
  "raw_issues": ["list of any unclear or missing items detected"]
}

Return ONLY the JSON. No markdown, no explanation, no prefix text.
PROMPT;
    }

    private function buildSuggestionPrompt(string $rawText): string
    {
        return <<<PROMPT
You are a pharmacist assistant reviewing raw OCR output from a scanned
Nigerian prescription. The text below came from an open-source OCR
engine (Tesseract) and may contain misreads, spacing errors, or
garbled characters — especially in drug names, dosages, and numbers.

RAW OCR TEXT:
{$rawText}

Your job is ONLY to suggest a cleaned-up, corrected version of this
text and a best-guess structured breakdown. You are NOT validating
drug safety or interactions — that happens later. Do not invent
information that isn't plausibly present in the raw text; where the
raw text is genuinely ambiguous, keep your correction conservative
and add a note instead of guessing.

Return ONLY a valid JSON object with this exact structure:
{
  "corrected_text": "the full corrected prescription text, human readable",
  "fields": {
    "patient_name": "string or null",
    "patient_age": number_or_null,
    "patient_gender": "male|female|other|null",
    "date": "YYYY-MM-DD or null",
    "prescriber_name": "string or null",
    "prescriber_reg": "string or null",
    "prescriber_hospital": "string or null",
    "prescriber_contact": "string or null",
    "drugs": [
      {
        "name": "corrected drug name",
        "strength": "e.g. 500mg",
        "dosage_form": "tablet|capsule|syrup|injection|etc",
        "dose_instructions": "e.g. 1 tab BD x 7 days",
        "duration": "e.g. 7 days",
        "quantity": "e.g. 14 tablets",
        "route": "oral|iv|topical|etc"
      }
    ]
  },
  "notes": ["short notes on anything you corrected or found ambiguous"]
}

Return ONLY the JSON. No markdown, no explanation, no prefix text.
PROMPT;
    }

    private function emptyExtraction(): array
    {
        return [
            'patient_name'       => null,
            'patient_age'        => null,
            'patient_gender'     => null,
            'date'               => null,
            'prescriber_name'    => null,
            'prescriber_reg'     => null,
            'prescriber_hospital'=> null,
            'prescriber_contact' => null,
            'drugs'              => [],
            'raw_issues'         => ['OCR extraction failed'],
        ];
    }

    private function summarizeMonograph(?array $data): ?array
    {
        if (!$data) return null;

        return [
            'indication'          => $data['indication'] ?? null,
            'pregnancy_category'  => $data['pregnancy_category'] ?? null,
            'common_side_effects' => array_slice($data['side_effects'] ?? [], 0, 3),
            'major_warnings'      => array_slice($data['warnings'] ?? [], 0, 2),
        ];
    }
}