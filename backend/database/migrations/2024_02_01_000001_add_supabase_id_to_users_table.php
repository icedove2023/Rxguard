<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Migration: add_supabase_id_to_users_table
 *
 * Credentials (password, email confirmation, password reset, OTP) are now
 * owned by Supabase Auth. This column links a local `users` row to its
 * corresponding Supabase Auth user (the `sub` claim of the Supabase JWT).
 *
 * The local `password` column is kept (NOT NULL in the original schema)
 * but is no longer used to authenticate — it's filled with a random,
 * never-shared value at registration time so the column constraint is
 * satisfied without storing a real, checkable local credential.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->uuid('supabase_id')->nullable()->unique()->after('id');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropUnique(['supabase_id']);
            $table->dropColumn('supabase_id');
        });
    }
};
