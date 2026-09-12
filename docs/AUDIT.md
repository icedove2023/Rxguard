# RxGuard — Technical Audit (Screens + Frontend/Backend Integration)

_Snapshot as of this session. Covers the web frontend (`frontend/`) and Laravel backend (`backend/`). Mobile app is explicitly out of scope — still pending._

---

## 1. Per-screen audit

### `login.html`
- **Right:** Supabase-backed login, "email not confirmed" (403) handled with an inline resend-confirmation link, redirect-after-login via `?redirect=`.
- **Gap:** No CAPTCHA/rate-limit UI feedback if Supabase starts throttling repeated failed logins — user just sees a generic error after several tries. Not a blocker, just no graceful messaging for that specific case.

### `register.html`
- **Right:** Two account types (consumer / professional), Supabase sign-up wired, branches correctly on `requires_confirmation` vs. immediate session.
- **Gap:** No password-strength meter on this page (one exists in `auth.js`/`PasswordStrength` but isn't attached here) — inconsistent with the change-password form on `profile.html`, which does show one.

### `forgot-password.html` / `reset-password.html` / `auth-callback.html`
- **Right:** Full Supabase recovery-link round trip: request → email (via Resend) → fragment-token capture → set new password. Generic "check your email" response (no account-enumeration leak).
- **Gap:** `auth-callback.html` assumes the link always lands with a URL fragment; if a corporate email scanner "clicks" the link server-side before the user does (common with some email security gateways), the one-time Supabase link gets consumed and the real user hits "link expired." This is a known category of issue with any fragment-based magic-link flow, not unique to this build — flagging for awareness, no fix implemented.

### `dashboard.html`
- **Right:** `requireAuth()` gate runs on load, role-aware metric labels for admin, notification list rendering, interaction alerts.
- **Gap (unchanged from earlier audit, still open):** No admin management UI. The API client (`api.js`) has full wrappers for user management, professional verification, and audit logs, but nothing in the dashboard (or any other page) calls them beyond `analytics()`. An admin logging in sees the same shell as everyone else with a couple of extra numbers.

### `scan.html` — rebuilt this session
- **Right (new):** Full 4-step pipeline now matches the backend exactly:
  1. Upload → 2. Tesseract OCR (raw text, engine + confidence shown) → 3. **Review & Approve** screen (editable textarea, optional "Ask Gemini" button showing a side-by-side suggestion + notes, "Use This Version" button, free-form manual editing at any point) → 4. Approve triggers EMDEX/OpenFDA validation, renders the safety report.
  - `edit_source` (`manual`/`gemini`/`hybrid`) is derived client-side by diffing the approved text against whichever baseline (raw or Gemini) the user last touched, and sent to the backend for audit purposes.
  - Resuming an interrupted scan (`?id=`) now correctly re-enters the review screen if the prescription is stuck at `extracted`/`awaiting_review` instead of assuming a finished report exists.
  - `requireAuth()` gate added; the old "browse as guest" mode was removed per the new "no services for unregistered users" requirement.
- **Gap:** No visual diff (e.g. highlighted word-level changes) between raw and Gemini text — it's just two separate text blocks. A power-user nicety, not essential.
- **Gap:** No client-side preview of the uploaded scan image next to the text during review (the `fetchScanBlobUrl()` helper exists in `api.js` for this but isn't yet wired into `scan.html`'s review screen). Would help users cross-check OCR errors against the original image.

### `checker.html` (drug interaction checker)
- **Right:** Wired to the (now authenticated-only) `/drugs/interactions` endpoint; `requireAuth()` gate added this session.
- **Gap:** None found beyond the auth gate that was just closed.

### `bmi.html`
- **Right:** `requireAuth()` gate added this session; calculation + history wired correctly.
- **Gap:** None found beyond the auth gate that was just closed.

### `chatbot.html`
- **Right:** `requireAuth()` gate added this session; the old guest-mode banner and "guest session list" markup were removed (dead code cleanup).
- **Gap:** None found beyond the auth gate that was just closed.

### `profile.html`
- **Right:** `requireAuth()` gate (pre-existing), tabs for profile/security/sessions, **change password now wired** to Supabase via `auth.js`'s `ChangePassword` module (forces full logout afterward, matching the backend's "revoke all sessions" behavior), **delete account now wired** with a password field + typed "DELETE" confirmation, matching the backend's actual permanent-delete behavior (copy was previously inaccurate — it claimed a reversible 30-day "deactivation," which the backend never implemented).
- **Gap:** Avatar upload UI — present and wired to `/user/profile/avatar`, not independently re-verified this session; flagging only because it wasn't part of this pass's focus.

### `index.html` (landing page)
- **Right:** Correctly remains public — no auth-gated functionality lives here, consistent with "no services for unregistered users" (a marketing page isn't a "service").

---

## 2. Frontend ↔ Backend integration audit

### Auth (Supabase)
| Area | Status |
|---|---|
| Register/login/logout/refresh | ✅ Wired, contract matches (`access_token`/`refresh_token` shape consistent both ends) |
| Forgot/reset password | ✅ Wired end-to-end including the three new pages |
| Change password / delete account | ✅ Wired this session (previously API-only, no UI) |
| Resend confirmation | ✅ Wired (login page's inline link) |
| Route protection | ✅ Every feature route now behind `auth.supabase` middleware; drug lookups moved from public to authenticated this session |

### Prescription pipeline
| Area | Status |
|---|---|
| Upload → Extract (Tesseract) → Suggest (Gemini) → Confirm (EMDEX/OpenFDA) | ✅ Newly built end-to-end this session, frontend and backend both rewritten to match |
| Resuming an in-progress scan | ✅ Handled (see scan.html notes above) |
| Scan file access | ✅ Fixed a real bug — `scan_url` used to point at a public-storage path that didn't exist for a privately-stored file (PHI exposure risk via a broken link); now routed through an authenticated, ownership-checked `/prescriptions/{id}/scan` endpoint, fetched as a blob client-side since a plain `<img src>` can't carry an Authorization header |

### Admin & professional-review — still an open gap
| Area | Status |
|---|---|
| Admin: user management, professional verification, audit logs, analytics, API usage | Backend 100% implemented; `api.js` has full wrappers; **no page in the frontend calls any of it except `analytics()`** |
| Pharmacist/physician review queue (approve/flag prescriptions) | Backend 100% implemented (and the `'verified'`/`'approved'` status-enum mismatch found this session is now fixed); **no frontend wrapper or page exists at all** |

These two are the largest remaining frontend/backend gaps in the whole app — the backend is ready, nothing on the frontend consumes it.

### Audit logging
- Fixed a real bug this session: `AuditMiddleware`'s path-matching patterns (`api/login`, `api/prescriptions`, etc.) never matched the actual routed paths (`api/v1/auth/login`, etc.), so every request was silently falling back to a generic, unreadable action name. Patterns now match the real `api/v1/...` prefix.
- Removed a duplicate-logging bug introduced then caught in the same session (both the `audit` middleware and explicit `AuditLog::record()` calls firing on the same public auth routes).

### Data model / status consistency
- Prescription `status` enum widened (`extracted`, `awaiting_review`) to support the new pipeline; a genuine pre-existing bug (`approve()` writing `'verified'`, a value never in the enum) is fixed to `'approved'`.

---

## 3. Known outstanding gaps (not addressed this session, by instruction or scope)

- **Mobile app:** still an auth-only shell (Login/Register real, everything else a `PlaceholderScreen`). Explicitly left pending.
- **Admin management UI** (frontend): backend-ready, no pages built.
- **Professional review-queue UI** (frontend): backend-ready, no pages built.
- **Zip regeneration:** not performed, per instruction — none of this session's file changes have been bundled yet.
- **No automated tests** anywhere in the backend (`tests/` still holds only Laravel's default placeholder tests) — the entire auth rewrite and OCR pipeline rebuild in this session have no test coverage.
- **Tesseract/Imagick server dependencies**: `docker/Dockerfile.backend` now installs `tesseract-ocr`, `ghostscript`, and the PHP `imagick` extension, but if you're running the backend outside this Docker image (bare-metal, a different container base, etc.), you'll need to install these yourself or PDF/image OCR will fail at runtime with a clear error message (by design — it doesn't silently fall back to anything).
