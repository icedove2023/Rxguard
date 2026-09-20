/**
 * RxGuard — review-queue.js
 * Pharmacist/physician review queue: list prescriptions awaiting
 * sign-off, view full detail, approve or flag.
 * Depends on: api.js, app.js
 */
'use strict';

const QueueState = {
  page: 1,
  pendingFlagId: null,
};

/* ─────────────────────────────────────────
   Load queue
───────────────────────────────────────── */
async function loadQueue(page = 1) {
  QueueState.page = page;
  const list = document.getElementById('queueList');
  list.innerHTML = `<div class="empty-state">Loading…</div>`;

  try {
    const { data } = await RxGuard.ProfessionalReview.queue({ page });
    const items = data.prescriptions?.data || [];

    document.getElementById('queueCount').textContent = `${data.pending_count} pending`;
    document.getElementById('queueEmpty').style.display = items.length ? 'none' : 'block';

    list.innerHTML = items.map(renderQueueCard).join('');

    document.getElementById('queuePager').innerHTML = App.renderPagination(
      { current_page: data.prescriptions.current_page, last_page: data.prescriptions.last_page },
      loadQueue
    );
  } catch (err) {
    list.innerHTML = `<div class="empty-state">Failed to load queue: ${escHtml(err.message)}</div>`;
  }
}

function renderQueueCard(p) {
  const isFlagged = p.status === 'flagged';
  const score = p.safety_score;
  const scoreBadge = score === null || score === undefined
    ? '<span class="badge badge-neutral">Pending score</span>'
    : score >= 90 ? `<span class="badge badge-success">✓ ${Math.round(score)}%</span>`
    : score >= 70 ? `<span class="badge badge-warning">⚠ ${Math.round(score)}%</span>`
    : `<span class="badge badge-danger">⛔ ${Math.round(score)}%</span>`;

  const drugNames = (p.drugs || []).map(d => escHtml(d.drug_name || d.generic_name || 'Unknown')).slice(0, 6);
  const interactionCount = (p.interactions || []).length;

  return `
    <div class="queue-card ${isFlagged ? 'is-flagged' : ''}">
      <div class="queue-card-head">
        <div>
          <strong>${escHtml(p.patient_name || 'Unnamed patient')}</strong>
          ${isFlagged ? '<span class="badge badge-danger" style="margin-left:.35rem">🚩 Flagged</span>' : ''}
          <div class="queue-meta">
            Uploaded by ${escHtml(p.user?.name || 'unknown')} · ${App.DateFmt.display(p.created_at)}
            ${interactionCount ? ` · <span style="color:var(--rx-red)">${interactionCount} interaction(s)</span>` : ''}
          </div>
        </div>
        ${scoreBadge}
      </div>

      <div class="queue-drugs">
        ${drugNames.length
          ? drugNames.map(d => `<span class="badge badge-neutral">${d}</span>`).join('')
          : '<span style="font-size:.8125rem;color:var(--rx-muted)">No drugs extracted</span>'}
      </div>

      ${isFlagged && p.flag_reason ? `
        <div style="font-size:.8125rem;color:var(--rx-red-dark);background:var(--rx-red-light);
                    padding:.5rem .75rem;border-radius:var(--radius-md)">
          <strong>Flag reason:</strong> ${escHtml(p.flag_reason)}
        </div>` : ''}

      <div class="queue-actions">
        <button class="btn btn-outline btn-sm" onclick="viewDetail(${p.id})">View Full Report</button>
        <button class="btn btn-primary btn-sm" onclick="approvePrescription(${p.id})">✅ Approve</button>
        <button class="btn btn-danger btn-sm" onclick="openFlagModal(${p.id})">🚩 Flag</button>
      </div>
    </div>
  `;
}

/* ─────────────────────────────────────────
   Detail modal (reuses fullReport shape via show())
───────────────────────────────────────── */
async function viewDetail(id) {
  document.getElementById('detailModalBody').innerHTML = '<div class="empty-state">Loading…</div>';
  App.Modal.open('detailModal');

  try {
    const { data: r } = await RxGuard.Prescriptions.show(id);

    const drugRows = (r.drugs || []).map(d => `
      <tr>
        <td>${escHtml(d.display_name || d.drug_name)}</td>
        <td>${escHtml(d.strength || '—')}</td>
        <td>${escHtml(d.dose_instructions || '—')}</td>
        <td>${d.has_warning ? '<span class="badge badge-warning">⚠</span>' : '<span class="badge badge-success">✓</span>'}</td>
      </tr>`).join('') || '<tr><td colspan="4" style="color:var(--rx-muted)">No drugs extracted.</td></tr>';

    const interactionRows = (r.interactions || []).map(i => `
      <div style="padding:.6rem .75rem;background:var(--rx-red-light);border-radius:var(--radius-md);margin-bottom:.5rem;font-size:.8125rem">
        <strong>${escHtml(i.drug_a)} + ${escHtml(i.drug_b)}</strong>
        <span class="badge badge-danger" style="margin-left:.35rem">${escHtml(i.severity)}</span><br/>
        ${escHtml(i.clinical_effect || '')}<br/>
        <em>${escHtml(i.recommendation || '')}</em>
      </div>`).join('') || '<div style="color:var(--rx-muted);font-size:.8125rem">No interactions detected.</div>';

    document.getElementById('detailModalBody').innerHTML = `
      <div style="font-size:.875rem;display:flex;flex-direction:column;gap:1rem">
        <div>
          <strong>${escHtml(r.patient?.name || 'Unnamed patient')}</strong>
          ${r.patient?.age ? ` · ${r.patient.age} yrs` : ''} ${r.patient?.gender ? ` · ${escHtml(r.patient.gender)}` : ''}<br/>
          <span style="color:var(--rx-muted);font-size:.8125rem">
            Uploaded by ${escHtml(r.uploaded_by?.name || 'unknown')} (${escHtml(r.uploaded_by?.email || '')})
          </span>
        </div>

        <div>
          <strong>Prescriber:</strong> ${escHtml(r.prescriber?.name || '—')}
          ${r.prescriber?.hospital ? ` · ${escHtml(r.prescriber.hospital)}` : ''}
        </div>

        <div>
          <strong>Safety score:</strong> ${r.safety_score !== null ? Math.round(r.safety_score) + '%' : '—'} ·
          <strong>Completeness:</strong> ${r.completeness_score !== null ? Math.round(r.completeness_score) + '%' : '—'}
        </div>

        <div>
          <div style="font-weight:600;margin-bottom:.4rem">Drugs</div>
          <table class="rx-table" style="width:100%;font-size:.8125rem">
            <thead><tr><th>Drug</th><th>Strength</th><th>Instructions</th><th></th></tr></thead>
            <tbody>${drugRows}</tbody>
          </table>
        </div>

        <div>
          <div style="font-weight:600;margin-bottom:.4rem">Interactions</div>
          ${interactionRows}
        </div>

        <div style="border-top:1px solid var(--rx-border);padding-top:.75rem">
          <div style="font-weight:600;margin-bottom:.4rem">Extracted text (as approved by patient)</div>
          <pre style="white-space:pre-wrap;font-size:.75rem;background:var(--rx-surface-alt);padding:.6rem;border-radius:var(--radius-md);max-height:160px;overflow:auto">${escHtml(r.approved_text || r.raw_ocr_text || '')}</pre>
        </div>

        <div class="queue-actions">
          <button class="btn btn-primary btn-sm" onclick="approvePrescription(${r.id})">✅ Approve</button>
          <button class="btn btn-danger btn-sm" onclick="App.Modal.close('detailModal'); openFlagModal(${r.id})">🚩 Flag</button>
        </div>
      </div>
    `;
  } catch (err) {
    document.getElementById('detailModalBody').innerHTML =
      `<div class="empty-state">Failed to load detail: ${escHtml(err.message)}</div>`;
  }
}

/* ─────────────────────────────────────────
   Approve
───────────────────────────────────────── */
async function approvePrescription(id) {
  if (!confirm('Approve this prescription? This confirms it has been clinically reviewed.')) return;

  try {
    await RxGuard.ProfessionalReview.approve(id, null);
    RxGuard.Toast.success('Approved', 'Prescription marked as reviewed and approved.');
    App.Modal.close('detailModal');
    loadQueue(QueueState.page);
  } catch (err) {
    RxGuard.Toast.error('Failed', err.message || 'Could not approve prescription.');
  }
}

/* ─────────────────────────────────────────
   Flag
───────────────────────────────────────── */
function openFlagModal(id) {
  QueueState.pendingFlagId = id;
  document.getElementById('flagReasonInput').value = '';
  document.getElementById('flagSeverity').value = 'medium';
  document.getElementById('flagError').style.display = 'none';
  App.Modal.open('flagModal');
}

async function submitFlag() {
  const reason = document.getElementById('flagReasonInput').value.trim();
  const severity = document.getElementById('flagSeverity').value;
  const errBox = document.getElementById('flagError');

  if (reason.length < 5) {
    document.getElementById('flagErrorMsg').textContent = 'Please describe the concern (at least a few words).';
    errBox.style.display = 'flex';
    return;
  }

  const btn = document.getElementById('flagSubmitBtn');
  btn.disabled = true;
  btn.textContent = 'Flagging…';

  try {
    await RxGuard.ProfessionalReview.flag(QueueState.pendingFlagId, reason, severity);
    RxGuard.Toast.warning('Flagged', 'Prescription flagged for further review.');
    App.Modal.close('flagModal');
    App.Modal.close('detailModal');
    loadQueue(QueueState.page);
  } catch (err) {
    document.getElementById('flagErrorMsg').textContent = err.message || 'Could not flag prescription.';
    errBox.style.display = 'flex';
  } finally {
    btn.disabled = false;
    btn.textContent = '🚩 Flag Prescription';
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

/* ─────────────────────────────────────────
   Boot
───────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  if (!RxGuard.requireAuth(['pharmacist', 'physician'])) return;

  App.injectSidebar('review-queue');
  document.getElementById('flagSubmitBtn').addEventListener('click', submitFlag);

  loadQueue(1);
});

window.viewDetail            = viewDetail;
window.approvePrescription   = approvePrescription;
window.openFlagModal         = openFlagModal;
