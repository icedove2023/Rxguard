/**
 * RxGuard — checker.js
 * Drug interaction checker: multi-drug input, flag options,
 * result rendering, drug monograph lookup, check history.
 * Depends on: api.js, app.js
 */

'use strict';

/* ─────────────────────────────────────────
   State
───────────────────────────────────────── */
const CheckerState = {
  drugs   : ['', ''],   // Current drug name inputs (min 2)
  history : [],         // Past checks (session-only, not persisted)
  lastResult: null,
};

/* ─────────────────────────────────────────
   Drug input management
───────────────────────────────────────── */
const DrugInputs = {
  MAX : 10,

  add() {
    if (CheckerState.drugs.length >= this.MAX) {
      RxGuard.Toast.info('Maximum reached', `You can check up to ${this.MAX} drugs at once.`);
      return;
    }
    CheckerState.drugs.push('');
    this.render();
  },

  remove(idx) {
    if (CheckerState.drugs.length <= 2) return; // keep minimum 2
    CheckerState.drugs.splice(idx, 1);
    this.render();
  },

  update(idx, val) {
    CheckerState.drugs[idx] = val;
  },

  render() {
    const container = document.getElementById('drugInputs');
    if (!container) return;

    container.innerHTML = CheckerState.drugs.map((val, i) => `
      <div class="drug-input-row" id="drugRow${i}">
        <div class="drug-input-index">${i + 1}</div>
        <div style="flex:1;position:relative">
          <input class="form-control drug-field"
                 type="text"
                 id="drugField${i}"
                 value="${escHtml(val)}"
                 placeholder="Drug name (e.g. ${DRUG_SUGGESTIONS[i % DRUG_SUGGESTIONS.length]})"
                 autocomplete="off"
                 oninput="DrugInputs.update(${i}, this.value); showSuggestions(${i}, this.value)"
                 onfocus="showSuggestions(${i}, this.value)"
                 onblur="hideSuggestions(${i})"
                 onkeydown="handleFieldKey(event, ${i})"/>
          <div class="drug-suggestions" id="suggestions${i}"></div>
        </div>
        ${CheckerState.drugs.length > 2
          ? `<button type="button" class="btn-remove-drug" onclick="DrugInputs.remove(${i})"
                     title="Remove">×</button>`
          : '<div style="width:28px"></div>'}
      </div>
    `).join('');

    // Add drug button state
    const addBtn = document.getElementById('addDrugBtn');
    if (addBtn) addBtn.disabled = CheckerState.drugs.length >= this.MAX;
  },
};

/* ─────────────────────────────────────────
   Autocomplete suggestions
───────────────────────────────────────── */
const DRUG_SUGGESTIONS = [
  'Warfarin','Aspirin','Metformin','Lisinopril','Amlodipine',
  'Atorvastatin','Omeprazole','Ciprofloxacin','Amoxicillin','Paracetamol',
  'Ibuprofen','Diclofenac','Prednisolone','Metronidazole','Artemether',
  'Salbutamol','Furosemide','Losartan','Glibenclamide','Azithromycin',
];

const COMMON_DRUGS = [
  'Warfarin','Aspirin','Metformin','Lisinopril','Amlodipine',
  'Atorvastatin','Omeprazole','Ciprofloxacin','Amoxicillin','Paracetamol',
  'Ibuprofen','Diclofenac','Prednisolone','Metronidazole','Artemether',
  'Lumefantrine','Salbutamol','Furosemide','Losartan','Glibenclamide',
  'Azithromycin','Cotrimoxazole','Rifampicin','Isoniazid','Ethambutol',
  'Tramadol','Codeine','Amitriptyline','Carbamazepine','Phenytoin',
  'Haloperidol','Chlorpromazine','Nifedipine','Atenolol','Bisoprolol',
  'Digoxin','Spironolactone','Levothyroxine','Ferrous Sulphate','Folic Acid',
];

function showSuggestions(idx, query) {
  const box = document.getElementById(`suggestions${idx}`);
  if (!box) return;

  const q = (query || '').trim().toLowerCase();

  const matches = q.length < 1
    ? COMMON_DRUGS.slice(0, 6)
    : COMMON_DRUGS.filter(d => d.toLowerCase().startsWith(q)).slice(0, 6);

  if (!matches.length) { box.innerHTML = ''; box.style.display = 'none'; return; }

  box.style.display = 'block';
  box.innerHTML = matches.map(drug => `
    <div class="suggestion-item"
         onmousedown="selectSuggestion(${idx}, '${escHtml(drug)}')">${drug}</div>
  `).join('');
}

function hideSuggestions(idx) {
  setTimeout(() => {
    const box = document.getElementById(`suggestions${idx}`);
    if (box) { box.innerHTML = ''; box.style.display = 'none'; }
  }, 150);
}

function selectSuggestion(idx, name) {
  CheckerState.drugs[idx] = name;
  const field = document.getElementById(`drugField${idx}`);
  if (field) field.value = name;
  hideSuggestions(idx);
}

function handleFieldKey(e, idx) {
  if (e.key === 'Enter') { e.preventDefault(); submitCheck(); }
  if (e.key === 'Tab' && idx === CheckerState.drugs.length - 1) {
    e.preventDefault(); DrugInputs.add();
    setTimeout(() => document.getElementById(`drugField${idx + 1}`)?.focus(), 50);
  }
}

/* ─────────────────────────────────────────
   Submit check
───────────────────────────────────────── */
async function submitCheck() {
  clearResults();

  // Collect non-empty drug names
  const drugs = CheckerState.drugs
    .map(d => d.trim())
    .filter(Boolean);

  if (drugs.length < 2) {
    RxGuard.Toast.warning('Two drugs required', 'Enter at least two drug names to check for interactions.');
    return;
  }

  // Patient flags
  const flags = {
    patient_pregnant : document.getElementById('flagPregnant')?.checked || false,
    patient_age      : parseInt(document.getElementById('patientAge')?.value, 10) || null,
  };

  const btn = document.getElementById('checkBtn');
  if (btn) { btn.disabled = true; btn.classList.add('loading'); btn.textContent = ''; }

  try {
    const res    = await RxGuard.Drugs.interactions(drugs, flags);
    const result = res.data;
    CheckerState.lastResult = result;

    // Save to session history
    CheckerState.history.unshift({
      drugs,
      flags,
      result,
      checkedAt: new Date().toISOString(),
    });
    renderHistory();

    renderResults(result);
    document.getElementById('resultsPanel')
      .scrollIntoView({ behavior: 'smooth', block: 'start' });

  } catch (err) {
    RxGuard.Toast.error('Check failed', err.message || 'Unable to check interactions. Please try again.');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.classList.remove('loading');
      btn.textContent = '🔍 Check Interactions';
    }
  }
}

/* ─────────────────────────────────────────
   Results rendering
───────────────────────────────────────── */
function renderResults(result) {
  const panel = document.getElementById('resultsPanel');
  panel.style.display = 'block';

  // Summary bar
  renderSummaryBar(result);

  // Interaction cards
  const container = document.getElementById('interactionCards');
  const emptyEl   = document.getElementById('noInteractions');

  if (!result.interactions || result.interactions.length === 0) {
    container.innerHTML = '';
    emptyEl.style.display = 'block';
    return;
  }

  emptyEl.style.display = 'none';

  // Sort: major/contraindicated first
  const sorted = [...result.interactions].sort((a, b) => {
    const order = { contraindicated:0, major:1, moderate:2, minor:3 };
    return (order[a.severity] ?? 4) - (order[b.severity] ?? 4);
  });

  container.innerHTML = sorted.map(renderInteractionCard).join('');
}

function renderSummaryBar(result) {
  const bar = document.getElementById('summaryBar');
  if (!bar) return;

  const count    = result.interaction_count || 0;
  const hasMajor = result.has_major;
  const drugs    = result.drugs || [];

  const summaryColor = hasMajor
    ? 'var(--rx-red-light)'
    : count > 0
      ? 'var(--rx-amber-light)'
      : 'var(--rx-green-light)';

  const summaryBorder = hasMajor
    ? '#F0AFAF'
    : count > 0
      ? '#EDD098'
      : '#A5D9C5';

  const icon    = hasMajor ? '⛔' : count > 0 ? '⚠️' : '✅';
  const message = count === 0
    ? 'No interactions found between the checked drugs.'
    : `${count} interaction${count > 1 ? 's' : ''} detected${hasMajor ? ' — major risk identified' : ''}.`;

  bar.style.display     = 'flex';
  bar.style.background  = summaryColor;
  bar.style.borderColor = summaryBorder;
  bar.innerHTML = `
    <span style="font-size:1.25rem;flex-shrink:0">${icon}</span>
    <div style="flex:1">
      <div style="font-size:.9375rem;font-weight:600;margin-bottom:.25rem">${message}</div>
      <div style="font-size:.8125rem;color:var(--rx-muted)">
        Checked: ${drugs.map(d => `<strong>${escHtml(d)}</strong>`).join(' + ')}
        ${result.patient_flags?.pregnant ? ' · <span class="badge badge-info">Pregnancy check enabled</span>' : ''}
      </div>
    </div>
    <div style="font-size:.75rem;color:var(--rx-muted);flex-shrink:0">
      ${new Date().toLocaleTimeString('en-NG', { hour:'2-digit', minute:'2-digit' })}
    </div>`;
}

function renderInteractionCard(interaction) {
  const sev  = interaction.severity || 'minor';
  const type = interaction.interaction_type || 'ddi';

  const typeLabel = {
    ddi              : '💊 Drug–Drug',
    drug_pregnancy   : '🤰 Drug–Pregnancy',
    drug_disease     : '🏥 Drug–Disease',
    duplicate_therapy: '🔁 Duplicate Therapy',
    dosage_error     : '⚠️ Dosage Issue',
    missing_info     : 'ℹ️ Missing Information',
  }[type] || type;

  const alts = interaction.alternatives || [];

  return `
    <div class="interaction-card ${sev}" style="margin-bottom:var(--space-4)">
      <div class="interaction-header">
        <div>
          <div class="interaction-drugs">
            ${escHtml(interaction.drug_a)}
            <span style="color:var(--rx-muted);font-weight:400;margin:0 6px">+</span>
            ${escHtml(interaction.drug_b)}
          </div>
          <div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.35rem;align-items:center">
            ${App.Badge.severity(sev)}
            <span class="badge badge-neutral" style="font-size:.6875rem">${typeLabel}</span>
            ${interaction.evidence_level
              ? `<span class="badge badge-info" style="font-size:.6875rem">Evidence: ${interaction.evidence_level}</span>`
              : ''}
          </div>
        </div>
      </div>

      ${interaction.mechanism ? `
        <div style="font-size:.875rem;font-weight:600;color:var(--rx-text-secondary);
                    margin-bottom:.35rem;margin-top:var(--space-3)">Mechanism</div>
        <div class="interaction-body">${escHtml(interaction.mechanism)}</div>
      ` : ''}

      ${interaction.clinical_effect ? `
        <div style="font-size:.875rem;font-weight:600;color:var(--rx-text-secondary);
                    margin-bottom:.35rem">Clinical Effect</div>
        <div class="interaction-body">${escHtml(interaction.clinical_effect)}</div>
      ` : ''}

      ${interaction.recommendation ? `
        <div class="interaction-rec">
          💡 <strong>Recommendation:</strong> ${escHtml(interaction.recommendation)}
        </div>
      ` : ''}

      ${alts.length ? `
        <div style="margin-top:var(--space-3)">
          <div style="font-size:.8125rem;font-weight:600;color:var(--rx-muted);
                      text-transform:uppercase;letter-spacing:.4px;margin-bottom:.5rem">
            🇳🇬 Safer Alternatives (EMDEX / OpenFDA)
          </div>
          ${alts.map(alt => `
            <div class="alt-drug-item">
              <div>
                <div class="alt-drug-name">${escHtml(alt.generic || alt.alternative_generic)}</div>
                ${(alt.brands || alt.alternative_brands)?.length
                  ? `<div class="alt-drug-brands">
                       🇳🇬 ${(alt.brands || alt.alternative_brands).slice(0,4).join(' · ')}
                     </div>`
                  : ''}
                ${alt.reason
                  ? `<div class="alt-drug-reason">${escHtml(alt.reason)}</div>`
                  : ''}
              </div>
              <span class="badge badge-safe" style="flex-shrink:0">Safer</span>
            </div>`).join('')}
        </div>
      ` : ''}

      ${interaction.source
        ? `<div style="margin-top:var(--space-3);font-size:.75rem;color:var(--rx-muted)">
             Source: ${escHtml(interaction.source)}
           </div>`
        : ''}
    </div>`;
}

function clearResults() {
  document.getElementById('resultsPanel').style.display = 'none';
  document.getElementById('summaryBar').style.display   = 'none';
  document.getElementById('interactionCards').innerHTML  = '';
  document.getElementById('noInteractions').style.display = 'none';
}

/* ─────────────────────────────────────────
   Drug monograph lookup
───────────────────────────────────────── */
async function lookupMonograph(name) {
  if (!name?.trim()) return;

  const panel     = document.getElementById('monographPanel');
  const container = document.getElementById('monographContent');
  if (!panel || !container) return;

  panel.style.display   = 'block';
  container.innerHTML   = `<div style="text-align:center;padding:2rem">
    <div class="spinner" style="margin:0 auto 1rem"></div>
    <div style="font-size:.875rem;color:var(--rx-muted)">Looking up ${escHtml(name)}…</div>
  </div>`;

  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });

  try {
    const res  = await RxGuard.Drugs.lookup(name);
    const drug = res.data;
    if (!drug) throw new Error('Drug not found');
    renderMonograph(drug);
  } catch (err) {
    container.innerHTML = `
      <div class="alert alert-warning">
        <span>⚠️</span>
        <span>No monograph data found for <strong>${escHtml(name)}</strong>. 
        Try an alternative spelling or generic name.</span>
      </div>`;
  }
}

function renderMonograph(drug) {
  const container = document.getElementById('monographContent');
  if (!container) return;

  const mono   = drug.monograph || drug;
  const brands = drug.brands || [];

  container.innerHTML = `
    <div style="display:flex;align-items:flex-start;justify-content:space-between;
                flex-wrap:wrap;gap:var(--space-4);margin-bottom:var(--space-5)">
      <div>
        <h3 style="font-size:1.125rem;font-weight:700;margin-bottom:.25rem">
          ${escHtml(drug.generic_name || drug.drug_name)}
        </h3>
        ${mono.atc_code
          ? `<div style="font-size:.8125rem;color:var(--rx-muted)">ATC: ${escHtml(mono.atc_code)}</div>`
          : ''}
      </div>
      ${mono.pregnancy_category
        ? `<span class="badge ${mono.pregnancy_category === 'X' || mono.pregnancy_category === 'D' ? 'badge-danger' : 'badge-warning'}">
             Pregnancy Cat. ${escHtml(mono.pregnancy_category)}
           </span>`
        : ''}
    </div>

    ${mono.indication ? `
      <div class="mono-section">
        <div class="mono-label">Indication</div>
        <div class="mono-body">${escHtml(mono.indication)}</div>
      </div>` : ''}

    ${mono.dosage ? `
      <div class="mono-section">
        <div class="mono-label">Standard Dosage</div>
        <div class="mono-body">${escHtml(mono.dosage)}</div>
      </div>` : ''}

    ${mono.contraindications?.length ? `
      <div class="mono-section">
        <div class="mono-label">Contraindications</div>
        <ul class="mono-list">
          ${(Array.isArray(mono.contraindications)
              ? mono.contraindications
              : [mono.contraindications]).map(c => `<li>${escHtml(c)}</li>`).join('')}
        </ul>
      </div>` : ''}

    ${mono.side_effects?.length ? `
      <div class="mono-section">
        <div class="mono-label">Common Side Effects</div>
        <div style="display:flex;flex-wrap:wrap;gap:.4rem">
          ${(Array.isArray(mono.side_effects) ? mono.side_effects : [mono.side_effects])
            .slice(0,8).map(s => `<span class="badge badge-neutral">${escHtml(s)}</span>`).join('')}
        </div>
      </div>` : ''}

    ${mono.pregnancy_warning ? `
      <div class="mono-section">
        <div class="mono-label" style="color:var(--rx-amber-dark)">⚠️ Pregnancy Warning</div>
        <div class="mono-body" style="color:var(--rx-amber-dark)">${escHtml(mono.pregnancy_warning)}</div>
      </div>` : ''}

    ${brands.length ? `
      <div class="mono-section">
        <div class="mono-label">🇳🇬 Nigerian Brands (OpenFDA)</div>
        <div style="display:flex;flex-wrap:wrap;gap:.4rem">
          ${brands.slice(0,8).map(b => `
            <span class="badge" style="background:var(--rx-green-light);color:var(--rx-green-dark)">
              ${escHtml(b.brand_name || b)}
            </span>`).join('')}
        </div>
      </div>` : ''}

    ${mono.storage ? `
      <div class="mono-section">
        <div class="mono-label">Storage</div>
        <div class="mono-body">${escHtml(mono.storage)}</div>
      </div>` : ''}

    <div style="margin-top:var(--space-4);font-size:.75rem;color:var(--rx-muted)">
      Source: EMDEX Nigeria Drug Database · OpenFDA Brand Registry
    </div>`;
}

/* ─────────────────────────────────────────
   Session history (client-side only)
───────────────────────────────────────── */
function renderHistory() {
  const container = document.getElementById('historyList');
  const emptyEl   = document.getElementById('historyEmpty');
  if (!container) return;

  if (CheckerState.history.length === 0) {
    if (emptyEl) emptyEl.style.display = 'block';
    container.innerHTML = '';
    return;
  }

  if (emptyEl) emptyEl.style.display = 'none';

  container.innerHTML = CheckerState.history.slice(0, 8).map((entry, i) => {
    const count    = entry.result?.interaction_count || 0;
    const hasMajor = entry.result?.has_major;
    const icon     = hasMajor ? '⛔' : count > 0 ? '⚠️' : '✅';
    const cls      = hasMajor ? 'badge-danger' : count > 0 ? 'badge-warning' : 'badge-safe';

    return `
      <div class="history-row" onclick="restoreCheck(${i})" title="Restore this check">
        <span style="font-size:1.1rem">${icon}</span>
        <div style="flex:1;min-width:0">
          <div style="font-size:.875rem;font-weight:600;
                      white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
            ${entry.drugs.map(d => escHtml(d)).join(' + ')}
          </div>
          <div style="font-size:.75rem;color:var(--rx-muted)">
            ${App.DateFmt.relative(entry.checkedAt)}
          </div>
        </div>
        <span class="badge ${cls}">${count} alert${count !== 1 ? 's' : ''}</span>
      </div>`;
  }).join('');
}

function restoreCheck(idx) {
  const entry = CheckerState.history[idx];
  if (!entry) return;

  CheckerState.drugs = [...entry.drugs];
  DrugInputs.render();

  if (entry.flags?.patient_pregnant) {
    const chk = document.getElementById('flagPregnant');
    if (chk) chk.checked = true;
  }
  if (entry.flags?.patient_age) {
    const ageEl = document.getElementById('patientAge');
    if (ageEl) ageEl.value = entry.flags.patient_age;
  }

  renderResults(entry.result);
  document.getElementById('resultsPanel')
    .scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ─────────────────────────────────────────
   Utility
───────────────────────────────────────── */
function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function resetChecker() {
  CheckerState.drugs = ['', ''];
  DrugInputs.render();
  clearResults();
  document.getElementById('flagPregnant').checked = false;
  document.getElementById('patientAge').value     = '';
  document.getElementById('monographPanel').style.display = 'none';
}


if (typeof window !== 'undefined') {
  // Expose DrugInputs object (used in onclick, oninput, onfocus, onblur, onkeydown)
  window.DrugInputs = DrugInputs;
  
  // Expose suggestion functions
  window.showSuggestions = showSuggestions;
  window.hideSuggestions = hideSuggestions;
  window.selectSuggestion = selectSuggestion;
  window.handleFieldKey = handleFieldKey;
  
  // Expose main actions
  window.submitCheck = submitCheck;
  window.resetChecker = resetChecker;
  window.lookupMonograph = lookupMonograph;
  window.restoreCheck = restoreCheck;
}
/* ─────────────────────────────────────────
   Expose globals
───────────────────────────────────────── */
window.DrugInputs   = DrugInputs;
window.CheckerPage  = { submitCheck, resetChecker, lookupMonograph, restoreCheck };

/* ─────────────────────────────────────────
   Boot
───────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  App.injectSidebar('interactions');

  DrugInputs.render();

  document.getElementById('checkBtn')?.addEventListener('click', submitCheck);
  document.getElementById('resetCheckerBtn')?.addEventListener('click', resetChecker);
  document.getElementById('addDrugBtn')?.addEventListener('click', () => DrugInputs.add());

  document.getElementById('monographForm')?.addEventListener('submit', e => {
    e.preventDefault();
    const val = document.getElementById('monographInput')?.value.trim();
    if (val) lookupMonograph(val);
  });
});