<?php

namespace App\Http\Controllers\Api;


use App\Models\AuditLog;  
use App\Models\BmiRecord; 
use App\Models\ChatSession;
use App\Services\DrugDatabaseService;
use App\Services\ChatbotService;
use App\Services\BmiService;
use App\Services\UserService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Validator;

// ====================================================================
// DrugController
// GET  /api/drug/{name}         Drug info from EMDEX + OpenFDA
// POST /api/drug/interactions   Check interaction between two drugs
// GET  /api/drug/brands/{name}  Nigerian brand list from EMDEX
// ====================================================================
class DrugController extends Controller
{
    public function __construct(private readonly DrugDatabaseService $drugDbService) {}

    public function show(string $name): JsonResponse
    {
        $data = $this->drugDbService->lookup($name);

        if (!$data) {
            return response()->json([
                'status'  => 'error',
                'message' => "No drug information found for: {$name}",
            ], 404);
        }

        return response()->json(['status' => 'success', 'data' => $data]);
    }

    public function checkInteraction(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'drugs'            => ['required', 'array', 'min:2', 'max:10'],
            'drugs.*'          => ['required', 'string', 'max:200'],
            'patient_pregnant' => ['nullable', 'boolean'],
            'patient_age'      => ['nullable', 'integer', 'min:0', 'max:120'],
        ]);

        if ($validator->fails()) {
            return response()->json(['status' => 'error', 'errors' => $validator->errors()], 422);
        }

        $result = $this->drugDbService->checkInteractions(
            $request->drugs,
            [
                'pregnant' => $request->boolean('patient_pregnant'),
                'age'      => $request->input('patient_age'),
            ]
        );

        AuditLog::record(
            'drug.interaction.check',
            $request->user()?->id,
            null, null,
            ['drugs' => $request->drugs]
        );

        return response()->json(['status' => 'success', 'data' => $result]);
    }

    public function brands(string $name): JsonResponse
    {
        $brands = $this->drugDbService->getBrands($name);

        return response()->json([
            'status' => 'success',
            'data'   => [
                'generic_name' => $name,
                'brands'       => $brands,
            ],
        ]);
    }
}




