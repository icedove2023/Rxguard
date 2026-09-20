/**
 * RxGuard Mobile — types/index.ts
 *
 * Shared TypeScript interfaces and types that mirror
 * the backend API response shapes.
 */

import type { UserRole, RxStatus, SeverityLevel } from '@constants';

/* ─────────────────────────────────────────────────────────────────
   Auth / User
───────────────────────────────────────────────────────────────── */

export interface ProfessionalProfile {
  profession       : string;
  license_number   : string;
  institution      : string;
  specialty        : string | null;
  license_verified : boolean;
  verified_at      : string | null;
}

export interface User {
  id                  : number;
  name                : string;
  email               : string;
  phone               : string | null;
  role                : UserRole;
  avatar_url          : string | null;
  is_verified         : boolean;
  is_active           : boolean;
  email_verified_at   : string | null;
  last_login_at       : string | null;
  created_at          : string;
  professional_profile: ProfessionalProfile | null;
}

export interface AuthTokens {
  access_token  : string;
  refresh_token : string;
  token_type    : string;
  expires_in    : number;
}

/** Register can return live tokens (email confirmation disabled) OR
 *  ask the user to confirm their email first (the normal Supabase flow). */
export interface RegisterResult {
  user                  : User;
  access_token?         : string;
  refresh_token?        : string;
  token_type?           : string;
  expires_in?           : number;
  requires_confirmation?: boolean;
}

export interface LoginPayload {
  email    : string;
  password : string;
}

export interface RegisterPayload {
  name                  : string;
  email                 : string;
  phone                 : string | null;
  password              : string;
  password_confirmation : string;
  role                  : UserRole;
  license_number?       : string;
  institution?          : string;
  specialty?            : string;
}

/* ─────────────────────────────────────────────────────────────────
   API response envelope
───────────────────────────────────────────────────────────────── */

export interface ApiResponse<T> {
  status  : 'success' | 'error';
  message?: string;
  data    : T;
  errors? : Record<string, string[]>;
}

export interface PaginatedData<T> {
  data          : T[];
  current_page  : number;
  last_page     : number;
  per_page      : number;
  total         : number;
  from          : number | null;
  to            : number | null;
}

/* ─────────────────────────────────────────────────────────────────
   Prescription
───────────────────────────────────────────────────────────────── */

export interface PatientInfo {
  name   : string | null;
  age    : number | null;
  gender : 'male' | 'female' | 'other' | null;
}

export interface PrescriberInfo {
  name     : string | null;
  reg_no   : string | null;
  hospital : string | null;
  contact  : string | null;
}

export interface DrugBrand {
  brand_name   : string;
  manufacturer?: string;
  strength?    : string;
}

export interface EmdexSummary {
  indication         : string | null;
  pregnancy_category : string | null;
  common_side_effects: string[];
  major_warnings     : string[];
}

export interface PrescriptionDrug {
  id               : number;
  drug_name        : string;
  generic_name     : string | null;
  display_name     : string;
  strength         : string | null;
  dosage_form      : string | null;
  dose_instructions: string | null;
  duration         : string | null;
  quantity         : string | null;
  route            : string | null;
  atc_code         : string | null;
  has_warning      : boolean;
  warning_text     : string | null;
  brands           : string[];
  emdex_summary    : EmdexSummary | null;
}

export interface DrugAlternative {
  generic          : string;
  brands           : string[];
  reason           : string | null;
  safety_advantage : string | null;
  availability     : 'widely_available' | 'sometimes_available' | 'specialist_only';
}

export interface DrugInteraction {
  id               : number;
  drug_a           : string;
  drug_b           : string;
  severity         : SeverityLevel;
  severity_color   : string;
  interaction_type : string;
  mechanism        : string | null;
  clinical_effect  : string | null;
  recommendation   : string | null;
  evidence_level   : 'A' | 'B' | 'C' | 'D' | null;
  source           : string | null;
  alternatives     : DrugAlternative[];
}

export interface PrescriptionFlags {
  has_interactions: boolean;
  has_errors      : boolean;
}

export interface ReviewInfo {
  status      : string | null;
  notes       : string | null;
  reviewed_by : { id: number; name: string; role: string } | null;
  reviewed_at : string | null;
  flag_reason : string | null;
  flagged_at  : string | null;
}

export interface UploadedBy {
  id    : number;
  name  : string;
  email : string;
}

export interface GeminiMeta {
  model      : string | null;
  request_id : string | null;
}

export interface Prescription {
  id                  : number;
  status              : RxStatus;
  safety_score        : number | null;
  completeness_score  : number | null;
  safety_label        : string;
  safety_color        : string;
  ocr_confidence      : number | null;
  ocr_engine          : string | null;
  raw_ocr_text        : string | null;
  suggested_text      : string | null;
  suggested_fields    : Record<string, unknown> | null;
  approved_text       : string | null;
  edit_source         : 'manual' | 'gemini' | 'hybrid' | null;
  file_type           : 'jpg' | 'png' | 'pdf';
  scan_url            : string;
  patient             : PatientInfo;
  uploaded_by         : UploadedBy | null;
  prescriber          : PrescriberInfo;
  prescription_date   : string | null;
  drugs               : PrescriptionDrug[];
  interactions        : DrugInteraction[];
  flags               : PrescriptionFlags;
  review              : ReviewInfo;
  gemini_meta         : GeminiMeta;
  created_at          : string;
  updated_at          : string;
}

/** Response from POST /prescriptions/{id}/extract (Tesseract OCR) */
export interface OcrExtractResult {
  prescription_id : number;
  status          : RxStatus;
  raw_text        : string;
  ocr_engine      : string;
  ocr_confidence  : number;
  pages           : number;
}

/** Response from POST /prescriptions/{id}/suggest (Gemini suggestion) */
export interface SuggestionResult {
  prescription_id : number;
  status          : RxStatus;
  raw_text        : string;
  suggested_text  : string;
  suggested_fields: Record<string, unknown>;
  notes           : string[];
}

export interface PrescriptionListItem {
  id               : number;
  status           : RxStatus;
  safety_score     : number | null;
  patient_name     : string | null;
  prescriber_name  : string | null;
  prescription_date: string | null;
  file_type        : string;
  has_interactions : boolean;
  has_errors       : boolean;
  created_at       : string;
}

export interface UploadPrescriptionResponse {
  prescription_id: number;
  status         : RxStatus;
}

/* ─────────────────────────────────────────────────────────────────
   Drug checker
───────────────────────────────────────────────────────────────── */

export interface InteractionCheckPayload {
  drugs            : string[];
  patient_pregnant?: boolean;
  patient_age?     : number | null;
}

export interface InteractionCheckResult {
  drugs              : string[];
  interaction_count  : number;
  has_major          : boolean;
  interactions       : DrugInteraction[];
  patient_flags      : { pregnant?: boolean; age?: number | null };
  checked_at         : string;
}

export interface DrugMonograph {
  drug_name    : string;
  generic_name : string;
  emdex_id     : string | null;
  atc_code     : string | null;
  monograph    : {
    indication         : string | null;
    dosage             : string | null;
    contraindications  : string[];
    side_effects       : string[];
    pregnancy_category : string | null;
    pregnancy_warning  : string | null;
    storage            : string | null;
    atc_code           : string | null;
  } | null;
  brands: DrugBrand[];
}

/* ─────────────────────────────────────────────────────────────────
   Chatbot
───────────────────────────────────────────────────────────────── */

export interface ChatMessage {
  id          : number;
  session_id  : number;
  role        : 'user' | 'assistant';
  content     : string;
  sources     : string[];
  created_at  : string;
}

export interface ChatSession {
  id            : number;
  session_token : string;
  title         : string | null;
  message_count : number;
  is_active     : boolean;
  messages?     : ChatMessage[];
  created_at    : string;
  updated_at    : string;
}

export interface ChatMessagePayload {
  message    : string;
  session_id?: number | null;
}

export interface ChatMessageResponse {
  session_id      : number;
  user_message    : string;
  assistant_reply : string;
  sources         : string[];
  tokens_used     : number;
}

/* ─────────────────────────────────────────────────────────────────
   BMI
───────────────────────────────────────────────────────────────── */

export type BmiCategory =
  | 'underweight'
  | 'normal'
  | 'overweight'
  | 'obese_I'
  | 'obese_II'
  | 'obese_III';

export interface BmiCalculatePayload {
  height_cm : number;
  weight_kg : number;
  age       : number;
  gender    : 'male' | 'female';
}

export interface BmiRecord {
  id              : number;
  bmi_value       : number;
  category        : BmiCategory;
  category_label  : string;
  category_color  : string;
  gauge_percent   : number;
  ideal_weight_kg : { min_kg: number; max_kg: number };
  inputs          : BmiCalculatePayload;
  nutrition_recs  : string[];
  lifestyle_recs  : string[];
  medical_note    : string;
  record_id       : number | null;
  recorded_at     : string | null;
}

/* ─────────────────────────────────────────────────────────────────
   Notifications
───────────────────────────────────────────────────────────────── */

export interface AppNotification {
  id         : string;
  user_id    : number;
  type       : string;
  title      : string;
  body       : string;
  data       : Record<string, unknown> | null;
  read_at    : string | null;
  created_at : string;
}

/* ─────────────────────────────────────────────────────────────────
   Navigation param lists
───────────────────────────────────────────────────────────────── */

export type AuthStackParamList = {
  Splash         : undefined;
  Login          : { redirect?: string };
  Register       : undefined;
  ForgotPassword : undefined;
  // Supabase delivers the recovery session via a deep-link URL fragment,
  // captured by the linking config and passed through as accessToken —
  // there's no separate emailed "token" + "email" pair to key off of.
  ResetPassword  : { accessToken: string };
};

export type MainTabParamList = {
  Dashboard : undefined;
  Scan      : undefined;
  Checker   : undefined;
  Chatbot   : undefined;
  BMI       : undefined;
};

export type RootStackParamList = {
  Auth                 : undefined;
  Main                 : undefined;
  ScanResult           : { prescriptionId: number };
  PrescriptionDetail   : { prescriptionId: number };
  CheckerResult        : { result: InteractionCheckResult };
  ChatSession          : { sessionId?: number };
  BMIHistory           : undefined;
  Profile              : undefined;
  Settings             : undefined;
  Notifications        : undefined;
};