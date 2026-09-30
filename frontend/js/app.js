/**
 * RxGuard — app.js
 * Global utilities loaded on every page.
 * Depends on: api.js (loaded first)
 */

'use strict';

/* ─────────────────────────────────────────────
   1. Dark-mode toggle (persisted in localStorage)
───────────────────────────────────────────── */
const Theme = (() => {
  const STORAGE_KEY = 'rxguard_theme';

  function apply(mode) {
    document.documentElement.setAttribute('data-theme', mode);
    localStorage.setItem(STORAGE_KEY, mode);
  }

  function toggle() {
    const current = localStorage.getItem(STORAGE_KEY) ||
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    apply(current === 'dark' ? 'light' : 'dark');
  }

  function init() {
    const saved = localStorage.getItem(STORAGE_KEY);
    const preferred = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    apply(saved || preferred);
  }

  return { init, toggle, apply };
})();

/* ─────────────────────────────────────────────
   2. Navbar: active link, user state, mobile menu
───────────────────────────────────────────── */
const Navbar = (() => {
  function init() {
    highlightActive();
    renderUserState();
    bindMobileToggle();
    renderNotificationBadge();
  }

  function highlightActive() {
    const path = window.location.pathname.split('/').pop();
    document.querySelectorAll('.navbar-nav .nav-link').forEach(link => {
      const href = link.getAttribute('href')?.split('/').pop();
      link.classList.toggle('active', href === path);
    });
  }

  function renderUserState() {
    const user     = RxGuard.Auth.currentUser();
    const guestEl  = document.getElementById('navGuest');
    const userEl   = document.getElementById('navUser');
    const nameEl   = document.getElementById('navUserName');
    const adminLink= document.getElementById('navAdminLink');

    if (!guestEl || !userEl) return;

    if (user) {
      guestEl.style.display = 'none';
      userEl.style.display  = 'flex';
      if (nameEl) nameEl.textContent = user.name?.split(' ')[0] || 'Account';
      if (adminLink) adminLink.style.display = user.role === 'admin' ? 'block' : 'none';
    } else {
      guestEl.style.display = 'flex';
      userEl.style.display  = 'none';
    }
  }

  async function renderNotificationBadge() {
    if (!RxGuard.Auth.isAuthenticated()) return;
    const badge = document.getElementById('notifBadge');
    if (!badge) return;
    try {
      const data = await RxGuard.User.notifications();
      const unread = (data.data?.data || []).filter(n => !n.read_at).length;
      badge.textContent = unread > 9 ? '9+' : unread;
      badge.style.display = unread > 0 ? 'inline-flex' : 'none';
    } catch {}
  }

  function bindMobileToggle() {
    const toggle   = document.getElementById('navToggle');
    const navLinks = document.getElementById('navLinks');
    const backdrop = document.getElementById('mobileNavBackdrop');
    if (!toggle || !navLinks) return;

    toggle.setAttribute('aria-controls', 'navLinks');

    const setOpen = open => {
      navLinks.classList.toggle('mobile-open', open);
      document.body.classList.toggle('mobile-nav-open', open);
      backdrop?.classList.toggle('open', open);
      toggle.setAttribute('aria-expanded', String(open));
      navLinks.setAttribute('aria-hidden', String(!open && window.innerWidth <= 768));

      if (open) navLinks.querySelector('.nav-link')?.focus({ preventScroll: true });
      else toggle.focus({ preventScroll: true });
    };

    toggle.addEventListener('click', () => {
      setOpen(!navLinks.classList.contains('mobile-open'));
    });

    backdrop?.addEventListener('click', () => setOpen(false));
    navLinks.addEventListener('click', event => {
      if (event.target.closest('.nav-link')) setOpen(false);
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && navLinks.classList.contains('mobile-open')) setOpen(false);
    });
    window.addEventListener('resize', () => {
      if (window.innerWidth > 768 && navLinks.classList.contains('mobile-open')) setOpen(false);
      navLinks.setAttribute('aria-hidden', String(window.innerWidth <= 768));
    });

    navLinks.setAttribute('aria-hidden', String(window.innerWidth <= 768));
  }

  return { init, renderUserState };
})();

/* ─────────────────────────────────────────────
   3. Form helpers
───────────────────────────────────────────── */
const FormHelper = {
  /** Mark a field as invalid with an error message below it */
  setError(fieldId, message) {
    const input = document.getElementById(fieldId);
    if (!input) return;
    input.classList.add('is-invalid');
    let err = input.parentElement.querySelector('.form-error');
    if (!err) {
      err = document.createElement('div');
      err.className = 'form-error';
      input.parentElement.appendChild(err);
    }
    err.textContent = message;
  },

  clearError(fieldId) {
    const input = document.getElementById(fieldId);
    if (!input) return;
    input.classList.remove('is-invalid');
    input.parentElement.querySelector('.form-error')?.remove();
  },

  clearAll(formId) {
    const form = document.getElementById(formId);
    if (!form) return;
    form.querySelectorAll('.is-invalid').forEach(el => el.classList.remove('is-invalid'));
    form.querySelectorAll('.form-error').forEach(el => el.remove());
  },

  /** Apply backend validation errors (field → message map) to form inputs */
  applyApiErrors(errors) {
    Object.entries(errors).forEach(([field, message]) => {
      // Convert snake_case → camelCase for id lookup
      const id = field.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      this.setError(id, message) || this.setError(field, message);
    });
  },

  /** Disable / re-enable a submit button with loading indicator */
  setLoading(btnId, loading, originalText = null) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.disabled = loading;
    btn.classList.toggle('loading', loading);
    if (!loading && originalText) btn.textContent = originalText;
  },

  /** Collect all form field values into a plain object */
  collect(formId) {
    const form = document.getElementById(formId);
    if (!form) return {};
    const data = {};
    form.querySelectorAll('[name]').forEach(el => {
      if (el.type === 'checkbox') data[el.name] = el.checked;
      else if (el.type === 'radio') { if (el.checked) data[el.name] = el.value; }
      else data[el.name] = el.value;
    });
    return data;
  },
};

/* ─────────────────────────────────────────────
   4. Date / time formatters
───────────────────────────────────────────── */
const DateFmt = {
  display: date => date
    ? new Date(date).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—',

  time: date => date
    ? new Date(date).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })
    : '',

  relative: date => {
    if (!date) return '';
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1)  return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs  < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7)  return `${days}d ago`;
    return DateFmt.display(date);
  },
};

/* ─────────────────────────────────────────────
   5. Badge renderer
───────────────────────────────────────────── */
const Badge = {
  safety(score) {
    if (score === null || score === undefined) return '<span class="badge badge-neutral">Pending</span>';
    if (score >= 90) return `<span class="badge badge-safe">✓ Safe · ${score}%</span>`;
    if (score >= 70) return `<span class="badge badge-warning">⚠ Review · ${score}%</span>`;
    return `<span class="badge badge-danger">⛔ Flagged · ${score}%</span>`;
  },

  severity(level) {
    const map = {
      major          : 'badge-danger',
      contraindicated: 'badge-danger',
      moderate       : 'badge-warning',
      minor          : 'badge-success',
      missing_info   : 'badge-neutral',
      duplicate_therapy:'badge-warning',
    };
    return `<span class="badge ${map[level] || 'badge-neutral'}">${level?.replace('_', ' ').toUpperCase()}</span>`;
  },

  role(role) {
    const map = { admin: 'badge-danger', physician: 'badge-info', pharmacist: 'badge-success', consumer: 'badge-neutral' };
    return `<span class="badge ${map[role] || 'badge-neutral'}">${role}</span>`;
  },

  status(status) {
    const map = { completed: 'badge-safe', pending: 'badge-neutral', processing: 'badge-info', flagged: 'badge-danger', approved: 'badge-success' };
    return `<span class="badge ${map[status] || 'badge-neutral'}">${status}</span>`;
  },
};

/* ─────────────────────────────────────────────
   6. Modal manager
───────────────────────────────────────────── */
const Modal = {
  open(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('open');
    document.body.style.overflow = 'hidden';
  },
  close(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('open');
    document.body.style.overflow = '';
  },
  init() {
    // Close on backdrop click
    document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
      backdrop.addEventListener('click', e => {
        if (e.target === backdrop) Modal.close(backdrop.id);
      });
    });
    // Close buttons
    document.querySelectorAll('[data-modal-close]').forEach(btn => {
      btn.addEventListener('click', () => Modal.close(btn.dataset.modalClose));
    });
  },
};

/* ─────────────────────────────────────────────
   7. Pagination renderer
───────────────────────────────────────────── */
function renderPagination(meta, onPage) {
  if (!meta || meta.last_page <= 1) return '';
  const { current_page, last_page } = meta;
  let html = '<div class="flex gap-2 items-center justify-center mt-6">';

  if (current_page > 1)
    html += `<button class="btn btn-outline btn-sm" onclick="(${onPage})(${current_page - 1})">← Prev</button>`;

  for (let i = Math.max(1, current_page - 2); i <= Math.min(last_page, current_page + 2); i++) {
    html += `<button class="btn btn-sm ${i === current_page ? 'btn-primary' : 'btn-outline'}"
               onclick="(${onPage})(${i})">${i}</button>`;
  }

  if (current_page < last_page)
    html += `<button class="btn btn-outline btn-sm" onclick="(${onPage})(${current_page + 1})">Next →</button>`;

  html += '</div>';
  return html;
}

/* ─────────────────────────────────────────────
   8. Shared navbar HTML (injected into every page)
───────────────────────────────────────────── */
function injectNavbar() {
  const target = document.getElementById('navbarMount');
  if (!target) return;
  const user = RxGuard.Auth.currentUser();
  const isAdmin = user?.role === 'admin';

  target.innerHTML = `
    <nav class="navbar" role="navigation" aria-label="Main navigation">
      <a href="index.html" class="navbar-brand">
        <div class="navbar-logo" aria-hidden="true">Rx</div>
        RxGuard
      </a>

      <div class="navbar-nav" id="navLinks">
        <a href="index.html"     class="nav-link">Home</a>
        <a href="dashboard.html" class="nav-link">Dashboard</a>
        <a href="scan.html"      class="nav-link">Scan Rx</a>
        <a href="checker.html"   class="nav-link">Drug Checker</a>
        <a href="chatbot.html"   class="nav-link">AI Assistant</a>
        <a href="bmi.html"       class="nav-link">BMI</a>
        ${user ? `
          <a href="profile.html" class="nav-link mobile-user-action">👤 Profile</a>
          ${isAdmin ? '<a href="admin.html" class="nav-link mobile-user-action">Admin</a>' : ''}
          <button type="button" class="nav-link mobile-user-action" onclick="RxGuard.Auth.logout()">Sign Out</button>
        ` : `
          <a href="login.html" class="nav-link mobile-user-action">Sign In</a>
          <a href="register.html" class="nav-link mobile-user-action">Get Started</a>
        `}
      </div>

      <div class="navbar-actions">
        <button id="themeToggle" class="btn btn-sm btn-outline" style="padding:6px 10px"
          aria-label="Switch to dark theme" aria-pressed="false" title="Switch to dark theme">🌙</button>

        <div id="navGuest" style="display:flex;gap:8px">
          <a href="login.html"    class="btn btn-outline btn-sm">Sign In</a>
          <a href="register.html" class="btn btn-primary btn-sm">Get Started</a>
        </div>

        <div id="navUser" style="display:none;align-items:center;gap:10px">
          <button onclick="window.location.href='dashboard.html'"
                  style="background:none;border:none;cursor:pointer;position:relative;font-size:1.2rem"
                  title="Notifications">
            🔔
            <span id="notifBadge" class="sidebar-badge"
                  style="position:absolute;top:-4px;right:-4px;display:none">0</span>
          </button>
          <div style="display:flex;align-items:center;gap:8px;cursor:pointer"
               onclick="window.location.href='profile.html'">
            <div style="width:32px;height:32px;border-radius:50%;background:var(--rx-blue);
                        color:#fff;display:flex;align-items:center;justify-content:center;
                        font-size:.8125rem;font-weight:700" id="navAvatarInitial">U</div>
            <span id="navUserName" style="font-size:.875rem;font-weight:500"></span>
          </div>
          <button onclick="RxGuard.Auth.logout()" class="btn btn-sm btn-outline"
                  style="color:var(--rx-red);border-color:var(--rx-red)">Sign Out</button>
          <a id="navAdminLink" href="admin.html" class="btn btn-sm btn-danger"
             style="display:none">Admin</a>
        </div>
      </div>

      <button class="navbar-toggle" id="navToggle" aria-label="Toggle menu" aria-expanded="false">
        <span style="font-size:1.4rem">☰</span>
      </button>
    </nav>
    <div id="mobileNavBackdrop" class="mobile-nav-backdrop" aria-hidden="true"></div>
  `;
}

/* ─────────────────────────────────────────────
   9. Shared sidebar HTML (injected into dashboard pages)
───────────────────────────────────────────── */
function injectSidebar(activeItem = 'overview') {
  const target = document.getElementById('sidebarMount');
  if (!target) return;

  const user  = RxGuard.Auth.currentUser();
  const isAdmin = user?.role === 'admin';
  const isPro   = ['pharmacist','physician'].includes(user?.role);

  const items = [
    { id:'overview',      href:'dashboard.html',  icon:'📊', label:'Overview'       },
    { id:'prescriptions', href:'scan.html',        icon:'📋', label:'Prescriptions'  },
    { id:'interactions',  href:'checker.html',     icon:'⚠️', label:'Drug Checker'   },
    { id:'chatbot',       href:'chatbot.html',     icon:'🤖', label:'AI Assistant'   },
    { id:'bmi',           href:'bmi.html',         icon:'⚖️', label:'BMI Records'    },
    { id:'profile',       href:'profile.html',     icon:'👤', label:'Profile'        },
  ];

  let html = '<div class="sidebar" id="sidebar">';

  items.forEach(item => {
    html += `<a href="${item.href}" class="sidebar-item ${activeItem === item.id ? 'active' : ''}">
               <span class="sidebar-icon">${item.icon}</span>${item.label}
             </a>`;
  });

  if (isPro) {
    html += `<div class="sidebar-section-label">Clinical Review</div>
             <a href="review-queue.html" class="sidebar-item ${activeItem === 'review-queue' ? 'active' : ''}">
               <span class="sidebar-icon">🩺</span>Review Queue
             </a>`;
  }

  if (isAdmin) {
    html += `<div class="sidebar-section-label">Administration</div>
             <a href="admin.html" class="sidebar-item ${activeItem === 'admin' ? 'active' : ''}">
               <span class="sidebar-icon">🛡️</span>Admin Panel
             </a>`;
  }

  html += `<div style="margin-top:auto;padding-top:1rem;border-top:1px solid var(--rx-border)">
             <button onclick="RxGuard.Auth.logout()"
                     class="sidebar-item" style="color:var(--rx-red);width:100%">
               <span class="sidebar-icon">🚪</span>Sign Out
             </button>
           </div></div>`;

  target.innerHTML = html;
}

/* ─────────────────────────────────────────────
   10. Init on every page load
───────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  Theme.init();
  injectNavbar();
  const syncThemeToggle = () => {
    const button = document.getElementById('themeToggle');
    if (!button) return;
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    button.textContent = isDark ? '☀️' : '🌙';
    button.setAttribute('aria-label', isDark ? 'Switch to light theme' : 'Switch to dark theme');
    button.setAttribute('aria-pressed', String(isDark));
    button.title = isDark ? 'Switch to light theme' : 'Switch to dark theme';
  };
  syncThemeToggle();
  initMobileDisclosures();
  Navbar.init();
  Modal.init();

  // Dark mode toggle
  document.addEventListener('click', e => {
    if (e.target.id === 'themeToggle' || e.target.closest('#themeToggle')) {
      Theme.toggle();
      syncThemeToggle();
    }
  });
});

function initMobileDisclosures() {
  const disclosures = [...document.querySelectorAll('.mobile-disclosure')];
  if (!disclosures.length) return;

  const mobileQuery = window.matchMedia('(max-width: 768px)');
  const sync = () => {
    disclosures.forEach(disclosure => {
      if (disclosure.dataset.userToggled) return;
      disclosure.open = !mobileQuery.matches;
    });
  };

  disclosures.forEach(disclosure => {
    disclosure.addEventListener('toggle', () => {
      if (disclosure.dataset.initialized) disclosure.dataset.userToggled = 'true';
      disclosure.dataset.initialized = 'true';
    });
  });

  sync();
  mobileQuery.addEventListener('change', sync);
}

/* ─────────────────────────────────────────────
   11. Global error boundary
───────────────────────────────────────────── */
window.addEventListener('unhandledrejection', event => {
  const err = event.reason;
  if (err instanceof RxGuard.RxGuardApiError && err.status !== 401) {
    RxGuard.Toast.error('Request failed', err.message);
  }
});

/* Export globals */
window.App = { Theme, Navbar, FormHelper, DateFmt, Badge, Modal, renderPagination, injectSidebar };