<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * RoleMiddleware
 *
 * Restricts routes to users with specific roles.
 *
 * Usage in routes: ->middleware('role:admin')
 *                  ->middleware('role:pharmacist,physician')
 */
class RoleMiddleware
{
    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        $user = $request->user();

        if (!$user) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Unauthenticated.',
            ], 401);
        }

        if (!in_array($user->role, $roles)) {
            return response()->json([
                'status'  => 'error',
                'message' => 'You do not have permission to perform this action.',
                'required_roles' => $roles,
                'your_role'      => $user->role,
            ], 403);
        }

        return $next($request);
    }
}