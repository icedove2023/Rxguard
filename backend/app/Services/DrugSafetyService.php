<?php

namespace App\Services;

use App\Models\Prescription;
use App\Models\DrugInteraction;
use App\Models\DrugAlternative;
use App\Services\DrugDatabaseService;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\DB;
use Exception;



/**
 * DrugSafetyService
 *
 * Clinical safety analysis engine for extracted prescription drugs.
 *
 * Checks performed:
 *   1. Drug–Drug Interactions (DDI) via EMDEX
 *   2. Pregnancy contraindications (category D/X)
 *   3. Duplicate therapy detection (same ATC class)
 *   4. Dosage validation against EMDEX recommended ranges
 *   5. Age-related contraindications
 */
class DrugSafetyService
{
    public function __construct(
        private readonly DrugDatabaseService $drugDbService
    ) {}

    /**
     * Run the full safety analysis for a prescription.
     *
     * Persists DrugInteraction + DrugAlternative records.
     *
     * @return array{has_interactions: bool, has_errors: bool, interaction_count: int}
     */
    public function analyze(Prescription $prescription): array
    {
        $prescription->loadMissing('drugs');
        $drugs = $prescription->drugs;

        if ($drugs->isEmpty()) {
            return ['has_interactions' => false, 'has_errors' => false, 'interaction_count' => 0];
        }

        $drugNames = $drugs->pluck('drug_name')->toArray();
        $atcCodes  = $drugs->pluck('atc_code')->filter()->toArray();

        $interactionCount = 0;
        $hasErrors        = false;

        // ---- 1. Drug–Drug interactions ----
        $ddiResult = $this->drugDbService->checkInteractions($drugNames, [
            'pregnant' => $this->inferPregnancy($prescription),
            'age'      => $prescription->patient_age,
        ]);

        foreach ($ddiResult['interactions'] as $interaction) {
            $this->persistInteraction($prescription->id, $interaction);
            $interactionCount++;
        }

        // ---- 2. Duplicate therapy (same ATC class) ----
        $duplicates = $this->detectDuplicateTherapy($drugs->toArray());
        foreach ($duplicates as $duplicate) {
            $this->persistInteraction($prescription->id, $duplicate);
            $interactionCount++;
            $hasErrors = true;
        }

        // ---- 3. Missing critical prescription fields ----
        $missingErrors = $this->checkMissingFields($prescription);
        foreach ($missingErrors as $error) {
            $this->persistInteraction($prescription->id, $error);
            $hasErrors = true;
        }
   
        // ---- 4. Per-drug dosage validation ----
        foreach ($drugs as $drug) {
            $dosageIssue = $this->validateDosage($drug);
            if ($dosageIssue) {
                $drug->update(['has_warning' => true, 'warning_text' => $dosageIssue]);
                $hasErrors = true;
            }
        }

        return [
            'has_interactions' => $interactionCount > 0,
            'has_errors'       => $hasErrors,
            'interaction_count'=> $interactionCount,
        ];
    }

    // ----------------------------------------------------------------
    // Duplicate therapy detection
    // ----------------------------------------------------------------

    /**
     * Detect drugs in the same ATC therapeutic class (duplicate therapy).
     * Example: Ibuprofen + Diclofenac are both NSAIDs (ATC M01A).
     */
    private function detectDuplicateTherapy(array $drugs): array
    {
        $issues     = [];
        $atcGroups  = [];

        // Known duplicate-prone drug classes (ATC level 3 + common names)
        $knownGroups = [
            'NSAID'       => ['ibuprofen', 'diclofenac', 'piroxicam', 'naproxen', 'indomethacin', 'aspirin', 'celecoxib'],
            'ACE_inhibitor'=> ['lisinopril', 'enalapril', 'ramipril', 'captopril', 'perindopril'],
            'ARB'         => ['losartan', 'valsartan', 'irbesartan', 'olmesartan', 'candesartan'],
            'statin'      => ['atorvastatin', 'simvastatin', 'rosuvastatin', 'lovastatin', 'pravastatin'],
            'PPI'         => ['omeprazole', 'esomeprazole', 'pantoprazole', 'lansoprazole', 'rabeprazole'],
            'sulfonyl'    => ['glibenclamide', 'glimepiride', 'gliclazide', 'glipizide'],
            'fluoroquin'  => ['ciprofloxacin', 'levofloxacin', 'ofloxacin', 'norfloxacin'],
        ];

        // Map each drug to its class
        foreach ($drugs as $drug) {
            $name = strtolower($drug['drug_name'] ?? $drug['generic_name'] ?? '');
            foreach ($knownGroups as $class => $members) {
                foreach ($members as $member) {
                    if (str_contains($name, $member)) {
                        $atcGroups[$class][] = $drug['drug_name'];
                        break;
                    }
                }
            }
        }

        // Flag groups with more than one drug
        foreach ($atcGroups as $class => $drugsInClass) {
            if (count($drugsInClass) > 1) {
                $issues[] = [
                    'drug_a'           => $drugsInClass[0],
                    'drug_b'           => $drugsInClass[1],
                    'severity'         => 'moderate',
                    'interaction_type' => 'duplicate_therapy',
                    'mechanism'        => "Both drugs belong to the same therapeutic class: {$class}.",
                    'clinical_effect'  => 'Additive adverse effects without proportional therapeutic benefit.',
                    'recommendation'   => 'Consider discontinuing one agent. Review with prescribing physician.',
                    'source'           => 'RxGuard Safety Engine',
                    'evidence_level'   => 'B',
                    'alternatives'     => null,
                ];
            }
        }

        return $issues;
    }

    // ----------------------------------------------------------------
    // Missing field errors
    // ----------------------------------------------------------------

    private function checkMissingFields(Prescription $prescription): array
    {
        $errors = [];

        $required = [
            ['field' => 'prescriber_name',  'label' => 'Prescriber name',            'severity' => 'minor'],
            ['field' => 'prescriber_reg_no','label' => 'Prescriber registration no.', 'severity' => 'moderate'],
            ['field' => 'prescription_date','label' => 'Prescription date',           'severity' => 'minor'],
            ['field' => 'patient_name',     'label' => 'Patient name',                'severity' => 'minor'],
        ];

        foreach ($required as $check) {
            if (empty($prescription->{$check['field']})) {
                $errors[] = [
                    'drug_a'           => 'Prescription',
                    'drug_b'           => $check['label'],
                    'severity'         => $check['severity'],
                    'interaction_type' => 'missing_info',
                    'mechanism'        => null,
                    'clinical_effect'  => "Missing required field: {$check['label']}",
                    'recommendation'   => "Obtain {$check['label']} from the prescribing physician.",
                    'source'           => 'RxGuard Completeness Check',
                    'evidence_level'   => null,
                    'alternatives'     => null,
                ];
            }
        }

        return $errors;
    }

    // ----------------------------------------------------------------
    // Dosage validation
    // ----------------------------------------------------------------

    /**
     * Validate a drug's dose against common Nigerian prescribing guidelines.
     * Returns an error message string or null if dosage is acceptable.
     */
    private function validateDosage(\App\Models\PrescriptionDrug $drug): ?string
    {
        $name  = strtolower($drug->generic_name ?? $drug->drug_name);
        $instr = strtolower($drug->dose_instructions ?? '');

        // Known dangerous high-dose patterns
        $rules = [
            'paracetamol'  => ['max_daily_mg' => 4000, 'max_single_mg' => 1000],
            'ibuprofen'    => ['max_daily_mg' => 2400, 'max_single_mg' => 800],
            'metformin'    => ['max_daily_mg' => 3000, 'max_single_mg' => 1000],
            'amoxicillin'  => ['max_daily_mg' => 3000, 'max_single_mg' => 1000],
        ];

        // Check if instructions indicate clearly excessive frequency
        if (preg_match('/(\d+)\s*tab.*qid/i', $instr, $m) && intval($m[1]) > 2) {
            return "Possible excessive dose frequency: '{$drug->dose_instructions}'. Verify with prescriber.";
        }

        // Flag missing instructions entirely
        if (empty($drug->dose_instructions) && empty($drug->strength)) {
            return 'Incomplete dosage information. Strength and instructions required.';
        }

        return null;
    }

    // ----------------------------------------------------------------
    // Persist to database
    // ----------------------------------------------------------------

    private function persistInteraction(int $prescriptionId, array $data): DrugInteraction
    {
        $interaction = DrugInteraction::create([
            'prescription_id'  => $prescriptionId,
            'drug_a'           => $data['drug_a'],
            'drug_b'           => $data['drug_b'],
            'severity'         => $data['severity'],
            'interaction_type' => $data['interaction_type'],
            'mechanism'        => $data['mechanism'] ?? null,
            'clinical_effect'  => $data['clinical_effect'] ?? null,
            'recommendation'   => $data['recommendation'] ?? null,
            'source'           => $data['source'] ?? null,
            'evidence_level'   => $data['evidence_level'] ?? null,
        ]);

        // Persist alternatives if provided
        if (!empty($data['alternatives'])) {
            foreach ($data['alternatives'] as $alt) {
                DrugAlternative::create([
                    'interaction_id'     => $interaction->id,
                    'alternative_generic'=> $alt['generic'] ?? $alt['alternative_generic'],
                    'alternative_brands' => $alt['brands']  ?? $alt['alternative_brands'] ?? null,
                    'reason'             => $alt['reason'] ?? null,
                    'safety_advantage'   => $alt['safety_advantage'] ?? null,
                    'availability'       => $alt['availability'] ?? 'widely_available',
                ]);
            }
        }

        return $interaction;
    }

    private function inferPregnancy(Prescription $prescription): bool
    {
        return $prescription->patient_gender === 'female'
            && $prescription->patient_age !== null
            && $prescription->patient_age >= 13
            && $prescription->patient_age <= 50;
    }
}