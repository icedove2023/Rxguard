<?php


use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\PrescriptionController;
use App\Http\Controllers\Api\DrugController;
use App\Http\Controllers\Api\ChatController;
use App\Http\Controllers\Api\BmiController;
use App\Http\Controllers\Api\UserController;
use App\Http\Controllers\Api\AdminController;

/*
|--------------------------------------------------------------------------
| RxGuard API Routes  — /api/*
|--------------------------------------------------------------------------
|
| All routes return JSON. Authentication is handled by Supabase Auth —
| the 'auth.supabase' middleware verifies the Supabase-issued access
| token and resolves it to the local user (see SupabaseAuth middleware).
| Role-restricted routes use the custom 'role' middleware.
| All mutating routes pass through 'audit' middleware automatically.
|
*/

// -----------------------------------------------------------------------
// Public routes (no authentication required)
// -----------------------------------------------------------------------
Route::prefix('v1')->name('api.v1.')->group(function () {

    // Health check
    Route::get('/health', fn () => response()->json([
        'status'    => 'ok',
        'platform'  => 'RxGuard',
        'version'   => '1.0.0',
        'timestamp' => now()->toISOString(),
    ]));

    // Authentication
    // NOTE: no 'audit' middleware here — these actions already call
    // AuditLog::record() explicitly inside AuthController with richer
    // context (failed-login email, resource ids, etc.) than the generic
    // middleware logger would produce. Applying both would double-log.
    Route::prefix('auth')->name('auth.')->group(function () {
        Route::post('/register',       [AuthController::class, 'register'])      ->name('register');
        Route::post('/login',          [AuthController::class, 'login'])         ->name('login');
        Route::post('/forgot-password',[AuthController::class, 'forgotPassword'])->name('forgot');
        Route::post('/reset-password', [AuthController::class, 'resetPassword']) ->name('reset');
        Route::post('/resend-confirmation', [AuthController::class, 'resendConfirmation'])->name('resend');
        // Uses the refresh_token from the request body, not the (possibly
        // expired) access token header, so it must stay outside auth.supabase.
        Route::post('/refresh',        [AuthController::class, 'refreshToken']) ->name('refresh');
    });

    // Public drug information — REMOVED. Every RxGuard feature, including
    // basic drug lookups, requires a registered/authenticated account
    // (see the 'drugs' group inside the authenticated block below).
    // Only /health and the auth endpoints above remain unauthenticated.

    // -----------------------------------------------------------------------
    // Authenticated routes
    // -----------------------------------------------------------------------
    Route::middleware(['auth.supabase', 'audit'])->group(function () {

        // Auth management (ALL auth endpoints for authenticated users)
        Route::prefix('auth')->name('auth.')->group(function () {
            Route::post('/logout',      [AuthController::class, 'logout'])        ->name('logout');
            Route::post('/logout-all',  [AuthController::class, 'logoutAllDevices'])->name('logout-all');     // ✅ FIX #5
            Route::get('/me',           [AuthController::class, 'me'])            ->name('me');
        });

        // User profile, account management & notifications
        Route::prefix('user')->name('user.')->group(function () {
            // Profile management
            Route::get('/profile',              [UserController::class, 'profile'])              ->name('profile');
            Route::put('/profile',              [UserController::class, 'updateProfile'])        ->name('profile.update');
            Route::post('/profile/avatar',      [UserController::class, 'uploadAvatar'])         ->name('avatar');
            
            // Password management
            Route::put('/password',             [UserController::class, 'updatePassword'])       ->name('password.update');  // ✅ FIX #3
            
            // Account management
            Route::delete('/account',           [UserController::class, 'deleteAccount'])        ->name('account.delete');    // ✅ FIX #6
            
            // Notifications
            Route::get('/notifications',        [UserController::class, 'notifications'])        ->name('notifications');
            Route::post('/notifications/read',  [UserController::class, 'markNotificationsRead'])->name('notifications.read');
        });

        // Prescription scanner & management
        Route::prefix('prescriptions')->name('prescriptions.')->group(function () {
            Route::get('/',           [PrescriptionController::class, 'index'])  ->name('index');
            Route::post('/upload',    [PrescriptionController::class, 'upload']) ->name('upload');
            // Multi-step review pipeline — see PrescriptionController docblock.
            Route::post('/{id}/extract', [PrescriptionController::class, 'extract'])->name('extract')
                 ->where('id', '[0-9]+');
            Route::post('/{id}/suggest', [PrescriptionController::class, 'suggest'])->name('suggest')
                 ->where('id', '[0-9]+');
            Route::post('/{id}/confirm', [PrescriptionController::class, 'confirm'])->name('confirm')
                 ->where('id', '[0-9]+');
            Route::get('/{id}/scan',  [PrescriptionController::class, 'scan'])   ->name('scan')
                 ->where('id', '[0-9]+');
            Route::get('/{id}',       [PrescriptionController::class, 'show'])   ->name('show')
                 ->where('id', '[0-9]+');
            Route::delete('/{id}',    [PrescriptionController::class, 'destroy'])->name('destroy')
                 ->where('id', '[0-9]+');
        });

        // Drug information & interaction checker (auth required — no
        // service is available to unregistered visitors; also logs to
        // the user's history)
        Route::prefix('drugs')->name('drugs.')->group(function () {
            Route::get('/{name}/brands', [DrugController::class, 'brands'])         ->name('brands');
            Route::post('/interactions', [DrugController::class, 'checkInteraction'])->name('interactions');
            Route::post('/check',        [DrugController::class, 'checkInteraction'])->name('check');
            Route::get('/{name}',        [DrugController::class, 'show'])           ->name('show');
        });

        // AI Healthcare Chatbot
        Route::prefix('chatbot')->name('chatbot.')->group(function () {
            Route::post('/message',  [ChatController::class, 'message']) ->name('message');
            Route::get('/history',   [ChatController::class, 'history']) ->name('history');
            Route::get('/{id}',      [ChatController::class, 'session']) ->name('session')
                 ->where('id', '[0-9]+');
            Route::delete('/{id}',   [ChatController::class, 'destroy'])->name('delete')
                 ->where('id', '[0-9]+');
        });

        // BMI Calculator & records
        Route::prefix('bmi')->name('bmi.')->group(function () {
            Route::post('/calculate', [BmiController::class, 'calculate'])->name('calculate');
            Route::get('/history',    [BmiController::class, 'history'])  ->name('history');
        });

        // -----------------------------------------------------------------------
        // Professional-only routes (pharmacist + physician)
        // -----------------------------------------------------------------------
        Route::middleware('role:pharmacist,physician')->prefix('professional')->name('pro.')->group(function () {
            // Prescriptions assigned for professional review
            Route::get('/prescriptions/queue',        [PrescriptionController::class, 'reviewQueue'])  ->name('rx.queue');
            Route::post('/prescriptions/{id}/approve',[PrescriptionController::class, 'approve'])      ->name('rx.approve')
                 ->where('id', '[0-9]+');
            Route::post('/prescriptions/{id}/flag',   [PrescriptionController::class, 'flag'])         ->name('rx.flag')
                 ->where('id', '[0-9]+');
        });

        // -----------------------------------------------------------------------
        // Admin-only routes
        // -----------------------------------------------------------------------
        Route::middleware('role:admin')->prefix('admin')->name('admin.')->group(function () {
            // User management
            Route::get('/users',                         [AdminController::class, 'users'])             ->name('users');
            Route::get('/users/{id}',                    [AdminController::class, 'user'])              ->name('user')
                 ->where('id', '[0-9]+');
            Route::put('/users/{id}/status',             [AdminController::class, 'updateUserStatus'])  ->name('user.status')
                 ->where('id', '[0-9]+');

            // Professional verification
            Route::get('/professionals/pending',         [AdminController::class, 'pendingProfessionals'])->name('professionals.pending');
            Route::post('/professionals/{id}/verify',    [AdminController::class, 'verifyProfessional'])  ->name('professionals.verify')
                 ->where('id', '[0-9]+');

            // Analytics & monitoring
            Route::get('/analytics',                     [AdminController::class, 'analytics'])         ->name('analytics');
            Route::get('/audit-logs',                    [AdminController::class, 'auditLogs'])         ->name('audit');
            Route::get('/api-usage',                     [AdminController::class, 'apiUsage'])          ->name('api.usage');
        });
    });
});

// -----------------------------------------------------------------------
// API documentation redirect
// -----------------------------------------------------------------------
Route::get('/docs', fn () => redirect('/api/v1/health'));