<?php

namespace App\Http\Controllers\Api;

use App\Models\Prescription;
use App\Models\AuditLog;
use App\Services\PrescriptionService;
use App\Services\TesseractOcrService;
use App\Services\DrugSafetyService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Routing\Controller;
use Illuminate\Contracts\Filesystem\FileNotFoundException;
use Illuminate\Process\Exceptions\ProcessTimedOutException;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\DB;

/**
 * PrescriptionController
 *
 * Multi-step review pipeline (nothing is sent to EMDEX/OpenFDA until the
 * user has reviewed and explicitly approved the extracted text):
 *
 *   POST   /prescriptions/upload            1. Upload image/PDF
 *   POST   /prescriptions/{id}/extract      2. Tesseract OCR -> raw text
 *   POST   /prescriptions/{id}/suggest      3. Gemini suggests corrections (optional)
 *   POST   /prescriptions/{id}/confirm      4. User approves text (edited or as-is)
 *                                               -> EMDEX/OpenFDA validation + safety scoring
 *   GET    /prescriptions                   List user's prescriptions
 *   GET    /prescriptions/{id}              Full prescription report
 *   GET    /prescriptions/{id}/scan         Stream the original scan (auth + ownership checked)
 *   DELETE /prescriptions/{id}              Archive a prescription
 *
 * PROFESSIONAL ROUTES (pharmacist & physician):
 *   GET    /professional/prescriptions/queue
 *   POST   /professional/prescriptions/{id}/approve
 *   POST   /professional/prescriptions/{id}/flag
 */
class PrescriptionController extends Controller
{
    public function __construct(
        private readonly PrescriptionService $prescriptionService,
        private readonly TesseractOcrService $ocrService,
        private readonly DrugSafetyService   $drugSafetyService,
    ) {}

    // ----------------------------------------------------------------
    // POST /api/upload-prescription
    // ----------------------------------------------------------------
    public function upload(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'prescription' => [
                'required', 'file',
                'mimes:jpg,jpeg,png,pdf',
                'extensions:jpg,jpeg,png,pdf',
                'max:10240',   // 10 MB
            ],
        ]);

        if ($validator->fails()) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Invalid file. Accepted: JPG, PNG, PDF up to 10 MB.',
                'errors'  => $validator->errors(),
            ], 422);
        }

        $file = $request->file('prescription');
        $fileType = strtolower($file->getClientOriginalExtension());
        if ($fileType === 'jpeg') {
            $fileType = 'jpg';
        }

        $disk = config('filesystems.prescription_disk');
        $path = null;
        $prescription = null;
        $stage = 'storage';

        try {
            $path = $file->store("prescriptions/{$request->user()->id}", $disk);
            if (!$path) {
                throw new \RuntimeException('Storage did not return a file path.');
            }

            $stage = 'database';
            DB::transaction(function () use ($request, $path, $fileType, &$prescription): void {
                $prescription = Prescription::create([
                    'user_id'   => $request->user()->id,
                    'scan_path' => $path,
                    'file_type' => $fileType,
                    'status'    => 'pending',
                ]);

                AuditLog::record(
                    'prescription.upload',
                    $request->user()->id,
                    'Prescription',
                    $prescription->id
                );
            });
        } catch (\Throwable $e) {
            if ($path) {
                try {
                    Storage::disk($disk)->delete($path);
                } catch (\Throwable) {
                    Log::warning('Prescription upload cleanup failed', [
                        'user_id' => $request->user()->id,
                        'disk' => $disk,
                    ]);
                }
            }

            Log::error('Prescription upload failed', [
                'user_id' => $request->user()->id,
                'disk' => $disk,
                'stage' => $stage,
                'exception' => get_class($e),
            ]);

            return response()->json([
                'status' => 'error',
                'code' => $stage === 'storage' ? 'STORAGE_FAILED' : 'UPLOAD_FAILED',
                'message' => $stage === 'storage'
                    ? 'Prescription storage is temporarily unavailable. Please try again.'
                    : 'The prescription could not be saved. Please try again.',
            ], $stage === 'storage' ? 503 : 500);
        }

        // Dispatch background OCR job
        // ProcessPrescription::dispatch($prescription);

        return response()->json([
            'status'  => 'success',
            'message' => 'Prescription uploaded. It is ready for text extraction.',
            'data'    => [
                'prescription_id' => $prescription->id,
                'status'          => $prescription->status,
            ],
        ], 201);
    }

    // ----------------------------------------------------------------
    // POST /api/prescriptions/{id}/extract
    // Step 2: run Tesseract OCR (free, open-source, CLI) on the upload.
    // Produces raw text only — no AI interpretation, no external
    // drug-database calls yet.
    // ----------------------------------------------------------------
    public function extract(Request $request, int $id): JsonResponse
    {
        $prescription = Prescription::forUser($request->user()->id)->findOrFail($id);

        if (!in_array($prescription->status, ['pending', 'extracted', 'awaiting_review'])) {
            return response()->json([
                'status'  => 'error',
                'message' => 'This prescription has already moved past the extraction step.',
            ], 409);
        }

        try {
            $ocrResult = $this->ocrService->extractText($prescription);

            $prescription->update([
                'raw_ocr_text'   => $ocrResult['text'],
                'ocr_engine'     => $ocrResult['engine'],
                'ocr_confidence' => $ocrResult['confidence'],
                'status'         => 'extracted',
            ]);

            AuditLog::record(
                'prescription.extracted',
                $request->user()->id,
                'Prescription',
                $prescription->id,
                ['engine' => $ocrResult['engine'], 'confidence' => $ocrResult['confidence']]
            );

            return response()->json([
                'status'  => 'success',
                'message' => 'Text extracted. Review it below, edit if needed, or ask Gemini to suggest corrections.',
                'data'    => [
                    'prescription_id' => $prescription->id,
                    'status'          => $prescription->status,
                    'raw_text'        => $ocrResult['text'],
                    'ocr_engine'      => $ocrResult['engine'],
                    'ocr_confidence'  => $ocrResult['confidence'],
                    'pages'           => $ocrResult['pages'],
                ],
            ]);
        } catch (FileNotFoundException $e) {
            Log::warning('Prescription OCR source file is missing', [
                'prescription_id' => $prescription->id,
                'user_id' => $request->user()->id,
                'disk' => config('filesystems.prescription_disk'),
            ]);

            return response()->json([
                'status' => 'error',
                'code' => 'FILE_NOT_FOUND',
                'message' => 'The uploaded prescription file could not be found. Please upload it again.',
            ], 404);
        } catch (ProcessTimedOutException $e) {
            $prescription->update(['status' => 'flagged']);
            Log::warning('Prescription OCR timed out', [
                'prescription_id' => $prescription->id,
                'user_id' => $request->user()->id,
            ]);

            return response()->json([
                'status' => 'error',
                'code' => 'OCR_TIMEOUT',
                'message' => 'Text extraction took too long. Try a clearer image or a shorter PDF.',
            ], 504);
        } catch (\Throwable $e) {
            $prescription->update(['status' => 'flagged']);
            Log::error('Prescription OCR extraction failed', [
                'prescription_id' => $prescription->id,
                'user_id' => $request->user()->id,
                'exception' => get_class($e),
                'error' => $e->getMessage(),
            ]);

            return response()->json([
                'status'  => 'error',
                'code' => 'OCR_FAILED',
                'message' => 'OCR extraction failed. The file may be unreadable, or try a clearer photo/scan.',
            ], 500);
        }
    }

    // ----------------------------------------------------------------
    // POST /api/prescriptions/{id}/suggest
    // Step 3 (optional): Gemini suggests corrections/cleansing of the
    // raw OCR text and a structured-field preview. Purely advisory —
    // nothing here is validated or persisted as final.
    // ----------------------------------------------------------------
    public function suggest(Request $request, int $id): JsonResponse
    {
        $prescription = Prescription::forUser($request->user()->id)->findOrFail($id);

        if (empty($prescription->raw_ocr_text)) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Run text extraction first.',
            ], 409);
        }

        try {
            $suggestion = $this->prescriptionService->suggestCorrections($prescription->raw_ocr_text);

            $prescription->update([
                'suggested_text'    => $suggestion['corrected_text'],
                'suggested_fields'  => $suggestion['fields'],
                'gemini_model'      => $suggestion['model'],
                'gemini_request_id' => $suggestion['request_id'],
                'status'            => 'awaiting_review',
            ]);

            AuditLog::record(
                'prescription.suggested',
                $request->user()->id,
                'Prescription',
                $prescription->id,
                ['model' => $suggestion['model']]
            );

            return response()->json([
                'status'  => 'success',
                'message' => 'Gemini has suggested corrections. Compare with the raw text and approve, edit, or keep the original.',
                'data'    => [
                    'prescription_id' => $prescription->id,
                    'status'          => $prescription->status,
                    'raw_text'        => $prescription->raw_ocr_text,
                    'suggested_text'  => $suggestion['corrected_text'],
                    'suggested_fields'=> $suggestion['fields'],
                    'notes'           => $suggestion['notes'],
                ],
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'status'  => 'error',
                'message' => 'Gemini suggestion is temporarily unavailable. You can still edit the raw text manually and continue.',
            ], 502);
        }
    }

    // ----------------------------------------------------------------
    // POST /api/prescriptions/{id}/confirm
    // Step 4: user approves final text (their own edit, Gemini's
    // suggestion as-is, or a hybrid). ONLY NOW do we re-run structured
    // extraction and validate against EMDEX + OpenFDA + the safety engine.
    // ----------------------------------------------------------------
    public function confirm(Request $request, int $id): JsonResponse
    {
        $prescription = Prescription::forUser($request->user()->id)->findOrFail($id);

        if (!in_array($prescription->status, ['extracted', 'awaiting_review'])) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Nothing awaiting confirmation for this prescription.',
            ], 409);
        }

        $validator = Validator::make($request->all(), [
            'approved_text' => ['required', 'string', 'min:5'],
            'edit_source'   => ['required', 'in:manual,gemini,hybrid'],
        ]);

        if ($validator->fails()) {
            return response()->json(['status' => 'error', 'errors' => $validator->errors()], 422);
        }

        try {
            $prescription->update([
                'approved_text' => $request->approved_text,
                'edit_source'   => $request->edit_source,
                'approved_at'   => now(),
                'status'        => 'processing',
            ]);

            // Re-derive structured fields from the user-approved text —
            // never trust client-submitted structured JSON directly for
            // the data that drives drug safety validation.
            $extracted = $this->prescriptionService->extractFields($request->approved_text);

            $this->prescriptionService->enrichDrugs($prescription, $extracted['drugs'] ?? []);
            $safetyResult = $this->drugSafetyService->analyze($prescription);
            $scores = $this->prescriptionService->calculateScores($prescription, $extracted);

            $prescription->update([
                'extracted_fields'    => $extracted,
                'safety_score'        => $scores['safety'],
                'completeness_score'  => $scores['completeness'],
                'patient_name'        => $extracted['patient_name'] ?? null,
                'patient_age'         => $extracted['patient_age'] ?? null,
                'patient_gender'      => $extracted['patient_gender'] ?? null,
                'prescription_date'   => $extracted['date'] ?? null,
                'prescriber_name'     => $extracted['prescriber_name'] ?? null,
                'prescriber_reg_no'   => $extracted['prescriber_reg'] ?? null,
                'prescriber_hospital' => $extracted['prescriber_hospital'] ?? null,
                'prescriber_contact'  => $extracted['prescriber_contact'] ?? null,
                'has_interactions'    => $safetyResult['has_interactions'],
                'has_errors'          => $safetyResult['has_errors'],
                'status'              => 'completed',
            ]);

            AuditLog::record(
                'prescription.confirmed',
                $request->user()->id,
                'Prescription',
                $prescription->id,
                ['edit_source' => $request->edit_source, 'safety_score' => $scores['safety']]
            );

            return response()->json([
                'status'  => 'success',
                'message' => 'Prescription validated against EMDEX and OpenFDA.',
                'data'    => $this->prescriptionService->fullReport($prescription),
            ]);
        } catch (\Throwable $e) {
            $prescription->update(['status' => 'flagged']);
            report($e);

            return response()->json([
                'status'  => 'error',
                'message' => 'Validation failed. Please try again shortly.',
            ], 500);
        }
    }

    // ----------------------------------------------------------------
    // GET /api/prescriptions/{id}/scan
    // Streams the original scan file. Never publicly accessible — the
    // file lives on the configured private disk and this route enforces auth +
    // ownership (or professional/admin role) before serving it.
    // ----------------------------------------------------------------
    public function scan(Request $request, int $id): Response
    {
        $prescription = Prescription::findOrFail($id);

        $isOwner = $prescription->user_id === $request->user()->id;
        $isReviewer = in_array($request->user()->role, ['pharmacist', 'physician', 'admin']);

        if (!$isOwner && !$isReviewer) {
            abort(403, 'You do not have permission to view this file.');
        }

        $disk = config('filesystems.prescription_disk');
        if (!Storage::disk($disk)->exists($prescription->scan_path)) {
            abort(404, 'Scan file not found.');
        }

        AuditLog::record(
            'prescription.scan.viewed',
            $request->user()->id,
            'Prescription',
            $prescription->id
        );

        return Storage::disk($disk)->response($prescription->scan_path);
    }

    // ----------------------------------------------------------------
    // GET /api/prescriptions
    // ----------------------------------------------------------------
    public function index(Request $request): JsonResponse
    {
        $prescriptions = Prescription::forUser($request->user()->id)
            ->whereRaw('is_archived = FALSE')
            ->with(['drugs', 'interactions'])
            ->orderByDesc('created_at')
            ->paginate(15);

        return response()->json([
            'status' => 'success',
            'data'   => $prescriptions,
        ]);
    }

    // ----------------------------------------------------------------
    // GET /api/prescriptions/{id}
    // ----------------------------------------------------------------
    public function show(Request $request, int $id): JsonResponse
    {
        $prescription = Prescription::with(['drugs', 'interactions.alternatives', 'reviewer'])
            ->findOrFail($id);

        $isOwner    = $prescription->user_id === $request->user()->id;
        $isReviewer = in_array($request->user()->role, ['pharmacist', 'physician', 'admin']);

        if (!$isOwner && !$isReviewer) {
            abort(403, 'You do not have permission to view this prescription.');
        }

        return response()->json([
            'status' => 'success',
            'data'   => $this->prescriptionService->fullReport($prescription),
        ]);
    }

    // ----------------------------------------------------------------
    // DELETE /api/prescriptions/{id}   (soft archive, not hard delete)
    // ----------------------------------------------------------------
    public function destroy(Request $request, int $id): JsonResponse
    {
        $prescription = Prescription::forUser($request->user()->id)->findOrFail($id);
        $prescription->update(['is_archived' => true]);

        AuditLog::record(
            'prescription.archived',
            $request->user()->id,
            'Prescription',
            $id
        );

        return response()->json([
            'status'  => 'success',
            'message' => 'Prescription archived.',
        ]);
    }

    // ================================================================
    // PROFESSIONAL ROUTES (for pharmacists & physicians)
    // ================================================================

    // ----------------------------------------------------------------
    // GET /api/professional/prescriptions/queue (ADDED - ✅ FIX #7)
    // ----------------------------------------------------------------
    /**
     * Get prescriptions pending professional review
     * For pharmacists and physicians to see prescriptions that need verification
     * 
     * @param Request $request
     * @return JsonResponse
     */
    public function reviewQueue(Request $request): JsonResponse
    {
        // Get prescriptions that need professional review
        // Status can be: 'completed' (needs review), 'flagged' (needs attention)
        $prescriptions = Prescription::whereIn('status', ['completed', 'flagged'])
            ->whereNull('reviewed_by')  // Not yet reviewed
            ->whereRaw('is_archived = FALSE')
            ->with(['user', 'drugs', 'interactions'])
            ->orderByRaw("CASE WHEN status = 'flagged' THEN 0 ELSE 1 END") // Flagged first
            ->orderByDesc('created_at')
            ->paginate(20);

        return response()->json([
            'status' => 'success',
            'data'   => [
                'pending_count' => $prescriptions->total(),
                'prescriptions' => $prescriptions,
            ],
        ]);
    }

    // ----------------------------------------------------------------
    // POST /api/professional/prescriptions/{id}/approve (ADDED - ✅ FIX #7)
    // ----------------------------------------------------------------
    /**
     * Approve a prescription (pharmacist/physician verification)
     * 
     * @param Request $request
     * @param int $id
     * @return JsonResponse
     */
    public function approve(Request $request, int $id): JsonResponse
    {
        $prescription = Prescription::findOrFail($id);

        // Check if already reviewed
        if ($prescription->reviewed_by) {
            return response()->json([
                'status' => 'error',
                'message' => 'Prescription has already been reviewed.',
            ], 409);
        }

        $validator = Validator::make($request->all(), [
            'notes' => ['nullable', 'string', 'max:500'],
        ]);

        if ($validator->fails()) {
            return response()->json([
                'status' => 'error',
                'errors' => $validator->errors(),
            ], 422);
        }

        $prescription->update([
            'reviewed_by' => $request->user()->id,
            'reviewed_at' => now(),
            'review_status' => 'approved',
            'review_notes' => $request->notes,
            'status' => 'approved',
        ]);

        AuditLog::record(
            'prescription.approved',
            $request->user()->id,
            'Prescription',
            $id,
            [
                'reviewer_role' => $request->user()->role,
                'notes' => $request->notes,
            ]
        );

        return response()->json([
            'status' => 'success',
            'message' => 'Prescription approved successfully.',
            'data' => [
                'prescription_id' => $prescription->id,
                'reviewed_by' => $request->user()->name,
                'reviewed_at' => $prescription->reviewed_at,
            ],
        ]);
    }

    // ----------------------------------------------------------------
    // POST /api/professional/prescriptions/{id}/flag (ADDED - ✅ FIX #7)
    // ----------------------------------------------------------------
    /**
     * Flag a prescription for further review (pharmacist/physician)
     * 
     * @param Request $request
     * @param int $id
     * @return JsonResponse
     */
    public function flag(Request $request, int $id): JsonResponse
    {
        $prescription = Prescription::findOrFail($id);

        $validator = Validator::make($request->all(), [
            'flag_reason' => ['required', 'string', 'max:500'],
            'severity' => ['sometimes', 'in:low,medium,high,critical'],
        ]);

        if ($validator->fails()) {
            return response()->json([
                'status' => 'error',
                'errors' => $validator->errors(),
            ], 422);
        }

        $updateData = [
            'status' => 'flagged',
            'flag_reason' => $request->flag_reason,
            'flagged_by' => $request->user()->id,
            'flagged_at' => now(),
        ];

        // If a professional is flagging, also record their review
        if (!$prescription->reviewed_by) {
            $updateData['reviewed_by'] = $request->user()->id;
            $updateData['reviewed_at'] = now();
            $updateData['review_status'] = 'flagged';
        }

        $prescription->update($updateData);

        AuditLog::record(
            'prescription.flagged',
            $request->user()->id,
            'Prescription',
            $id,
            [
                'flag_reason' => $request->flag_reason,
                'severity' => $request->severity ?? 'medium',
                'reviewer_role' => $request->user()->role,
            ]
        );

        return response()->json([
            'status' => 'success',
            'message' => 'Prescription flagged for further review.',
            'data' => [
                'prescription_id' => $prescription->id,
                'flag_reason' => $request->flag_reason,
                'flagged_by' => $request->user()->name,
            ],
        ]);
    }
}