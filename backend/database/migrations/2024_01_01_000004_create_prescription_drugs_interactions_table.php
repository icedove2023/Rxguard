<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Migration: create_prescription_drugs_table
 * Creates the table for storing drug information extracted from prescriptions.
 * Also creates related tables: drug_alternatives, drug_interactions, prescription_drugs
 * Each row is one drug line extracted from a prescription.
 * Enriched with OpenFDA monograph data and EMDEX Nigerian brand listings.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('prescription_drugs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('prescription_id')->constrained()->cascadeOnDelete();

            // As written on the prescription
            $table->string('drug_name', 200);
            $table->string('generic_name', 200)->nullable()->comment('Resolved via EMDEX');
            $table->string('strength', 80)->nullable();
            $table->string('dosage_form', 80)->nullable()->comment('Tablet, capsule, syrup, etc.');
            $table->string('dose_instructions', 255)->nullable()->comment('e.g. 1 tab BD after meals');
            $table->string('duration', 80)->nullable();
            $table->string('quantity', 60)->nullable();
            $table->string('route', 60)->nullable()->comment('Oral, IV, topical, etc.');

            // EMDEX enrichment
            $table->string('emdex_drug_id', 60)->nullable();
            $table->json('emdex_data')->nullable()->comment('Full EMDEX monograph object');
            $table->string('atc_code', 20)->nullable()->comment('WHO ATC classification');

            // OpenFDA enrichment
            $table->json('openfda_brands')->nullable()->comment('Array of Nigerian brand objects');

            // Validation flags (null = not yet checked)
            $table->boolean('dosage_valid')->nullable();
            $table->boolean('duration_valid')->nullable();
            $table->boolean('has_warning')->default(false);
            $table->text('warning_text')->nullable();

            $table->unsignedTinyInteger('sort_order')->default(0);
            $table->timestamp('created_at')->useCurrent();

            $table->index('prescription_id');
            $table->index('generic_name');
            $table->index('atc_code');
        });

        Schema::create('drug_interactions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('prescription_id')->constrained()->cascadeOnDelete();

            $table->string('drug_a', 200);
            $table->string('drug_b', 200);
            $table->enum('severity', ['major', 'moderate', 'minor', 'contraindicated']);
            $table->enum('interaction_type', [
                'ddi',                // drug–drug interaction
                'drug_pregnancy',
                'drug_disease',
                'duplicate_therapy',
                'dosage_error',
                'missing_info',
            ]);

            $table->text('mechanism')->nullable();
            $table->text('clinical_effect')->nullable();
            $table->text('recommendation')->nullable();
            $table->json('alternatives')->nullable();
            $table->string('source', 80)->nullable()->comment('EMDEX | OpenFDA | Gemini');
            $table->enum('evidence_level', ['A', 'B', 'C', 'D'])->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->index('prescription_id');
            $table->index('severity');
            $table->index('interaction_type');
        });

        Schema::create('drug_alternatives', function (Blueprint $table) {
            $table->id();
            $table->foreignId('interaction_id')
                  ->constrained('drug_interactions')
                  ->cascadeOnDelete();

            $table->string('alternative_generic', 200);
            $table->json('alternative_brands')->nullable();
            $table->text('reason')->nullable();
            $table->text('safety_advantage')->nullable();
            $table->enum('availability', [
                'widely_available',
                'sometimes_available',
                'specialist_only',
            ])->default('widely_available');
            $table->timestamp('created_at')->useCurrent();

            $table->index('interaction_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('drug_alternatives');
        Schema::dropIfExists('drug_interactions');
        Schema::dropIfExists('prescription_drugs');
    }
};