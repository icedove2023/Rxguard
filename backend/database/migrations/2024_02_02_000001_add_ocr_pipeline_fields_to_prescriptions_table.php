<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Migration: add_ocr_pipeline_fields_to_prescriptions_table
 *
 * Supports the new multi-step OCR review pipeline:
 *   uploaded -> extracted (Tesseract) -> awaiting_review (Gemini suggests
 *   corrections) -> processing (user-approved text validated against
 *   EMDEX/OpenFDA) -> completed
 *
 * New status values: 'extracted', 'awaiting_review'.
 * (Existing values kept: pending, processing, completed, flagged, approved)
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('prescriptions', function (Blueprint $table) {
            $table->string('ocr_engine', 40)->nullable()->after('raw_ocr_text')
                ->comment('e.g. tesseract-5.3.0');

            // Gemini's suggested cleanup of the raw OCR text + its structured
            // field guess — shown to the user for comparison, never used
            // directly for validation until the user approves.
            $table->longText('suggested_text')->nullable()->after('ocr_engine');
            $table->json('suggested_fields')->nullable()->after('suggested_text');

            // What the user actually approved (may equal raw_ocr_text,
            // suggested_text, or a manual hybrid edit) and how they got there.
            $table->longText('approved_text')->nullable()->after('suggested_fields');
            $table->string('edit_source', 20)->nullable()->after('approved_text')
                ->comment('manual | gemini | hybrid');
            $table->timestamp('approved_at')->nullable()->after('edit_source');
        });

        // Laravel's enum() on Postgres is a CHECK constraint, not a native
        // enum type — widen it to include the two new pipeline states.
        DB::statement('ALTER TABLE prescriptions DROP CONSTRAINT IF EXISTS prescriptions_status_check');
        DB::statement("ALTER TABLE prescriptions ADD CONSTRAINT prescriptions_status_check
            CHECK (status IN ('pending','extracted','awaiting_review','processing','completed','flagged','approved'))");
    }

    public function down(): void
    {
        Schema::table('prescriptions', function (Blueprint $table) {
            $table->dropColumn([
                'ocr_engine', 'suggested_text', 'suggested_fields',
                'approved_text', 'edit_source', 'approved_at',
            ]);
        });

        DB::statement('ALTER TABLE prescriptions DROP CONSTRAINT IF EXISTS prescriptions_status_check');
        DB::statement("ALTER TABLE prescriptions ADD CONSTRAINT prescriptions_status_check
            CHECK (status IN ('pending','processing','completed','flagged','approved'))");
    }
};
