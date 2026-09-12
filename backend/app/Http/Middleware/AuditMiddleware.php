<?php

namespace App\Http\Middleware;

use App\Models\AuditLog;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * AuditMiddleware
 *
 * Automatically logs all state-changing API requests (POST, PUT, PATCH, DELETE)
 * to the audit_logs table for NDPR compliance.
 *
 * Read-only GET requests are not logged unless they access PHI
 * (handled explicitly in controllers via AuditLog::record()).
 */
class AuditMiddleware
{
    // Routes that should always be audited regardless of method
    private array $alwaysAudit = [
        'api/v1/auth/login',
        'api/v1/auth/logout',
        'api/v1/auth/register',
    ];

    // Sensitive fields to strip from payload logs
    private array $sensitiveFields = [
        'password', 'password_confirmation', 'token',
        'access_token', 'refresh_token', 'current_password',
    ];

    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        $shouldAudit = in_array($request->method(), ['POST', 'PUT', 'PATCH', 'DELETE'])
            || $this->isAlwaysAudited($request);

        if ($shouldAudit) {
            $this->writeLog($request, $response);
        }

        return $response;
    }

    private function writeLog(Request $request, Response $response): void
    {
        try {
            $action = $this->resolveAction($request);

            AuditLog::create([
                'user_id'      => $request->user()?->id,
                'action'       => $action,
                'resource_type'=> null,
                'resource_id'  => null,
                'new_values'   => $this->sanitizePayload($request->all()),
                'ip_address'   => $request->ip(),
                'user_agent'   => $request->userAgent(),
                'status'       => $response->isSuccessful() ? 'success' : 'failure',
                'metadata'     => [
                    'method'      => $request->method(),
                    'url'         => $request->fullUrl(),
                    'http_status' => $response->getStatusCode(),
                ],
            ]);
        } catch (\Throwable) {
            // Audit logging must never break the main request
        }
    }

    private function resolveAction(Request $request): string
    {
        $path   = ltrim($request->path(), '/');
        $method = strtolower($request->method());

        // Map common patterns to readable action names
        // (paths are matched as seen by the router, e.g. "api/v1/auth/login")
        $patterns = [
            'api/v1/auth/login'              => 'user.login',
            'api/v1/auth/logout-all'         => 'user.logout.all',
            'api/v1/auth/logout'             => 'user.logout',
            'api/v1/auth/register'           => 'user.register',
            'api/v1/auth/forgot-password'    => 'user.password.forgot',
            'api/v1/auth/reset-password'     => 'user.password.reset',
            'api/v1/auth/resend-confirmation'=> 'user.email.resend',
            'api/v1/user/password'           => 'user.password.update',
            'api/v1/user/account'            => 'user.account.delete',
            'api/v1/user/profile'            => 'user.profile.' . $method,
            'api/v1/prescriptions'           => 'prescription.' . $method,
            'api/v1/professional/prescriptions' => 'prescription.review.' . $method,
            'api/v1/chatbot'                 => 'chat.message',
            'api/v1/bmi'                     => 'bmi.calculate',
            'api/v1/admin/users'             => 'admin.user.' . $method,
            'api/v1/admin/professionals'     => 'admin.professional.' . $method,
            'api/v1/drugs/interactions'      => 'drug.interaction.check',
            'api/v1/drugs/check'             => 'drug.interaction.check',
        ];

        foreach ($patterns as $pattern => $action) {
            if (str_starts_with($path, $pattern)) {
                return $action;
            }
        }

        return "api.{$method}." . str_replace('/', '.', $path);
    }

    private function sanitizePayload(array $data): array
    {
        foreach ($this->sensitiveFields as $field) {
            if (isset($data[$field])) {
                $data[$field] = '[REDACTED]';
            }
        }
        return $data;
    }

    private function isAlwaysAudited(Request $request): bool
    {
        $path = ltrim($request->path(), '/');
        foreach ($this->alwaysAudit as $route) {
            if (str_starts_with($path, $route)) return true;
        }
        return false;
    }
}