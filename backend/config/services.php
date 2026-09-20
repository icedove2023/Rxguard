<?php

// config/services.php — External API service credentials
// Environment variables are loaded from .env

return [

    /*
    |--------------------------------------------------------------------------
    | Gemini AI  (Google Generative Language API)
    |--------------------------------------------------------------------------
    */
    'gemini' => [
        'api_key'    => env('GEMINI_API_KEY'),
        'ocr_model'  => env('GEMINI_OCR_MODEL',  'gemini-flash-latest'),
        'chat_model' => env('GEMINI_CHAT_MODEL', 'Gemini-Flash-Latest'),
        'base_url'   => 'https://generativelanguage.googleapis.com/v1beta',
        'timeout'    => env('GEMINI_TIMEOUT', 60),
    ],

    /*
    |--------------------------------------------------------------------------
    | EMDEX  (Nigerian Drug Brand Registry)
    |--------------------------------------------------------------------------
    */ 
    'emdex' => [
        'api_key'  => env('EMDEX_API_KEY'),
        'base_url' => env('EMDEX_BASE_URL', 'https://api.emdex.ng/v1'),
        'timeout'  => env('EMDEX_TIMEOUT', 15),
    ],

    /*
    |--------------------------------------------------------------------------
    | OpenFDA  (Nigerian Drug Monograph Database)
    |--------------------------------------------------------------------------
    */
    'openfda' => [
    'api_key'  => env('OPENFDA_API_KEY'),
    'base_url' => env('OPENFDA_BASE_URL', 'https://api.fda.gov'),
    'timeout'  => env('OPENFDA_TIMEOUT', 15),
    ],
    /*
    |--------------------------------------------------------------------------
    | NAFDAC  (National Agency for Food and Drug Administration and Control)
    |--------------------------------------------------------------------------
    */
    'nafdac' => [
        'api_key'  => env('NAFDAC_API_KEY'),
        'base_url' => env('NAFDAC_BASE_URL', 'https://api.nafdac.gov.ng/v1'),
        'timeout'  => env('NAFDAC_TIMEOUT', 15),
    ],

    /*
    |--------------------------------------------------------------------------
    | Termii  (Nigerian SMS provider for OTP/notifications)
    |--------------------------------------------------------------------------
    */
    'termii' => [
        'api_key'  => env('TERMII_API_KEY'),
        'base_url' => 'https://api.ng.termii.com/api',
        'sender_id'=> env('TERMII_SENDER_ID', 'RxGuard'),
    ],

    /*
    |--------------------------------------------------------------------------
    | AWS S3  (File storage for prescription scans)
    |--------------------------------------------------------------------------
    */
    'ses' => [
        'key'    => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'af-south-1'),
    ],

    /*
    |--------------------------------------------------------------------------
    | Supabase  (Auth — email verification, password reset/change, OTP)
    |--------------------------------------------------------------------------
    | Supabase Auth (GoTrue) sends all account emails (signup confirmation,
    | password recovery) through the SMTP provider configured in the
    | Supabase Dashboard (Project Settings -> Auth -> SMTP Settings), which
    | should be set to Resend. Nothing else needs to be configured here for
    | that — it's a Supabase dashboard setting, not application code.
    |
    | jwt_secret: the project's legacy JWT secret (Project Settings -> API),
    | used to verify Supabase-issued access tokens locally (fast path). If
    | left blank, tokens are verified remotely against Supabase's /auth/v1/user
    | endpoint instead (slower, but works with newer asymmetric JWT signing
    | keys too).
    */
    'supabase' => [
        'url'              => env('SUPABASE_URL'),
        'anon_key'         => env('SUPABASE_ANON_KEY'),
        'service_role_key' => env('SUPABASE_SERVICE_ROLE_KEY'),
        'jwt_secret'       => env('SUPABASE_JWT_SECRET'),
        'redirect_to'      => env('SUPABASE_AUTH_REDIRECT_URL'),
        // Deep link back into the mobile app after an email confirmation
        // or password-recovery link is tapped — see mobile/android/android/README.md.
        'mobile_redirect_to' => env('SUPABASE_MOBILE_REDIRECT_URL', 'rxguard://auth-callback'),
    ],

    /*
    |--------------------------------------------------------------------------
    | Tesseract OCR (open-source, free, CLI-based)
    |--------------------------------------------------------------------------
    | Step 1 of the prescription pipeline. No API key, no per-request cost.
    | Requires the `tesseract-ocr` package (+ language data) installed on
    | the server/container — see docker/Dockerfile.backend.
    */
    'tesseract' => [
        'binary'   => env('TESSERACT_BINARY', 'tesseract'),
        'language' => env('TESSERACT_LANGUAGE', 'eng'),
        'timeout'  => env('TESSERACT_TIMEOUT', 60),
    ],

];