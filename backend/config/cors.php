<?php

return [

    'paths' => [
        'api/*',
    ],

    'allowed_methods' => [
        '*',
    ],

    'allowed_origins' => [
        'https://rxguardyou.vercel.app',
        'http://localhost',
        'http://localhost:3000',
        'http://localhost:5173',
    ],

    'allowed_origins_patterns' => [],

    'allowed_headers' => [
        '*',
    ],

    'exposed_headers' => [],

    'max_age' => 3600,

    'supports_credentials' => false,

];
