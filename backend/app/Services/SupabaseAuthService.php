<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * SupabaseAuthService
 *
 * Thin client around Supabase Auth (GoTrue)'s REST API. Supabase owns
 * credentials, email verification, password reset, and OTP delivery for
 * this app — actual email sending happens through the SMTP provider
 * configured in the Supabase Dashboard (set to Resend).
 *
 * Reference: https://supabase.com/docs/reference/auth
 */
class SupabaseAuthService
{
    private string $url;
    private string $anonKey;
    private string $serviceRoleKey;
    private ?string $jwtSecret;
    private ?string $redirectTo;
    private ?string $mobileRedirectTo;

    public function __construct()
    {
        $this->url             = rtrim((string) config('services.supabase.url'), '/');
        $this->anonKey         = (string) config('services.supabase.anon_key');
        $this->serviceRoleKey  = (string) config('services.supabase.service_role_key');
        $this->jwtSecret       = config('services.supabase.jwt_secret') ?: null;
        $this->redirectTo      = config('services.supabase.redirect_to') ?: null;
        $this->mobileRedirectTo = config('services.supabase.mobile_redirect_to') ?: null;
    }

    public function isConfigured(): bool
    {
        return $this->url !== '' && $this->anonKey !== '';
    }

    /**
     * Resolves which pre-configured redirect URL to hand Supabase.
     * Deliberately NOT a free-form URL accepted from the client — that
     * would be an open-redirect vulnerability in an auth flow. Callers
     * only ever choose between the server's own known-good URLs.
     */
    private function resolveRedirect(string $client = 'web'): ?string
    {
        return $client === 'mobile' ? $this->mobileRedirectTo : $this->redirectTo;
    }

    // ----------------------------------------------------------------
    // Sign up / sign in / tokens
    // ----------------------------------------------------------------

    /**
     * Create a new Supabase Auth user. Supabase automatically emails a
     * confirmation link (via Resend, once SMTP is configured) unless
     * email confirmations are disabled for the project.
     *
     * @throws SupabaseAuthException
     */
    public function signUp(string $email, string $password, array $metadata = [], string $client = 'web'): array
    {
        $redirect = $this->resolveRedirect($client);

        $response = $this->client()->post("{$this->url}/auth/v1/signup", array_filter([
            'email'    => $email,
            'password' => $password,
            'data'     => $metadata,
            'options'  => $redirect ? ['email_redirect_to' => $redirect] : null,
        ]));

        return $this->handle($response, 'Sign up');
    }

    /**
     * @throws SupabaseAuthException
     */
    public function signInWithPassword(string $email, string $password): array
    {
        $response = $this->client()
            ->post("{$this->url}/auth/v1/token?grant_type=password", [
                'email'    => $email,
                'password' => $password,
            ]);

        return $this->handle($response, 'Sign in');
    }

    /**
     * @throws SupabaseAuthException
     */
    public function refreshToken(string $refreshToken): array
    {
        $response = $this->client()
            ->post("{$this->url}/auth/v1/token?grant_type=refresh_token", [
                'refresh_token' => $refreshToken,
            ]);

        return $this->handle($response, 'Token refresh');
    }

    /**
     * Sign out of the current session, all sessions, or every session
     * except the current one. Best-effort — never throws.
     *
     * @param 'local'|'global'|'others' $scope
     */
    public function signOut(string $accessToken, string $scope = 'local'): void
    {
        try {
            $this->client($accessToken)
                ->post("{$this->url}/auth/v1/logout?scope={$scope}");
        } catch (\Throwable $e) {
            Log::warning('Supabase sign-out failed (non-fatal)', ['error' => $e->getMessage()]);
        }
    }

    // ----------------------------------------------------------------
    // Password reset / change / email verification
    // ----------------------------------------------------------------

    /**
     * Trigger Supabase's "forgot password" email. Always call this and
     * treat it as fire-and-forget from the controller's perspective to
     * avoid leaking whether an email exists.
     */
    public function sendPasswordResetEmail(string $email, string $client = 'web'): void
    {
        try {
            $this->client()->post("{$this->url}/auth/v1/recover", array_filter([
                'email'   => $email,
                'options' => ($redirect = $this->resolveRedirect($client)) ? ['redirect_to' => $redirect] : null,
            ]));
        } catch (\Throwable $e) {
            Log::warning('Supabase password reset email failed', ['error' => $e->getMessage()]);
        }
    }

    /**
     * Complete a password reset OR an authenticated password change.
     * $accessToken is either the token from the recovery email link
     * (password reset) or the user's current session token (change
     * password while logged in) — both use the same Supabase endpoint.
     *
     * @throws SupabaseAuthException
     */
    public function updateUserPassword(string $accessToken, string $newPassword): array
    {
        $response = $this->client($accessToken)
            ->put("{$this->url}/auth/v1/user", ['password' => $newPassword]);

        return $this->handle($response, 'Password update');
    }

    /**
     * Resend the signup confirmation email.
     */
    public function resendConfirmation(string $email, string $client = 'web'): void
    {
        try {
            $this->client()->post("{$this->url}/auth/v1/resend", array_filter([
                'type'    => 'signup',
                'email'   => $email,
                'options' => ($redirect = $this->resolveRedirect($client)) ? ['email_redirect_to' => $redirect] : null,
            ]));
        } catch (\Throwable $e) {
            Log::warning('Supabase resend confirmation failed', ['error' => $e->getMessage()]);
        }
    }

    /**
     * Fetch the Supabase user record for a given access token. Used to
     * check email_confirmed_at / sync local verification status.
     *
     * @throws SupabaseAuthException
     */
    public function getUser(string $accessToken): array
    {
        $response = $this->client($accessToken)->get("{$this->url}/auth/v1/user");

        return $this->handle($response, 'Fetch user');
    }

    // ----------------------------------------------------------------
    // Admin operations (service role key — server-side only, never expose)
    // ----------------------------------------------------------------

    /**
     * Create a pre-confirmed user (used by the rxguard:make-admin command
     * so the first admin doesn't have to click a confirmation email).
     *
     * @throws SupabaseAuthException
     */
    public function adminCreateUser(string $email, string $password, array $metadata = [], bool $emailConfirm = true): array
    {
        $response = $this->adminClient()->post("{$this->url}/auth/v1/admin/users", [
            'email'         => $email,
            'password'      => $password,
            'email_confirm' => $emailConfirm,
            'user_metadata' => $metadata,
        ]);

        return $this->handle($response, 'Admin create user');
    }

    /**
     * @throws SupabaseAuthException
     */
    public function adminDeleteUser(string $supabaseId): void
    {
        $response = $this->adminClient()->delete("{$this->url}/auth/v1/admin/users/{$supabaseId}");

        if ($response->failed() && $response->status() !== 404) {
            $this->handle($response, 'Admin delete user');
        }
    }

    /**
     * @throws SupabaseAuthException
     */
    public function adminGetUserById(string $supabaseId): array
    {
        $response = $this->adminClient()->get("{$this->url}/auth/v1/admin/users/{$supabaseId}");

        return $this->handle($response, 'Admin fetch user');
    }

    // ----------------------------------------------------------------
    // JWT verification
    // ----------------------------------------------------------------

    /**
     * Verify a Supabase access token and return its claims.
     *
     * Fast path: local HS256 verification against the project's legacy
     * JWT secret (no network round trip).
     * Fallback: if no secret is configured (or verification fails),
     * confirm the token remotely via /auth/v1/user — this also supports
     * projects using newer asymmetric signing keys.
     *
     * Returns null if the token is invalid/expired.
     */
    public function verifyAccessToken(string $accessToken): ?array
    {
        if ($this->jwtSecret) {
            $claims = $this->decodeAndVerifyLocally($accessToken, $this->jwtSecret);
            if ($claims) {
                return $claims;
            }
        }

        try {
            $user = $this->getUser($accessToken);

            return [
                'sub'                => $user['id'] ?? null,
                'email'              => $user['email'] ?? null,
                'email_confirmed_at' => $user['email_confirmed_at'] ?? null,
                'user_metadata'      => $user['user_metadata'] ?? [],
                'exp'                => null, // unknown via this path; token already proven live
            ];
        } catch (SupabaseAuthException) {
            return null;
        }
    }

    private function decodeAndVerifyLocally(string $jwt, string $secret): ?array
    {
        $parts = explode('.', $jwt);

        if (count($parts) !== 3) {
            return null;
        }

        [$headerB64, $payloadB64, $sigB64] = $parts;

        $expectedSig = $this->base64UrlEncode(
            hash_hmac('sha256', "{$headerB64}.{$payloadB64}", $secret, true)
        );

        if (!hash_equals($expectedSig, $sigB64)) {
            return null;
        }

        $payload = json_decode($this->base64UrlDecode($payloadB64), true);

        if (!is_array($payload)) {
            return null;
        }

        if (isset($payload['exp']) && $payload['exp'] < time()) {
            return null; // expired
        }

        return $payload;
    }

    private function base64UrlEncode(string $data): string
    {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }

    private function base64UrlDecode(string $data): string
    {
        return base64_decode(strtr($data, '-_', '+/') . str_repeat('=', (4 - strlen($data) % 4) % 4));
    }

    // ----------------------------------------------------------------
    // HTTP helpers
    // ----------------------------------------------------------------

    private function client(?string $bearerToken = null)
    {
        $http = Http::withHeaders([
            'apikey'       => $this->anonKey,
            'Content-Type' => 'application/json',
        ])->timeout(15);

        return $bearerToken
            ? $http->withToken($bearerToken)
            : $http->withToken($this->anonKey);
    }

    private function adminClient()
    {
        return Http::withHeaders([
            'apikey'       => $this->serviceRoleKey,
            'Content-Type' => 'application/json',
        ])->withToken($this->serviceRoleKey)->timeout(15);
    }

    /**
     * @throws SupabaseAuthException
     */
    private function handle($response, string $action): array
    {
        if ($response->failed()) {
            $body    = $response->json();
            $message = $body['msg'] ?? $body['error_description'] ?? $body['message'] ?? "{$action} failed.";

            Log::warning("Supabase {$action} failed", [
                'status' => $response->status(),
                'body'   => $body,
            ]);

            throw new SupabaseAuthException($message, $response->status());
        }

        return $response->json() ?? [];
    }
}
