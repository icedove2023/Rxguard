<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * DatabaseSeeder
 *
 * Seeds: system settings, admin user, demo consumer,
 *        demo pharmacist, demo physician.
 */
class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        // Only real, non-demo baseline data is seeded here.
        // To create your first admin account, run:
        //     php artisan rxguard:make-admin
        $this->call([
            SystemSettingsSeeder::class,
        ]);
    }
}

// ----------------------------------------------------------------
// System settings seeder
// ----------------------------------------------------------------
class SystemSettingsSeeder extends Seeder
{
    public function run(): void
    {
        $settings = [
            ['key' => 'gemini_model',            'value' => 'gemini-1.5-pro',       'group' => 'ai',       'description' => 'Gemini model version for OCR and chatbot'],
            ['key' => 'gemini_chat_model',        'value' => 'gemini-1.5-flash',     'group' => 'ai',       'description' => 'Gemini model for chatbot (faster, cheaper)'],
            ['key' => 'safety_score_threshold',  'value' => '70',                   'group' => 'scanner',  'description' => 'Minimum passing safety score (0-100)'],
            ['key' => 'max_upload_size_mb',       'value' => '10',                   'group' => 'scanner',  'description' => 'Max prescription upload file size in MB'],
            ['key' => 'session_lifetime_min',     'value' => '60',                   'group' => 'auth',     'description' => 'JWT access token lifetime in minutes'],
            ['key' => 'refresh_token_days',       'value' => '7',                    'group' => 'auth',     'description' => 'Refresh token lifetime in days'],
            ['key' => 'drug_cache_hours',         'value' => '24',                   'group' => 'cache',    'description' => 'Hours to cache drug API responses'],
            ['key' => 'rate_limit_per_min',       'value' => '60',                   'group' => 'security', 'description' => 'API rate limit requests per minute per IP'],
            ['key' => 'ndpr_consent_version',     'value' => '1.0',                  'group' => 'legal',    'description' => 'Current NDPR consent document version'],
            ['key' => 'platform_name',            'value' => 'RxGuard',              'group' => 'general',  'description' => 'Platform display name'],
            ['key' => 'support_email',            'value' => 'support@rxguard.ng',   'group' => 'general',  'description' => 'Support contact email address'],
            ['key' => 'app_timezone',             'value' => 'Africa/Lagos',         'group' => 'general',  'description' => 'Platform timezone'],
            ['key' => 'maintenance_mode',         'value' => '0',                    'group' => 'general',  'description' => '1 = maintenance mode active'],
            ['key' => 'emdex_api_base_url',       'value' => 'https://api.emdex.org', 'group' => 'api',      'description' => 'EMDEX API base URL'],
            ['key' => 'openfda_api_base_url',     'value' => 'https://api.openfda.ng','group' => 'api',     'description' => 'OpenFDA API base URL'],
        ];

        foreach ($settings as $setting) {
            DB::table('system_settings')->updateOrInsert(
                ['key' => $setting['key']],
                array_merge($setting, ['updated_at' => now()])
            );
        }
    }
}