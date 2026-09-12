<?php

namespace App\Services;

/**
 * Thrown when a Supabase Auth API call fails. $statusCode mirrors the
 * HTTP status Supabase returned (e.g. 400 invalid credentials, 422
 * validation, 429 rate-limited) so callers can map it to a sensible
 * client-facing response.
 */
class SupabaseAuthException extends \RuntimeException
{
    public function __construct(string $message, private readonly int $statusCode = 400)
    {
        parent::__construct($message);
    }

    public function getStatusCode(): int
    {
        return $this->statusCode;
    }
}
