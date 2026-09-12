<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Migration: create_professional_profiles_table
 *
 * Extended profile for pharmacists and physicians.
 * License verification is performed by admin before role elevation.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('professional_profiles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
            $table->enum('profession', ['pharmacist', 'physician']);
            $table->string('license_number', 60);
            $table->string('institution', 255)->comment('Hospital or pharmacy name');
            $table->string('specialty', 120)->nullable();
            $table->boolean('license_verified')->default(false);
            $table->foreignId('verified_by')->nullable()->constrained('users')->nullOnDelete();
            $table->text('verification_note')->nullable();
            $table->string('nafdac_ref', 80)->nullable();
            $table->string('mdcn_reg', 80)->nullable()->comment('MDCN/PCN registration number');
            $table->timestamp('verified_at')->nullable();
            $table->timestamps();

            $table->index('license_number');
            $table->index('license_verified');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('professional_profiles');
    }
};