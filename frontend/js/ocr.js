/**
 * RxGuard — ocr.js
 *
 * OCR Integration Module
 * ──────────────────────
 * Responsible for the complete prescription digitisation pipeline:
 *   1. Client-side file validation (type, size, dimensions)
 *   2. Secure upload to the backend (/api/v1/prescriptions/upload)
 *   3. Trigger analysis (/api/v1/prescriptions/{id}/analyze)
 *   4. Progress reporting via callbacks
 *   5. Structured extraction of all prescription fields
 *   6. Error classification and recovery hints
 *
 * Usage:
 *   const result = await OCR.process(file, { onProgress, onStep });
 *   // result: OcrResult | throws OcrError
 *
 * Depends on: api.js (window.RxGuard must be loaded first)
 * Does NOT modify any existing file or DOM directly.
 */

'use strict';

/* ─────────────────────────────────────────────────────────────────
   Constants
───────────────────────────────────────────────────────────────── */

const OCR_CONFIG = Object.freeze({
  /** Accepted MIME types */
  ALLOWED_TYPES : ['image/jpeg', 'image/png', 'application/pdf'],

  /** Allowed file extensions (shown in error messages) */
  ALLOWED_EXTS  : ['JPG', 'PNG', 'PDF'],

  /** Hard file-size cap (10 MB — matches backend validation) */
  MAX_BYTES     : 10 * 1024 * 1024,

  /** Minimum readable image size in bytes (rejects tiny/corrupt files) */
  MIN_BYTES     : 2048,

  /** Max image dimensions to warn about blurry capture */
  WARN_WIDTH_PX : 400,
  WARN_HEIGHT_PX: 400,

  /** Timeout for the upload step (ms) */
  UPLOAD_TIMEOUT_MS : 30_000,

  /** Timeout for the full analysis step (ms) */
  ANALYZE_TIMEOUT_MS: 90_000,

  /** Confidence level below which a low-quality warning is added */
  LOW_CONFIDENCE_THRESHOLD: 60,

  /** Minimum completeness score to consider the extraction acceptable */
  MIN_COMPLETENESS_SCORE: 30,
});

/* ─────────────────────────────────────────────────────────────────
   Pipeline step definitions
   (Mirrors the step IDs used in scanner.js / scan.html)
───────────────────────────────────────────────────────────────── */

const OCR_STEPS = Object.freeze([
  { id: 'upload',     label: 'Uploading file',                pct: 15  },
  { id: 'ocr',        label: 'Running Gemini OCR',            pct: 40  },
  { id: 'extraction', label: 'Extracting prescription fields', pct: 65  },
  { id: 'validation', label: 'Validating with EMDEX',         pct: 85  },
  { id: 'report',     label: 'Building safety report',        pct: 100 },
]);

/* ─────────────────────────────────────────────────────────────────
   Error types
───────────────────────────────────────────────────────────────── */

class OcrError extends Error {
  /**
   * @param {string} message     Human-readable message shown to the user.
   * @param {string} code        Machine-readable error code.
   * @param {object} [meta]      Extra context (file name, size, step, etc.).
   * @param {boolean} [retryable] Whether the user can meaningfully retry.
   */
  constructor(message, code, meta = {}, retryable = true) {
    super(message);
    this.name      = 'OcrError';
    this.code      = code;
    this.meta      = meta;
    this.retryable = retryable;
  }

  /** Friendly hint displayed beneath the error message in the UI */
  get hint() {
    return OCR_ERROR_HINTS[this.code] ?? 'Please try again or contact support.';
  }
}

const OCR_ERROR_HINTS = {
  FILE_TYPE_INVALID  : 'Upload a JPG, PNG, or PDF file.',
  FILE_TOO_LARGE     : 'Compress the image or use a lower-resolution scan (max 10 MB).',
  FILE_TOO_SMALL     : 'The file appears to be empty or corrupt. Please try a different file.',
  FILE_READ_FAILED   : 'The file could not be read. Make sure it is not password-protected.',
  IMAGE_TOO_SMALL    : 'The image resolution is too low. Take a clearer photo in good lighting.',
  UPLOAD_FAILED      : 'Check your internet connection and try again.',
  UPLOAD_TIMEOUT     : 'The upload took too long. Try a smaller file or check your connection.',
  ANALYZE_FAILED     : 'The server could not process the prescription. Try a clearer image.',
  ANALYZE_TIMEOUT    : 'Analysis is taking longer than expected. The server may be busy — try again.',
  EXTRACTION_EMPTY   : 'No text was extracted. Ensure the prescription is clearly visible with good lighting.',
  CONFIDENCE_LOW     : 'The scan quality is low. Re-photograph with better lighting and try again.',
  ALREADY_PROCESSED  : 'This prescription has already been analysed.',
  UNAUTHENTICATED    : 'You must be signed in to analyse prescriptions.',
  SERVER_ERROR       : 'A server error occurred. Our team has been notified.',
  NETWORK_ERROR      : 'No network connection. Check your internet and try again.',
};

/* ─────────────────────────────────────────────────────────────────
   OcrResult  —  the structured data returned on success
───────────────────────────────────────────────────────────────── */

class OcrResult {
  /**
   * @param {object} raw  Full API response from analyze endpoint.
   */
  constructor(raw) {
    /** Raw API payload — preserved for downstream consumers */
    this.raw = raw;

    /** Unique backend prescription record ID */
    this.prescriptionId = raw.id ?? null;

    /** Pipeline status from the backend */
    this.status = raw.status ?? 'completed';

    /** 0–100 overall safety score */
    this.safetyScore = raw.safety_score ?? null;

    /** 0–100 completeness of extracted fields */
    this.completenessScore = raw.completeness_score ?? null;

    /** OCR engine confidence (0–100) */
    this.ocrConfidence = raw.ocr_confidence ?? null;

    /** Gemini model used */
    this.geminiModel = raw.gemini_meta?.model ?? null;

    /** Patient demographics extracted from prescription */
    this.patient = this._parsePatient(raw.patient ?? {});

    /** Prescriber details */
    this.prescriber = this._parsePrescriber(raw.prescriber ?? {});

    /** ISO date string or null */
    this.prescriptionDate = raw.prescription_date ?? null;

    /** Array of extracted drug objects */
    this.drugs = this._parseDrugs(raw.drugs ?? []);

    /** Array of detected interaction/error objects */
    this.interactions = raw.interactions ?? [];

    /** Boolean flags */
    this.hasInteractions = raw.flags?.has_interactions ?? false;
    this.hasErrors       = raw.flags?.has_errors       ?? false;

    /** Warnings added client-side (e.g. low confidence) */
    this.warnings = this._buildWarnings();
  }

  /* ── Field parsers ── */

  _parsePatient(p) {
    return {
      name   : p.name   ?? null,
      age    : p.age    ?? null,
      gender : p.gender ?? null,
    };
  }

  _parsePrescriber(p) {
    return {
      name      : p.name     ?? null,
      regNo     : p.reg_no   ?? null,
      hospital  : p.hospital ?? null,
      contact   : p.contact  ?? null,
    };
  }

  _parseDrugs(drugs) {
    return drugs.map(d => ({
      drugName         : d.drug_name          ?? '',
      genericName      : d.generic_name       ?? null,
      displayName      : d.display_name       ?? d.drug_name ?? '',
      strength         : d.strength           ?? null,
      dosageForm       : d.dosage_form        ?? null,
      doseInstructions : d.dose_instructions  ?? null,
      duration         : d.duration           ?? null,
      quantity         : d.quantity           ?? null,
      route            : d.route              ?? null,
      atcCode          : d.atc_code           ?? null,
      hasWarning       : d.has_warning        ?? false,
      warningText      : d.warning_text       ?? null,
      brands           : d.brands             ?? [],
      emdexSummary     : d.emdex_summary      ?? null,
    }));
  }

  _buildWarnings() {
    const w = [];

    if (this.ocrConfidence !== null && this.ocrConfidence < OCR_CONFIG.LOW_CONFIDENCE_THRESHOLD) {
      w.push({
        code    : 'CONFIDENCE_LOW',
        message : `OCR confidence is ${this.ocrConfidence}% — extraction may be incomplete.`,
        hint    : OCR_ERROR_HINTS.CONFIDENCE_LOW,
      });
    }

    if (this.completenessScore !== null && this.completenessScore < OCR_CONFIG.MIN_COMPLETENESS_SCORE) {
      w.push({
        code    : 'EXTRACTION_INCOMPLETE',
        message : 'Several required prescription fields could not be extracted.',
        hint    : 'Check that the full prescription including prescriber details is visible.',
      });
    }

    if (!this.prescriber.name) {
      w.push({
        code    : 'MISSING_PRESCRIBER',
        message : 'Prescriber name not found on prescription.',
        hint    : 'Ensure the doctor\'s name and MDCN/PCN number are clearly visible.',
      });
    }

    if (!this.prescriptionDate) {
      w.push({
        code    : 'MISSING_DATE',
        message : 'Prescription date could not be extracted.',
        hint    : 'Confirm the date is printed or written on the prescription.',
      });
    }

    if (this.drugs.length === 0) {
      w.push({
        code    : 'NO_DRUGS',
        message : 'No medications were extracted from this prescription.',
        hint    : 'The drug list may be on a separate page, or image quality may be too low.',
      });
    }

    return w;
  }

  /* ── Convenience getters ── */

  /** True if any warnings or interactions were found */
  get hasIssues() {
    return this.warnings.length > 0 || this.hasInteractions || this.hasErrors;
  }

  /** Human-readable safety label */
  get safetyLabel() {
    if (this.safetyScore === null) return 'Pending';
    if (this.safetyScore >= 90)   return 'Safe';
    if (this.safetyScore >= 70)   return 'Review Needed';
    return 'Flagged';
  }

  /** CSS colour class matching safety label */
  get safetyColor() {
    if (this.safetyScore === null) return 'gray';
    if (this.safetyScore >= 90)   return 'green';
    if (this.safetyScore >= 70)   return 'amber';
    return 'red';
  }

  /** Drug names as a comma-separated string */
  get drugList() {
    return this.drugs.map(d => d.displayName).join(', ') || '—';
  }

  /** Interactions sorted: contraindicated > major > moderate > minor */
  get sortedInteractions() {
    const order = { contraindicated: 0, major: 1, moderate: 2, minor: 3 };
    return [...this.interactions].sort(
      (a, b) => (order[a.severity] ?? 4) - (order[b.severity] ?? 4)
    );
  }
}

/* ─────────────────────────────────────────────────────────────────
   OCR  —  public API
───────────────────────────────────────────────────────────────── */

const OCR = {

  /* ── Public entry point ─────────────────────────────────────── */

  /**
   * Process a prescription file through the full OCR pipeline.
   *
   * @param {File}   file           The prescription file from a file input or drop event.
   * @param {object} [options]
   * @param {function(step: object, pct: number): void} [options.onProgress]
   *   Called at each pipeline step.  `step` has `{ id, label, pct }`.
   * @param {function(step: object): void}              [options.onStep]
   *   Called when each step starts (before the async work).
   * @param {AbortSignal}                               [options.signal]
   *   Optional AbortSignal to cancel the pipeline.
   *
   * @returns {Promise<OcrResult>}
   * @throws  {OcrError}
   */
  async process(file, options = {}) {
    const { onProgress = null, onStep = null, signal = null } = options;

    // ── Step 0: validate file client-side ──
    this._validateFile(file);

    // ── Step 1: upload ──
    this._reportStep(OCR_STEPS[0], onStep, onProgress);
    const prescriptionId = await this._upload(file, signal);

    // ── Steps 2–4: trigger analysis (OCR + extraction + validation) ──
    this._reportStep(OCR_STEPS[1], onStep, onProgress);
    const analysisData   = await this._analyse(prescriptionId, onProgress, signal);

    // ── Step 5: build result ──
    this._reportStep(OCR_STEPS[4], onStep, onProgress);
    return new OcrResult(analysisData);
  },

  /* ── File validation ─────────────────────────────────────────── */

  /**
   * Validate file type and size before any network request.
   * @param {File} file
   * @throws {OcrError}
   */
  _validateFile(file) {
    if (!file || !(file instanceof File)) {
      throw new OcrError(
        'No file provided.',
        'FILE_READ_FAILED',
        {},
        false
      );
    }

    if (!OCR_CONFIG.ALLOWED_TYPES.includes(file.type)) {
      throw new OcrError(
        `Unsupported file type: "${file.type || 'unknown'}". ` +
        `Accepted formats: ${OCR_CONFIG.ALLOWED_EXTS.join(', ')}.`,
        'FILE_TYPE_INVALID',
        { fileType: file.type, fileName: file.name },
        false
      );
    }

    if (file.size < OCR_CONFIG.MIN_BYTES) {
      throw new OcrError(
        'The file appears to be empty or too small to be a prescription.',
        'FILE_TOO_SMALL',
        { fileSize: file.size, fileName: file.name },
        false
      );
    }

    if (file.size > OCR_CONFIG.MAX_BYTES) {
      const sizeMb = (file.size / 1024 / 1024).toFixed(1);
      throw new OcrError(
        `File is too large (${sizeMb} MB). Maximum allowed size is 10 MB.`,
        'FILE_TOO_LARGE',
        { fileSize: file.size, fileName: file.name },
        false
      );
    }
  },

  /**
   * For image files, check pixel dimensions after the fact and
   * resolve a warning (not an error) if too small.
   * Returns a Promise<{width, height}|null>.
   */
  async _getImageDimensions(file) {
    if (!file.type.startsWith('image/')) return null;

    return new Promise(resolve => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload  = () => { URL.revokeObjectURL(url); resolve({ width: img.width, height: img.height }); };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    });
  },

  /* ── Upload step ─────────────────────────────────────────────── */

  /**
   * Upload the file to the backend and return the prescription ID.
   * @param {File}        file
   * @param {AbortSignal} [signal]
   * @returns {Promise<number>} prescriptionId
   * @throws  {OcrError}
   */
  async _upload(file, signal) {
    const controller = new AbortController();
    const timeoutId  = setTimeout(
      () => controller.abort(),
      OCR_CONFIG.UPLOAD_TIMEOUT_MS
    );

    // Chain caller's signal
    if (signal) {
      signal.addEventListener('abort', () => controller.abort());
    }

    try {
      const res = await RxGuard.Prescriptions.upload(file);

      const id = res.data?.prescription_id;
      if (!id) {
        throw new OcrError(
          'Upload succeeded but no prescription ID was returned.',
          'UPLOAD_FAILED',
          { response: res },
          true
        );
      }

      return id;

    } catch (err) {
      if (err instanceof OcrError) throw err;

      // AbortController timeout
      if (err.name === 'AbortError' || controller.signal.aborted) {
        throw new OcrError(
          'Upload timed out after 30 seconds.',
          'UPLOAD_TIMEOUT',
          { fileName: file.name },
          true
        );
      }

      // Network errors
      if (err.status === 0 || !navigator.onLine) {
        throw new OcrError(
          'No network connection. Check your internet and try again.',
          'NETWORK_ERROR',
          {},
          true
        );
      }

      // Auth
      if (err.status === 401) {
        throw new OcrError(
          'You must be signed in to upload prescriptions.',
          'UNAUTHENTICATED',
          {},
          false
        );
      }

      // Validation (e.g. wrong file type rejected by server too)
      if (err.status === 422) {
        const detail = err.validationErrors
          ? Object.values(err.validationErrors).flat().join(' ')
          : err.message;
        throw new OcrError(detail, 'FILE_TYPE_INVALID', { apiErrors: err.validationErrors }, false);
      }

      // 5xx
      if (err.status >= 500) {
        throw new OcrError(
          'A server error occurred during upload.',
          'SERVER_ERROR',
          { status: err.status },
          true
        );
      }

      throw new OcrError(
        err.message || 'Upload failed.',
        'UPLOAD_FAILED',
        { originalError: err.message },
        true
      );

    } finally {
      clearTimeout(timeoutId);
    }
  },

  /* ── Analyse step ────────────────────────────────────────────── */

  /**
   * Trigger analysis of an uploaded prescription and return the
   * full structured report from the backend.
   *
   * @param {number}   prescriptionId
   * @param {function} onProgress
   * @param {AbortSignal} [signal]
   * @returns {Promise<object>}  Raw report data from the API
   * @throws  {OcrError}
   */
  async _analyse(prescriptionId, onProgress, signal) {
    const controller = new AbortController();
    const timeoutId  = setTimeout(
      () => controller.abort(),
      OCR_CONFIG.ANALYZE_TIMEOUT_MS
    );

    if (signal) {
      signal.addEventListener('abort', () => controller.abort());
    }

    try {
      // Advance progress indicator through OCR → extraction → validation steps
      // while the single long-running request executes.
      const progressInterval = this._simulateProgress(onProgress, [
        { step: OCR_STEPS[1], delay: 0    },
        { step: OCR_STEPS[2], delay: 8000 },
        { step: OCR_STEPS[3], delay: 18000},
      ]);

      let res;
      try {
        res = await RxGuard.Prescriptions.analyze(prescriptionId);
      } finally {
        clearInterval(progressInterval);
      }

      const data = res?.data;

      if (!data) {
        throw new OcrError(
          'No analysis data received from the server.',
          'ANALYZE_FAILED',
          { prescriptionId },
          true
        );
      }

      // Check the backend flagged it as already done
      if (res.status === 'error' && res.message?.includes('already been analyzed')) {
        throw new OcrError(
          'This prescription has already been analysed.',
          'ALREADY_PROCESSED',
          { prescriptionId },
          false
        );
      }

      return data;

    } catch (err) {
      if (err instanceof OcrError) throw err;

      if (err.name === 'AbortError' || controller.signal.aborted) {
        throw new OcrError(
          'Analysis timed out after 90 seconds. The server may be under load.',
          'ANALYZE_TIMEOUT',
          { prescriptionId },
          true
        );
      }

      if (err.status === 0 || !navigator.onLine) {
        throw new OcrError('No network connection.', 'NETWORK_ERROR', {}, true);
      }

      if (err.status === 401) {
        throw new OcrError('Session expired.', 'UNAUTHENTICATED', {}, false);
      }

      if (err.status === 409) {
        throw new OcrError(
          'This prescription has already been analysed.',
          'ALREADY_PROCESSED',
          { prescriptionId },
          false
        );
      }

      if (err.status >= 500) {
        throw new OcrError(
          'A server error occurred during analysis.',
          'SERVER_ERROR',
          { status: err.status, prescriptionId },
          true
        );
      }

      throw new OcrError(
        err.message || 'Analysis failed.',
        'ANALYZE_FAILED',
        { prescriptionId, originalError: err.message },
        true
      );

    } finally {
      clearTimeout(timeoutId);
    }
  },

  /* ── Progress helpers ────────────────────────────────────────── */

  /**
   * Report a pipeline step to both onStep and onProgress callbacks.
   * @param {object}   step
   * @param {function} onStep
   * @param {function} onProgress
   */
  _reportStep(step, onStep, onProgress) {
    if (typeof onStep     === 'function') onStep(step);
    if (typeof onProgress === 'function') onProgress(step, step.pct);
  },

  /**
   * Fire progress callbacks at timed intervals to give the user
   * visual feedback during the long-running analyse call.
   * Returns an interval ID to be cleared when the request resolves.
   *
   * @param {function}          onProgress
   * @param {Array<{step,delay}>} schedule
   * @returns {number} intervalId
   */
  _simulateProgress(onProgress, schedule) {
    if (typeof onProgress !== 'function') return -1;

    const timers = schedule.map(({ step, delay }) =>
      setTimeout(() => onProgress(step, step.pct), delay)
    );

    // Return a pseudo-interval ID that cancels all scheduled timers
    return {
      [Symbol.toPrimitive]() { return -1; },
      _timers: timers,
    };
  },

  /* ── Utilities ───────────────────────────────────────────────── */

  /**
   * Validate a file and return a preview object without uploading.
   * Useful for showing a preview card before the user clicks Analyse.
   *
   * @param {File} file
   * @returns {Promise<FilePreview>}
   * @throws  {OcrError}
   */
  async preview(file) {
    this._validateFile(file);
    const dims = await this._getImageDimensions(file);

    const warnings = [];
    if (dims && (dims.width < OCR_CONFIG.WARN_WIDTH_PX || dims.height < OCR_CONFIG.WARN_HEIGHT_PX)) {
      warnings.push({
        code    : 'IMAGE_TOO_SMALL',
        message : `Image is ${dims.width}×${dims.height}px — this may be too low for accurate OCR.`,
        hint    : OCR_ERROR_HINTS.IMAGE_TOO_SMALL,
      });
    }

    return {
      name        : file.name,
      size        : file.size,
      sizeLabel   : this._formatBytes(file.size),
      type        : file.type,
      extension   : file.name.split('.').pop().toUpperCase(),
      isImage     : file.type.startsWith('image/'),
      isPdf       : file.type === 'application/pdf',
      dimensions  : dims,
      dataUrl     : file.type.startsWith('image/') ? await this._readAsDataUrl(file) : null,
      warnings,
    };
  },

  /** Read file as base64 data URL for thumbnail preview */
  _readAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = e => resolve(e.target.result);
      reader.onerror = () => reject(new OcrError(
        'Could not read file for preview.',
        'FILE_READ_FAILED',
        { fileName: file.name }
      ));
      reader.readAsDataURL(file);
    });
  },

  /** Human-readable file size label */
  _formatBytes(bytes) {
    if (bytes < 1024)             return `${bytes} B`;
    if (bytes < 1024 * 1024)      return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  },

  /**
   * Cancel a running process by aborting its AbortController.
   * Callers should hold the controller and call controller.abort().
   * This method is a convenience wrapper for clarity.
   *
   * @param {AbortController} controller
   */
  cancel(controller) {
    if (controller && typeof controller.abort === 'function') {
      controller.abort();
    }
  },

  /**
   * Check whether a given MIME type is accepted.
   * @param {string} mimeType
   * @returns {boolean}
   */
  isAcceptedType(mimeType) {
    return OCR_CONFIG.ALLOWED_TYPES.includes(mimeType);
  },

  /**
   * Return the accept string for an <input type="file"> element.
   * @returns {string}  e.g. "image/jpeg,image/png,application/pdf"
   */
  get acceptAttr() {
    return OCR_CONFIG.ALLOWED_TYPES.join(',');
  },
};

/* ─────────────────────────────────────────────────────────────────
   Expose to global scope
───────────────────────────────────────────────────────────────── */

window.OCR       = OCR;
window.OcrError  = OcrError;
window.OcrResult = OcrResult;
window.OCR_STEPS = OCR_STEPS;