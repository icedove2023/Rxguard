<?php

// config/rxguard.php — Platform-wide configuration constants

return [

    'name'    => env('APP_NAME', 'RxGuard'),
    'version' => '1.0.0',
    'country' => 'NG',
    'timezone'=> 'Africa/Lagos',
    'currency'=> 'NGN',

    /*
    |--------------------------------------------------------------------------
    | Safety scoring thresholds
    |--------------------------------------------------------------------------
    */
    'scoring' => [
        'safe_threshold'   => 90,   // >= 90 → Safe (green)
        'review_threshold' => 70,   // 70–89 → Review Needed (amber)
        // Below 70 → Flagged (red)

        'severity_deductions' => [
            'contraindicated' => 30,
            'major'           => 20,
            'moderate'        => 10,
            'minor'           =>  4,
            'missing_info'    =>  5,
            'duplicate'       =>  8,
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | File upload limits
    |--------------------------------------------------------------------------
    */
    'uploads' => [
        'max_size_mb'       => env('MAX_UPLOAD_MB', 10),
        'allowed_mimes'     => ['jpg', 'jpeg', 'png', 'pdf'],
        'prescription_disk' => 'private',
        'avatar_disk'       => 'public',
    ],

    /*
    |--------------------------------------------------------------------------
    | Drug cache
    |--------------------------------------------------------------------------
    */
    'cache' => [
        'drug_ttl_hours'        => env('DRUG_CACHE_HOURS', 24),
        'interaction_ttl_hours' => 48,
        'brand_ttl_hours'       => 72,
    ],

    /*
    |--------------------------------------------------------------------------
    | Rate limiting
    |--------------------------------------------------------------------------
    */
    'rate_limits' => [
        'general'     => 60,    // per minute
        'ocr'         => 10,    // per minute (expensive Gemini call)
        'chatbot'     => 30,    // per minute
        'login'       => 5,     // per minute (brute force protection)
    ],

    /*
    |--------------------------------------------------------------------------
    | Token lifetimes
    |--------------------------------------------------------------------------
    */
    'tokens' => [
        'access_ttl_minutes'  => env('ACCESS_TOKEN_TTL', 60),
        'refresh_ttl_days'    => env('REFRESH_TOKEN_TTL', 7),
    ],

    /*
    |--------------------------------------------------------------------------
    | NDPR (Nigerian Data Protection Regulation)
    |--------------------------------------------------------------------------
    */
    'ndpr' => [
        'consent_version'     => '1.0',
        'data_retention_years'=> 7,
        'dpo_email'           => env('DPO_EMAIL', 'dpo@rxguard.ng'),
    ],

    /*
    |--------------------------------------------------------------------------
    | Support contacts
    |--------------------------------------------------------------------------
    */
    'support' => [
        'email'   => env('SUPPORT_EMAIL', 'support@rxguard.ng'),
        'phone'   => env('SUPPORT_PHONE', '+2348000000000'),
        'website' => env('APP_URL', 'https://rxguard.ng'),
    ],
];