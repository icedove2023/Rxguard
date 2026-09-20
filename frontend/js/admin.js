/**
 * RxGuard — admin.js
 * Powers admin.html: user management, professional verification,
 * platform analytics, audit logs, external API usage.
 * Depends on: api.js, app.js
 */
'use strict';

const AdminState = {
  usersPage : 1,
  auditPage : 1,
};

/* ─────────────────────────────────────────
   Tabs
───────────────────────────────────────── */
function switchAdminTab(tab) {
  document.querySelectorAll('.admin-tab').forEach(el =>
    el.classList.toggle('active', el.dataset.tab === tab));
  document.querySelectorAll('.admin-panel').forEach(el =>
    el.classList.toggle('active', el.id === `panel-${tab}`));

  if (tab === 'overview')      loadOverview();
  if (tab === 'users')         loadUsers(1);
  if (tab === 'verification')  loadVerificationQueue();
  if (tab === 'audit')         loadAuditLogs(1);
  if (tab === 'api-usage')     loadApiUsage();
}

/* ─────────────────────────────────────────
   Overview
───────────────────────────────────────── */
async function loadOverview() {
  const statsEl = document.getElementById('overviewStats');
  statsEl.innerHTML = '<div class="empty-state">Loading…</div>';

  try {
    const { data } = await RxGuard.Admin.analytics();

    statsEl.innerHTML = [
      statMini(data.users.total, 'Total Users'),
      statMini(data.users.this_month, 'New This Month'),
      statMini(data.prescriptions.total, 'Prescriptions Scanned'),
      statMini(data.prescriptions.with_interactions, 'With Interactions'),
      statMini(data.prescriptions.flagged, 'Flagged for Review'),
      statMini(data.prescriptions.avg_safety_score ?? '—', 'Avg. Safety Score'),
    ].join('');

    const sevEl = document.getElementById('severityBreakdown');
    const severities = data.interactions_by_severity || [];
    sevEl.innerHTML = severities.length
      ? severities.map(s => statMini(s.count, capitalize(s.severity))).join('')
      : '<div class="empty-state">No interaction data yet.</div>';

  } catch (err) {
    statsEl.innerHTML = `<div class="empty-state">Failed to load analytics: ${escHtml(err.message)}</div>`;
  }
}

function statMini(value, label) {
  return `<div class="stat-mini"><div class="stat-mini-value">${value}</div><div class="stat-mini-label">${label}</div></div>`;
}

/* ─────────────────────────────────────────
   Users
───────────────────────────────────────── */
async function loadUsers(page = 1) {
  AdminState.usersPage = page;
  const body = document.getElementById('usersTableBody');
  body.innerHTML = `<tr><td colspan="6" class="empty-state">Loading…</td></tr>`;

  const params = {
    page,
    search : document.getElementById('userSearch').value.trim(),
    role   : document.getElementById('userRoleFilter').value,
    status : document.getElementById('userStatusFilter').value,
  };

  try {
    const { data } = await RxGuard.Admin.users(params);
    const users = data.data || [];

    document.getElementById('usersEmpty').style.display = users.length ? 'none' : 'block';
    body.innerHTML = users.map(u => `
      <tr>
        <td>${escHtml(u.name)}</td>
        <td>${escHtml(u.email)}</td>
        <td><span class="badge badge-info">${u.role}</span></td>
        <td>${u.is_active ? '<span class="badge badge-success">Active</span>' : '<span class="badge badge-danger">Deactivated</span>'}</td>
        <td>${App.DateFmt.display(u.created_at)}</td>
        <td style="text-align:right">
          <button class="btn btn-outline btn-sm" onclick="openUserModal(${u.id})">View</button>
        </td>
      </tr>
    `).join('');

    document.getElementById('usersPager').innerHTML = App.renderPagination(
      { current_page: data.current_page, last_page: data.last_page }, loadUsers
    );

  } catch (err) {
    body.innerHTML = `<tr><td colspan="6" class="empty-state">Failed to load users: ${escHtml(err.message)}</td></tr>`;
  }
}

async function openUserModal(id) {
  document.getElementById('userModalBody').innerHTML = '<div class="empty-state">Loading…</div>';
  App.Modal.open('userModal');

  try {
    const { data: user } = await RxGuard.Admin.user(id);
    const pp = user.professional_profile;

    document.getElementById('userModalBody').innerHTML = `
      <div style="display:flex;flex-direction:column;gap:.75rem;font-size:.875rem">
        <div><strong>${escHtml(user.name)}</strong> · ${escHtml(user.email)}</div>
        <div>Role: <span class="badge badge-info">${user.role}</span>
             Status: ${user.is_active ? '<span class="badge badge-success">Active</span>' : '<span class="badge badge-danger">Deactivated</span>'}</div>
        <div>Phone: ${escHtml(user.phone || '—')}</div>
        <div>Joined: ${App.DateFmt.display(user.created_at)}</div>
        ${pp ? `
          <div style="border-top:1px solid var(--rx-border);padding-top:.75rem">
            <strong>Professional Profile</strong><br/>
            ${escHtml(pp.profession)} · Licence ${escHtml(pp.license_number)}<br/>
            ${escHtml(pp.institution || '')}<br/>
            Verified: ${pp.license_verified ? '✅' : '⏳ Pending'}
          </div>` : ''}
        <div style="border-top:1px solid var(--rx-border);padding-top:.75rem;display:flex;gap:.5rem">
          <button class="btn btn-sm ${user.is_active ? 'btn-danger' : 'btn-primary'}"
                  onclick="toggleUserStatus(${user.id}, ${!user.is_active})">
            ${user.is_active ? 'Deactivate Account' : 'Reactivate Account'}
          </button>
        </div>
      </div>
    `;
  } catch (err) {
    document.getElementById('userModalBody').innerHTML =
      `<div class="empty-state">Failed to load user: ${escHtml(err.message)}</div>`;
  }
}

async function toggleUserStatus(id, activate) {
  try {
    await RxGuard.Admin.updateUserStatus(id, activate);
    RxGuard.Toast.success('Updated', `User ${activate ? 'reactivated' : 'deactivated'}.`);
    App.Modal.close('userModal');
    loadUsers(AdminState.usersPage);
  } catch (err) {
    RxGuard.Toast.error('Failed', err.message || 'Could not update user status.');
  }
}

/* ─────────────────────────────────────────
   Professional verification
───────────────────────────────────────── */
async function loadVerificationQueue() {
  const list = document.getElementById('verificationList');
  list.innerHTML = '<div class="empty-state">Loading…</div>';

  try {
    const { data } = await RxGuard.Admin.pendingProfessionals();
    const profiles = data.data || [];

    document.getElementById('verificationEmpty').style.display = profiles.length ? 'none' : 'block';
    document.getElementById('pendingBadge').innerHTML = profiles.length
      ? `<span class="badge badge-warning" style="margin-left:.35rem">${profiles.length}</span>` : '';

    list.innerHTML = profiles.map(p => `
      <div class="card" style="margin-bottom:var(--space-3);background:var(--rx-surface-alt)">
        <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:.75rem">
          <div>
            <strong>${escHtml(p.user?.name || 'Unknown')}</strong> — ${escHtml(p.profession)}<br/>
            <span style="font-size:.8125rem;color:var(--rx-muted)">
              Licence: ${escHtml(p.license_number)} · ${escHtml(p.institution || '')}
            </span><br/>
            <span style="font-size:.75rem;color:var(--rx-muted)">Applied ${App.DateFmt.display(p.created_at)}</span>
          </div>
          <div style="display:flex;gap:.5rem;align-items:flex-start">
            <button class="btn btn-primary btn-sm" onclick="verifyProfessional(${p.id}, true)">✅ Approve</button>
            <button class="btn btn-danger btn-sm" onclick="verifyProfessional(${p.id}, false)">❌ Reject</button>
          </div>
        </div>
      </div>
    `).join('');
  } catch (err) {
    list.innerHTML = `<div class="empty-state">Failed to load queue: ${escHtml(err.message)}</div>`;
  }
}

async function verifyProfessional(id, approved) {
  let note = null;
  if (!approved) {
    note = prompt('Reason for rejection (shown internally only):') || '';
  }
  try {
    await RxGuard.Admin.verifyProfessional(id, approved, note);
    RxGuard.Toast.success(approved ? 'Approved' : 'Rejected', 'Professional verification updated.');
    loadVerificationQueue();
  } catch (err) {
    RxGuard.Toast.error('Failed', err.message || 'Could not update verification status.');
  }
}

/* ─────────────────────────────────────────
   Audit logs
───────────────────────────────────────── */
async function loadAuditLogs(page = 1) {
  AdminState.auditPage = page;
  const body = document.getElementById('auditTableBody');
  body.innerHTML = `<tr><td colspan="4" class="empty-state">Loading…</td></tr>`;

  const params = {
    page,
    action : document.getElementById('auditActionFilter').value.trim(),
    from   : document.getElementById('auditFromFilter').value,
    to     : document.getElementById('auditToFilter').value,
  };

  try {
    const { data } = await RxGuard.Admin.auditLogs(params);
    const logs = data.data || [];

    document.getElementById('auditEmpty').style.display = logs.length ? 'none' : 'block';
    body.innerHTML = logs.map(l => `
      <tr>
        <td>${App.DateFmt.display(l.created_at)} ${App.DateFmt.time(l.created_at)}</td>
        <td>${escHtml(l.user?.name || 'System / Guest')}</td>
        <td><code style="font-size:.75rem">${escHtml(l.action)}</code></td>
        <td style="font-size:.75rem;color:var(--rx-muted)">${escHtml(l.resource_type || '—')}${l.resource_id ? ' #' + l.resource_id : ''}</td>
      </tr>
    `).join('');

    document.getElementById('auditPager').innerHTML = App.renderPagination(
      { current_page: data.current_page, last_page: data.last_page }, loadAuditLogs
    );
  } catch (err) {
    body.innerHTML = `<tr><td colspan="4" class="empty-state">Failed to load audit logs: ${escHtml(err.message)}</td></tr>`;
  }
}

/* ─────────────────────────────────────────
   API usage
───────────────────────────────────────── */
async function loadApiUsage() {
  const summaryEl = document.getElementById('apiUsageSummary');
  const bodyEl    = document.getElementById('apiUsageTableBody');
  summaryEl.innerHTML = '<div class="empty-state">Loading…</div>';
  bodyEl.innerHTML = '';

  try {
    const { data } = await RxGuard.Admin.apiUsage();
    const s = data.summary || {};
    const rows = data.api_breakdown || [];

    summaryEl.innerHTML = [
      statMini(s.total_api_calls ?? s.total_external_api_calls ?? 0, 'Total Calls'),
      s.success_rate !== undefined ? statMini(`${s.success_rate}%`, 'Success Rate') : '',
      s.average_response_ms !== undefined ? statMini(`${Math.round(s.average_response_ms)}ms`, 'Avg Response') : '',
      s.unique_users !== undefined ? statMini(s.unique_users, 'Unique Users') : '',
    ].join('');

    document.getElementById('apiUsageEmpty').style.display = rows.length ? 'none' : 'block';
    bodyEl.innerHTML = rows.map(r => `
      <tr>
        <td><code style="font-size:.75rem">${escHtml(r.api_name || r.action)}</code></td>
        <td>${r.total_calls ?? r.call_count ?? 0}</td>
        <td>${r.unique_users ?? '—'}</td>
      </tr>
    `).join('');
  } catch (err) {
    summaryEl.innerHTML = `<div class="empty-state">Failed to load API usage: ${escHtml(err.message)}</div>`;
  }
}

/* ─────────────────────────────────────────
   Helpers
───────────────────────────────────────── */
function escHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}
function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

/* ─────────────────────────────────────────
   Boot
───────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  if (!RxGuard.requireAuth(['admin'])) return;

  App.injectSidebar('admin');

  document.querySelectorAll('.admin-tab').forEach(btn =>
    btn.addEventListener('click', () => switchAdminTab(btn.dataset.tab)));

  document.getElementById('userFilterBtn').addEventListener('click', () => loadUsers(1));
  document.getElementById('auditFilterBtn').addEventListener('click', () => loadAuditLogs(1));

  loadOverview();
});

window.openUserModal      = openUserModal;
window.toggleUserStatus   = toggleUserStatus;
window.verifyProfessional = verifyProfessional;
