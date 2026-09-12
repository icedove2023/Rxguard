<?php

namespace App\Http\Controllers\Api;

use App\Models\User;
use App\Models\ProfessionalProfile;
use App\Models\AuditLog;
use App\Models\Prescription;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

/**
 * AdminController
 *
 * GET    /api/admin/users                   List all users
 * GET    /api/admin/users/{id}              Get user detail
 * PUT    /api/admin/users/{id}/status       Activate / deactivate
 * GET    /api/admin/professionals/pending   Professionals awaiting license verification
 * POST   /api/admin/professionals/{id}/verify  Approve or reject license
 * GET    /api/admin/audit-logs             Paginated audit log
 * GET    /api/admin/analytics              Platform usage statistics
 * GET    /api/admin/api-usage              External API usage metrics (ADDED)
 */
class AdminController extends Controller
{
    // ----------------------------------------------------------------
    // GET /api/admin/users
    // ----------------------------------------------------------------
    public function users(Request $request): JsonResponse
    {
        $query = User::with('professionalProfile')
            ->when($request->filled('role'), fn ($q) => $q->byRole($request->role))
            ->when($request->filled('search'), fn ($q) => $q->where(function ($q) use ($request) {
                $q->where('name', 'like', "%{$request->search}%")
                  ->orWhere('email', 'like', "%{$request->search}%");
            }))
            ->when($request->filled('status'), fn ($q) => $q->where(
                'is_active', $request->status === 'active'
            ))
            ->orderByDesc('created_at');

        return response()->json([
            'status' => 'success',
            'data'   => $query->paginate(25),
        ]);
    }

    // ----------------------------------------------------------------
    // GET /api/admin/users/{id}
    // ----------------------------------------------------------------
    public function user(int $id): JsonResponse
    {
        $user = User::with([
            'professionalProfile',
            'prescriptions' => fn ($q) => $q->latest()->limit(5),
            'auditLogs'     => fn ($q) => $q->latest()->limit(10),
        ])->findOrFail($id);

        return response()->json(['status' => 'success', 'data' => $user]);
    }

    // ----------------------------------------------------------------
    // PUT /api/admin/users/{id}/status
    // ----------------------------------------------------------------
    public function updateUserStatus(Request $request, int $id): JsonResponse
    {
        $request->validate([
            'is_active' => ['required', 'boolean'],
        ]);

        $user = User::findOrFail($id);

        if ($user->id === $request->user()->id) {
            return response()->json([
                'status'  => 'error',
                'message' => 'You cannot change your own account status.',
            ], 403);
        }

        $user->update(['is_active' => $request->boolean('is_active')]);

        AuditLog::record(
            $request->boolean('is_active') ? 'admin.user.activated' : 'admin.user.deactivated',
            $request->user()->id,
            'User',
            $id
        );

        return response()->json([
            'status'  => 'success',
            'message' => 'User status updated.',
        ]);
    }

    // ----------------------------------------------------------------
    // GET /api/admin/professionals/pending
    // ----------------------------------------------------------------
    public function pendingProfessionals(): JsonResponse
    {
        $profiles = ProfessionalProfile::with('user')
            ->where('license_verified', false)
            ->orderBy('created_at')
            ->paginate(20);

        return response()->json(['status' => 'success', 'data' => $profiles]);
    }

    // ----------------------------------------------------------------
    // POST /api/admin/professionals/{id}/verify
    // ----------------------------------------------------------------
    public function verifyProfessional(Request $request, int $id): JsonResponse
    {
        $request->validate([
            'approved' => ['required', 'boolean'],
            'note'     => ['nullable', 'string', 'max:500'],
        ]);

        $profile = ProfessionalProfile::with('user')->findOrFail($id);

        $profile->update([
            'license_verified'  => $request->boolean('approved'),
            'verified_by'       => $request->user()->id,
            'verification_note' => $request->input('note'),
            'verified_at'       => $request->boolean('approved') ? now() : null,
        ]);

        // If rejected, revert user role to consumer
        if (!$request->boolean('approved')) {
            $profile->user->update(['role' => 'consumer']);
        }

        AuditLog::record(
            $request->boolean('approved')
                ? 'admin.professional.approved'
                : 'admin.professional.rejected',
            $request->user()->id,
            'ProfessionalProfile',
            $id,
            ['note' => $request->input('note')]
        );

        return response()->json([
            'status'  => 'success',
            'message' => $request->boolean('approved')
                ? 'Professional verified successfully.'
                : 'Professional application rejected.',
        ]);
    }

    // ----------------------------------------------------------------
    // GET /api/admin/audit-logs
    // ----------------------------------------------------------------
    public function auditLogs(Request $request): JsonResponse
    {
        $logs = AuditLog::with('user:id,name,email')
            ->when($request->filled('action'), fn ($q) => $q->where('action', 'like', "%{$request->action}%"))
            ->when($request->filled('user_id'), fn ($q) => $q->where('user_id', $request->user_id))
            ->when($request->filled('from'), fn ($q) => $q->where('created_at', '>=', $request->from))
            ->when($request->filled('to'), fn ($q) => $q->where('created_at', '<=', $request->to))
            ->orderByDesc('created_at')
            ->paginate(50);

        return response()->json(['status' => 'success', 'data' => $logs]);
    }

    // ----------------------------------------------------------------
    // GET /api/admin/analytics
    // ----------------------------------------------------------------
    public function analytics(): JsonResponse
    {
        $data = [
            'users' => [
                'total'       => User::count(),
                'consumers'   => User::byRole('consumer')->count(),
                'pharmacists' => User::byRole('pharmacist')->count(),
                'physicians'  => User::byRole('physician')->count(),
                'this_month'  => User::where('created_at', '>=', now()->startOfMonth())->count(),
            ],
            'prescriptions' => [
                'total'            => Prescription::count(),
                'completed'        => Prescription::where('status', 'completed')->count(),
                'with_interactions'=> Prescription::where('has_interactions', true)->count(),
                'flagged'          => Prescription::where('status', 'flagged')->count(),
                'avg_safety_score' => round(Prescription::avg('safety_score'), 1),
                'this_month'       => Prescription::where('created_at', '>=', now()->startOfMonth())->count(),
            ],
            'api_usage' => DB::table('api_usage_logs')
                ->select('api_name', DB::raw('COUNT(*) as calls'), DB::raw('AVG(response_ms) as avg_ms'))
                ->where('created_at', '>=', now()->subDays(30))
                ->groupBy('api_name')
                ->get(),
            'interactions_by_severity' => DB::table('drug_interactions')
                ->select('severity', DB::raw('COUNT(*) as count'))
                ->groupBy('severity')
                ->get(),
        ];

        return response()->json(['status' => 'success', 'data' => $data]);
    }

    // ----------------------------------------------------------------
    // GET /api/admin/api-usage (ADDED - ✅ FIX)
    // ----------------------------------------------------------------
    /**
     * Get external API usage metrics (EMDEX, OpenFDA, Gemini, etc.)
     * 
     * @param Request $request
     * @return JsonResponse
     */
    public function apiUsage(Request $request): JsonResponse
    {
        // Get date range from request or default to last 30 days
        $fromDate = $request->from_date ?: now()->subDays(30)->toDateString();
        $toDate = $request->to_date ?: now()->toDateString();

        // If you have an api_usage_logs table, use it
        if (DB::table('information_schema.tables')
            ->where('table_schema', 'public')
            ->where('table_name', 'api_usage_logs')
            ->exists()) {
            $apiUsageData = DB::table('api_usage_logs')
                ->select(
                    'api_name',
                    DB::raw('COUNT(*) as total_calls'),
                    DB::raw('AVG(response_ms) as average_response_ms'),
                    DB::raw('MAX(response_ms) as max_response_ms'),
                    DB::raw('SUM(CASE WHEN status_code >= 200 AND status_code < 300 THEN 1 ELSE 0 END) as successful_calls'),
                    DB::raw('SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) as failed_calls')
                )
                ->whereBetween('created_at', [$fromDate, $toDate . ' 23:59:59'])
                ->groupBy('api_name')
                ->orderBy('total_calls', 'DESC')
                ->get();

            $totalCalls = $apiUsageData->sum('total_calls');
            $successRate = $totalCalls > 0 
                ? round(($apiUsageData->sum('successful_calls') / $totalCalls) * 100, 2)
                : 0;

            return response()->json([
                'status' => 'success',
                'data' => [
                    'period' => [
                        'from' => $fromDate,
                        'to' => $toDate,
                    ],
                    'summary' => [
                        'total_api_calls' => $totalCalls,
                        'success_rate' => $successRate,
                        'average_response_ms' => round($apiUsageData->avg('average_response_ms'), 2),
                    ],
                    'api_breakdown' => $apiUsageData,
                ],
            ]);
        }

        // Fallback: Use audit logs to track API usage
        // Track API calls to external services from audit logs
        $apiActions = ['prescription.analyze', 'drug.search', 'drug.interaction', 'chatbot.message'];
        
        $externalApiCalls = AuditLog::whereIn('action', $apiActions)
            ->whereBetween('created_at', [$fromDate, $toDate . ' 23:59:59'])
            ->select(
                'action',
                DB::raw('COUNT(*) as call_count'),
                DB::raw('COUNT(DISTINCT user_id) as unique_users')
            )
            ->groupBy('action')
            ->orderBy('call_count', 'DESC')
            ->get();

        $totalExternalCalls = $externalApiCalls->sum('call_count');

        // Monthly trend for API usage
        $monthlyTrend = AuditLog::whereIn('action', $apiActions)
            ->where('created_at', '>=', now()->subMonths(6))
            ->select(
                // PostgreSQL date formatting (was MySQL's DATE_FORMAT(...))
                DB::raw("TO_CHAR(created_at, 'YYYY-MM') as month"),
                DB::raw('COUNT(*) as total_calls')
            )
            ->groupBy('month')
            ->orderBy('month', 'DESC')
            ->get();

        return response()->json([
            'status' => 'success',
            'data' => [
                'period' => [
                    'from' => $fromDate,
                    'to' => $toDate,
                ],
                'summary' => [
                    'total_external_api_calls' => $totalExternalCalls,
                    'unique_users' => AuditLog::whereIn('action', $apiActions)
                        ->whereBetween('created_at', [$fromDate, $toDate . ' 23:59:59'])
                        ->distinct('user_id')
                        ->count('user_id'),
                    'average_daily_calls' => round($totalExternalCalls / 30, 2),
                ],
                'api_breakdown' => $externalApiCalls,
                'monthly_trend' => $monthlyTrend,
            ],
        ]);
    }
}