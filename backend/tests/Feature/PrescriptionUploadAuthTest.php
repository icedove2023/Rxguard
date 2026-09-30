<?php

namespace Tests\Feature;

use Tests\TestCase;

class PrescriptionUploadAuthTest extends TestCase
{
    public function test_prescription_upload_requires_authentication(): void
    {
        $this->postJson('/api/v1/prescriptions/upload')
            ->assertUnauthorized()
            ->assertJsonPath('message', 'Unauthenticated.');
    }
}