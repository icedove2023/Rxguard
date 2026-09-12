<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Migration: create_prescriptions_table
 *
 * Master record for every uploaded prescription scan.
 * Tracks OCR output, extracted fields, safety scoring,
 * and review status through the validation pipeline.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('prescriptions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();

            // File storage
            $table->string('scan_path', 512)->comment('S3 or local path to original file');
            $table->enum('file_type', ['jpg', 'png', 'pdf']);

            // OCR + AI results
            $table->longText('raw_ocr_text')->nullable();
            $table->json('extracted_fields')->nullable();
            $table->decimal('safety_score', 5, 2)->nullable()->comment('0–100 percentage');
            $table->decimal('completeness_score', 5, 2)->nullable();

            // Status through pipeline
            $table->enum('status', [
                'pending', 'processing', 'completed', 'flagged', 'approved'
            ])->default('pending');

            // Patient fields extracted from prescription
            $table->string('patient_name', 120)->nullable();
            $table->unsignedTinyInteger('patient_age')->nullable();
            $table->enum('patient_gender', ['male', 'female', 'other'])->nullable();
            $table->date('prescription_date')->nullable();

            // Prescriber fields
            $table->string('prescriber_name', 120)->nullable();
            $table->string('prescriber_reg_no', 60)->nullable();
            $table->string('prescriber_hospital', 255)->nullable();
            $table->string('prescriber_contact', 80)->nullable();

            // Gemini API metadata
            $table->string('gemini_request_id', 128)->nullable();
            $table->string('gemini_model', 60)->nullable();
            $table->decimal('ocr_confidence', 5, 2)->nullable();

            // Quick-access boolean flags
            $table->boolean('has_interactions')->default(false);
            $table->boolean('has_errors')->default(false);
            $table->boolean('is_archived')->default(false);

            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index('user_id');
            $table->index('status');
            $table->index('safety_score');
            $table->index('created_at');
            $table->index('has_interactions');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('prescriptions');
    }
};