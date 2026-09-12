/**
 * RxGuard — chat-service.js
 *
 * Chatbot Service Layer
 * ─────────────────────
 * Abstracts all communication with the RxGuard Chatbot API
 * (POST /api/v1/chatbot/message) and provides:
 *
 *   - Query classification into topic categories
 *   - Conversation history management (in-memory + backend sessions)
 *   - Pre-flight message enrichment for medication / nutrition / lifestyle queries
 *   - Structured response parsing with source attribution
 *   - Retry logic, timeout handling, and typed error classification
 *   - Conversation export
 *
 * This service owns NO DOM. It returns data objects and emits events.
 * The chatbot.js UI layer consumes ChatService.
 *
 * Depends on: api.js (window.RxGuard must be loaded first)
 */

'use strict';

/* ─────────────────────────────────────────────────────────────────
   Query categories
   Used to classify user messages and attach contextual hints
   that are appended to the message before sending to the backend.
   The backend Gemini call itself grounds answers in EMDEX/OpenFDA.
───────────────────────────────────────────────────────────────── */

const QUERY_CATEGORY = Object.freeze({
  MEDICATION   : 'medication',    // Drug info, dosage, side effects
  INTERACTION  : 'interaction',   // Drug–drug or drug–food interactions
  NUTRITION    : 'nutrition',     // Diet advice, foods to avoid/eat
  LIFESTYLE    : 'lifestyle',     // Exercise, sleep, stress, hypertension
  PREGNANCY    : 'pregnancy',     // Safe drugs in pregnancy / breastfeeding
  BRANDS       : 'brands',        // Nigerian brand equivalents
  EMERGENCY    : 'emergency',     // Overdose, severe reaction keywords
  GENERAL      : 'general',       // Fallback
});

/**
 * Keyword patterns for each category.
 * Ordered so more-specific patterns are checked first.
 */
const CATEGORY_PATTERNS = [
  {
    category : QUERY_CATEGORY.EMERGENCY,
    patterns : [
      /overdose/i, /poisoning/i, /allergic reaction/i,
      /can.t breathe/i, /difficulty breathing/i, /unconscious/i,
      /swelling.*(throat|face|lip)/i, /anaphyla/i,
    ],
  },
  {
    category : QUERY_CATEGORY.PREGNANCY,
    patterns : [
      /pregnan/i, /breastfeed/i, /lactati/i, /trimester/i,
      /safe.*baby/i, /fetal/i, /foetal/i, /teratog/i,
    ],
  },
  {
    category : QUERY_CATEGORY.INTERACTION,
    patterns : [
      /interact/i, /combine/i, /take.*together/i, /safe.*with/i,
      /mix.*drug/i, /drug.*drug/i, /food.*drug/i, /avoid.*with/i,
    ],
  },
  {
    category : QUERY_CATEGORY.NUTRITION,
    patterns : [
      /food/i, /diet/i, /eat/i, /avoid.*eating/i, /nutrition/i,
      /drink/i, /alcohol/i, /grapefruit/i, /vitamin/i, /supplement/i,
    ],
  },
  {
    category : QUERY_CATEGORY.LIFESTYLE,
    patterns : [
      /lifestyle/i, /exercise/i, /blood pressure/i, /hypertension/i,
      /diabetes.*control/i, /weight/i, /sleep/i, /stress/i,
      /quit smoking/i, /physical activity/i, /naturally/i,
    ],
  },
  {
    category : QUERY_CATEGORY.BRANDS,
    patterns : [
      /brand/i, /available.*nigeria/i, /local.*name/i,
      /generic.*equivalent/i, /nafdac/i, /emzor/i, /fidson/i,
    ],
  },
  {
    category : QUERY_CATEGORY.MEDICATION,
    patterns : [
      /what is\b/i, /used for/i, /dosage/i, /dose/i,
      /side effect/i, /how.*take/i, /when.*take/i,
      /contraindic/i, /prescrib/i, /medic/i, /drug/i,
      /tablet/i, /capsule/i, /injection/i, /syrup/i,
    ],
  },
];

/* ─────────────────────────────────────────────────────────────────
   Suggested query templates per category
   Surfaced by ChatService.suggestionsFor(category)
───────────────────────────────────────────────────────────────── */

const CATEGORY_SUGGESTIONS = Object.freeze({
  [QUERY_CATEGORY.MEDICATION]: [
    'What is Metformin used for and what is the standard dose in Nigeria?',
    'What are the side effects of Atorvastatin?',
    'How should I take Amoxicillin — with or without food?',
    'What are the contraindications of Warfarin?',
    'Can I take Paracetamol every day long-term?',
  ],
  [QUERY_CATEGORY.INTERACTION]: [
    'Is it safe to take Aspirin and Warfarin together?',
    'Can I drink alcohol while taking Metronidazole?',
    'What drugs interact with Ciprofloxacin?',
    'Can I take Ibuprofen with Lisinopril?',
    'What should not be taken with Digoxin?',
  ],
  [QUERY_CATEGORY.NUTRITION]: [
    'What foods should I avoid while taking Warfarin?',
    'Can I drink grapefruit juice while on Amlodipine?',
    'What foods raise blood pressure and should I avoid?',
    'Should I take my iron tablets with orange juice?',
    'What is a good diet for someone with type 2 diabetes?',
  ],
  [QUERY_CATEGORY.LIFESTYLE]: [
    'How can I control hypertension naturally through diet and lifestyle?',
    'What exercises are recommended for someone with type 2 diabetes?',
    'How does stress affect blood pressure and what can I do?',
    'How many hours of sleep does an adult need for good health?',
    'How can I reduce my cholesterol through lifestyle changes?',
  ],
  [QUERY_CATEGORY.PREGNANCY]: [
    'What pain relief medications are safe during pregnancy in Nigeria?',
    'Is Paracetamol safe to take while breastfeeding?',
    'What vitamins should I take during pregnancy?',
    'Can I take Metformin while pregnant?',
    'Which antibiotics are safe in the first trimester?',
  ],
  [QUERY_CATEGORY.BRANDS]: [
    'What are the Nigerian brand names for Paracetamol?',
    'Which brands of Metformin are available in Nigeria?',
    'What is the Nigerian equivalent of Augmentin?',
    'Where can I find Artemether-Lumefantrine in Nigeria?',
    'What local brands of Omeprazole are NAFDAC-approved?',
  ],
  [QUERY_CATEGORY.GENERAL]: [
    'What is RxGuard and what can you help me with?',
    'How do I store medications safely at home?',
    'What should I do if I miss a dose of my medication?',
    'When should I see a pharmacist vs. a doctor?',
    'What is NAFDAC and how do I verify a Nigerian drug?',
  ],
});

/* ─────────────────────────────────────────────────────────────────
   ChatMessage — a single turn in a conversation
───────────────────────────────────────────────────────────────── */

class ChatMessage {
  constructor({ role, content, sources = [], tokensUsed = 0, timestamp = null, category = null }) {
    this.id         = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    this.role       = role;          // 'user' | 'assistant'
    this.content    = content;
    this.sources    = sources;       // ['EMDEX Nigeria', 'OpenFDA', ...]
    this.tokensUsed = tokensUsed;
    this.timestamp  = timestamp ?? new Date().toISOString();
    this.category   = category;      // QUERY_CATEGORY value (user messages only)
  }

  get isUser()      { return this.role === 'user'; }
  get isAssistant() { return this.role === 'assistant'; }

  /** Format timestamp as "09:30 AM" */
  get timeLabel() {
    return new Date(this.timestamp).toLocaleTimeString('en-NG', {
      hour: '2-digit', minute: '2-digit',
    });
  }

  toPlainObject() {
    return {
      id         : this.id,
      role       : this.role,
      content    : this.content,
      sources    : this.sources,
      tokensUsed : this.tokensUsed,
      timestamp  : this.timestamp,
      category   : this.category,
    };
  }
}

/* ─────────────────────────────────────────────────────────────────
   Conversation — a full session with history
───────────────────────────────────────────────────────────────── */

class Conversation {
  constructor(sessionId = null) {
    this.sessionId = sessionId;
    this.messages  = [];           // ChatMessage[]
    this.createdAt = new Date().toISOString();
    this.title     = null;
    this._totalTokens = 0;
  }

  addMessage(msg) {
    if (!(msg instanceof ChatMessage)) {
      throw new TypeError('Expected a ChatMessage instance.');
    }
    this.messages.push(msg);
    this._totalTokens += msg.tokensUsed ?? 0;

    // Auto-title from first user message
    if (!this.title && msg.isUser) {
      this.title = msg.content.length > 55
        ? msg.content.slice(0, 55).trimEnd() + '…'
        : msg.content;
    }
  }

  get messageCount()  { return this.messages.length; }
  get totalTokens()   { return this._totalTokens; }
  get lastMessage()   { return this.messages[this.messages.length - 1] ?? null; }
  get isEmpty()       { return this.messages.length === 0; }

  /** Return messages as a plain array for serialisation */
  toJSON() {
    return {
      sessionId  : this.sessionId,
      title      : this.title,
      messages   : this.messages.map(m => m.toPlainObject()),
      createdAt  : this.createdAt,
      totalTokens: this._totalTokens,
    };
  }

  /** Export conversation as plain text for copy/share */
  toText() {
    const header = `RxGuard AI Conversation\n${new Date(this.createdAt).toLocaleString('en-NG')}\n${'─'.repeat(40)}\n\n`;
    const body   = this.messages.map(m => {
      const who  = m.isUser ? 'You' : 'RxGuard AI';
      const src  = m.sources.length ? `\n  Sources: ${m.sources.join(', ')}` : '';
      return `[${m.timeLabel}] ${who}:\n${m.content}${src}`;
    }).join('\n\n');
    const footer = `\n\n${'─'.repeat(40)}\n⚕️ Not a substitute for professional medical advice.\nGenerated by RxGuard Nigeria`;
    return header + body + footer;
  }
}

/* ─────────────────────────────────────────────────────────────────
   ChatServiceError
───────────────────────────────────────────────────────────────── */

class ChatServiceError extends Error {
  constructor(message, code = 'UNKNOWN', retryable = true) {
    super(message);
    this.name      = 'ChatServiceError';
    this.code      = code;
    this.retryable = retryable;
  }

  /** User-facing recovery hint */
  get hint() {
    const hints = {
      NETWORK_ERROR    : 'Check your internet connection and try again.',
      UNAUTHENTICATED  : 'Please sign in to continue.',
      RATE_LIMITED     : 'Too many messages sent. Wait a moment and try again.',
      MESSAGE_TOO_LONG : 'Your message is too long. Please shorten it (max 2000 characters).',
      SERVER_ERROR     : 'Our AI service is temporarily unavailable. Please try again in a moment.',
      TIMEOUT          : 'The response is taking too long. Please try again.',
      EMPTY_MESSAGE    : 'Please enter a message before sending.',
      UNKNOWN          : 'An unexpected error occurred. Please try again.',
    };
    return hints[this.code] ?? hints.UNKNOWN;
  }
}

/* ─────────────────────────────────────────────────────────────────
   ChatService — public API
───────────────────────────────────────────────────────────────── */

const ChatService = {

  /** Active conversation (in-memory; survives page navigations only within session) */
  _conversation : null,

  /* ────────────────────────────────────────────────────────────
     send() — core method, called for every user message
  ──────────────────────────────────────────────────────────── */

  /**
   * Send a user message and receive an AI response.
   *
   * @param {string}   text       The user's message text.
   * @param {object}   [options]
   * @param {number}   [options.sessionId]     Backend session ID to continue an existing session.
   * @param {boolean}  [options.isEmergency]   Skip classification and flag as emergency immediately.
   * @param {function} [options.onToken]        Streaming callback (reserved — not yet supported by backend).
   *
   * @returns {Promise<{userMessage: ChatMessage, assistantMessage: ChatMessage, conversation: Conversation}>}
   * @throws  {ChatServiceError}
   */
  async send(text, options = {}) {
    const { sessionId = null, isEmergency = false } = options;

    // ── Validate ──
    const clean = String(text ?? '').trim();
    if (!clean) {
      throw new ChatServiceError('Please enter a message before sending.', 'EMPTY_MESSAGE', false);
    }
    if (clean.length > 2000) {
      throw new ChatServiceError(
        `Your message is too long (${clean.length} chars). Please shorten it.`,
        'MESSAGE_TOO_LONG', false
      );
    }

    // ── Classify the query ──
    const category = isEmergency
      ? QUERY_CATEGORY.EMERGENCY
      : this.classify(clean);

    // ── Emergency short-circuit ──
    if (category === QUERY_CATEGORY.EMERGENCY) {
      return this._handleEmergency(clean, sessionId);
    }

    // ── Ensure we have an active conversation ──
    const conv = this._ensureConversation(sessionId);

    // ── Record user message ──
    const userMsg = new ChatMessage({
      role    : 'user',
      content : clean,
      category,
    });
    conv.addMessage(userMsg);

    // ── Call backend API ──
    let apiData;
    try {
      const res = await RxGuard.Chatbot.message(clean, conv.sessionId);
      apiData   = res.data;
    } catch (err) {
      // Remove the optimistically added user message on failure
      conv.messages.pop();
      throw this._normaliseError(err);
    }

    // ── Sync session ID from backend ──
    if (apiData.session_id && !conv.sessionId) {
      conv.sessionId = apiData.session_id;
    }

    // ── Record assistant response ──
    const assistantMsg = new ChatMessage({
      role       : 'assistant',
      content    : apiData.assistant_reply ?? '',
      sources    : apiData.sources         ?? [],
      tokensUsed : apiData.tokens_used     ?? 0,
    });
    conv.addMessage(assistantMsg);

    return { userMessage: userMsg, assistantMessage: assistantMsg, conversation: conv };
  },

  /* ────────────────────────────────────────────────────────────
     loadSession() — restore a saved session from the backend
  ──────────────────────────────────────────────────────────── */

  /**
   * Load an existing chat session from the backend and
   * reconstruct a Conversation object.
   *
   * @param  {number} sessionId
   * @returns {Promise<Conversation>}
   * @throws  {ChatServiceError}
   */
  async loadSession(sessionId) {
    try {
      const res  = await RxGuard.Chatbot.session(sessionId);
      const data = res.data;

      const conv = new Conversation(data.id);
      conv.title     = data.title ?? null;
      conv.createdAt = data.created_at ?? new Date().toISOString();

      (data.messages ?? []).forEach(m => {
        conv.addMessage(new ChatMessage({
          role       : m.role,
          content    : m.content,
          sources    : m.sources    ?? [],
          tokensUsed : m.tokens_used ?? 0,
          timestamp  : m.created_at ?? null,
        }));
      });

      this._conversation = conv;
      return conv;

    } catch (err) {
      throw this._normaliseError(err);
    }
  },

  /* ────────────────────────────────────────────────────────────
     history() — list all saved sessions for the user
  ──────────────────────────────────────────────────────────── */

  /**
   * Fetch paginated chat session history from the backend.
   *
   * @returns {Promise<{sessions: object[], total: number, hasMore: boolean}>}
   * @throws  {ChatServiceError}
   */
  async history() {
    try {
      const res  = await RxGuard.Chatbot.history();
      const page = res.data;
      return {
        sessions: page.data       ?? [],
        total   : page.total      ?? 0,
        hasMore : page.current_page < page.last_page,
      };
    } catch (err) {
      throw this._normaliseError(err);
    }
  },

  /* ────────────────────────────────────────────────────────────
     deleteSession() — remove a session from backend + local state
  ──────────────────────────────────────────────────────────── */

  /**
   * @param  {number} sessionId
   * @returns {Promise<void>}
   * @throws  {ChatServiceError}
   */
  async deleteSession(sessionId) {
    try {
      await RxGuard.Chatbot.destroy(sessionId);
      if (this._conversation?.sessionId === sessionId) {
        this._conversation = null;
      }
    } catch (err) {
      throw this._normaliseError(err);
    }
  },

  /* ────────────────────────────────────────────────────────────
     Query classification
  ──────────────────────────────────────────────────────────── */

  /**
   * Classify a message string into a QUERY_CATEGORY.
   *
   * @param  {string} text
   * @returns {string}  One of the QUERY_CATEGORY values.
   */
  classify(text) {
    const t = String(text ?? '');
    for (const { category, patterns } of CATEGORY_PATTERNS) {
      if (patterns.some(p => p.test(t))) return category;
    }
    return QUERY_CATEGORY.GENERAL;
  },

  /**
   * Return whether a message is about medications.
   * @param  {string} text
   * @returns {boolean}
   */
  isMedicationQuery(text) {
    return [
      QUERY_CATEGORY.MEDICATION,
      QUERY_CATEGORY.INTERACTION,
      QUERY_CATEGORY.BRANDS,
    ].includes(this.classify(text));
  },

  /**
   * Return whether a message is about nutrition or diet.
   * @param  {string} text
   * @returns {boolean}
   */
  isNutritionQuery(text) {
    return this.classify(text) === QUERY_CATEGORY.NUTRITION;
  },

  /**
   * Return whether a message is about lifestyle/wellness.
   * @param  {string} text
   * @returns {boolean}
   */
  isLifestyleQuery(text) {
    return this.classify(text) === QUERY_CATEGORY.LIFESTYLE;
  },

  /**
   * Return whether a message relates to pregnancy safety.
   * @param  {string} text
   * @returns {boolean}
   */
  isPregnancyQuery(text) {
    return this.classify(text) === QUERY_CATEGORY.PREGNANCY;
  },

  /* ────────────────────────────────────────────────────────────
     Suggestions
  ──────────────────────────────────────────────────────────── */

  /**
   * Return suggested queries for a given category.
   * Defaults to GENERAL suggestions if category not found.
   *
   * @param  {string} [category]   A QUERY_CATEGORY value or null.
   * @returns {string[]}
   */
  suggestionsFor(category = null) {
    return CATEGORY_SUGGESTIONS[category] ?? CATEGORY_SUGGESTIONS[QUERY_CATEGORY.GENERAL];
  },

  /**
   * Return all default suggestions shown before any message is sent.
   * Covers medication, nutrition, lifestyle, and pregnancy categories.
   *
   * @returns {Array<{label: string, text: string, category: string}>}
   */
  get defaultSuggestions() {
    return [
      { label: '💊 Metformin usage',              category: QUERY_CATEGORY.MEDICATION, text: 'What is Metformin used for and what is the standard dose in Nigeria?' },
      { label: '🥗 Foods to avoid with Warfarin', category: QUERY_CATEGORY.NUTRITION,  text: 'What foods should I avoid while taking Warfarin?' },
      { label: '❤️ Hypertension lifestyle tips',  category: QUERY_CATEGORY.LIFESTYLE,  text: 'How can I control hypertension naturally through diet and lifestyle?' },
      { label: '🤰 Safe pain relief in pregnancy',category: QUERY_CATEGORY.PREGNANCY,  text: 'What pain relief medications are safe during pregnancy in Nigeria?' },
      { label: '💊 Aspirin + Warfarin together?', category: QUERY_CATEGORY.INTERACTION,text: 'Is it safe to take Aspirin and Warfarin together?' },
      { label: '🇳🇬 Paracetamol brands Nigeria',  category: QUERY_CATEGORY.BRANDS,     text: 'What are the Nigerian brand names for Paracetamol?' },
      { label: '⚖️ Diabetes & exercise advice',   category: QUERY_CATEGORY.LIFESTYLE,  text: 'What exercises are recommended for someone with type 2 diabetes?' },
      { label: '🥗 Diet with high cholesterol',   category: QUERY_CATEGORY.NUTRITION,  text: 'What diet changes help lower cholesterol in Nigeria?' },
    ];
  },

  /* ────────────────────────────────────────────────────────────
     Conversation management
  ──────────────────────────────────────────────────────────── */

  /**
   * Start a fresh in-memory conversation (does not call the API).
   * Call this when the user opens the chat screen or clicks "New Chat".
   *
   * @returns {Conversation}
   */
  newConversation() {
    this._conversation = new Conversation();
    return this._conversation;
  },

  /**
   * Get the active in-memory conversation, creating one if needed.
   * @returns {Conversation}
   */
  get activeConversation() {
    if (!this._conversation) this.newConversation();
    return this._conversation;
  },

  /**
   * Export the active conversation as plain text.
   * Returns null if there is no active conversation.
   *
   * @returns {string|null}
   */
  exportConversation() {
    return this._conversation?.toText() ?? null;
  },

  /**
   * Export the active conversation as a JSON object.
   * @returns {object|null}
   */
  exportConversationJSON() {
    return this._conversation?.toJSON() ?? null;
  },

  /* ────────────────────────────────────────────────────────────
     Emergency handling
  ──────────────────────────────────────────────────────────── */

  /**
   * @private
   * Return a hard-coded emergency response without calling the API.
   * Logs the user message to the local conversation only.
   */
  _handleEmergency(text, sessionId) {
    const conv = this._ensureConversation(sessionId);

    const userMsg = new ChatMessage({
      role    : 'user',
      content : text,
      category: QUERY_CATEGORY.EMERGENCY,
    });

    const emergencyReply = [
      '🚨 **This sounds like a medical emergency.**',
      '',
      'Please take immediate action:',
      '',
      '• **Call 112** (Nigeria Emergency Services) immediately',
      '• **Go to the nearest hospital emergency department**',
      '• If overdose is suspected — bring all medication packets to the hospital',
      '• Do NOT induce vomiting unless instructed by a medical professional',
      '',
      'After the emergency has been managed, you can return here for medication information and follow-up guidance.',
      '',
      '⚕️ *RxGuard is an information service and cannot replace emergency medical care.*',
    ].join('\n');

    const assistantMsg = new ChatMessage({
      role    : 'assistant',
      content : emergencyReply,
      sources : ['Nigeria Emergency Services (112)'],
    });

    conv.addMessage(userMsg);
    conv.addMessage(assistantMsg);

    return { userMessage: userMsg, assistantMessage: assistantMsg, conversation: conv };
  },

  /* ────────────────────────────────────────────────────────────
     Private utilities
  ──────────────────────────────────────────────────────────── */

  /** @private */
  _ensureConversation(sessionId = null) {
    if (!this._conversation) {
      this._conversation = new Conversation(sessionId);
    } else if (sessionId && !this._conversation.sessionId) {
      this._conversation.sessionId = sessionId;
    }
    return this._conversation;
  },

  /** @private — map API/network errors to ChatServiceError */
  _normaliseError(err) {
    if (err instanceof ChatServiceError) return err;

    const status = err?.status ?? 0;

    if (status === 0 || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      return new ChatServiceError(
        'No network connection. Check your internet and try again.',
        'NETWORK_ERROR', true
      );
    }
    if (status === 401) {
      return new ChatServiceError('Session expired. Please sign in again.', 'UNAUTHENTICATED', false);
    }
    if (status === 422) {
      return new ChatServiceError(
        err.message || 'Message could not be sent. Please check and try again.',
        'MESSAGE_TOO_LONG', false
      );
    }
    if (status === 429) {
      return new ChatServiceError(
        'Too many messages sent. Please wait a moment before trying again.',
        'RATE_LIMITED', true
      );
    }
    if (status >= 500) {
      return new ChatServiceError(
        'Our AI service is temporarily unavailable. Please try again shortly.',
        'SERVER_ERROR', true
      );
    }
    if (err?.name === 'AbortError') {
      return new ChatServiceError('Request timed out. Please try again.', 'TIMEOUT', true);
    }

    return new ChatServiceError(
      err?.message || 'An unexpected error occurred.',
      'UNKNOWN', true
    );
  },

  /* ────────────────────────────────────────────────────────────
     Static reference data
  ──────────────────────────────────────────────────────────── */

  /** All query category constants */
  get categories() { return QUERY_CATEGORY; },

  /** All suggestions grouped by category */
  get allSuggestions() { return CATEGORY_SUGGESTIONS; },
};

/* ─────────────────────────────────────────────────────────────────
   Expose to global scope
───────────────────────────────────────────────────────────────── */

window.ChatService       = ChatService;
window.ChatMessage       = ChatMessage;
window.Conversation      = Conversation;
window.ChatServiceError  = ChatServiceError;
window.QUERY_CATEGORY    = QUERY_CATEGORY;