<?php

namespace App\Services;

use App\Models\Prescription;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\DB;

/**
 * OcrService
 *
 * Uses Gemini Vision API for prescription OCR extraction.
 * Returns structured pharmaceutical data in JSON format.
 */
class OcrService
{
    private string $apiKey;
    private string $model;
    private string $apiBase = 'https://generativelanguage.googleapis.com/v1beta';

    public function __construct()
    {
        $this->apiKey = config('services.gemini.api_key');

        // FIX: correct Gemini model name
        $this->model = config('services.gemini.ocr_model', 'gemini-1.5-flash');
    }

    /**
     * Extract structured prescription data from image/PDF.
     */
    public function extractText(Prescription $prescription): array
    {
        $fileContent = Storage::disk('private')->get($prescription->scan_path);

        if (!$fileContent) {
            throw new \RuntimeException("Cannot read file: {$prescription->scan_path}");
        }

        // 🚨 File size protection (important for PDFs/images)
        if (strlen($fileContent) > 15 * 1024 * 1024) {
            throw new \RuntimeException("File too large for OCR processing (limit 15MB)");
        }

        $mimeType = Storage::disk('private')->mimeType($prescription->scan_path)
            ?? $this->mimeType($prescription->file_type);

        $b64Data = base64_encode($fileContent);

        $payload = [
            'contents' => [
                [
                    'parts' => [
                        [
                            'inline_data' => [
                                'mime_type' => $mimeType,
                                'data'      => $b64Data,
                            ],
                        ],
                        [
                            'text' => $this->buildOcrPrompt(),
                        ],
                    ],
                ],
            ],
            'generationConfig' => [
                'temperature'     => 0.1,
                'maxOutputTokens' => 2048,
            ],
        ];

        $response = Http::withHeaders([
                'Content-Type' => 'application/json',
                'Accept'       => 'application/json',
            ])
            ->retry(3, 1000) // FIX: retry logic for 429/503 errors
            ->timeout(60)
            ->post(
                "{$this->apiBase}/models/{$this->model}:generateContent?key={$this->apiKey}",
                $payload
            );

        if ($response->failed()) {
            Log::error('Gemini extraction failed', [
                'status' => $response->status(),
                'body'   => $response->body(),
                'rx_id'  => $prescription->id,
                'model'  => $this->model,
            ]);

            throw new \RuntimeException(
                'Gemini OCR service failed. Status: ' . $response->status()
            );
        }

        $data = $response->json();

        // FIX: safe parsing
        $text = data_get($data, 'candidates.0.content.parts.0.text', '');

        if (!$text) {
            Log::warning('Empty OCR response from Gemini', [
                'rx_id' => $prescription->id,
                'response' => $data,
            ]);
        }

        // FIX: proper request ID handling
        $requestId = data_get($data, 'responseId')
            ?? data_get($data, 'name')
            ?? uniqid('gemini_', true);

        $tokens = data_get($data, 'usageMetadata.totalTokenCount', 0);

        $this->logUsage('OCR', $response->status(), $tokens);

        return [
            'text'       => trim($text),
            'model'      => $this->model,
            'request_id' => (string) $requestId,
            'confidence' => $this->estimateConfidence($text),
        ];
    }

    /**
     * STRICT JSON OCR prompt for consistent extraction.
     */
    private function buildOcrPrompt(): string
    {
        return <<<PROMPT
You are a pharmaceutical OCR system for Nigerian prescriptions.

Return ONLY valid JSON in this structure:

{
  "raw_text": "",
  "patient": {
    "name": "",
    "age": "",
    "gender": "",
    "date": ""
  },
  "prescriber": {
    "name": "",
    "mdcn_number": "",
    "facility": "",
    "contact": ""
  },
  "medications": [
    {
      "name": "",
      "strength": "",
      "form": "",
      "dosage": "",
      "duration": "",
      "quantity": ""
    }
  ]
}

Rules:
- Output ONLY JSON (no explanation, no markdown)
- Use "" for missing values
- Use "[ILLEGIBLE]" where unclear
- Do not invent data
PROMPT;
    }

    /**
     * MIME type resolver fallback.
     */
    private function mimeType(string $fileType): string
    {
        return match (strtolower($fileType)) {
            'pdf'         => 'application/pdf',
            'png'         => 'image/png',
            'jpg', 'jpeg' => 'image/jpeg',
            default       => 'image/jpeg',
        };
    }

    /**
     * Confidence estimation heuristic.
     */
    private function estimateConfidence(string $text): float
    {
        $length = strlen($text);

        $illegible = substr_count(strtolower($text), '[illegible]')
                   + substr_count(strtolower($text), '[unclear]');

        if ($length < 50) {
            return 30.0;
        }

        $base = min(95.0, 60.0 + ($length / 100));
        $penalty = $illegible * 5.0;

        return max(20.0, round($base - $penalty, 1));
    }

    /**
     * Logs API usage safely (non-blocking).
     */
    private function logUsage(string $endpoint, int $status, int $tokens): void
    {
        try {
            DB::table('api_usage_logs')->insert([
                'api_name'    => 'gemini',
                'endpoint'    => $endpoint,
                'status_code' => $status,
                'tokens_used' => $tokens,
                'created_at'  => now(),
            ]);
        } catch (\Throwable $e) {
            Log::warning('Failed to log Gemini usage', [
                'error' => $e->getMessage(),
            ]);
        }
    }
    
}