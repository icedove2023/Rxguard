-- =============================================================
-- RxGuard - Nigeria's Prescription Safety Platform
-- Database Schema v1.0.0
-- Charset: utf8mb4 | Engine: InnoDB | Collation: utf8mb4_unicode_ci
-- =============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;
SET SQL_MODE = 'STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';

CREATE DATABASE IF NOT EXISTS rxguard_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE rxguard_db;

-- =============================================================
-- TABLE: users
-- Core identity table. Roles: consumer, pharmacist, physician, admin
-- =============================================================
CREATE TABLE users (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name            VARCHAR(120)    NOT NULL,
    email           VARCHAR(180)    NOT NULL,
    phone           VARCHAR(20)     NULL,
    password        VARCHAR(255)    NOT NULL COMMENT 'bcrypt hash',
    role            ENUM('consumer','pharmacist','physician','admin') NOT NULL DEFAULT 'consumer',
    avatar          VARCHAR(512)    NULL,
    is_verified     TINYINT(1)      NOT NULL DEFAULT 0,
    is_active       TINYINT(1)      NOT NULL DEFAULT 1,
    email_verified_at TIMESTAMP     NULL,
    last_login_at   TIMESTAMP       NULL,
    last_login_ip   VARCHAR(45)     NULL,
    remember_token  VARCHAR(100)    NULL,
    created_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uq_users_email (email),
    INDEX idx_users_role (role),
    INDEX idx_users_is_active (is_active),
    INDEX idx_users_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================
-- TABLE: professional_profiles
-- Extended data for pharmacists and physicians
-- =============================================================
CREATE TABLE professional_profiles (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id          BIGINT UNSIGNED NOT NULL,
    profession       ENUM('pharmacist','physician') NOT NULL,
    license_number   VARCHAR(60)     NOT NULL,
    institution      VARCHAR(255)    NOT NULL COMMENT 'Hospital or pharmacy name',
    specialty        VARCHAR(120)    NULL,
    license_verified TINYINT(1)      NOT NULL DEFAULT 0,
    verified_by      BIGINT UNSIGNED NULL COMMENT 'Admin user id who approved',
    verification_note TEXT           NULL,
    nafdac_ref       VARCHAR(80)     NULL COMMENT 'NAFDAC registry reference',
    mdcn_reg         VARCHAR(80)     NULL COMMENT 'MDCN/PCN registration number',
    verified_at      TIMESTAMP       NULL,
    created_at       TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uq_prof_user (user_id),
    INDEX idx_prof_license (license_number),
    INDEX idx_prof_verified (license_verified),
    CONSTRAINT fk_prof_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================
-- TABLE: personal_access_tokens  (Laravel Sanctum / JWT store)
-- =============================================================
CREATE TABLE personal_access_tokens (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tokenable_type  VARCHAR(255)    NOT NULL,
    tokenable_id    BIGINT UNSIGNED NOT NULL,
    name            VARCHAR(255)    NOT NULL,
    token           VARCHAR(64)     NOT NULL,
    abilities       TEXT            NULL,
    last_used_at    TIMESTAMP       NULL,
    expires_at      TIMESTAMP       NULL,
    created_at      TIMESTAMP       NULL,
    updated_at      TIMESTAMP       NULL,

    PRIMARY KEY (id),
    UNIQUE KEY uq_token (token),
    INDEX idx_tokenable (tokenable_type, tokenable_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================
-- TABLE: password_reset_tokens
-- =============================================================
CREATE TABLE password_reset_tokens (
    email      VARCHAR(180)  NOT NULL,
    token      VARCHAR(255)  NOT NULL,
    created_at TIMESTAMP     NULL,
    PRIMARY KEY (email),
    INDEX idx_prt_token (token)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================
-- TABLE: prescriptions
-- Master record for each uploaded prescription
-- =============================================================
CREATE TABLE prescriptions (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id             BIGINT UNSIGNED NOT NULL,
    reviewed_by         BIGINT UNSIGNED NULL COMMENT 'Pharmacist / physician who reviewed',
    scan_path           VARCHAR(512)    NOT NULL COMMENT 'S3 / local path to original file',
    file_type           ENUM('jpg','png','pdf') NOT NULL,
    raw_ocr_text        LONGTEXT        NULL COMMENT 'Raw text from Gemini OCR',
    extracted_fields    JSON            NULL COMMENT 'Structured extraction result',
    safety_score        DECIMAL(5,2)    NULL COMMENT '0-100 safety percentage',
    completeness_score  DECIMAL(5,2)    NULL,
    status              ENUM('pending','processing','completed','flagged','approved') NOT NULL DEFAULT 'pending',

    -- Patient fields extracted from prescription
    patient_name        VARCHAR(120)    NULL,
    patient_age         TINYINT UNSIGNED NULL,
    patient_gender      ENUM('male','female','other') NULL,
    prescription_date   DATE            NULL,

    -- Prescriber fields
    prescriber_name     VARCHAR(120)    NULL,
    prescriber_reg_no   VARCHAR(60)     NULL,
    prescriber_hospital VARCHAR(255)    NULL,
    prescriber_contact  VARCHAR(80)     NULL,

    -- Gemini analysis metadata
    gemini_request_id   VARCHAR(128)    NULL,
    gemini_model        VARCHAR(60)     NULL,
    ocr_confidence      DECIMAL(5,2)    NULL,

    -- Flags
    has_interactions    TINYINT(1)      NOT NULL DEFAULT 0,
    has_errors          TINYINT(1)      NOT NULL DEFAULT 0,
    is_archived         TINYINT(1)      NOT NULL DEFAULT 0,

    notes               TEXT            NULL COMMENT 'Reviewer notes',
    created_at          TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    INDEX idx_rx_user (user_id),
    INDEX idx_rx_status (status),
    INDEX idx_rx_safety_score (safety_score),
    INDEX idx_rx_created (created_at),
    CONSTRAINT fk_rx_user    FOREIGN KEY (user_id)    REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_rx_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================
-- TABLE: prescription_drugs
-- Individual drugs extracted from a prescription
-- =============================================================
CREATE TABLE prescription_drugs (
    id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    prescription_id    BIGINT UNSIGNED NOT NULL,
    drug_name          VARCHAR(200)    NOT NULL COMMENT 'As written on prescription',
    generic_name       VARCHAR(200)    NULL COMMENT 'Resolved from EMDEX',
    strength           VARCHAR(80)     NULL COMMENT 'e.g. 500mg, 10mg/5ml',
    dosage_form        VARCHAR(80)     NULL COMMENT 'Tablet, capsule, syrup etc.',
    dose_instructions  VARCHAR(255)    NULL COMMENT 'e.g. 1 tab BD after meals',
    duration           VARCHAR(80)     NULL COMMENT 'e.g. 7 days, 30 days',
    quantity           VARCHAR(60)     NULL COMMENT 'e.g. 14 tablets',
    route              VARCHAR(60)     NULL COMMENT 'Oral, IV, topical etc.',

    -- EMDEX enrichment
    emdex_drug_id      VARCHAR(60)     NULL,
    emdex_data         JSON            NULL COMMENT 'Full monograph from EMDEX',
    atc_code           VARCHAR(20)     NULL COMMENT 'WHO ATC classification',

    -- OpenFDA enrichment
    openfda_brands     JSON            NULL COMMENT 'Array of Nigerian brand objects',

    -- Validation flags
    dosage_valid       TINYINT(1)      NULL COMMENT 'NULL = unchecked',
    duration_valid     TINYINT(1)      NULL,
    has_warning        TINYINT(1)      NOT NULL DEFAULT 0,
    warning_text       TEXT            NULL,

    sort_order         TINYINT UNSIGNED NOT NULL DEFAULT 0,
    created_at         TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    INDEX idx_pd_prescription (prescription_id),
    INDEX idx_pd_generic (generic_name),
    INDEX idx_pd_atc (atc_code),
    CONSTRAINT fk_pd_prescription FOREIGN KEY (prescription_id) REFERENCES prescriptions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================
-- TABLE: drug_interactions
-- Detected interaction pairs from the safety engine
-- =============================================================
CREATE TABLE drug_interactions (
    id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    prescription_id   BIGINT UNSIGNED NOT NULL,
    drug_a            VARCHAR(200)    NOT NULL,
    drug_b            VARCHAR(200)    NOT NULL,
    severity          ENUM('major','moderate','minor','contraindicated') NOT NULL,
    interaction_type  ENUM('ddi','drug_pregnancy','drug_disease','duplicate_therapy','dosage_error','missing_info') NOT NULL,
    mechanism         TEXT            NULL COMMENT 'Clinical mechanism explanation',
    clinical_effect   TEXT            NULL,
    recommendation    TEXT            NULL,
    alternatives      JSON            NULL COMMENT 'Array of alternative drug objects',
    source            VARCHAR(80)     NULL COMMENT 'EMDEX | OpenFDA | Gemini',
    evidence_level    ENUM('A','B','C','D') NULL COMMENT 'Evidence grade',
    created_at        TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    INDEX idx_di_prescription (prescription_id),
    INDEX idx_di_severity (severity),
    INDEX idx_di_type (interaction_type),
    CONSTRAINT fk_di_prescription FOREIGN KEY (prescription_id) REFERENCES prescriptions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================
-- TABLE: drug_alternatives
-- Recommended alternatives for flagged drugs
-- =============================================================
CREATE TABLE drug_alternatives (
    id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    interaction_id     BIGINT UNSIGNED NOT NULL,
    alternative_generic VARCHAR(200)   NOT NULL,
    alternative_brands  JSON           NULL COMMENT 'OpenFDA brand list',
    reason             TEXT           NULL COMMENT 'Why this is safer',
    safety_advantage   TEXT           NULL,
    availability       ENUM('widely_available','sometimes_available','specialist_only') NOT NULL DEFAULT 'widely_available',
    created_at         TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    INDEX idx_da_interaction (interaction_id),
    CONSTRAINT fk_da_interaction FOREIGN KEY (interaction_id) REFERENCES drug_interactions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================
-- TABLE: chat_sessions
-- AI chatbot conversation threads
-- =============================================================
CREATE TABLE chat_sessions (
    id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id        BIGINT UNSIGNED NOT NULL,
    session_token  VARCHAR(64)     NOT NULL,
    title          VARCHAR(255)    NULL COMMENT 'Auto-generated from first message',
    message_count  SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    is_active      TINYINT(1)      NOT NULL DEFAULT 1,
    created_at     TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uq_chat_token (session_token),
    INDEX idx_chat_user (user_id),
    CONSTRAINT fk_chat_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================
-- TABLE: chat_messages
-- Individual messages within a chat session
-- =============================================================
CREATE TABLE chat_messages (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    session_id      BIGINT UNSIGNED NOT NULL,
    role            ENUM('user','assistant') NOT NULL,
    content         LONGTEXT        NOT NULL,
    sources         JSON            NULL COMMENT 'EMDEX/OpenFDA citations used',
    gemini_model    VARCHAR(60)     NULL,
    tokens_used     SMALLINT UNSIGNED NULL,
    created_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    INDEX idx_cm_session (session_id),
    CONSTRAINT fk_cm_session FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================
-- TABLE: bmi_records
-- BMI calculations and wellness recommendations per user
-- =============================================================
CREATE TABLE bmi_records (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id          BIGINT UNSIGNED NOT NULL,
    height_cm        DECIMAL(5,1)    NOT NULL,
    weight_kg        DECIMAL(5,1)    NOT NULL,
    age              TINYINT UNSIGNED NOT NULL,
    gender           ENUM('male','female') NOT NULL,
    bmi_value        DECIMAL(5,2)    NOT NULL,
    category         ENUM('underweight','normal','overweight','obese_I','obese_II','obese_III') NOT NULL,
    nutrition_recs   JSON            NULL COMMENT 'Array of nutrition recommendations',
    lifestyle_recs   JSON            NULL COMMENT 'Array of lifestyle modifications',
    notes            TEXT            NULL,
    recorded_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    INDEX idx_bmi_user (user_id),
    INDEX idx_bmi_recorded (recorded_at),
    CONSTRAINT fk_bmi_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================
-- TABLE: audit_logs
-- Immutable record of all significant actions (NDPR compliance)
-- =============================================================
CREATE TABLE audit_logs (
    id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id        BIGINT UNSIGNED NULL COMMENT 'NULL for unauthenticated actions',
    action         VARCHAR(100)    NOT NULL COMMENT 'e.g. prescription.scan, user.login',
    resource_type  VARCHAR(80)     NULL COMMENT 'e.g. Prescription, User',
    resource_id    BIGINT UNSIGNED NULL,
    old_values     JSON            NULL COMMENT 'Before state (for updates)',
    new_values     JSON            NULL COMMENT 'After state',
    ip_address     VARCHAR(45)     NULL,
    user_agent     VARCHAR(512)    NULL,
    session_id     VARCHAR(64)     NULL,
    status         ENUM('success','failure') NOT NULL DEFAULT 'success',
    metadata       JSON            NULL,
    created_at     TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    INDEX idx_al_user (user_id),
    INDEX idx_al_action (action),
    INDEX idx_al_resource (resource_type, resource_id),
    INDEX idx_al_created (created_at),
    CONSTRAINT fk_al_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================
-- TABLE: notifications
-- In-app and push notification records
-- =============================================================
CREATE TABLE notifications (
    id          CHAR(36)        NOT NULL COMMENT 'UUID',
    user_id     BIGINT UNSIGNED NOT NULL,
    type        VARCHAR(100)    NOT NULL COMMENT 'e.g. InteractionAlert, PrescriptionReady',
    title       VARCHAR(255)    NOT NULL,
    body        TEXT            NOT NULL,
    data        JSON            NULL COMMENT 'Additional payload',
    read_at     TIMESTAMP       NULL,
    created_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    INDEX idx_notif_user (user_id),
    INDEX idx_notif_read (read_at),
    CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================
-- TABLE: drug_cache
-- Local cache of EMDEX + OpenFDA API responses to reduce API calls
-- =============================================================
CREATE TABLE drug_cache (
    id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    drug_name      VARCHAR(200)    NOT NULL,
    generic_name   VARCHAR(200)    NULL,
    source         ENUM('emdex','openfda','gemini') NOT NULL,
    data           LONGTEXT        NOT NULL COMMENT 'JSON response from API',
    fetched_at     TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at     TIMESTAMP       NOT NULL,

    PRIMARY KEY (id),
    INDEX idx_dc_drug (drug_name),
    INDEX idx_dc_source (source),
    INDEX idx_dc_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================
-- TABLE: api_usage_logs
-- Track external API call counts for monitoring and billing
-- =============================================================
CREATE TABLE api_usage_logs (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    api_name     ENUM('gemini','emdex','openfda','nafdac') NOT NULL,
    endpoint     VARCHAR(255)    NOT NULL,
    user_id      BIGINT UNSIGNED NULL,
    status_code  SMALLINT        NOT NULL,
    response_ms  SMALLINT        NULL COMMENT 'Response time in milliseconds',
    tokens_used  INT UNSIGNED    NULL COMMENT 'For Gemini token billing',
    created_at   TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    INDEX idx_aul_api (api_name),
    INDEX idx_aul_created (created_at),
    INDEX idx_aul_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================
-- TABLE: system_settings
-- Key-value store for admin-configurable platform settings
-- =============================================================
CREATE TABLE system_settings (
    `key`        VARCHAR(100)    NOT NULL,
    `value`      TEXT            NULL,
    `group`      VARCHAR(60)     NOT NULL DEFAULT 'general',
    description  VARCHAR(255)    NULL,
    updated_by   BIGINT UNSIGNED NULL,
    updated_at   TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================
-- INITIAL DATA: System settings defaults
-- =============================================================
INSERT INTO system_settings (`key`, `value`, `group`, description) VALUES
('gemini_model',         'gemini-1.5-pro',       'ai',       'Gemini model for OCR and chat'),
('safety_score_threshold', '70',                 'scanner',  'Minimum passing safety score'),
('max_upload_size_mb',   '10',                   'scanner',  'Max prescription upload size'),
('session_lifetime_min', '60',                   'auth',     'JWT access token lifetime'),
('refresh_token_days',   '7',                    'auth',     'Refresh token lifetime in days'),
('drug_cache_hours',     '24',                   'cache',    'Hours to cache drug API responses'),
('rate_limit_per_min',   '60',                   'security', 'API rate limit per minute per IP'),
('ndpr_consent_version', '1.0',                  'legal',    'Current consent document version'),
('platform_name',        'RxGuard',              'general',  'Platform display name'),
('support_email',        'support@rxguard.ng',   'general',  'Support contact email');

SET FOREIGN_KEY_CHECKS = 1;

-- =============================================================
-- VIEWS Why LEFT JOIN not INNER JOIN?
-- INNER JOIN would exclude prescriptions without users, drugs, or interactions.
-- LEFT JOIN ensures you see every prescription, just with zeros or NULLs for missing related data
-- =============================================================

CREATE OR REPLACE VIEW v_prescription_summary AS
SELECT
    p.id,
    p.user_id,
    u.name          AS patient_name_user,
    p.patient_name,
    p.prescription_date,
    p.safety_score,
    p.status,
    p.has_interactions,
    p.has_errors,
    COUNT(pd.id)    AS drug_count,
    COUNT(di.id)    AS interaction_count,
    p.created_at
FROM prescriptions p
LEFT JOIN users u          ON u.id = p.user_id
LEFT JOIN prescription_drugs pd ON pd.prescription_id = p.id
LEFT JOIN drug_interactions di  ON di.prescription_id = p.id
GROUP BY p.id, p.user_id, u.name, p.patient_name, p.prescription_date,
         p.safety_score, p.status, p.has_interactions, p.has_errors, p.created_at;

CREATE OR REPLACE VIEW v_api_usage_daily AS
SELECT
    DATE(created_at)  AS usage_date,
    api_name,
    COUNT(*)          AS total_calls,
    AVG(response_ms)  AS avg_response_ms,
    SUM(tokens_used)  AS total_tokens,
    SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) AS error_count
FROM api_usage_logs
GROUP BY DATE(created_at), api_name;
