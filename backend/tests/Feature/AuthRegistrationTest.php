<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\SupabaseAuthException;
use App\Services\SupabaseAuthService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Mockery;
use Tests\TestCase;

class AuthRegistrationTest extends TestCase
{
    use RefreshDatabase;

    public function test_empty_payload_returns_validation_errors_without_calling_supabase(): void
    {
        $supabase = Mockery::mock(SupabaseAuthService::class);
        $supabase->shouldNotReceive('signUp');
        app()->instance(SupabaseAuthService::class, $supabase);

        $this->postJson('/api/v1/auth/register', [])
            ->assertUnprocessable()
            ->assertJsonPath('message', 'Validation failed')
            ->assertJsonValidationErrors(['name', 'email', 'password', 'role'])
            ->assertJsonStructure(['request_id']);
    }

    public function test_invalid_email_is_rejected(): void
    {
        $supabase = Mockery::mock(SupabaseAuthService::class);
        $supabase->shouldNotReceive('signUp');
        app()->instance(SupabaseAuthService::class, $supabase);

        $this->postJson('/api/v1/auth/register', ['email' => 'not-an-email'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['email']);
    }

    public function test_password_confirmation_must_match(): void
    {
        $supabase = Mockery::mock(SupabaseAuthService::class);
        $supabase->shouldNotReceive('signUp');
        app()->instance(SupabaseAuthService::class, $supabase);

        $this->postJson('/api/v1/auth/register', [
            'name' => 'Test Patient',
            'email' => 'patient@example.com',
            'password' => 'StrongPassword123',
            'password_confirmation' => 'DifferentPassword123',
            'role' => 'consumer',
        ])->assertUnprocessable()
            ->assertJsonValidationErrors(['password']);
    }

    public function test_professional_registration_requires_license_and_institution(): void
    {
        $supabase = Mockery::mock(SupabaseAuthService::class);
        $supabase->shouldNotReceive('signUp');
        app()->instance(SupabaseAuthService::class, $supabase);

        $this->postJson('/api/v1/auth/register', ['role' => 'pharmacist'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['license_number', 'institution']);
    }

    public function test_professional_registration_creates_local_user_and_profile(): void
    {
        $supabaseId = '93d4c9f8-a40e-4a2b-8ea6-8db7315d3593';
        $supabase = Mockery::mock(SupabaseAuthService::class);
        $supabase->shouldReceive('isConfigured')->once()->andReturn(true);
        $supabase->shouldReceive('signUp')->once()->andReturn([
            'user' => [
                'id' => $supabaseId,
                'email' => 'pharmacist@example.com',
                'email_confirmed_at' => null,
            ],
            'session' => null,
        ]);
        app()->instance(SupabaseAuthService::class, $supabase);

        $this->postJson('/api/v1/auth/register', [
            'name' => 'Test Pharmacist',
            'email' => 'pharmacist@example.com',
            'password' => 'StrongPassword123',
            'password_confirmation' => 'StrongPassword123',
            'role' => 'pharmacist',
            'phone' => '+2348012345678',
            'license_number' => 'PCN/2022/000123',
            'institution' => 'Test Pharmacy',
            'specialty' => 'Clinical Pharmacy',
        ])->assertCreated()
            ->assertJsonPath('data.requires_confirmation', true)
            ->assertJsonPath('data.user.role', 'pharmacist');

        $user = User::where('supabase_id', $supabaseId)->firstOrFail();
        $this->assertDatabaseHas('professional_profiles', [
            'user_id' => $user->id,
            'profession' => 'pharmacist',
            'license_number' => 'PCN/2022/000123',
            'institution' => 'Test Pharmacy',
        ]);
        $this->assertDatabaseHas('audit_logs', [
            'user_id' => $user->id,
            'action' => 'user.register',
        ]);
    }

    public function test_confirmed_supabase_user_is_stored_as_verified(): void
    {
        $supabaseId = '30eebac7-7181-4a70-bbe8-d8f9f5a14f00';
        $supabase = Mockery::mock(SupabaseAuthService::class);
        $supabase->shouldReceive('isConfigured')->once()->andReturn(true);
        $supabase->shouldReceive('signUp')->once()->andReturn([
            'user' => [
                'id' => $supabaseId,
                'email' => 'verified@example.com',
                'email_confirmed_at' => '2026-09-30T08:00:00Z',
            ],
            'session' => [
                'access_token' => 'test-access-token',
                'refresh_token' => 'test-refresh-token',
                'expires_in' => 3600,
            ],
        ]);
        app()->instance(SupabaseAuthService::class, $supabase);

        $this->postJson('/api/v1/auth/register', $this->consumerPayload('verified@example.com'))
            ->assertCreated()
            ->assertJsonPath('data.access_token', 'test-access-token');

        $this->assertDatabaseHas('users', [
            'supabase_id' => $supabaseId,
            'email' => 'verified@example.com',
            'is_verified' => true,
        ]);
    }

    public function test_supabase_rejection_does_not_create_local_user(): void
    {
        $supabase = Mockery::mock(SupabaseAuthService::class);
        $supabase->shouldReceive('isConfigured')->once()->andReturn(true);
        $supabase->shouldReceive('signUp')->once()->andThrow(new SupabaseAuthException('Email already registered', 400));
        app()->instance(SupabaseAuthService::class, $supabase);

        $this->postJson('/api/v1/auth/register', $this->consumerPayload('existing@example.com'))
            ->assertUnprocessable()
            ->assertJsonPath('message', 'Email already registered')
            ->assertJsonStructure(['request_id']);

        $this->assertDatabaseCount('users', 0);
    }

    public function test_missing_supabase_configuration_returns_safe_unavailable_response(): void
    {
        $supabase = Mockery::mock(SupabaseAuthService::class);
        $supabase->shouldReceive('isConfigured')->once()->andReturn(false);
        $supabase->shouldNotReceive('signUp');
        app()->instance(SupabaseAuthService::class, $supabase);

        $this->postJson('/api/v1/auth/register', $this->consumerPayload())
            ->assertStatus(503)
            ->assertJsonPath('message', 'Registration service is temporarily unavailable.')
            ->assertJsonStructure(['request_id']);

        $this->assertDatabaseCount('users', 0);
    }

    public function test_unexpected_supabase_transport_failure_returns_safe_gateway_error(): void
    {
        $supabase = Mockery::mock(SupabaseAuthService::class);
        $supabase->shouldReceive('isConfigured')->once()->andReturn(true);
        $supabase->shouldReceive('signUp')->once()->andThrow(new \RuntimeException('test transport failure'));
        app()->instance(SupabaseAuthService::class, $supabase);

        $this->postJson('/api/v1/auth/register', $this->consumerPayload())
            ->assertStatus(502)
            ->assertJsonPath('message', 'Registration service is temporarily unavailable. Please try again.')
            ->assertJsonStructure(['request_id']);

        $this->assertDatabaseCount('users', 0);
    }

    public function test_local_database_failure_rolls_back_and_attempts_cleanup(): void
    {
        DB::unprepared("CREATE TRIGGER fail_registration_insert BEFORE INSERT ON users BEGIN SELECT RAISE(ABORT, 'forced test failure'); END");

        $supabaseId = '8c638dad-d190-420a-b4b2-c59dfe6766aa';
        $supabase = Mockery::mock(SupabaseAuthService::class);
        $supabase->shouldReceive('isConfigured')->once()->andReturn(true);
        $supabase->shouldReceive('signUp')->once()->andReturn([
            'user' => ['id' => $supabaseId, 'email' => 'patient@example.com'],
            'session' => null,
        ]);
        $supabase->shouldReceive('adminDeleteUser')->once()->with($supabaseId);
        app()->instance(SupabaseAuthService::class, $supabase);

        $this->postJson('/api/v1/auth/register', $this->consumerPayload())
            ->assertServerError()
            ->assertJsonPath('message', 'Registration failed. Please try again.')
            ->assertJsonStructure(['request_id']);

        $this->assertDatabaseCount('users', 0);
        $this->assertDatabaseCount('audit_logs', 0);
    }

    private function consumerPayload(string $email = 'patient@example.com'): array
    {
        return [
            'name' => 'Test Patient',
            'email' => $email,
            'password' => 'StrongPassword123',
            'password_confirmation' => 'StrongPassword123',
            'role' => 'consumer',
        ];
    }
}
