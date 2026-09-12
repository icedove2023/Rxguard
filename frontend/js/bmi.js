/**
 * RxGuard — bmi.js
 * BMI calculator, history list, trend chart, recommendations.
 * Depends on: api.js, app.js
 */

'use strict';

/* ─────────────────────────────────────────
   State
───────────────────────────────────────── */
const BmiState = {
  lastResult : null,
  history    : [],
  histPage   : 1,
};

/* ─────────────────────────────────────────
   Calculator
───────────────────────────────────────── */
const Calculator = {
  async submit() {
    App.FormHelper.clearAll('bmiForm');
    hideResult();

    const heightCm = parseFloat(document.getElementById('heightCm').value);
    const weightKg = parseFloat(document.getElementById('weightKg').value);
    const age      = parseInt(document.getElementById('age').value, 10);
    const gender   = document.getElementById('gender').value;

    // Client-side validation
    let valid = true;
    if (!heightCm || heightCm < 50 || heightCm > 300) {
      App.FormHelper.setError('heightCm', 'Enter a valid height between 50 and 300 cm');
      valid = false;
    }
    if (!weightKg || weightKg < 5 || weightKg > 500) {
      App.FormHelper.setError('weightKg', 'Enter a valid weight between 5 and 500 kg');
      valid = false;
    }
    if (!age || age < 2 || age > 120) {
      App.FormHelper.setError('age', 'Enter a valid age between 2 and 120');
      valid = false;
    }
    if (!gender) {
      App.FormHelper.setError('gender', 'Please select a gender');
      valid = false;
    }
    if (!valid) return;

    App.FormHelper.setLoading('calcBtn', true);

    try {
      const res      = await RxGuard.Bmi.calculate(heightCm, weightKg, age, gender);
      const result   = res.data;
      BmiState.lastResult = result;

      renderResult(result);
      showResult();

      // Reload history to include new record
      if (RxGuard.Auth.isAuthenticated()) {
        loadHistory();
      }

      // Smooth scroll to result
      document.getElementById('resultPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });

    } catch (err) {
      RxGuard.Toast.error('Calculation failed', err.message || 'Please try again.');
    } finally {
      App.FormHelper.setLoading('calcBtn', false, '⚖️ Calculate BMI');
    }
  },

  reset() {
    document.getElementById('bmiForm').reset();
    hideResult();
    updateLivePreview(null);
  },
};

/* ─────────────────────────────────────────
   Live preview (updates as user types)
───────────────────────────────────────── */
function updateLivePreview(bmi) {
  const preview = document.getElementById('livePreview');
  const valEl   = document.getElementById('liveVal');
  const catEl   = document.getElementById('liveCat');

  if (!bmi || isNaN(bmi)) {
    if (preview) preview.style.opacity = '0.35';
    if (valEl)   valEl.textContent     = '—';
    if (catEl)   catEl.textContent     = 'Enter measurements above';
    return;
  }

  if (preview) preview.style.opacity = '1';
  if (valEl)   valEl.textContent     = bmi.toFixed(1);
  if (catEl) {
    const { label, color } = bmiMeta(bmi);
    catEl.textContent  = label;
    catEl.style.color  = color;
    valEl.style.color  = color;
  }
}

function bindLivePreview() {
  const fields = ['heightCm', 'weightKg'];
  fields.forEach(id => {
    document.getElementById(id)?.addEventListener('input', recalcLive);
  });
}

function recalcLive() {
  const h = parseFloat(document.getElementById('heightCm').value);
  const w = parseFloat(document.getElementById('weightKg').value);
  if (h > 0 && w > 0) {
    updateLivePreview(w / ((h / 100) ** 2));
  } else {
    updateLivePreview(null);
  }
}

/* ─────────────────────────────────────────
   Result rendering
───────────────────────────────────────── */
function renderResult(r) {
  // Score display
  const bmi      = r.bmi;
  const { label, color } = bmiMeta(bmi);

  document.getElementById('resultBmiValue').textContent = bmi.toFixed(1);
  document.getElementById('resultBmiValue').style.color = color;
  document.getElementById('resultCategory').textContent  = label;
  document.getElementById('resultCategory').style.color  = color;

  // Ideal weight
  const ideal = r.ideal_weight_kg;
  if (ideal) {
    document.getElementById('idealWeight').textContent =
      `Ideal range: ${ideal.min_kg}–${ideal.max_kg} kg`;
  }

  // Gauge pointer (0–100%)
  const pct = r.gauge_percent ?? gaugePercent(bmi);
  document.getElementById('gaugePointer').style.left = `${Math.min(98, Math.max(2, pct))}%`;

  // Category badge
  document.getElementById('resultBadge').innerHTML = renderCategoryBadge(r.category_enum || r.category);

  // Medical note
  const noteEl = document.getElementById('medicalNote');
  if (noteEl && r.medical_note) noteEl.textContent = r.medical_note;

  // Recommendations
  renderRecommendations(r.nutrition_recs || [], r.lifestyle_recs || []);

  // Inputs summary
  const inp = r.inputs || {};
  document.getElementById('inputSummary').textContent =
    [inp.heightCm && `${inp.heightCm} cm`,
     inp.weightKg && `${inp.weightKg} kg`,
     inp.age      && `${inp.age} yrs`,
     inp.gender].filter(Boolean).join(' · ');
}

function renderRecommendations(nutrition, lifestyle) {
  const nutEl  = document.getElementById('nutritionList');
  const lifeEl = document.getElementById('lifestyleList');

  if (nutEl) {
    nutEl.innerHTML = nutrition.length
      ? nutrition.map(item => `<li>${escHtml(item)}</li>`).join('')
      : '<li>Maintain a balanced, nutritious diet.</li>';
  }
  if (lifeEl) {
    lifeEl.innerHTML = lifestyle.length
      ? lifestyle.map(item => `<li>${escHtml(item)}</li>`).join('')
      : '<li>Stay physically active and get regular health check-ups.</li>';
  }
}

function showResult()  { document.getElementById('resultPanel').style.display = 'block'; }
function hideResult()  { document.getElementById('resultPanel').style.display = 'none';  }

/* ─────────────────────────────────────────
   History
───────────────────────────────────────── */
async function loadHistory(page = 1) {
  const container  = document.getElementById('historyList');
  const emptyEl    = document.getElementById('historyEmpty');
  const chartWrap  = document.getElementById('trendChartWrap');
  if (!container) return;

  showHistorySkeleton(container);

  try {
    const res   = await RxGuard.Bmi.history();
    const items = res.data?.data || [];
    BmiState.history = items;
    BmiState.histPage = page;

    if (items.length === 0) {
      container.innerHTML = '';
      if (emptyEl)   emptyEl.style.display   = 'block';
      if (chartWrap) chartWrap.style.display  = 'none';
      return;
    }

    if (emptyEl)   emptyEl.style.display   = 'none';
    if (chartWrap) chartWrap.style.display  = 'block';

    container.innerHTML = items.map(renderHistoryRow).join('');
    renderTrendChart(items.slice().reverse());

    const pagEl = document.getElementById('historyPagination');
    if (pagEl) pagEl.innerHTML = renderPagination(res.data, 'loadHistory');

  } catch (err) {
    container.innerHTML =
      `<div class="alert alert-danger"><span>⛔</span><span>${escHtml(err.message)}</span></div>`;
  }
}

function renderHistoryRow(record) {
  const { label, color } = bmiMeta(record.bmi_value);
  return `
    <div class="bmi-history-row">
      <div class="bmi-history-date">
        <span class="bhi-day">${new Date(record.recorded_at).getDate()}</span>
        <span class="bhi-mon">${new Date(record.recorded_at).toLocaleString('en-NG',{month:'short'})}</span>
        <span class="bhi-yr">${new Date(record.recorded_at).getFullYear()}</span>
      </div>
      <div class="bmi-history-main">
        <div class="bhi-value" style="color:${color}">${record.bmi_value}</div>
        <div class="bhi-cat">${label}</div>
      </div>
      <div class="bmi-history-meta">
        <span class="bhi-detail">${record.height_cm} cm</span>
        <span class="bhi-detail">${record.weight_kg} kg</span>
        <span class="bhi-detail">${record.age} yrs · ${record.gender}</span>
      </div>
      ${renderCategoryBadge(record.category)}
    </div>`;
}

function showHistorySkeleton(container) {
  container.innerHTML = Array(3).fill(0).map(() => `
    <div class="bmi-history-row" style="pointer-events:none">
      <div class="skeleton" style="width:36px;height:48px;border-radius:6px;flex-shrink:0"></div>
      <div style="flex:1;display:flex;flex-direction:column;gap:6px">
        <div class="skeleton" style="height:20px;width:60px;border-radius:4px"></div>
        <div class="skeleton" style="height:12px;width:100px;border-radius:4px"></div>
      </div>
      <div class="skeleton" style="height:22px;width:90px;border-radius:20px"></div>
    </div>`).join('');
}

/* ─────────────────────────────────────────
   Trend chart (inline SVG)
───────────────────────────────────────── */
function renderTrendChart(records) {
  const canvas = document.getElementById('trendChart');
  if (!canvas || records.length < 2) return;

  const W = canvas.clientWidth || 500;
  const H = 100;
  const PAD = 12;

  const values = records.map(r => r.bmi_value);
  const minV   = Math.min(...values) - 2;
  const maxV   = Math.max(...values) + 2;

  const toX = i => PAD + (i / (values.length - 1)) * (W - PAD * 2);
  const toY = v => PAD + (1 - (v - minV) / (maxV - minV)) * (H - PAD * 2);

  // Zone bands
  const zones = [
    { lo: 0,    hi: 18.5, fill: '#3B9ECE22', label:'Underweight' },
    { lo: 18.5, hi: 25,   fill: '#1D9E7522', label:'Normal'      },
    { lo: 25,   hi: 30,   fill: '#E5A50A22', label:'Overweight'  },
    { lo: 30,   hi: 50,   fill: '#E24B4A22', label:'Obese'       },
  ];

  let bands = zones.map(z => {
    const y1 = toY(Math.min(z.hi, maxV));
    const y2 = toY(Math.max(z.lo, minV));
    if (y2 <= y1) return '';
    return `<rect x="${PAD}" y="${y1}" width="${W - PAD*2}" height="${y2 - y1}" fill="${z.fill}"/>`;
  }).join('');

  // Reference lines at BMI 18.5 and 25
  const refLines = [18.5, 25, 30].map(v => {
    if (v < minV || v > maxV) return '';
    const y = toY(v);
    return `<line x1="${PAD}" y1="${y}" x2="${W - PAD}" y2="${y}"
                  stroke="var(--rx-border)" stroke-width="1" stroke-dasharray="3 3"/>
            <text x="${PAD + 2}" y="${y - 3}" font-size="8" fill="var(--rx-muted)">${v}</text>`;
  }).join('');

  const path = values.map((v, i) =>
    `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(v).toFixed(1)}`
  ).join(' ');

  // Fill area under line
  const firstX = toX(0).toFixed(1);
  const lastX  = toX(values.length - 1).toFixed(1);
  const fillPath = `${path} L${lastX},${H - PAD} L${firstX},${H - PAD} Z`;

  const dots = values.map((v, i) => {
    const { color } = bmiMeta(v);
    return `<circle cx="${toX(i).toFixed(1)}" cy="${toY(v).toFixed(1)}"
                    r="4" fill="${color}" stroke="#fff" stroke-width="2">
              <title>BMI ${v} · ${App.DateFmt.display(records[i].recorded_at)}</title>
            </circle>`;
  }).join('');

  const labels = values.map((v, i) => {
    if (values.length > 6 && i % 2 !== 0) return '';
    return `<text x="${toX(i).toFixed(1)}" y="${H}" font-size="8"
                  text-anchor="middle" fill="var(--rx-muted)">
              ${new Date(records[i].recorded_at).toLocaleDateString('en-NG',{month:'short',day:'numeric'})}
            </text>`;
  }).join('');

  canvas.innerHTML = `
    <svg viewBox="0 0 ${W} ${H + 14}" width="100%" xmlns="http://www.w3.org/2000/svg"
         style="overflow:visible;display:block">
      ${bands}
      ${refLines}
      <path d="${fillPath}" fill="var(--rx-blue)" fill-opacity="0.08"/>
      <path d="${path}" fill="none" stroke="var(--rx-blue)"
            stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      ${dots}
      ${labels}
    </svg>`;
}

/* ─────────────────────────────────────────
   Helpers
───────────────────────────────────────── */
function bmiMeta(bmi) {
  if (bmi < 18.5) return { label: 'Underweight',      color: '#3B9ECE' };
  if (bmi < 25.0) return { label: 'Normal Weight',    color: '#1D9E75' };
  if (bmi < 30.0) return { label: 'Overweight',       color: '#E5A50A' };
  if (bmi < 35.0) return { label: 'Obese (Class I)',  color: '#E24B4A' };
  if (bmi < 40.0) return { label: 'Obese (Class II)', color: '#A32D2D' };
  return             { label: 'Obese (Class III)',  color: '#7B1414' };
}

function gaugePercent(bmi) {
  return Math.min(100, Math.max(0, (bmi - 10) / 35 * 100));
}

function renderCategoryBadge(cat) {
  const map = {
    underweight : ['badge-info',    'Underweight'     ],
    normal      : ['badge-safe',    'Normal Weight'   ],
    overweight  : ['badge-warning', 'Overweight'      ],
    obese_I     : ['badge-danger',  'Obese Class I'   ],
    obese_II    : ['badge-danger',  'Obese Class II'  ],
    obese_III   : ['badge-danger',  'Obese Class III' ],
  };
  const [cls, label] = map[cat] || ['badge-neutral', cat || '—'];
  return `<span class="badge ${cls}">${label}</span>`;
}

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/* ─────────────────────────────────────────
   Expose globals
───────────────────────────────────────── */
window.BmiPage = { Calculator, loadHistory };

/* ─────────────────────────────────────────
   Boot
───────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  App.injectSidebar('bmi');

  document.getElementById('bmiForm')?.addEventListener('submit', e => {
    e.preventDefault();
    Calculator.submit();
  });

  document.getElementById('resetBtn')?.addEventListener('click', () => Calculator.reset());

  bindLivePreview();

  if (RxGuard.Auth.isAuthenticated()) {
    loadHistory();
  } else {
    const histSection = document.getElementById('historySection');
    if (histSection) histSection.style.display = 'none';
  }
});