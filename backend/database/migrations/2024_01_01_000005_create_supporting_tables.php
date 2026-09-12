<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Migration: create_supporting_tables
 *
 * Creates: chat_sessions, chat_messages, bmi_records,
 *          audit_logs, notifications, drug_cache,
 *          api_usage_logs, system_settings
 */
return new class extends Migration
{
    public function up(): void
    {
        // --------------------------------------------------------
        // Chat sessions + messages
        // --------------------------------------------------------
        Schema::create('chat_sessions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('session_token', 64)->unique();
            $table->string('title', 255)->nullable()->comment('Auto-generated from first message');
            $table->unsignedSmallInteger('message_count')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index('user_id');
        });

        Schema::create('chat_messages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('session_id')
                  ->constrained('chat_sessions')
                  ->cascadeOnDelete();
            $table->enum('role', ['user', 'assistant']);
            $table->longText('content');
            $table->json('sources')->nullable()->comment('EMDEX/OpenFDA citations used');
            $table->string('gemini_model', 60)->nullable();
            $table->unsignedSmallInteger('tokens_used')->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->index('session_id');
        });

        // --------------------------------------------------------
        // BMI records
        // --------------------------------------------------------
        Schema::create('bmi_records', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->decimal('height_cm', 5, 1);
            $table->decimal('weight_kg', 5, 1);
            $table->unsignedTinyInteger('age');
            $table->enum('gender', ['male', 'female']);
            $table->decimal('bmi_value', 5, 2);
            $table->enum('category', [
                'underweight', 'normal', 'overweight',
                'obese_I', 'obese_II', 'obese_III',
            ]);
            $table->json('nutrition_recs')->nullable();
            $table->json('lifestyle_recs')->nullable();
            $table->text('notes')->nullable();
            $table->timestamp('recorded_at')->useCurrent();

            $table->index('user_id');
            $table->index('recorded_at');
        });

        // --------------------------------------------------------
        // Audit logs  (NDPR compliance — never delete rows)
        // --------------------------------------------------------
        Schema::create('audit_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('action', 100)->comment('e.g. prescription.scan, user.login');
            $table->string('resource_type', 80)->nullable();
            $table->unsignedBigInteger('resource_id')->nullable();
            $table->json('old_values')->nullable();
            $table->json('new_values')->nullable();
            $table->ipAddress('ip_address')->nullable();
            $table->string('user_agent', 512)->nullable();
            $table->string('session_id', 64)->nullable();
            $table->enum('status', ['success', 'failure'])->default('success');
            $table->json('metadata')->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->index('user_id');
            $table->index('action');
            $table->index(['resource_type', 'resource_id']);
            $table->index('created_at')->nullable();
        });

        // --------------------------------------------------------
        // Notifications
        // --------------------------------------------------------
        Schema::create('notifications', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('type', 100)->comment('e.g. InteractionAlert, PrescriptionReady');
            $table->string('title', 255);
            $table->text('body');
            $table->json('data')->nullable();
            $table->timestamp('read_at')->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->index('user_id');
            $table->index('read_at');
        });

        // --------------------------------------------------------
        // Drug response cache  (reduces external API calls)
        // --------------------------------------------------------
        Schema::create('drug_cache', function (Blueprint $table) {
            $table->id();
            $table->string('drug_name', 200);
            $table->string('generic_name', 200)->nullable();
            $table->enum('source', ['emdex', 'openfda', 'gemini']);
            $table->longText('data')->comment('JSON API response');
            $table->timestamp('fetched_at')->useCurrent();
            $table->timestamp('expires_at')->nullable();

            $table->index('drug_name');
            $table->index('source');
            $table->index('expires_at');
        });

        // --------------------------------------------------------
        // API usage logging  (monitoring + billing)
        // --------------------------------------------------------
        Schema::create('api_usage_logs', function (Blueprint $table) {
            $table->id();
            $table->enum('api_name', ['gemini', 'emdex', 'openfda', 'nafdac']);
            $table->string('endpoint', 255);
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->smallInteger('status_code');
            $table->unsignedSmallInteger('response_ms')->nullable();
            $table->unsignedInteger('tokens_used')->nullable()->comment('For Gemini token billing');
            $table->timestamp('created_at')->useCurrent();

            $table->index('api_name');
            $table->index('created_at');
            $table->index('user_id');
        });

        // --------------------------------------------------------
        // System settings  (admin-configurable key-value store)
        // --------------------------------------------------------
        Schema::create('system_settings', function (Blueprint $table) {
            $table->string('key', 100)->primary();
            $table->text('value')->nullable();
            $table->string('group', 60)->default('general');
            $table->string('description', 255)->nullable();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('updated_at')->useCurrent()->useCurrentOnUpdate();

            $table->index('group');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('system_settings');
        Schema::dropIfExists('api_usage_logs');
        Schema::dropIfExists('drug_cache');
        Schema::dropIfExists('notifications');
        Schema::dropIfExists('audit_logs');
        Schema::dropIfExists('bmi_records');
        Schema::dropIfExists('chat_messages');
        Schema::dropIfExists('chat_sessions');
    }
};