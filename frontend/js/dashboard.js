/**
 * RxGuard — dashboard.js
 * Loads and renders all dashboard data sections.
 * Depends on: api.js, app.js (loaded before this file)
 */

'use strict';

/* ─────────────────────────────────────────
   State
───────────────────────────────────────── */
const State = {
  user          : null,
  prescriptions : [],
  bmiRecords    : [],
  notifications : [],
  analytics     : null,
  rxPage        : 1,
};

/* ─────────────────────────────────────────
   Init
───────────────────────────────────────── */
async function initDashboard() {
  App.injectSidebar('overview');

  // Greet user
  const user = RxGuard.Auth.currentUser();
  State.user = user;
  renderGreeting(user);

  // Load all sections in parallel
  await Promise.allSettled([
    loadPrescriptions(),
    loadBmiRecords(),
    loadNotifications(),
    loadAnalytics(),
  ]);
}

/* ─────────────────────────────────────────
   Greeting
───────────────────────────────────────── */
function renderGreeting(user) {
  const nameEl = document.getElementById('greetName');
  const roleEl = document.getElementById('greetRole');
  const dateEl = document.getElementById('greetDate');

  const hour = new Date().getHours();
  const tod  = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  if (nameEl) nameEl.textContent = `${tod}, ${user?.name?.split(' ')[0] || 'there'} 👋`;
  if (roleEl) roleEl.innerHTML   = App.Badge.role(user?.role || 'consumer');
  if (dateEl) dateEl.textContent = new Date().toLocaleDateString('en-NG', {
    weekday:'long', day:'numeric', month:'long', year:'numeric'
  });
}

/* ─────────────────────────────────────────
   Analytics / metrics
───────────────────────────────────────── */
async function loadAnalytics() {
  // For non-admins we derive metrics from prescription list
  const rxData = State.prescriptions;

  const total      = rxData.length;
  const completed  = rxData.filter(r => r.status === 'completed').length;
  const withAlerts = rxData.filter(r => r.has_interactions).length;
  const avgScore   = total
    ? Math.round(rxData.filter(r => r.safety_score).reduce((s, r) => s + r.safety_score, 0) / completed || 0)
    : 0;

  setMetric('metricTotal',    total,      '');
  setMetric('metricScore',    avgScore ? avgScore + '%' : '—', '');
  setMetric('metricAlerts',   withAlerts, '');
  setMetric('metricMeds',     State.bmiRecords.length, '');

  // Admin gets platform-wide analytics
  if (RxGuard.Auth.isAdmin()) {
    try {
      const res = await RxGuard.Admin.analytics();
      renderAdminMetrics(res.data);
    } catch {}
  }
}

function setMetric(id, value, suffix) {
  const el = document.getElementById(id);
  if (el) el.textContent = value + suffix;
}

function renderAdminMetrics(data) {
  setMetric('metricTotal',  data.prescriptions?.total    || 0, '');
  setMetric('metricScore',  (data.prescriptions?.avg_safety_score || 0) + '%', '');
  setMetric('metricAlerts', data.prescriptions?.with_interactions || 0, '');
  setMetric('metricMeds',   data.users?.total || 0, '');

  const changeLabels = {
    metricTotalChange : `+${data.prescriptions?.this_month || 0} this month`,
    metricAlertChange : `${data.interactions_by_severity?.find(i=>i.severity==='major')?.count || 0} major`,
    metricMedChange   : `+${data.users?.this_month || 0} this month`,
  };
  Object.entries(changeLabels).forEach(([id, txt]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = txt;
  });
}

/* ─────────────────────────────────────────
   Prescriptions
───────────────────────────────────────── */
async function loadPrescriptions(page = 1) {
  const container  = document.getElementById('rxList');
  const emptyState = document.getElementById('rxEmpty');
  if (!container) return;

  showSkeleton(container, 4);

  try {
    const res = await RxGuard.Prescriptions.list({ page });
    const items = res.data?.data || [];
    State.prescriptions = items;
    State.rxPage = page;

    if (items.length === 0) {
      container.innerHTML = '';
      if (emptyState) emptyState.style.display = 'block';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';
    container.innerHTML = items.map(renderRxItem).join('');

    // Pagination
    const pagEl = document.getElementById('rxPagination');
    if (pagEl) pagEl.innerHTML = renderPagination(res.data, 'Dashboard.loadPrescriptions');

    // Refresh metrics from loaded data
    loadAnalytics();

  } catch (err) {
    container.innerHTML = `<div class="alert alert-danger"><span>⛔</span><span>${err.message}</span></div>`;
  }
}

function renderRxItem(rx) {
  const icon  = rx.file_type === 'pdf' ? '📄' : '📷';
  const date  = App.DateFmt.relative(rx.created_at);
  const badge = App.Badge.safety(rx.safety_score);
  const drugs = rx.drugs?.length ? `${rx.drugs.length} drug${rx.drugs.length > 1 ? 's' : ''}` : 'Processing…';

  return `
    <div class="rx-item" onclick="viewPrescription(${rx.id})" style="cursor:pointer">
      <div class="rx-thumb">${icon}</div>
      <div class="rx-info">
        <h4>${escHtml(rx.patient_name || 'Unknown Patient')}</h4>
        <p>${escHtml(rx.prescriber_name || 'No prescriber info')} · ${drugs}</p>
      </div>
      <div class="rx-meta">
        ${badge}
        <span class="rx-date">${date}</span>
      </div>
    </div>`;
}

function viewPrescription(id) {
  window.location.href = `scan.html?id=${id}`;
}

/* ─────────────────────────────────────────
   Notifications / alerts
───────────────────────────────────────── */
async function loadNotifications() {
  const container = document.getElementById('alertsList');
  if (!container) return;

  showSkeleton(container, 3);

  try {
    const res   = await RxGuard.User.notifications();
    const items = (res.data?.data || []).slice(0, 6);
    State.notifications = items;

    // Badge count on sidebar
    const badge = document.getElementById('alertSidebarBadge');
    const unread = items.filter(n => !n.read_at).length;
    if (badge) { badge.textContent = unread; badge.style.display = unread ? 'inline-flex' : 'none'; }

    if (items.length === 0) {
      container.innerHTML = '<div class="empty-state" style="padding:2rem"><div class="empty-icon">🔔</div><div class="empty-title">No alerts</div></div>';
      return;
    }

    container.innerHTML = items.map(renderAlert).join('');

    // Mark all read after displaying
    if (unread > 0) {
      try { await RxGuard.User.markNotificationsRead(); } catch {}
    }
  } catch {
    container.innerHTML = '<p style="color:var(--rx-muted);font-size:.875rem;padding:.5rem">Unable to load notifications.</p>';
  }
}

function renderAlert(notif) {
  const isUnread = !notif.read_at;
  const typeIcon = {
    InteractionAlert   : '⚠️',
    PrescriptionReady  : '✅',
    LicenceVerified    : '🏥',
    SystemAlert        : 'ℹ️',
  }[notif.type] || '🔔';

  const dotColor = isUnread ? 'var(--rx-blue)' : 'var(--rx-border)';

  return `
    <div class="alert-item" style="${isUnread ? 'background:var(--rx-blue-xlight);border-radius:8px;padding:.5rem;margin-bottom:.25rem' : ''}">
      <div style="width:8px;height:8px;border-radius:50%;background:${dotColor};flex-shrink:0;margin-top:6px"></div>
      <div style="flex:1;min-width:0">
        <div style="font-size:.875rem;font-weight:${isUnread ? '600' : '400'};display:flex;align-items:center;gap:6px">
          ${typeIcon} ${escHtml(notif.title)}
        </div>
        <div style="font-size:.8125rem;color:var(--rx-muted);margin-top:2px;line-height:1.5">
          ${escHtml(notif.body)}
        </div>
        <div style="font-size:.75rem;color:var(--rx-muted);margin-top:4px">${App.DateFmt.relative(notif.created_at)}</div>
      </div>
    </div>`;
}

/* ─────────────────────────────────────────
   Interaction alerts (from prescriptions)
───────────────────────────────────────── */
function renderInteractionAlerts() {
  const container = document.getElementById('interactionAlerts');
  if (!container) return;

  const flagged = State.prescriptions.filter(rx => rx.has_interactions);

  if (flagged.length === 0) {
    container.innerHTML = `
      <div style="text-align:center;padding:1.5rem;color:var(--rx-muted)">
        <div style="font-size:1.5rem;margin-bottom:.5rem">✅</div>
        <div style="font-size:.875rem">No active interaction alerts</div>
      </div>`;
    return;
  }

  container.innerHTML = flagged.slice(0, 5).map(rx => `
    <div class="alert-item" onclick="viewPrescription(${rx.id})" style="cursor:pointer;padding:.5rem;border-radius:8px;margin-bottom:.25rem">
      <div style="width:8px;height:8px;border-radius:50%;background:var(--rx-red);flex-shrink:0;margin-top:6px"></div>
      <div style="flex:1">
        <div style="font-size:.875rem;font-weight:600">${escHtml(rx.patient_name || 'Prescription #' + rx.id)}</div>
        <div style="font-size:.8125rem;color:var(--rx-muted)">Drug interaction detected · ${App.Badge.safety(rx.safety_score)}</div>
      </div>
    </div>`).join('');
}

/* ─────────────────────────────────────────
   BMI records
───────────────────────────────────────── */
async function loadBmiRecords() {
  const container = document.getElementById('bmiSummary');
  if (!container) return;

  try {
    const res   = await RxGuard.Bmi.history();
    const items = res.data?.data || [];
    State.bmiRecords = items;

    if (items.length === 0) {
      container.innerHTML = `
        <div style="text-align:center;padding:1.5rem;color:var(--rx-muted)">
          <div style="font-size:1.5rem;margin-bottom:.5rem">⚖️</div>
          <div style="font-size:.875rem;margin-bottom:.75rem">No BMI records yet</div>
          <a href="bmi.html" class="btn btn-primary btn-sm">Calculate BMI</a>
        </div>`;
      return;
    }

    const latest = items[0];
    const color  = { underweight:'var(--rx-blue)', normal:'var(--rx-green)', overweight:'var(--rx-amber)', obese_I:'var(--rx-red)', obese_II:'var(--rx-red)', obese_III:'var(--rx-red)' }[latest.category] || 'var(--rx-muted)';

    container.innerHTML = `
      <div style="text-align:center;margin-bottom:1rem">
        <div style="font-size:2.5rem;font-weight:800;color:${color};line-height:1">${latest.bmi_value}</div>
        <div style="font-size:.8125rem;color:var(--rx-muted);margin-top:.25rem">BMI · ${App.DateFmt.display(latest.recorded_at)}</div>
        <div style="margin-top:.5rem">${renderBmiCategory(latest.category)}</div>
      </div>
      <div style="font-size:.8125rem;color:var(--rx-muted);margin-bottom:.75rem">
        ${latest.height_cm}cm · ${latest.weight_kg}kg · ${latest.age}yrs · ${latest.gender}
      </div>
      ${items.length > 1 ? renderBmiTrend(items.slice(0, 5)) : ''}
      <a href="bmi.html" class="btn btn-outline btn-sm btn-block" style="margin-top:.75rem">View full history</a>`;

  } catch {
    container.innerHTML = '<p style="color:var(--rx-muted);font-size:.875rem">Unable to load BMI data.</p>';
  }
}

function renderBmiCategory(cat) {
  const map = {
    underweight: ['badge-info',    'Underweight'],
    normal:      ['badge-safe',    'Normal Weight'],
    overweight:  ['badge-warning', 'Overweight'],
    obese_I:     ['badge-danger',  'Obese Class I'],
    obese_II:    ['badge-danger',  'Obese Class II'],
    obese_III:   ['badge-danger',  'Obese Class III'],
  };
  const [cls, label] = map[cat] || ['badge-neutral', cat];
  return `<span class="badge ${cls}">${label}</span>`;
}

function renderBmiTrend(records) {
  const pts = records.map(r => r.bmi_value).reverse();
  const min = Math.min(...pts) - 1;
  const max = Math.max(...pts) + 1;
  const w = 200, h = 48;

  const toX = (i) => (i / (pts.length - 1)) * w;
  const toY = (v) => h - ((v - min) / (max - min)) * h;

  const path = pts.map((v, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(' ');

  return `
    <div style="margin:.5rem 0">
      <div style="font-size:.75rem;color:var(--rx-muted);margin-bottom:.25rem">Trend (last ${pts.length} records)</div>
      <svg viewBox="0 0 ${w} ${h}" width="100%" height="48" style="overflow:visible">
        <path d="${path}" fill="none" stroke="var(--rx-blue)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        ${pts.map((v,i) => `<circle cx="${toX(i).toFixed(1)}" cy="${toY(v).toFixed(1)}" r="3" fill="var(--rx-blue)"/>`).join('')}
      </svg>
    </div>`;
}

/* ─────────────────────────────────────────
   Quick actions
───────────────────────────────────────── */
function initQuickActions() {
  document.getElementById('btnNewScan')?.addEventListener('click', () => {
    window.location.href = 'scan.html';
  });
  document.getElementById('btnCheckDrug')?.addEventListener('click', () => {
    window.location.href = 'checker.html';
  });
  document.getElementById('btnAskAI')?.addEventListener('click', () => {
    window.location.href = 'chatbot.html';
  });
  document.getElementById('btnBmi')?.addEventListener('click', () => {
    window.location.href = 'bmi.html';
  });
}

/* ─────────────────────────────────────────
   Prescription archive action
───────────────────────────────────────── */
async function archivePrescription(id, e) {
  e.stopPropagation();
  if (!confirm('Archive this prescription?')) return;
  try {
    await RxGuard.Prescriptions.destroy(id);
    RxGuard.Toast.success('Archived', 'Prescription moved to archive.');
    loadPrescriptions(State.rxPage);
  } catch (err) {
    RxGuard.Toast.error('Failed', err.message);
  }
}

/* ─────────────────────────────────────────
   Skeleton loader
───────────────────────────────────────── */
function showSkeleton(container, rows) {
  container.innerHTML = Array(rows).fill(0).map(() => `
    <div class="rx-item" style="pointer-events:none">
      <div class="skeleton" style="width:42px;height:42px;border-radius:8px;flex-shrink:0"></div>
      <div style="flex:1;display:flex;flex-direction:column;gap:6px">
        <div class="skeleton" style="height:13px;width:55%;border-radius:4px"></div>
        <div class="skeleton" style="height:11px;width:75%;border-radius:4px"></div>
      </div>
      <div class="skeleton" style="height:22px;width:80px;border-radius:20px"></div>
    </div>`).join('');
}

/* ─────────────────────────────────────────
   Utility
───────────────────────────────────────── */
function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ─────────────────────────────────────────
   Expose for pagination callback & HTML onclick
───────────────────────────────────────── */
window.Dashboard = {
  loadPrescriptions,
  viewPrescription,
  archivePrescription,
};

/* ─────────────────────────────────────────
   Boot
───────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  if (!RxGuard.requireAuth()) return;

  await initDashboard();
  initQuickActions();

  // After prescriptions load, render interaction panel
  renderInteractionAlerts();
});