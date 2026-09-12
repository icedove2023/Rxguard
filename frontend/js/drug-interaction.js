/**
 * RxGuard — drug-interaction.js
 *
 * Drug Interaction Engine
 * ───────────────────────
 * Centralised service for all client-side interaction checking,
 * severity classification, result structuring, and HTML rendering.
 *
 * Interaction types handled:
 *   ddi              — drug–drug interaction
 *   drug_pregnancy   — pregnancy category D / X risk
 *   drug_disease     — contraindication against known condition
 *   duplicate_therapy— same therapeutic class prescribed twice
 *   dosage_error     — dose outside recommended range
 *   missing_info     — required prescription field absent
 *
 * Usage:
 *   const result = await DrugInteractionEngine.check(drugs, options);
 *   const html   = DrugInteractionEngine.renderResults(result);
 *
 * Depends on: api.js  (window.RxGuard must be loaded first)
 * Does NOT modify the DOM directly — returns HTML strings and
 * structured result objects for callers to place as needed.
 */

'use strict';

/* ─────────────────────────────────────────────────────────────────
   Constants
───────────────────────────────────────────────────────────────── */

const SEVERITY_ORDER = Object.freeze({
  contraindicated: 0,
  major          : 1,
  moderate       : 2,
  minor          : 3,
});

const SEVERITY_META = Object.freeze({
  contraindicated: {
    label   : 'CONTRAINDICATED',
    color   : '#A32D2D',
    bg      : '#FCEBEB',
    border  : '#F0AFAF',
    icon    : '⛔',
    advice  : 'Do NOT use this combination. Seek immediate clinical review.',
  },
  major: {
    label   : 'MAJOR',
    color   : '#E24B4A',
    bg      : '#FCEBEB',
    border  : '#F0AFAF',
    icon    : '⛔',
    advice  : 'Avoid this combination. Consult a PCN-registered pharmacist or MDCN physician.',
  },
  moderate: {
    label   : 'MODERATE',
    color   : '#854F0B',
    bg      : '#FAEEDA',
    border  : '#EDD098',
    icon    : '⚠️',
    advice  : 'Use with caution. Monitor the patient closely and consider alternatives.',
  },
  minor: {
    label   : 'MINOR',
    color   : '#0F6E56',
    bg      : '#E1F5EE',
    border  : '#A5D9C5',
    icon    : 'ℹ️',
    advice  : 'Low clinical significance. Monitor for side effects.',
  },
});

const INTERACTION_TYPE_LABELS = Object.freeze({
  ddi              : '💊 Drug–Drug',
  drug_pregnancy   : '🤰 Pregnancy Risk',
  drug_disease     : '🏥 Contraindication',
  duplicate_therapy: '🔁 Duplicate Therapy',
  dosage_error     : '⚠️ Dosage Issue',
  missing_info     : 'ℹ️ Missing Information',
});

const EVIDENCE_LABELS = Object.freeze({
  A: 'High (Level A)',
  B: 'Moderate (Level B)',
  C: 'Low (Level C)',
  D: 'Very Low (Level D)',
});

/* ─────────────────────────────────────────────────────────────────
   InteractionResult — structured wrapper around the API response
───────────────────────────────────────────────────────────────── */

class InteractionResult {
  /**
   * @param {object} apiData  Raw response from POST /api/v1/drugs/interactions
   */
  constructor(apiData) {
    this.raw              = apiData;
    this.drugs            = apiData.drugs            ?? [];
    this.interactionCount = apiData.interaction_count ?? 0;
    this.hasMajor         = apiData.has_major         ?? false;
    this.interactions     = this._parse(apiData.interactions ?? []);
    this.patientFlags     = apiData.patient_flags     ?? {};
    this.checkedAt        = apiData.checked_at        ?? new Date().toISOString();
  }

  /* ── Parse and enrich each interaction from the API ── */
  _parse(interactions) {
    return interactions
      .map(i => ({
        drugA           : i.drug_a            ?? '—',
        drugB           : i.drug_b            ?? '—',
        severity        : i.severity          ?? 'minor',
        interactionType : i.interaction_type  ?? 'ddi',
        mechanism       : i.mechanism         ?? null,
        clinicalEffect  : i.clinical_effect   ?? null,
        recommendation  : i.recommendation    ?? null,
        alternatives    : Array.isArray(i.alternatives) ? i.alternatives : [],
        source          : i.source            ?? null,
        evidenceLevel   : i.evidence_level    ?? null,
        // Computed display properties
        severityMeta    : SEVERITY_META[i.severity] ?? SEVERITY_META.minor,
        typeLabel       : INTERACTION_TYPE_LABELS[i.interaction_type] ?? i.interaction_type,
        evidenceLabel   : EVIDENCE_LABELS[i.evidence_level] ?? null,
      }))
      .sort((a, b) =>
        (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99)
      );
  }

  /* ── Convenience getters ── */

  /** All contraindicated interactions */
  get contraindications() {
    return this.interactions.filter(i => i.severity === 'contraindicated');
  }

  /** All major interactions */
  get majorInteractions() {
    return this.interactions.filter(i => i.severity === 'major');
  }

  /** All pregnancy-related interactions */
  get pregnancyRisks() {
    return this.interactions.filter(i => i.interactionType === 'drug_pregnancy');
  }

  /** All duplicate-therapy detections */
  get duplicateTherapies() {
    return this.interactions.filter(i => i.interactionType === 'duplicate_therapy');
  }

  /** True if any interactions of any severity were found */
  get hasAnyInteraction() {
    return this.interactionCount > 0;
  }

  /** True if pregnancy flag was passed and risks were found */
  get hasPregnancyRisk() {
    return this.pregnancyRisks.length > 0;
  }

  /** Overall safety level string: safe | caution | warning | danger */
  get overallLevel() {
    if (this.contraindications.length > 0) return 'danger';
    if (this.majorInteractions.length > 0) return 'danger';
    if (this.interactions.some(i => i.severity === 'moderate')) return 'warning';
    if (this.interactions.some(i => i.severity === 'minor'))    return 'caution';
    return 'safe';
  }

  /** Summary line for display */
  get summaryText() {
    if (!this.hasAnyInteraction) {
      return 'No known interactions detected between the checked drugs.';
    }
    const parts = [];
    if (this.contraindications.length) parts.push(`${this.contraindications.length} contraindicated`);
    if (this.majorInteractions.length) parts.push(`${this.majorInteractions.length} major`);
    const mod = this.interactions.filter(i => i.severity === 'moderate').length;
    if (mod) parts.push(`${mod} moderate`);
    const min = this.interactions.filter(i => i.severity === 'minor').length;
    if (min) parts.push(`${min} minor`);
    return `${this.interactionCount} interaction${this.interactionCount > 1 ? 's' : ''} detected: ${parts.join(', ')}.`;
  }
}

/* ─────────────────────────────────────────────────────────────────
   InteractionError
───────────────────────────────────────────────────────────────── */

class InteractionError extends Error {
  constructor(message, code = 'UNKNOWN', retryable = true) {
    super(message);
    this.name      = 'InteractionError';
    this.code      = code;
    this.retryable = retryable;
  }
}

/* ─────────────────────────────────────────────────────────────────
   DrugInteractionEngine — public API
───────────────────────────────────────────────────────────────── */

const DrugInteractionEngine = {

  /* ────────────────────────────────────────────────────────────
     Core check — calls POST /api/v1/drugs/interactions
  ──────────────────────────────────────────────────────────── */

  /**
   * Check interactions between two or more drugs.
   *
   * @param {string[]}  drugs    Array of drug names (minimum 2, max 10).
   * @param {object}   [options]
   * @param {boolean}  [options.pregnant=false]   Flag pregnancy risk check.
   * @param {number}   [options.patientAge=null]  Patient age for age-specific warnings.
   * @param {string[]} [options.conditions=[]]    Known conditions for contraindication check.
   *
   * @returns {Promise<InteractionResult>}
   * @throws  {InteractionError}
   */
  async check(drugs, options = {}) {
    const {
      pregnant    = false,
      patientAge  = null,
      conditions  = [],
    } = options;

    // ── Client-side validation ──
    const cleaned = this._validateDrugs(drugs);

    // ── Build request payload matching backend DrugController expectation ──
    const payload = {
      drugs            : cleaned,
      patient_pregnant : pregnant,
      patient_age      : patientAge,
    };

    try {
      const res = await RxGuard.Drugs.interactions(cleaned, {
        patient_pregnant: pregnant,
        patient_age     : patientAge,
      });

      const result = new InteractionResult(res.data);

      // ── Client-side augmentation: condition-based contraindications ──
      if (conditions.length > 0) {
        const condChecks = await this._checkConditionContraindications(cleaned, conditions);
        if (condChecks.length > 0) {
          result.interactions.unshift(...condChecks);
          result.interactionCount += condChecks.length;
          result.hasMajor = result.hasMajor || condChecks.some(c =>
            c.severity === 'major' || c.severity === 'contraindicated'
          );
          // Re-sort after augmentation
          result.interactions.sort((a, b) =>
            (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99)
          );
        }
      }

      return result;

    } catch (err) {
      if (err instanceof InteractionError) throw err;
      throw this._normaliseError(err);
    }
  },

  /* ────────────────────────────────────────────────────────────
     Pregnancy-specific check
     Calls the same endpoint with pregnant=true.
  ──────────────────────────────────────────────────────────── */

  /**
   * Check all drugs in a list for pregnancy contraindications.
   *
   * @param {string[]} drugs
   * @returns {Promise<InteractionResult>}
   */
  async checkPregnancy(drugs) {
    return this.check(drugs, { pregnant: true });
  },

  /* ────────────────────────────────────────────────────────────
     Single drug monograph + contraindications
     Calls GET /api/v1/drugs/{name}
  ──────────────────────────────────────────────────────────── */

  /**
   * Fetch full drug monograph including contraindications from EMDEX.
   *
   * @param  {string}  drugName
   * @returns {Promise<object>}   Full monograph data object or null if not found.
   * @throws {InteractionError}
   */
  async getMonograph(drugName) {
    if (!drugName?.trim()) {
      throw new InteractionError('Drug name is required.', 'INVALID_INPUT', false);
    }

    try {
      const res = await RxGuard.Drugs.lookup(drugName.trim());
      return res.data ?? null;
    } catch (err) {
      if (err?.status === 404) return null;
      throw this._normaliseError(err);
    }
  },

  /* ────────────────────────────────────────────────────────────
     Nigerian brand lookup
     Calls GET /api/v1/drugs/{name}/brands
  ──────────────────────────────────────────────────────────── */

  /**
   * Fetch Nigerian brand names for a generic drug via OpenFDA.
   *
   * @param  {string}  drugName
   * @returns {Promise<Array<{brand_name: string, manufacturer?: string}>>}
   */
  async getBrands(drugName) {
    if (!drugName?.trim()) return [];
    try {
      const res = await RxGuard.Drugs.brands(drugName.trim());
      return res.data?.brands ?? [];
    } catch {
      return [];
    }
  },

  /* ────────────────────────────────────────────────────────────
     Batch check for a full prescription drug list
  ──────────────────────────────────────────────────────────── */

  /**
   * Check all interactions for a full list of prescription drugs.
   * Convenience wrapper that also fetches monograph data for each drug.
   *
   * @param {Array<{drug_name: string, generic_name?: string}>} prescriptionDrugs
   * @param {object} patientContext  { pregnant, age, conditions }
   * @returns {Promise<{result: InteractionResult, monographs: object[]}>}
   */
  async checkPrescription(prescriptionDrugs, patientContext = {}) {
    const names = prescriptionDrugs
      .map(d => d.generic_name || d.drug_name)
      .filter(Boolean);

    if (names.length < 2) {
      // Single-drug prescription — still check pregnancy/monograph
      const monographs = await Promise.all(
        names.map(n => this.getMonograph(n).catch(() => null))
      );
      return {
        result     : new InteractionResult({ drugs: names, interaction_count: 0, has_major: false, interactions: [], patient_flags: patientContext }),
        monographs,
      };
    }

    const [result, ...monographs] = await Promise.all([
      this.check(names, patientContext),
      ...names.map(n => this.getMonograph(n).catch(() => null)),
    ]);

    return { result, monographs };
  },

  /* ────────────────────────────────────────────────────────────
     Condition-based contraindication check (client-side)
     Uses known contraindication patterns until a dedicated
     /api/drug/contraindications endpoint is added to the backend.
  ──────────────────────────────────────────────────────────── */

  /**
   * @private
   * Cross-reference drugs against a list of known patient conditions.
   * Returns synthetic interaction objects in the same shape as API data.
   */
  async _checkConditionContraindications(drugs, conditions) {
    const issues = [];
    const normConditions = conditions.map(c => c.toLowerCase());

    // Known drug–disease contraindication patterns
    const DRUG_DISEASE_RULES = [
      {
        drugs      : ['aspirin', 'ibuprofen', 'naproxen', 'diclofenac', 'piroxicam'],
        condition  : 'peptic ulcer',
        severity   : 'major',
        mechanism  : 'NSAIDs inhibit prostaglandin synthesis, reducing gastric mucosal protection.',
        recommendation: 'Avoid NSAIDs. Use Paracetamol for analgesia. Consider PPI co-prescription if NSAID essential.',
      },
      {
        drugs      : ['metformin'],
        condition  : 'renal impairment',
        severity   : 'contraindicated',
        mechanism  : 'Metformin accumulates in renal impairment, raising risk of lactic acidosis.',
        recommendation: 'Contraindicated when eGFR < 30 mL/min/1.73m². Dose-reduce for eGFR 30–60.',
      },
      {
        drugs      : ['atenolol','bisoprolol','carvedilol','propranolol','metoprolol'],
        condition  : 'asthma',
        severity   : 'contraindicated',
        mechanism  : 'Non-selective beta-blockers cause bronchospasm in asthmatic patients.',
        recommendation: 'Avoid non-selective beta-blockers. Use cardioselective alternatives cautiously.',
      },
      {
        drugs      : ['lisinopril','enalapril','ramipril','captopril','perindopril'],
        condition  : 'pregnancy',
        severity   : 'contraindicated',
        mechanism  : 'ACE inhibitors are teratogenic — cause renal dysgenesis, oligohydramnios.',
        recommendation: 'Contraindicated in pregnancy. Switch to methyldopa or labetalol.',
      },
      {
        drugs      : ['amiodarone'],
        condition  : 'thyroid disease',
        severity   : 'major',
        mechanism  : 'Amiodarone contains iodine and disrupts thyroid hormone synthesis.',
        recommendation: 'Monitor thyroid function every 6 months. Endocrinology review recommended.',
      },
      {
        drugs      : ['tramadol','codeine','morphine','pethidine','fentanyl'],
        condition  : 'seizure disorder',
        severity   : 'major',
        mechanism  : 'Opioids, especially tramadol, lower seizure threshold.',
        recommendation: 'Use with extreme caution. Prefer Paracetamol or NSAIDs where possible.',
      },
      {
        drugs      : ['ciprofloxacin','levofloxacin','ofloxacin'],
        condition  : 'epilepsy',
        severity   : 'moderate',
        mechanism  : 'Fluoroquinolones inhibit GABA binding and lower seizure threshold.',
        recommendation: 'Avoid fluoroquinolones in epilepsy. Use alternative antibiotics.',
      },
    ];

    for (const drug of drugs) {
      const drugLower = drug.toLowerCase();

      for (const rule of DRUG_DISEASE_RULES) {
        const matchesDrug = rule.drugs.some(d => drugLower.includes(d));
        const matchesCond = normConditions.some(c => c.includes(rule.condition) || rule.condition.includes(c));

        if (matchesDrug && matchesCond) {
          issues.push({
            drugA          : drug,
            drugB          : rule.condition.replace(/\b\w/g, l => l.toUpperCase()),
            severity       : rule.severity,
            interactionType: 'drug_disease',
            mechanism      : rule.mechanism,
            clinicalEffect : null,
            recommendation : rule.recommendation,
            alternatives   : [],
            source         : 'RxGuard Clinical Rules',
            evidenceLevel  : 'B',
            severityMeta   : SEVERITY_META[rule.severity] ?? SEVERITY_META.moderate,
            typeLabel      : INTERACTION_TYPE_LABELS.drug_disease,
            evidenceLabel  : EVIDENCE_LABELS.B,
          });
        }
      }
    }

    return issues;
  },

  /* ────────────────────────────────────────────────────────────
     HTML rendering helpers
  ──────────────────────────────────────────────────────────── */

  /**
   * Render a complete interaction report as an HTML string.
   * Uses the same CSS classes as components.css / checker.html.
   *
   * @param  {InteractionResult} result
   * @param  {object}            [opts]
   * @param  {boolean}           [opts.showSummaryBar=true]
   * @param  {boolean}           [opts.showAlternatives=true]
   * @param  {boolean}           [opts.showSources=true]
   * @returns {string}  HTML string ready for innerHTML insertion.
   */
  renderResults(result, opts = {}) {
    const {
      showSummaryBar    = true,
      showAlternatives  = true,
      showSources       = true,
    } = opts;

    if (!(result instanceof InteractionResult)) {
      return '<div class="alert alert-danger"><span>⛔</span><span>Invalid result object.</span></div>';
    }

    const parts = [];

    if (showSummaryBar) {
      parts.push(this.renderSummaryBar(result));
    }

    if (!result.hasAnyInteraction) {
      parts.push(this.renderNoInteractions());
    } else {
      result.interactions.forEach(i => {
        parts.push(this.renderInteractionCard(i, { showAlternatives, showSources }));
      });
    }

    parts.push(this._renderDisclaimer());

    return parts.join('');
  },

  /**
   * Render the summary banner at the top of a result set.
   * @param  {InteractionResult} result
   * @returns {string}
   */
  renderSummaryBar(result) {
    const level = result.overallLevel;

    const style = {
      safe   : { bg:'var(--rx-green-light)', border:'#A5D9C5', icon:'✅', textColor:'var(--rx-green-dark)' },
      caution: { bg:'var(--rx-amber-light)', border:'#EDD098', icon:'ℹ️', textColor:'var(--rx-amber-dark)' },
      warning: { bg:'var(--rx-amber-light)', border:'#EDD098', icon:'⚠️', textColor:'var(--rx-amber-dark)' },
      danger : { bg:'var(--rx-red-light)',   border:'#F0AFAF', icon:'⛔', textColor:'var(--rx-red-dark)'   },
    }[level];

    const drugsHtml = result.drugs
      .map(d => `<strong>${this._escHtml(d)}</strong>`)
      .join(' + ');

    const pregnancyBadge = result.hasPregnancyRisk
      ? '<span class="badge badge-danger" style="margin-left:6px">🤰 Pregnancy risk</span>'
      : '';

    const duplicateBadge = result.duplicateTherapies.length
      ? '<span class="badge badge-warning" style="margin-left:6px">🔁 Duplicate therapy</span>'
      : '';

    return `
      <div style="display:flex;align-items:flex-start;gap:var(--space-3);
                  padding:var(--space-4) var(--space-5);
                  background:${style.bg};border:1px solid ${style.border};
                  border-radius:var(--radius-lg);margin-bottom:var(--space-4)">
        <span style="font-size:1.25rem;flex-shrink:0">${style.icon}</span>
        <div style="flex:1;min-width:0">
          <div style="font-size:.9375rem;font-weight:600;color:${style.textColor};margin-bottom:.35rem">
            ${this._escHtml(result.summaryText)}
          </div>
          <div style="font-size:.8125rem;color:var(--rx-muted);display:flex;flex-wrap:wrap;
                      align-items:center;gap:4px">
            Checked: ${drugsHtml}${pregnancyBadge}${duplicateBadge}
          </div>
        </div>
        <div style="font-size:.75rem;color:var(--rx-muted);flex-shrink:0;white-space:nowrap">
          ${new Date(result.checkedAt).toLocaleTimeString('en-NG', { hour:'2-digit', minute:'2-digit' })}
        </div>
      </div>`;
  },

  /**
   * Render a single interaction card.
   * Uses `.interaction-card.{severity}` from components.css.
   *
   * @param  {object}  interaction   Parsed interaction object from InteractionResult
   * @param  {object}  [opts]
   * @returns {string}
   */
  renderInteractionCard(interaction, opts = {}) {
    const { showAlternatives = true, showSources = true } = opts;
    const meta = interaction.severityMeta;

    const badgeHtml   = this._renderSeverityBadge(interaction.severity);
    const typeBadge   = `<span class="badge badge-neutral" style="font-size:.6875rem">
                           ${this._escHtml(interaction.typeLabel)}
                         </span>`;
    const evidenceBadge = interaction.evidenceLabel
      ? `<span class="badge badge-info" style="font-size:.6875rem">
           Evidence: ${this._escHtml(interaction.evidenceLabel)}
         </span>`
      : '';

    const mechanismHtml = interaction.mechanism
      ? `<div style="font-size:.875rem;font-weight:600;color:var(--rx-text-secondary);
                     margin:.75rem 0 .35rem">Mechanism</div>
         <div class="interaction-body">${this._escHtml(interaction.mechanism)}</div>`
      : '';

    const effectHtml = interaction.clinicalEffect
      ? `<div style="font-size:.875rem;font-weight:600;color:var(--rx-text-secondary);
                     margin:.5rem 0 .35rem">Clinical Effect</div>
         <div class="interaction-body">${this._escHtml(interaction.clinicalEffect)}</div>`
      : '';

    const recHtml = interaction.recommendation
      ? `<div class="interaction-rec" style="margin-top:.75rem">
           💡 <strong>Recommendation:</strong> ${this._escHtml(interaction.recommendation)}
         </div>`
      : '';

    const altsHtml = showAlternatives && interaction.alternatives.length
      ? this._renderAlternatives(interaction.alternatives)
      : '';

    const sourceHtml = showSources && interaction.source
      ? `<div style="font-size:.7rem;color:var(--rx-muted);margin-top:.75rem">
           Source: ${this._escHtml(interaction.source)}
         </div>`
      : '';

    const adviceHtml = `
      <div style="font-size:.75rem;font-style:italic;color:${meta.color};
                  margin-top:.5rem;padding:.5rem;background:rgba(255,255,255,.5);
                  border-radius:var(--radius-sm)">
        ${meta.advice}
      </div>`;

    return `
      <div class="interaction-card ${this._escHtml(interaction.severity)}"
           style="margin-bottom:var(--space-3)">
        <div class="interaction-header">
          <div>
            <div class="interaction-drugs">
              ${this._escHtml(interaction.drugA)}
              <span style="color:var(--rx-muted);font-weight:400;margin:0 5px">+</span>
              ${this._escHtml(interaction.drugB)}
            </div>
            <div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.35rem;align-items:center">
              ${badgeHtml}${typeBadge}${evidenceBadge}
            </div>
          </div>
          <span style="font-size:1.25rem">${meta.icon}</span>
        </div>
        ${mechanismHtml}
        ${effectHtml}
        ${recHtml}
        ${adviceHtml}
        ${altsHtml}
        ${sourceHtml}
      </div>`;
  },

  /**
   * Render the "no interactions found" success panel.
   * @returns {string}
   */
  renderNoInteractions() {
    return `
      <div style="text-align:center;padding:2.5rem var(--space-8);
                  background:var(--rx-green-light);
                  border:1px solid #A5D9C5;border-radius:var(--radius-lg)">
        <div style="font-size:2.5rem;margin-bottom:.75rem">✅</div>
        <div style="font-size:1rem;font-weight:700;color:var(--rx-green-dark);margin-bottom:.5rem">
          No Interactions Found
        </div>
        <div style="font-size:.875rem;color:var(--rx-green-dark);line-height:1.6;max-width:420px;margin:0 auto">
          No known drug interactions were detected between the checked medications.
          Always confirm with a PCN-registered pharmacist before dispensing.
        </div>
      </div>`;
  },

  /**
   * Render a severity badge matching the badge styles in components.css.
   * @param  {string} severity
   * @returns {string}
   */
  renderSeverityBadge(severity) {
    return this._renderSeverityBadge(severity);
  },

  /**
   * Render a compact inline severity pill (for use in tables and lists).
   * @param  {string} severity
   * @returns {string}
   */
  renderSeverityPill(severity) {
    const meta = SEVERITY_META[severity] ?? SEVERITY_META.minor;
    return `<span style="display:inline-flex;align-items:center;gap:4px;
                         padding:2px 10px;border-radius:999px;font-size:.6875rem;
                         font-weight:700;background:${meta.bg};color:${meta.color};
                         border:1px solid ${meta.border}">
              ${meta.icon} ${meta.label}
            </span>`;
  },

  /* ────────────────────────────────────────────────────────────
     Private helpers
  ──────────────────────────────────────────────────────────── */

  /**
   * Validate the drug list input.
   * @param  {string[]} drugs
   * @returns {string[]}  Cleaned array
   * @throws  {InteractionError}
   */
  _validateDrugs(drugs) {
    if (!Array.isArray(drugs)) {
      throw new InteractionError('drugs must be an array of strings.', 'INVALID_INPUT', false);
    }

    const cleaned = drugs
      .map(d => String(d || '').trim())
      .filter(Boolean);

    if (cleaned.length < 2) {
      throw new InteractionError(
        'At least two drug names are required to check for interactions.',
        'TOO_FEW_DRUGS',
        false
      );
    }

    if (cleaned.length > 10) {
      throw new InteractionError(
        'A maximum of 10 drugs can be checked at once.',
        'TOO_MANY_DRUGS',
        false
      );
    }

    // Detect obvious duplicates (case-insensitive)
    const lower = cleaned.map(d => d.toLowerCase());
    const unique = new Set(lower);
    if (unique.size < cleaned.length) {
      throw new InteractionError(
        'Duplicate drug names detected. Each drug should appear only once.',
        'DUPLICATE_DRUGS',
        false
      );
    }

    return cleaned;
  },

  _renderSeverityBadge(severity) {
    const meta = SEVERITY_META[severity] ?? SEVERITY_META.minor;
    const cls  = {
      contraindicated: 'badge-danger',
      major          : 'badge-danger',
      moderate       : 'badge-warning',
      minor          : 'badge-safe',
    }[severity] ?? 'badge-neutral';

    return `<span class="badge ${cls}">${meta.icon} ${meta.label}</span>`;
  },

  _renderAlternatives(alternatives) {
    const items = alternatives.slice(0, 3).map(alt => {
      const generic  = alt.generic          ?? alt.alternative_generic ?? '';
      const brands   = alt.brands           ?? alt.alternative_brands  ?? [];
      const reason   = alt.reason           ?? '';
      const advantage= alt.safety_advantage ?? '';

      const brandsHtml = brands.length
        ? `<div class="alt-drug-brands">🇳🇬 ${brands.slice(0, 4).map(b => this._escHtml(b)).join(' · ')}</div>`
        : '';

      const reasonHtml = reason
        ? `<div class="alt-drug-reason">${this._escHtml(reason)}</div>`
        : '';

      const advantageHtml = advantage
        ? `<div style="font-size:.7rem;color:var(--rx-green-dark);margin-top:2px">
             ✓ ${this._escHtml(advantage)}</div>`
        : '';

      return `
        <div class="alt-drug-item">
          <div>
            <div class="alt-drug-name">${this._escHtml(generic)}</div>
            ${brandsHtml}${reasonHtml}${advantageHtml}
          </div>
          <span class="badge badge-safe" style="flex-shrink:0">Safer</span>
        </div>`;
    }).join('');

    return `
      <div style="margin-top:var(--space-3)">
        <div style="font-size:.75rem;font-weight:700;color:var(--rx-muted);
                    text-transform:uppercase;letter-spacing:.4px;margin-bottom:.5rem">
          🇳🇬 Safer Alternatives (EMDEX / OpenFDA)
        </div>
        ${items}
      </div>`;
  },

  _renderDisclaimer() {
    return `
      <div style="margin-top:var(--space-4);padding:var(--space-3) var(--space-4);
                  background:var(--rx-surface-alt);border-radius:var(--radius-md);
                  border:1px solid var(--rx-border)">
        <p style="font-size:.75rem;color:var(--rx-muted);line-height:1.6;margin:0">
          ⚕️ This tool is for informational purposes only. Data sourced from EMDEX Nigeria
          and OpenFDA. Always verify with a qualified
          <strong>PCN-registered pharmacist</strong> or
          <strong>MDCN-registered physician</strong> before making clinical decisions.
        </p>
      </div>`;
  },

  _normaliseError(err) {
    if (err instanceof InteractionError) return err;

    if (err?.status === 0 || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      return new InteractionError(
        'No network connection. Check your internet and try again.',
        'NETWORK_ERROR', true
      );
    }
    if (err?.status === 401) {
      return new InteractionError('Session expired. Please log in again.', 'UNAUTHENTICATED', false);
    }
    if (err?.status === 422) {
      return new InteractionError(
        err.message || 'Validation failed. Check the drug names and try again.',
        'VALIDATION_ERROR', false
      );
    }
    if (err?.status >= 500) {
      return new InteractionError(
        'A server error occurred. Please try again.',
        'SERVER_ERROR', true
      );
    }

    return new InteractionError(
      err?.message || 'Interaction check failed. Please try again.',
      'UNKNOWN', true
    );
  },

  _escHtml(str) {
    return String(str ?? '')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;');
  },

  /* ────────────────────────────────────────────────────────────
     Static data accessors (no API call required)
  ──────────────────────────────────────────────────────────── */

  /** All severity metadata keyed by level string */
  get severityMeta()     { return SEVERITY_META; },

  /** Interaction type → display label map */
  get typeLabels()       { return INTERACTION_TYPE_LABELS; },

  /** Evidence grade → display label map */
  get evidenceLabels()   { return EVIDENCE_LABELS; },

  /** Severity sort order (lower = more severe) */
  get severityOrder()    { return SEVERITY_ORDER; },
};

/* ─────────────────────────────────────────────────────────────────
   Expose to global scope
───────────────────────────────────────────────────────────────── */

window.DrugInteractionEngine = DrugInteractionEngine;
window.InteractionResult     = InteractionResult;
window.InteractionError      = InteractionError;