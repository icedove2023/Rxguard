/**
 * RxGuard — auth.js
 * Handles post-login auth flows on the profile page:
 *   - Change password (authenticated)
 *   - Session management (list & revoke other sessions)
 * Forgot/reset password live in forgot-password.html, reset-password.html,
 * and auth-callback.html (Supabase Auth's email-link flow).
 * Depends on: api.js, app.js
 */

'use strict';

/* ─────────────────────────────────────────
   Change Password  (authenticated user)
───────────────────────────────────────── */
const ChangePassword = {
  formId : 'changePasswordForm',
  btnId  : 'changePwdBtn',

  init() {
    const form = document.getElementById(this.formId);
    if (!form) return;

    // Live strength meter on new password field
    const newPwdInput = document.getElementById('newPassword');
    if (newPwdInput) {
      newPwdInput.addEventListener('input', () => {
        PasswordStrength.update(newPwdInput.value, 'newPwdStrength', 'newPwdBar', 'newPwdLabel');
      });
    }

    // Toggle visibility buttons
    ['currentPassword', 'newPassword', 'confirmNewPassword'].forEach(id => {
      const btn = document.getElementById(`toggle_${id}`);
      if (btn) btn.addEventListener('click', () => PasswordStrength.toggleVisibility(id, btn));
    });

    form.addEventListener('submit', e => this.handleSubmit(e));
  },

  async handleSubmit(e) {
    e.preventDefault();
    App.FormHelper.clearAll(this.formId);
    this.hideError();

    const current = document.getElementById('currentPassword')?.value;
    const newPwd  = document.getElementById('newPassword')?.value;
    const confirm = document.getElementById('confirmNewPassword')?.value;

    // Validation
    let valid = true;
    if (!current) { App.FormHelper.setError('currentPassword', 'Current password is required'); valid = false; }
    if (!newPwd || newPwd.length < 8) {
      App.FormHelper.setError('newPassword', 'New password must be at least 8 characters'); valid = false;
    }
    if (newPwd === current) {
      App.FormHelper.setError('newPassword', 'New password must differ from current password'); valid = false;
    }
    if (newPwd !== confirm) {
      App.FormHelper.setError('confirmNewPassword', 'Passwords do not match'); valid = false;
    }
    if (!valid) return;

    App.FormHelper.setLoading(this.btnId, true);

    try {
      await RxGuard.api.put('/user/password', {
        current_password      : current,
        password              : newPwd,
        password_confirmation : confirm,
      });

      // The backend revokes every session (including this one) after a
      // password change, so the current token is now dead. Log out
      // locally and send the user to sign back in with the new password.
      RxGuard.Toast.success('Password updated', 'For your security you have been signed out. Please log in again.');
      RxGuard.TokenStore.clearTokens();
      setTimeout(() => { window.location.href = 'login.html'; }, 1500);
      return;

    } catch (err) {
      if (err.validationErrors) {
        App.FormHelper.applyApiErrors(err.allFieldErrors());
      } else {
        this.showError(err.message || 'Failed to update password. Please try again.');
      }
    } finally {
      App.FormHelper.setLoading(this.btnId, false, 'Update Password');
    }
  },

  showError(msg) {
    const el = document.getElementById('changePwdError');
    if (el) { el.style.display = 'flex'; el.querySelector('span:last-child').textContent = msg; }
  },
  hideError() {
    const el = document.getElementById('changePwdError');
    if (el) el.style.display = 'none';
  },
};

/* ─────────────────────────────────────────
   Forgot Password / Reset Password
   NOTE: these flows now live in forgot-password.html,
   reset-password.html, and auth-callback.html — Supabase Auth
   delivers the recovery link with the session token in the URL
   *fragment* (not a query-param token+email pair), which those
   pages handle directly. Nothing to init here.
───────────────────────────────────────── */

/* ─────────────────────────────────────────
   Password strength utility  (shared)
───────────────────────────────────────── */
const PasswordStrength = {
  update(pwd, wrapperId, barId, labelId) {
    const wrapper = document.getElementById(wrapperId);
    const bar     = document.getElementById(barId);
    const label   = document.getElementById(labelId);
    if (!wrapper || !bar || !label) return;

    if (!pwd) { wrapper.style.display = 'none'; return; }
    wrapper.style.display = 'block';

    let score = 0;
    if (pwd.length >= 8)               score++;
    if (pwd.length >= 12)              score++;
    if (/[A-Z]/.test(pwd))            score++;
    if (/[0-9]/.test(pwd))            score++;
    if (/[^A-Za-z0-9]/.test(pwd))    score++;

    const levels = [
      { pct:'20%', color:'#E24B4A', text:'Very weak'  },
      { pct:'40%', color:'#E5A50A', text:'Weak'        },
      { pct:'60%', color:'#E5A50A', text:'Fair'        },
      { pct:'80%', color:'#1D9E75', text:'Strong'      },
      { pct:'100%',color:'#0F6E56', text:'Very strong' },
    ];
    const lvl = levels[Math.min(score, 4)];
    bar.style.width      = lvl.pct;
    bar.style.background = lvl.color;
    label.textContent    = lvl.text;
    label.style.color    = lvl.color;
  },

  toggleVisibility(fieldId, btn) {
    const field  = document.getElementById(fieldId);
    if (!field) return;
    const isText = field.type === 'text';
    field.type   = isText ? 'password' : 'text';
    btn.textContent = isText ? '👁' : '🙈';
  },
};

/* ─────────────────────────────────────────
   Two-Factor / Session info (placeholder)
───────────────────────────────────────── */
const SessionManager = {
  async loadSessions() {
    // Future: GET /api/user/sessions for active device list
    const container = document.getElementById('sessionsList');
    if (!container) return;
    const user = RxGuard.Auth.currentUser();
    container.innerHTML = `
      <div style="display:flex;align-items:center;gap:.875rem;padding:.75rem;
                  background:var(--rx-green-light);border-radius:10px;border:1px solid #A5D9C5">
        <span style="font-size:1.25rem">💻</span>
        <div style="flex:1">
          <div style="font-size:.875rem;font-weight:600">Current session</div>
          <div style="font-size:.75rem;color:var(--rx-muted)">
            ${navigator.userAgent.slice(0,60)}…
          </div>
        </div>
        <span class="badge badge-safe">Active</span>
      </div>`;
  },

  async revokeAll() {
    if (!confirm('Sign out of all other devices?')) return;
    try {
      await RxGuard.api.post('/auth/logout-all', {});
      RxGuard.Toast.success('Signed out', 'All other sessions have been revoked.');
    } catch (err) {
      RxGuard.Toast.error('Failed', err.message);
    }
  },
};

/* ─────────────────────────────────────────
   Auto-init based on which forms are present
───────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  ChangePassword.init();
  SessionManager.loadSessions();
});

/* Export */
window.AuthForms = { ChangePassword, PasswordStrength, SessionManager };