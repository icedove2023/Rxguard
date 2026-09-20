<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Migration: add_review_fields_to_prescriptions_table
 *
 * PrescriptionController::approve()/flag() (and Prescription's own
 * $fillable list) have referenced these columns since they were
 * written, but they were never actually added to the schema — every
 * call to those two endpoints would have failed with a
 * "column does not exist" SQL error. This closes that gap.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('prescriptions', function (Blueprint $table) {
            $table->timestamp('reviewed_at')->nullable()->after('reviewed_by');
            $table->string('review_status', 20)->nullable()->after('reviewed_at')
                ->comment('approved | flagged');
            $table->text('review_notes')->nullable()->after('review_status');

            $table->text('flag_reason')->nullable()->after('review_notes');
            $table->foreignId('flagged_by')->nullable()->after('flag_reason')
                ->constrained('users')->nullOnDelete();
            $table->timestamp('flagged_at')->nullable()->after('flagged_by');

            $table->index('review_status');
        });
    }

    public function down(): void
    {
        Schema::table('prescriptions', function (Blueprint $table) {
            $table->dropConstrainedForeignId('flagged_by');
            $table->dropColumn([
                'reviewed_at', 'review_status', 'review_notes',
                'flag_reason', 'flagged_at',
            ]);
        });
    }
};
