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
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;

// ====================================================================
// BmiController
// POST /api/bmi          Calculate BMI and get recommendations
// GET  /api/bmi/history  List user's BMI records
// ====================================================================
class BmiController extends Controller
{
    public function __construct(private readonly BmiService $bmiService) {}

    public function calculate(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'height_cm' => ['required', 'numeric', 'min:50', 'max:300'],
            'weight_kg' => ['required', 'numeric', 'min:5', 'max:500'],
            'age'       => ['required', 'integer', 'min:2', 'max:120'],
            'gender'    => ['required', 'in:male,female'],
        ]);

        if ($validator->fails()) {
            return response()->json(['status' => 'error', 'errors' => $validator->errors()], 422);
        }

        $result = $this->bmiService->calculate(
            $request->float('height_cm'),
            $request->float('weight_kg'),
            $request->integer('age'),
            $request->input('gender'),
            $request->user()
        );

        return response()->json(['status' => 'success', 'data' => $result]);
    }

    public function history(Request $request): JsonResponse
    {
        $records = BmiRecord::where('user_id', $request->user()->id)
            ->orderByDesc('recorded_at')
            ->paginate(20);

        return response()->json(['status' => 'success', 'data' => $records]);
    }
}

