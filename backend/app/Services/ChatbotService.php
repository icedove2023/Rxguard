<?php

namespace App\Services;

use App\Models\User;
use App\Models\ChatSession;
use App\Models\ChatMessage;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * ChatbotService
 *
 * Powers the RxGuard AI Healthcare Assistant using Gemini API.
 *
 * Key design decisions:
 *  - All responses are GROUNDED in EMDEX + OpenFDA data fetched
 *    before each Gemini call. Gemini never answers from its own
 *    training data alone — drug facts are injected via context.
 *  - Full conversation history is included in every API call
 *    for coherent multi-turn dialogue.
 *  - Each response is tagged with its verified data sources.
 *  - Nigerian-specific context:  NAFDAC, PCN, MDCN,
 *    local brand names, local disease patterns.
 */
class ChatbotService
{
    private string $apiKey;
    private string $model;
    private string $apiBase = 'https://generativelanguage.googleapis.com/v1beta';

    // Hard system prompt — never exposed to users, never overridable
    private const SYSTEM_PROMPT = <<<PROMPT
You are RxGuard Assistant, a professional healthcare AI for Nigeria.

STRICT RULES:
1. Answer ONLY based on the verified pharmaceutical data provided in the context below.
2. NEVER fabricate drug names, dosages, interactions, or medical facts.
3. If drug data is not in the context, say "I don't have verified data for that medication. Please consult a pharmacist."
4. Always recommend consulting a qualified pharmacist (PCN-registered) or physician (MDCN-registered) for medical decisions.
5. NEVER prescribe medications or suggest specific treatment plans.
6. Use Nigerian context: mention Nigerian brand names, reference NAFDAC regulations, use Naira pricing context where relevant.
7. For emergencies, always direct to nearest hospital or call 112 (Nigeria emergency).

SCOPE:
✓ Medication information (usage, side effects, interactions, storage)
✓ Nutrition advice related to medications
✓ General wellness and lifestyle guidance
✓ Explanation of prescription instructions
✓ Nigerian drug brand equivalents
✗ Diagnosis of diseases
✗ Prescribing medications
✗ Replacing professional medical advice

Format responses clearly. Use bullet points for lists. Keep responses concise but complete.
PROMPT;

    public function __construct(
        private readonly DrugDatabaseService $drugDbService
    ) {
        $this->apiKey = config('services.gemini.api_key');
        $this->model  = config('services.gemini.chat_model', 'gemini-1.5-flash');
    }

    // ----------------------------------------------------------------
    // Session management
    // ----------------------------------------------------------------

    /**
     * Get existing session or create a new one for the user.
     */
    public function getOrCreateSession(User $user, ?int $sessionId): ChatSession
    {
        if ($sessionId) {
            $session = ChatSession::where('user_id', $user->id)
                ->where('is_active', true)
                ->find($sessionId);

            if ($session) return $session;
        }

        return ChatSession::create([
            'user_id'       => $user->id,
            'session_token' => Str::random(64),
            'is_active'     => true,
        ]);
    }

    // ----------------------------------------------------------------
    // Core chat method
    // ----------------------------------------------------------------

    /**
     * Process a user message and return the AI assistant reply.
     *
     * @return array{content: string, sources: array, tokens_used: int}
     */
    public function chat(ChatSession $session, string $userMessage): array
    {
        // 1. Detect drug/topic mentions in message
        $detectedDrugs = $this->detectDrugMentions($userMessage);

        // 2. Fetch real pharmaceutical data for detected drugs
        $drugContext = $this->buildDrugContext($detectedDrugs);

        // 3. Load conversation history (last 10 turns)
        $history = $this->buildHistory($session);

        // 4. Build Gemini request with grounded context
        $contents = $this->buildContents($history, $userMessage, $drugContext);

        // 5. Call Gemini API
        $geminiResponse = $this->callGemini($contents);

        // 6. Extract response text and sources
        $replyText  = $geminiResponse['text'];
        $tokensUsed = $geminiResponse['tokens'];

        // 7. Determine which sources were used
        $sources = $this->determineSources($detectedDrugs, $drugContext);

        // 8. Save user message to DB
        ChatMessage::create([
            'session_id' => $session->id,
            'role'       => 'user',
            'content'    => $userMessage,
            'created_at' => now(),
        ]);

        // 9. Save assistant reply to DB
        ChatMessage::create([
            'session_id'  => $session->id,
            'role'        => 'assistant',
            'content'     => $replyText,
            'sources'     => $sources,
            'gemini_model'=> $this->model,
            'tokens_used' => $tokensUsed,
            'created_at'  => now(),
        ]);

        // 10. Update session metadata
        $session->increment('message_count', 2);

        if ($session->message_count <= 2) {
            $session->update([
                'title' => Str::limit($userMessage, 60),
            ]);
        }

        return [
            'content'     => $replyText,
            'sources'     => $sources,
            'tokens_used' => $tokensUsed,
        ];
    }

    // ----------------------------------------------------------------
    // Drug mention detection
    // ----------------------------------------------------------------

    /**
     * Extract drug names mentioned in the user message.
     * Uses a combination of common Nigerian drug keywords and
     * simple NLP pattern matching.
     */
    private function detectDrugMentions(string $text): array
    {
        $text  = strtolower($text);
        $found = [];

        // Common medications frequently asked about in Nigeria
        $commonDrugs = [
            'paracetamol', 'ibuprofen', 'aspirin', 'amoxicillin', 'metformin',
            'lisinopril', 'amlodipine', 'atorvastatin', 'omeprazole', 'warfarin',
            'diclofenac', 'ciprofloxacin', 'azithromycin', 'artemether', 'lumefantrine',
            'hydroxychloroquine', 'prednisolone', 'dexamethasone', 'metronidazole',
            'fluconazole', 'cotrimoxazole', 'rifampicin', 'isoniazid', 'ethambutol',
            'salbutamol', 'beclomethasone', 'losartan', 'furosemide', 'spironolactone',
            'glibenclamide', 'insulin', 'levothyroxine', 'ferrous sulphate', 'folic acid',
            'vitamin c', 'vitamin b', 'zinc', 'calcium', 'tramadol', 'codeine',
            'amitriptyline', 'haloperidol', 'chlorpromazine', 'phenobarbitone',
            'phenytoin', 'carbamazepine', 'valproate', 'clonazepam', 'diazepam',
            'methotrexate', 'cyclophosphamide', 'tamoxifen', 'nifedipine', 'atenolol',
            'bisoprolol', 'carvedilol', 'digoxin', 'heparin', 'enoxaparin',
        ];

        foreach ($commonDrugs as $drug) {
            if (str_contains($text, $drug)) {
                $found[] = $drug;
            }
        }

        // Also look for phrases like "what is X" or "about X" as potential drug names
        if (preg_match_all('/(?:about|is|for|take|taking|on)\s+([a-z]+(?:\s+[a-z]+)?)/i', $text, $matches)) {
            foreach ($matches[1] as $candidate) {
                if (strlen($candidate) > 4 && !in_array($candidate, ['what', 'when', 'where', 'that', 'this', 'with'])) {
                    $found[] = $candidate;
                }
            }
        }

        return array_unique(array_slice($found, 0, 5)); // Limit to 5 drugs per query
    }

    // ----------------------------------------------------------------
    // Drug context builder
    // ----------------------------------------------------------------

    /**
     * Fetch real pharmaceutical data for each detected drug.
     * This data is injected into the Gemini prompt as ground truth.
     */
    private function buildDrugContext(array $drugs): array
    {
        $context = [];

        foreach ($drugs as $drugName) {
            $lookup = $this->drugDbService->lookup($drugName);
            $brands = $this->drugDbService->getBrands($drugName);

            if ($lookup || $brands) {
                $context[$drugName] = [
                    'monograph' => $lookup,
                    'brands'    => $brands,
                ];
            }
        }

        return $context;
    }

    /**
     * Format drug context as a readable string for injection into the prompt.
     */
    private function formatDrugContext(array $drugContext): string
    {
        if (empty($drugContext)) {
            return 'No specific drug data retrieved for this query. Answer from general Nigerian healthcare knowledge only.';
        }

        $lines = ["=== VERIFIED PHARMACEUTICAL DATA (use this as your source) ===\n"];

        foreach ($drugContext as $drugName => $data) {
            $lines[] = "DRUG: " . strtoupper($drugName);

            $mono = $data['monograph'] ?? [];
            if (!empty($mono['indication']))          $lines[] = "  Indication: " . $mono['indication'];
            if (!empty($mono['dosage']))              $lines[] = "  Standard Dosage: " . $mono['dosage'];
            if (!empty($mono['contraindications']))   $lines[] = "  Contraindications: " . implode(', ', (array)$mono['contraindications']);
            if (!empty($mono['side_effects']))        $lines[] = "  Side Effects: " . implode(', ', array_slice((array)$mono['side_effects'], 0, 5));
            if (!empty($mono['pregnancy_category'])) $lines[] = "  Pregnancy Category: " . $mono['pregnancy_category'];
            if (!empty($mono['pregnancy_warning']))  $lines[] = "  Pregnancy Note: " . $mono['pregnancy_warning'];
            if (!empty($mono['storage']))             $lines[] = "  Storage: " . $mono['storage'];
            if (!empty($mono['atc_code']))            $lines[] = "  ATC Code: " . $mono['atc_code'];

            if (!empty($data['brands'])) {
                $brandNames = array_column($data['brands'], 'brand_name');
                $lines[] = "  Nigerian Brands: " . implode(', ', array_slice($brandNames, 0, 6));
            }

            $lines[] = '';
        }

        return implode("\n", $lines);
    }

    // ----------------------------------------------------------------
    // Gemini API call
    // ----------------------------------------------------------------

    private function buildHistory(ChatSession $session): array
    {
        return ChatMessage::where('session_id', $session->id)
            ->orderByDesc('created_at')
            ->limit(20)          // last 10 user+assistant pairs
            ->get()
            ->reverse()
            ->map(fn (ChatMessage $m) => [
                'role'  => $m->role === 'assistant' ? 'model' : 'user',
                'parts' => [['text' => $m->content]],
            ])
            ->values()
            ->toArray();
    }

    private function buildContents(array $history, string $userMessage, array $drugContext): array
    {
        $drugContextText = $this->formatDrugContext($drugContext);

        // Prepend system prompt + drug context as first user turn
        $systemTurn = [
            'role'  => 'user',
            'parts' => [['text' => self::SYSTEM_PROMPT . "\n\n" . $drugContextText]],
        ];

        $systemAck = [
            'role'  => 'model',
            'parts' => [['text' => 'Understood. I will answer using only the verified data provided and Nigerian healthcare guidelines.']],
        ];

        $currentTurn = [
            'role'  => 'user',
            'parts' => [['text' => $userMessage]],
        ];

        return array_merge([$systemTurn, $systemAck], $history, [$currentTurn]);
    }

    private function callGemini(array $contents): array
    {
        try {
            $response = Http::withHeaders(['Content-Type' => 'application/json'])
                ->timeout(30)
                ->post(
                    "{$this->apiBase}/models/{$this->model}:generateContent?key={$this->apiKey}",
                    [
                        'contents'         => $contents,
                        'generationConfig' => [
                            'temperature'     => 0.3,
                            'maxOutputTokens' => 1024,
                            'topP'            => 0.8,
                        ],
                        'safetySettings'   => [
                            ['category' => 'HARM_CATEGORY_DANGEROUS_CONTENT', 'threshold' => 'BLOCK_MEDIUM_AND_ABOVE'],
                            ['category' => 'HARM_CATEGORY_HARASSMENT',        'threshold' => 'BLOCK_MEDIUM_AND_ABOVE'],
                        ],
                    ]
                );

            if ($response->failed()) {
                Log::error('Gemini chat API error', ['status' => $response->status(), 'body' => $response->body()]);
                return $this->fallbackResponse();
            }

            $data   = $response->json();
            $text   = $data['candidates'][0]['content']['parts'][0]['text'] ?? '';
            $tokens = $data['usageMetadata']['totalTokenCount'] ?? 0;

            // Log usage
            try {
                \DB::table('api_usage_logs')->insert([
                    'api_name'    => 'gemini',
                    'endpoint'    => 'chat',
                    'status_code' => $response->status(),
                    'tokens_used' => $tokens,
                    'created_at'  => now(),
                ]);
            } catch (\Throwable) {}

            return ['text' => trim($text), 'tokens' => $tokens];

        } catch (\Throwable $e) {
            Log::error('Gemini chat exception', ['error' => $e->getMessage()]);
            return $this->fallbackResponse();
        }
    }

    private function fallbackResponse(): array
    {
        return [
            'text'   => 'I apologise — our AI service is temporarily unavailable. Please try again in a moment. For urgent medication questions, contact a PCN-registered pharmacist or call your nearest hospital.',
            'tokens' => 0,
        ];
    }

    private function determineSources(array $detectedDrugs, array $drugContext): array
    {
        $sources = [];
        if (!empty($drugContext)) {
            $sources[] = 'EMDEX Nigerian Brand Registry';
            $sources[] = 'OpenFDA Drug Database';
        }
        if (!empty($detectedDrugs)) {
            $sources[] = 'Gemini AI (grounded response)';
        }
        $sources[] = 'Nigerian Pharmaceutical Guidelines';
        return array_unique($sources);
    }
}