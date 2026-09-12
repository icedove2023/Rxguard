<?php

namespace App\Console\Commands;

use App\Models\User;
use App\Services\SupabaseAuthException;
use App\Services\SupabaseAuthService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;

/**
 * Creates (or promotes) an admin user interactively.
 *
 * Replaces the old approach of shipping a hardcoded admin account in
 * the database seeder. Run this once per environment instead:
 *
 *     php artisan rxguard:make-admin
 *
 * Creates the identity in Supabase Auth (pre-confirmed, so no email
 * click-through is required for the very first admin) as well as the
 * local `users` row.
 */
class MakeAdminCommand extends Command
{
    protected $signature = 'rxguard:make-admin
                            {--email= : Email address for the admin account}
                            {--name= : Full name for the admin account}';

    protected $description = 'Create a new admin user (in Supabase Auth + locally), or promote an existing user to admin';

    public function __construct(private readonly SupabaseAuthService $supabase)
    {
        parent::__construct();
    }

    public function handle(): int
    {
        $email = $this->option('email') ?: $this->ask('Admin email address');

        $existing = User::where('email', $email)->first();

        if ($existing) {
            if ($existing->role === 'admin') {
                $this->info("User {$email} is already an admin.");
                return self::SUCCESS;
            }

            if (! $this->confirm("A user with {$email} already exists (role: {$existing->role}). Promote to admin?")) {
                return self::SUCCESS;
            }

            $existing->update(['role' => 'admin', 'is_active' => true, 'is_verified' => true]);
            $this->info("Promoted {$email} to admin.");
            return self::SUCCESS;
        }

        $name = $this->option('name') ?: $this->ask('Admin full name');
        $password = $this->secret('Admin password (min 12 characters)');
        $confirmPassword = $this->secret('Confirm password');

        $validator = Validator::make(
            compact('email', 'name', 'password'),
            [
                'email'    => ['required', 'email', 'unique:users,email'],
                'name'     => ['required', 'string', 'max:255'],
                'password' => ['required', 'string', 'min:12'],
            ]
        );

        if ($validator->fails()) {
            foreach ($validator->errors()->all() as $error) {
                $this->error($error);
            }
            return self::FAILURE;
        }

        if ($password !== $confirmPassword) {
            $this->error('Passwords do not match.');
            return self::FAILURE;
        }

        if (!$this->supabase->isConfigured()) {
            $this->error('Supabase is not configured (SUPABASE_URL / SUPABASE_ANON_KEY missing from .env).');
            return self::FAILURE;
        }

        try {
            $supabaseUser = $this->supabase->adminCreateUser($email, $password, [
                'name' => $name,
                'role' => 'admin',
            ], emailConfirm: true);
        } catch (SupabaseAuthException $e) {
            $this->error("Supabase rejected the account: {$e->getMessage()}");
            return self::FAILURE;
        }

        User::create([
            'supabase_id'       => $supabaseUser['id'] ?? $supabaseUser['user']['id'] ?? null,
            'name'              => $name,
            'email'             => $email,
            // Never used to authenticate — Supabase owns the real credential.
            'password'          => Hash::make(Str::random(40)),
            'role'              => 'admin',
            'is_verified'       => true,
            'is_active'         => true,
            'email_verified_at' => now(),
        ]);

        $this->info("Admin account created for {$email}.");
        return self::SUCCESS;
    }
}
