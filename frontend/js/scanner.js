/**
 * RxGuard — scanner.js
 * Prescription pipeline: Upload → Tesseract OCR (free, open-source) →
 * user reviews raw text (edit manually and/or ask Gemini to suggest
 * corrections) → approve → EMDEX/OpenFDA validation → safety report.
 * Depends on: api.js, app.js
 */

'use strict';

/* ─────────────────────────────────────────
   State
───────────────────────────────────────── */
const ScanState = {
  prescriptionId : null,
  file           : null,
  polling        : null,   // setInterval handle
  currentStep    : 0,      // 0-3
  baselineText   : '',     // text currently considered the "checkpoint"
  baselineSource : 'manual', // 'manual' | 'gemini' — where baselineText came from
};

/* ─────────────────────────────────────────
   Pipeline steps definition
───────────────────────────────────────── */
const STEPS = [
  { id:'step1', label:'Upload',            icon:'📤' },
  { id:'step2', label:'OCR Extract',       icon:'🔍' },
  { id:'step3', label:'Review & Approve',  icon:'📝' },
  { id:'step4', label:'Safety Report',     icon:'📋' },
];

/* ─────────────────────────────────────────
   Drag-and-drop + file select
───────────────────────────────────────── */
function initUploadZone() {
  const zone  = document.getElementById('uploadZone');
  const input = document.getElementById('fileInput');
  if (!zone || !input) return;

  // Click to open file picker
  zone.addEventListener('click', () => input.click());

  // Drag events
  zone.addEventListener('dragover',  e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFileSelected(file);
  });

  // File input change
  input.addEventListener('change', () => {
    if (input.files?.[0]) handleFileSelected(input.files[0]);
  });
}

function handleFileSelected(file) {
  const allowed = ['image/jpeg', 'image/png', 'application/pdf'];
  if (!allowed.includes(file.type)) {
    RxGuard.Toast.error('Unsupported file', 'Please upload a JPG, PNG, or PDF file.');
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    RxGuard.Toast.error('File too large', 'Maximum file size is 10 MB.');
    return;
  }

  ScanState.file = file;
  showFilePreview(file);
}

function showFilePreview(file) {
  const zone    = document.getElementById('uploadZone');
  const preview = document.getElementById('filePreview');
  if (!zone || !preview) return;

  zone.style.display    = 'none';
  preview.style.display = 'flex';

  document.getElementById('previewName').textContent = file.name;
  document.getElementById('previewSize').textContent = formatBytes(file.size);
  document.getElementById('previewType').textContent = file.type.split('/')[1].toUpperCase();

  // Image thumbnail
  if (file.type.startsWith('image/')) {
    const reader = new FileReader();
    reader.onload = e => {
      const thumb = document.getElementById('previewThumb');
      if (thumb) {
        thumb.innerHTML = `<img src="${e.target.result}" alt="Preview"
          style="width:100%;height:100%;object-fit:cover;border-radius:8px"/>`;
      }
    };
    reader.readAsDataURL(file);
  } else {
    const thumb = document.getElementById('previewThumb');
    if (thumb) thumb.innerHTML = '<span style="font-size:2rem">📄</span>';
  }
}

function clearUpload() {
  ScanState.file           = null;
  ScanState.prescriptionId = null;
  ScanState.currentStep    = 0;
  ScanState.baselineText   = '';
  ScanState.baselineSource = 'manual';

  document.getElementById('uploadZone').style.display    = 'block';
  document.getElementById('filePreview').style.display   = 'none';
  document.getElementById('progressSection').style.display = 'none';
  document.getElementById('reviewSection').style.display = 'none';
  document.getElementById('suggestionBox').style.display = 'none';
  document.getElementById('reportSection').style.display = 'none';
  document.getElementById('fileInput').value             = '';

  resetSteps();
}

/* ─────────────────────────────────────────
   Step 1+2 — Upload & Tesseract OCR extract
───────────────────────────────────────── */
async function startScan() {
  if (!ScanState.file) {
    RxGuard.Toast.warning('No file', 'Please select a prescription file first.');
    return;
  }

  showProgress();
  activateStep(0);

  try {
    // Step 1 — Upload
    setProgressLabel('Uploading prescription…');
    setProgressBar(20);
    const uploadRes      = await RxGuard.Prescriptions.upload(ScanState.file);
    ScanState.prescriptionId = uploadRes.data?.prescription_id;
    markStepDone(0);

    if (!ScanState.prescriptionId) throw new Error('Upload failed — no prescription ID returned.');

    // Step 2 — Tesseract OCR (free, open-source, no AI involved yet)
    activateStep(1);
    setProgressLabel('Running Tesseract OCR — extracting raw text…');
    setProgressBar(55);

    const extractRes = await RxGuard.Prescriptions.extract(ScanState.prescriptionId);
    markStepDone(1);

    setProgressBar(100);
    await sleep(250);

    document.getElementById('progressSection').style.display = 'none';
    showReviewScreen(extractRes.data);

  } catch (err) {
    setProgressLabel(`⛔ ${err.message || 'Extraction failed. Please try again.'}`);
    setProgressBar(0, 'red');
    RxGuard.Toast.error('Extraction failed', err.message || 'Please try again or use a clearer image.');
    document.getElementById('retryScanBtn').style.display = 'inline-flex';
  }
}

/* ─────────────────────────────────────────
   Step 3 — Review & Approve screen
───────────────────────────────────────── */
function showReviewScreen(data) {
  activateStep(2);

  const reviewSection = document.getElementById('reviewSection');
  const textarea       = document.getElementById('ocrTextArea');

  textarea.value           = data.raw_text || '';
  ScanState.baselineText   = data.raw_text || '';
  ScanState.baselineSource = 'manual';

  document.getElementById('reviewOcrMeta').textContent =
    `Engine: ${data.ocr_engine || 'tesseract'} · Confidence: ${data.ocr_confidence ?? '—'}%`;

  document.getElementById('suggestionBox').style.display = 'none';
  document.getElementById('suggestError').style.display  = 'none';
  document.getElementById('approveError').style.display  = 'none';
  resetSuggestBtn();
  resetApproveBtn();

  reviewSection.style.display = 'block';
  reviewSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function handleSuggest() {
  if (!ScanState.prescriptionId) return;

  const btn = document.getElementById('suggestBtn');
  const errBox = document.getElementById('suggestError');
  errBox.style.display = 'none';
  btn.disabled = true;
  btn.textContent = '✨ Asking Gemini…';

  try {
    const res = await RxGuard.Prescriptions.suggest(ScanState.prescriptionId);
    const { suggested_text, notes } = res.data;

    document.getElementById('suggestedTextPreview').textContent = suggested_text || '';
    document.getElementById('suggestionNotes').innerHTML = (notes || []).length
      ? '<strong>Notes:</strong><ul style="margin:.35rem 0 0 1.1rem;padding:0">' +
        notes.map(n => `<li>${escHtml(n)}</li>`).join('') + '</ul>'
      : '';
    document.getElementById('suggestionBox').style.display = 'block';
    document.getElementById('suggestionBox').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (err) {
    document.getElementById('suggestErrorMsg').textContent =
      err.message || 'Gemini suggestion is temporarily unavailable. You can still edit the text manually.';
    errBox.style.display = 'flex';
  } finally {
    resetSuggestBtn();
  }
}

function resetSuggestBtn() {
  const btn = document.getElementById('suggestBtn');
  btn.disabled = false;
  btn.textContent = '✨ Ask Gemini to Suggest Corrections';
}

function handleUseSuggestion() {
  const suggestedText = document.getElementById('suggestedTextPreview').textContent;
  document.getElementById('ocrTextArea').value = suggestedText;
  ScanState.baselineText   = suggestedText;
  ScanState.baselineSource = 'gemini';
  RxGuard.Toast.info('Applied', "Gemini's suggested text has been loaded into the editor. You can still edit it further.");
}

async function handleApprove() {
  if (!ScanState.prescriptionId) return;

  const finalText = document.getElementById('ocrTextArea').value.trim();
  const errBox = document.getElementById('approveError');
  errBox.style.display = 'none';

  if (finalText.length < 5) {
    document.getElementById('approveErrorMsg').textContent = 'The extracted text looks too short to validate.';
    errBox.style.display = 'flex';
    return;
  }

  const editSource = finalText === ScanState.baselineText
    ? ScanState.baselineSource
    : 'hybrid';

  const btn = document.getElementById('approveBtn');
  btn.disabled = true;
  btn.textContent = 'Validating with EMDEX + OpenFDA…';

  try {
    const res = await RxGuard.Prescriptions.confirm(ScanState.prescriptionId, finalText, editSource);

    activateStep(3);
    markStepDone(2);
    markStepDone(3);

    document.getElementById('reviewSection').style.display = 'none';
    renderReport(res.data);
    RxGuard.Toast.success('Validated', 'Your prescription has been checked against EMDEX and OpenFDA.');
  } catch (err) {
    document.getElementById('approveErrorMsg').textContent =
      err.message || 'Validation failed. Please try again shortly.';
    errBox.style.display = 'flex';
  } finally {
    resetApproveBtn();
  }
}

function resetApproveBtn() {
  const btn = document.getElementById('approveBtn');
  btn.disabled = false;
  btn.textContent = '✅ Approve & Validate (EMDEX + OpenFDA)';
}

/* ─────────────────────────────────────────
   Progress UI helpers
───────────────────────────────────────── */
function showProgress() {
  document.getElementById('filePreview').style.display    = 'none';
  document.getElementById('progressSection').style.display= 'block';
  document.getElementById('reviewSection').style.display  = 'none';
  document.getElementById('reportSection').style.display  = 'none';
  document.getElementById('retryScanBtn').style.display   = 'none';
}

function setProgressLabel(text) {
  const el = document.getElementById('progressLabel');
  if (el) el.textContent = text;
}

function setProgressBar(pct, color = '') {
  const bar = document.getElementById('progressBar');
  if (!bar) return;
  bar.style.width      = pct + '%';
  bar.className        = 'progress-bar' + (color ? ` ${color}` : '');
}

function activateStep(idx) {
  ScanState.currentStep = idx;
  STEPS.forEach((s, i) => {
    const el = document.getElementById(s.id);
    if (!el) return;
    const num = el.querySelector('.step-num');
    if (!num) return;
    if (i < idx)       num.className = 'step-num done';
    else if (i === idx) num.className = 'step-num active';
    else               num.className = 'step-num';
  });
}

function markStepDone(idx) {
  const el = document.getElementById(STEPS[idx]?.id);
  if (!el) return;
  const num = el.querySelector('.step-num');
  if (num) num.className = 'step-num done';
}

function resetSteps() {
  STEPS.forEach(s => {
    const el = document.getElementById(s.id);
    if (!el) return;
    const num = el.querySelector('.step-num');
    if (num) num.className = 'step-num';
  });
  setProgressBar(0);
  setProgressLabel('');
}

/* ─────────────────────────────────────────
   Report rendering
───────────────────────────────────────── */
function renderReport(report) {
  const section = document.getElementById('reportSection');
  if (!section) return;

  document.getElementById('reviewSection').style.display = 'none';
  section.style.display = 'block';

  // Safety score
  const score = report.safety_score ?? null;
  const color = score === null ? 'gray' : score >= 90 ? 'green' : score >= 70 ? 'amber' : 'red';
  const label = score === null ? 'Pending' : score >= 90 ? 'Safe' : score >= 70 ? 'Review Needed' : 'Flagged';

  document.getElementById('scoreValue').textContent  = score !== null ? Math.round(score) + '%' : '—';
  document.getElementById('scoreValue').className    = `score-value ${color}`;
  document.getElementById('scoreLabel').textContent  = label;
  document.getElementById('scoreLabel').style.color  = `var(--rx-${color === 'gray' ? 'muted' : color})`;
  document.getElementById('completenessScore').textContent =
    report.completeness_score !== null
      ? `Completeness: ${Math.round(report.completeness_score)}%`
      : '';

  // Patient info
  renderPatientBlock(report.patient, report.prescriber, report.prescription_date);

  // Drug table
  renderDrugTable(report.drugs || []);

  // Interactions
  renderInteractions(report.interactions || []);

  // Summary flags
  document.getElementById('flagInteractions').style.display =
    report.flags?.has_interactions ? 'flex' : 'none';
  document.getElementById('flagErrors').style.display =
    report.flags?.has_errors ? 'flex' : 'none';

  // OCR meta
  const ocrEngine = report.ocr_engine || 'Tesseract';
  const geminiUsed = report.edit_source === 'gemini' || report.edit_source === 'hybrid';
  document.getElementById('ocrMeta').textContent =
    `OCR: ${ocrEngine}` +
    (report.ocr_confidence ? ` (${report.ocr_confidence}% confidence)` : '') +
    (geminiUsed ? ` · Reviewed with Gemini's suggestions (${report.edit_source})` : ' · Manually reviewed');

  section.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderPatientBlock(patient, prescriber, date) {
  const fields = [
    ['patientName',    patient?.name   || '—'],
    ['patientAge',     patient?.age    ? `${patient.age} yrs` : '—'],
    ['patientGender',  patient?.gender || '—'],
    ['rxDate',         date            ? App.DateFmt.display(date) : '—'],
    ['prescriberName', prescriber?.name     || '—'],
    ['prescriberReg',  prescriber?.reg_no   || '—'],
    ['prescriberHosp', prescriber?.hospital || '—'],
  ];
  fields.forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  });
}

function renderDrugTable(drugs) {
  const tbody = document.getElementById('drugTableBody');
  if (!tbody) return;

  if (drugs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--rx-muted);padding:2rem">
      No drugs extracted from this prescription.</td></tr>`;
    return;
  }

  tbody.innerHTML = drugs.map(d => {
    const statusBadge = d.has_warning
      ? '<span class="badge badge-warning">⚠ Warning</span>'
      : '<span class="badge badge-safe">✓ OK</span>';

    const brands = d.brands?.length
      ? d.brands.slice(0, 3).map(b => `<span class="badge" style="background:var(--rx-green-light);color:var(--rx-green-dark);font-size:.6875rem">${escHtml(b)}</span>`).join(' ')
      : '<span style="color:var(--rx-muted);font-size:.8125rem">—</span>';

    return `
      <tr>
        <td>
          <div style="font-weight:600">${escHtml(d.display_name || d.drug_name)}</div>
          ${d.generic_name && d.generic_name !== d.drug_name
            ? `<div style="font-size:.75rem;color:var(--rx-muted)">${escHtml(d.generic_name)}</div>`
            : ''}
        </td>
        <td>${escHtml(d.strength || '—')}</td>
        <td>${escHtml(d.dose_instructions || '—')}</td>
        <td>${escHtml(d.duration || '—')}</td>
        <td><div style="display:flex;flex-wrap:wrap;gap:3px">${brands}</div></td>
        <td>${statusBadge}
          ${d.has_warning && d.warning_text
            ? `<div style="font-size:.7rem;color:var(--rx-amber-dark);margin-top:3px">${escHtml(d.warning_text)}</div>`
            : ''}
        </td>
      </tr>`;
  }).join('');
}

function renderInteractions(interactions) {
  const container = document.getElementById('interactionsList');
  const countEl   = document.getElementById('interactionsCount');
  const emptyEl   = document.getElementById('interactionsEmpty');
  if (!container) return;

  if (countEl) countEl.textContent = interactions.length
    ? `${interactions.length} issue${interactions.length > 1 ? 's' : ''} detected`
    : '';

  if (interactions.length === 0) {
    container.innerHTML = '';
    if (emptyEl) emptyEl.style.display = 'block';
    return;
  }

  if (emptyEl) emptyEl.style.display = 'none';

  // Sort severity: contraindicated > major > moderate > minor
  const order = { contraindicated:0, major:1, moderate:2, minor:3 };
  const sorted = [...interactions].sort((a,b) =>
    (order[a.severity] ?? 4) - (order[b.severity] ?? 4)
  );

  container.innerHTML = sorted.map(i => {
    const alts = (i.alternatives || []).slice(0, 2);
    return `
      <div class="interaction-card ${i.severity}" style="margin-bottom:var(--space-3)">
        <div class="interaction-header">
          <div>
            <div class="interaction-drugs">
              ${escHtml(i.drug_a)}
              <span style="color:var(--rx-muted);font-weight:400;margin:0 5px">+</span>
              ${escHtml(i.drug_b)}
            </div>
            <div style="display:flex;gap:.5rem;margin-top:.35rem;flex-wrap:wrap;align-items:center">
              ${App.Badge.severity(i.severity)}
              <span class="badge badge-neutral" style="font-size:.6875rem">
                ${interactionTypeLabel(i.interaction_type)}
              </span>
              ${i.evidence_level
                ? `<span class="badge badge-info" style="font-size:.6875rem">Evidence: ${i.evidence_level}</span>`
                : ''}
            </div>
          </div>
        </div>
        ${i.mechanism
          ? `<div class="interaction-body" style="margin-top:var(--space-3)">${escHtml(i.mechanism)}</div>`
          : ''}
        ${i.recommendation
          ? `<div class="interaction-rec">💡 <strong>Recommendation:</strong> ${escHtml(i.recommendation)}</div>`
          : ''}
        ${alts.length ? `
          <div style="margin-top:var(--space-3)">
            <div style="font-size:.75rem;font-weight:700;color:var(--rx-muted);
                        text-transform:uppercase;letter-spacing:.4px;margin-bottom:.4rem">
              🇳🇬 Safer Alternatives
            </div>
            ${alts.map(a => `
              <div class="alt-drug-item">
                <div>
                  <div class="alt-drug-name">${escHtml(a.generic)}</div>
                  ${a.brands?.length
                    ? `<div class="alt-drug-brands">🇳🇬 ${a.brands.slice(0,3).join(' · ')}</div>`
                    : ''}
                  ${a.reason
                    ? `<div class="alt-drug-reason">${escHtml(a.reason)}</div>`
                    : ''}
                </div>
                <span class="badge badge-safe" style="flex-shrink:0">Safer</span>
              </div>`).join('')}
          </div>` : ''}
        ${i.source
          ? `<div style="font-size:.7rem;color:var(--rx-muted);margin-top:var(--space-2)">
               Source: ${escHtml(i.source)}</div>`
          : ''}
      </div>`;
  }).join('');
}

/* ─────────────────────────────────────────
   View saved prescription (from URL param)
───────────────────────────────────────── */
async function loadExistingPrescription(id) {
  showProgress();
  setProgressLabel('Loading prescription…');
  setProgressBar(50);

  try {
    const res = await RxGuard.Prescriptions.show(id);
    setProgressBar(100);
    await sleep(200);
    document.getElementById('progressSection').style.display = 'none';
    ScanState.prescriptionId = id;

    const data = res.data;

    // Resume mid-pipeline: extracted but not yet approved/validated.
    if (data.status === 'extracted' || data.status === 'awaiting_review') {
      showReviewScreen({
        raw_text:       data.raw_ocr_text,
        ocr_engine:     data.ocr_engine,
        ocr_confidence: data.ocr_confidence,
      });

      if (data.status === 'awaiting_review' && data.suggested_text) {
        document.getElementById('suggestedTextPreview').textContent = data.suggested_text;
        document.getElementById('suggestionBox').style.display = 'block';
      }
      return;
    }

    renderReport(data);
  } catch (err) {
    setProgressBar(0, 'red');
    setProgressLabel('Failed to load prescription: ' + err.message);
  }
}

/* ─────────────────────────────────────────
   History list
───────────────────────────────────────── */
async function loadHistory() {
  const container = document.getElementById('historyList');
  const emptyEl   = document.getElementById('historyEmpty');
  if (!container) return;

  // Skeleton
  container.innerHTML = Array(3).fill(0).map(() => `
    <div class="rx-item" style="pointer-events:none">
      <div class="skeleton" style="width:42px;height:42px;border-radius:8px;flex-shrink:0"></div>
      <div style="flex:1;display:flex;flex-direction:column;gap:6px">
        <div class="skeleton" style="height:13px;width:60%;border-radius:4px"></div>
        <div class="skeleton" style="height:11px;width:80%;border-radius:4px"></div>
      </div>
      <div class="skeleton" style="height:22px;width:70px;border-radius:20px"></div>
    </div>`).join('');

  try {
    const res   = await RxGuard.Prescriptions.list();
    const items = res.data?.data || [];

    if (items.length === 0) {
      container.innerHTML = '';
      if (emptyEl) emptyEl.style.display = 'block';
      return;
    }

    if (emptyEl) emptyEl.style.display = 'none';
    container.innerHTML = items.slice(0, 8).map(rx => {
      const icon  = rx.file_type === 'pdf' ? '📄' : '📷';
      const badge = App.Badge.safety(rx.safety_score);
      return `
        <div class="rx-item" onclick="loadExistingPrescription(${rx.id})" style="cursor:pointer">
          <div class="rx-thumb">${icon}</div>
          <div class="rx-info" style="flex:1;min-width:0">
            <h4>${escHtml(rx.patient_name || 'Unknown Patient')}</h4>
            <p>${escHtml(rx.prescriber_name || 'No prescriber')} · ${App.DateFmt.relative(rx.created_at)}</p>
          </div>
          <div class="rx-meta">${badge}</div>
        </div>`;
    }).join('');

  } catch {
    container.innerHTML = '<p style="color:var(--rx-muted);font-size:.875rem">Unable to load history.</p>';
  }
}

/* ─────────────────────────────────────────
   Utility
───────────────────────────────────────── */
function formatBytes(bytes) {
  if (bytes < 1024)        return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function interactionTypeLabel(type) {
  return {
    ddi              : '💊 Drug–Drug',
    drug_pregnancy   : '🤰 Pregnancy',
    drug_disease     : '🏥 Drug–Disease',
    duplicate_therapy: '🔁 Duplicate',
    dosage_error     : '⚠️ Dosage',
    missing_info     : 'ℹ️ Missing Info',
  }[type] || type || 'Interaction';
}

/* ─────────────────────────────────────────
   Expose globals
───────────────────────────────────────── */
window.ScannerPage = {
  startScan, clearUpload, loadExistingPrescription,
  handleSuggest, handleUseSuggestion, handleApprove,
};

/* ─────────────────────────────────────────
   Boot
───────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  App.injectSidebar('prescriptions');
  initUploadZone();

  document.getElementById('scanBtn')?.addEventListener('click', startScan);
  document.getElementById('clearBtn')?.addEventListener('click', clearUpload);
  document.getElementById('retryScanBtn')?.addEventListener('click', () => {
    clearUpload();
    RxGuard.Toast.info('Ready', 'Upload a new prescription to try again.');
  });
  document.getElementById('suggestBtn')?.addEventListener('click', handleSuggest);
  document.getElementById('useSuggestionBtn')?.addEventListener('click', handleUseSuggestion);
  document.getElementById('approveBtn')?.addEventListener('click', handleApprove);

  loadHistory();

  // Load prescription from URL ?id=N
  const urlId = new URLSearchParams(window.location.search).get('id');
  if (urlId) loadExistingPrescription(parseInt(urlId, 10));
});