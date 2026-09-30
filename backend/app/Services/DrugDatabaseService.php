<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use App\Models\DrugCache;
use App\Models\DrugInteraction;
use App\Models\DrugAlternative;
use App\Models\Prescription;
use Exception;


/**
 * DrugDatabaseService
 *
 * Unified gateway to the EMDEX and Openfda pharmaceutical APIs.
 *
 * All responses are cached in the drug_cache table for 24 hours
 * to minimise external API calls and improve response times.
 *
 * Openfda —  drug monograph database (indications, dosage,
 *           contraindications, pregnancy category, side effects)
 *
 * EMDEX  — Nigerian drug brand registry (generic → brand mapping,
 *            manufacturers, dosage forms, strengths)
 */
class DrugDatabaseService
{
    private string $emdexKey;
    private string $emdexBase;
    private string $openfdaKey;
    private string $openfdaBase;
    private int    $cacheHours = 24;

    public function __construct()
    {
        $this->emdexKey   = config('services.emdex.api_key');
        $this->emdexBase  = config('services.emdex.base_url', 'https://api.emdex.ng/v1');
        $this->openfdaKey = config('services.openfda.api_key');
        $this->openfdaBase= config('services.openfda.base_url', 'https://api.fda.gov');
    }


    // ----------------------------------------------------------------
    // Unified drug lookup (Openfda monograph + EMDEX brands)
    // ----------------------------------------------------------------

    /**
     * Full drug lookup — merges Openfda monograph with EMDEX brand data.
     *
     * @return array|null  null if drug not found in either database
     */
    public function lookup(string $drugName): ?array
    {
        $cacheKey = 'drug_lookup_' . md5(strtolower(trim($drugName)));

        return Cache::remember($cacheKey, now()->addHours($this->cacheHours), function () use ($drugName) {
            $monograph = $this->fetchFromOpenfda($drugName); // Gets detailed medical info from Openfda
            $brands    = $this->fetchFromEmdex($drugName);   // Gets Nigerian brand names from EMDEX

            if (!$monograph && !$brands) {
                return null;
            }

            return [
                'drug_name'    => $drugName,
                'generic_name' => $monograph['generic_name'] ?? $brands['generic_name'] ?? $drugName,
                'openfda_id'   => $monograph['id'] ?? null,
                'atc_code'     => $monograph['atc_code'] ?? null,
                'monograph'    => $monograph,
                'brands'       => $brands['brands'] ?? [],
            ];
        });
    }

    /**
     * Get only Nigerian brand names for a generic drug.
     *
     * @return array  Array of brand objects
     */
    public function getBrands(string $drugName): array
    {
        $cacheKey = 'drug_brands_' . md5(strtolower(trim($drugName)));

        $result = Cache::remember($cacheKey, now()->addHours($this->cacheHours), function () use ($drugName) {
            return $this->fetchFromEmdex($drugName); // EMDEX now returns brands
        });

        return $result['brands'] ?? [];
    }

    // ----------------------------------------------------------------
    // Drug interaction checking
    // ----------------------------------------------------------------

    /**
    * Check interactions between a list of drug names using EMDEX.
    * OpenFDA monograph data is used separately for pregnancy-risk checks.
     *
     * @param  string[] $drugs
     * @param  array    $patientFlags  ['pregnant' => bool, 'age' => int]
     */
    public function checkInteractions(array $drugs, array $patientFlags = []): array
    {
        $pairs        = $this->buildPairs($drugs);
        $interactions = [];

        foreach ($pairs as [$drugA, $drugB]) {
            $interaction = $this->fetchInteraction($drugA, $drugB, $patientFlags);
            if ($interaction) {
                $interactions[] = $interaction;
            }
        }

        // Check pregnancy risks if applicable
        if (!empty($patientFlags['pregnant'])) {
            foreach ($drugs as $drug) {
                $pregRisk = $this->checkPregnancyRisk($drug);
                if ($pregRisk) {
                    $interactions[] = $pregRisk;
                }
            }
        }

        return [
            'drugs'               => $drugs,
            'interaction_count'   => count($interactions),
            'has_major'           => collect($interactions)->whereIn('severity', ['major', 'contraindicated'])->isNotEmpty(),
            'interactions'        => $interactions,
            'patient_flags'       => $patientFlags,
            'checked_at'          => now()->toISOString(),
        ];
    }

    // ----------------------------------------------------------------
    // Private: EMDEX API calls (now returns BRANDS format)
    // ----------------------------------------------------------------

    private function fetchFromEmdex(string $drugName): ?array
    {
        $cacheKey = 'emdex_' . md5(strtolower($drugName));
        $cached   = $this->getFromDbCache($drugName, 'emdex');

        if ($cached) return $cached;

        try {
            $response = Http::withHeaders([
                'Authorization' => "Bearer {$this->emdexKey}",
                'Accept'        => 'application/json',
            ])->timeout(15)->get("{$this->emdexBase}/drugs/search", [
                'q'     => $drugName,
                'limit' => 1,
            ]);

            $this->logApiUsage('emdex', '/drugs/search', $response->status());

            if ($response->successful()) {
                $drug = $response->json('data.0');
                if ($drug) {
                    // Transform EMDEX data to brands format
                    $transformedData = [
                        'generic_name' => $drugName,
                        'brands' => $drug['brand_names'] ?? [
                            [
                                'name' => $drug['brand_name'] ?? $drugName,
                                'manufacturer' => $drug['manufacturer'] ?? 'Unknown',
                                'strength' => $drug['strength'] ?? null,
                                'dosage_form' => $drug['dosage_form'] ?? null,
                            ]
                        ]
                    ];
                    $this->saveToDbCache($drugName, 'emdex', $transformedData);
                    return $transformedData;
                }
            }
        } catch (\Throwable $e) {
            Log::warning("EMDEX lookup failed for '{$drugName}'", ['error' => $e->getMessage()]);
        }

        // Return empty brands format as fallback (not monograph!)
        return [
            'generic_name' => $drugName,
            'brands' => [],
        ];
    }

    // ----------------------------------------------------------------
    // Private: Openfda API calls (now returns MONOGRAPH format)
    // ----------------------------------------------------------------
private function fetchFromOpenfda(string $drugName): ?array
{
    $cached = $this->getFromDbCache($drugName, 'openfda');

    if ($cached) {
        return $cached;
    }

    try {

        /*
        |--------------------------------------------------------------------------
        | Build robust search query
        |--------------------------------------------------------------------------
        | Searches both generic and brand names
        | Handles case variations more reliably
        */

       $searchQuery = sprintf(
    'openfda.generic_name:"%s" OR openfda.brand_name:"%s"',
    strtoupper($drugName),
    strtoupper($drugName)
    );
        $response = Http::timeout(15)
            ->acceptJson()
            ->get("{$this->openfdaBase}/drug/label.json", [
                'api_key' => $this->openfdaKey,
                'search'  => $searchQuery,
                'limit'   => 1,
            ]);
// After the API call, add this: 
\Log::info('OpenFDA Debug', [
    'url' => $response->effectiveUri(), // See the exact URL called
    'status' => $response->status(),
    'body' => $response->body(),
    'successful' => $response->successful(),
]);
        $this->logApiUsage(
            'openfda',
            '/drug/label.json',
            $response->status()
        );

        /*
        |--------------------------------------------------------------------------
        | Handle failed API response
        |--------------------------------------------------------------------------
        */

        if (!$response->successful()) {

            Log::warning('OpenFDA API request failed', [
                'drug'   => $drugName,
                'status' => $response->status(),
                'body'   => $response->body(),
            ]);

            return $this->fallbackDrugData($drugName);
        }

        $result = $response->json('results.0');

        if (!$result) {
            return $this->fallbackDrugData($drugName);
        }

        /*
        |--------------------------------------------------------------------------
        | Safely normalize OpenFDA fields
        |--------------------------------------------------------------------------
        */

        $openfda = $result['openfda'] ?? [];

        $transformedData = [

            'openfda_id' => $result['id'] ?? null,

            'generic_name' =>
                $openfda['generic_name'][0]
                ?? $drugName,

            
            'indication' =>
                $this->normalizeTextField(
                    $result['indications_and_usage'] ?? null
                ),

            'dosage' =>
                $this->normalizeTextField(
                    $result['dosage_and_administration'] ?? null
                ),
                'dosage_forms_and_strengths' =>
                $this->normalizeTextField(
                    $result['dosage_forms_and_strengths'] ?? null
                ),

            'warnings' =>
                $this->normalizeArrayField(
                    $result['warnings_and_cautions'] ?? null
                ),

            'contraindications' =>
                $this->normalizeArrayField(
                    $result['contraindications'] ?? null
                ),

            'side_effects' =>
                $this->normalizeArrayField(
                    $result['adverse_reactions'] ?? null
                ),
            
            'drug_interactions' =>
                $this->normalizeArrayField(
                    $result['drug_interactions'] ?? null
                ),
                'use_in_specific_populations' =>
                $this->normalizeArrayField(
                    $result['use_in_specific_populations'] ?? null
                ),

            'pregnancy_category' =>
                $this->normalizeTextField(
                    $result['pregnancy'] ?? null
                ),
        ];

        /*
        |--------------------------------------------------------------------------
        | Removed _original from production response
        |--------------------------------------------------------------------------
        */

        $this->saveToDbCache(
            $drugName,
            'openfda',
            $transformedData
        );

        return $transformedData;

    } catch (\Throwable $e) {

        Log::warning(
            "OpenFDA lookup failed for '{$drugName}'",
            [
                'error' => $e->getMessage()
            ]
        );

        return $this->fallbackDrugData($drugName);
    }
}

/*
|--------------------------------------------------------------------------
| Helper: Normalize array/string field safely
|--------------------------------------------------------------------------
*/

private function normalizeArrayField($value): array
{
    if (empty($value)) {
        return [];
    }

    return is_array($value)
        ? array_values($value)
        : [$value];
}

/*
|--------------------------------------------------------------------------
| Helper: Normalize text field safely
|--------------------------------------------------------------------------
*/

private function normalizeTextField($value): ?string
{
    if (empty($value)) {
        return null;
    }

    if (is_array($value)) {
        return $value[0] ?? null;
    }

    return (string) $value;
}
    // ----------------------------------------------------------------
    // Private: Interaction checking (unchanged - uses EMDEX endpoint)
    // ----------------------------------------------------------------

    private function fetchInteraction(string $drugA, string $drugB, array $flags): ?array
    {
        $cacheKey = 'interaction_' . md5(strtolower("$drugA|$drugB"));

        return Cache::remember($cacheKey, now()->addHours(48), function () use ($drugA, $drugB, $flags) {
            try {
                $response = Http::withHeaders([
                    'Authorization' => "Bearer {$this->emdexKey}",
                ])->timeout(15)->get("{$this->emdexBase}/interactions", [
                    'drug_a' => $drugA,
                    'drug_b' => $drugB,
                ]);

                $this->logApiUsage('emdex', '/interactions', $response->status());

                if ($response->successful()) {
                    return $response->json('data');
                }
            } catch (\Throwable $e) {
                Log::warning("Interaction check failed: {$drugA} + {$drugB}", ['error' => $e->getMessage()]);
            }

            return null;
        });
    }

    // ----------------------------------------------------------------
    // Private: Pregnancy risk check (uses Openfda monograph)
    // ----------------------------------------------------------------

    private function checkPregnancyRisk(string $drug): ?array
    {
        $monograph = $this->fetchFromOpenfda($drug); // Now uses Openfda for monograph data

        if (!$monograph) return null;

        $pregnancyCat = $monograph['pregnancy_category'] ?? null;

        if (in_array($pregnancyCat, ['D', 'X'])) {
            return [
                'drug_a'           => $drug,
                'drug_b'           => 'Pregnancy',
                'severity'         => $pregnancyCat === 'X' ? 'contraindicated' : 'major',
                'interaction_type' => 'drug_pregnancy',
                'mechanism'        => "Pregnancy category {$pregnancyCat}",
                'recommendation'   => $monograph['pregnancy_warning'] ?? 'Avoid in pregnancy. Consult obstetrician.',
                'evidence_level'   => 'A',
                'source'           => 'Openfda',
            ];
        }

        return null;
    }

    // ----------------------------------------------------------------
    // Private: database cache helpers
    // ----------------------------------------------------------------

    private function getFromDbCache(string $drugName, string $source): ?array
    {
        $row = DB::table('drug_cache')
            ->where('drug_name', strtolower($drugName))
            ->where('source', $source)
            ->where('expires_at', '>', now())
            ->first();

        if (!$row) return null;

        try {
            return json_decode($row->data, true, 512, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            return null;
        }
    }

    private function saveToDbCache(string $drugName, string $source, array $data): void
    {
        try {
            DB::table('drug_cache')->updateOrInsert(
                ['drug_name' => strtolower($drugName), 'source' => $source],
                [
                    'data'       => json_encode($data),
                    'fetched_at' => now(),
                    'expires_at' => now()->addHours($this->cacheHours),
                ]
            );
        } catch (\Throwable) {
            // Non-fatal
        }
    }

    // ----------------------------------------------------------------
    // Private: utilities
    // ----------------------------------------------------------------

    /**
     * Build all unique 2-drug pairs from a list of drugs.
     */
    private function buildPairs(array $drugs): array
    {
        $pairs = [];
        $count = count($drugs);

        for ($i = 0; $i < $count - 1; $i++) {
            for ($j = $i + 1; $j < $count; $j++) {
                $pairs[] = [$drugs[$i], $drugs[$j]];
            }
        }

        return $pairs;
    }

    /**
     * Minimal fallback drug data when API is unavailable.
     * Prevents pipeline failure for unknown drugs.
     * 
     * FIXED: Now returns MONOGRAPH format (for Openfda)
     */
    private function fallbackDrugData(string $drugName): array
    {
        return [
            'generic_name'       => $drugName,
            'indication'         => 'See prescriber for information',
            'dosage' => null,
        'dosage_forms_and_strengths' => null,
            'pregnancy_category' => null,
            'pregnancy_warning'  => null,
            'atc_code'           => null,
            'side_effects'       => [],
            'drug_interactions' => [],
        'use_in_specific_populations' => [],  
            'contraindications'  => [],
            'warnings'           => [],
            'dosage'             => null,
            '_source'            => 'fallback',
        ];
    }

    private function logApiUsage(string $api, string $endpoint, int $status): void
    {
        try {
            DB::table('api_usage_logs')->insert([
                'api_name'    => $api,
                'endpoint'    => $endpoint,
                'status_code' => $status,
                'created_at'  => now(),
            ]);
        } catch (\Throwable) {}
    }
}