/**
 * RxGuard — chatbot.js
 * AI Healthcare Assistant powered by Gemini, grounded in EMDEX + OpenFDA.
 * Handles session management, message sending/receiving, history sidebar.
 * Depends on: api.js, app.js
 */

'use strict';

/* ─────────────────────────────────────────
   State
───────────────────────────────────────── */
const ChatState = {
  sessionId    : null,   // Active backend session id
  sending      : false,  // Prevent double-sends
  messageCount : 0,      // Messages in current session
  historyLoaded: false,
};

/* ─────────────────────────────────────────
   Send a message
───────────────────────────────────────── */
async function sendMessage(text) {
  text = (text || getInputValue()).trim();
  if (!text || ChatState.sending) return;

  clearInput();
  hideQuickChips();
  appendUserMessage(text);
  showTyping();
  setSending(true);

  try {
    const res     = await RxGuard.Chatbot.message(text, ChatState.sessionId);
    const data    = res.data?.data;

    if (!data) { throw new Error("Invalid server response"); }

    // Store the session id returned from the first message
    if (!ChatState.sessionId && data.session_id) {
      ChatState.sessionId = data.session_id;
      updateSessionTitle(text);
    }

    removeTyping();
    appendBotMessage(
  data.assistant_reply || 'No response received',
  data.sources || []
);
    ChatState.messageCount++;

    // Refresh session list in sidebar
    if (ChatState.messageCount % 3 === 1) loadSessionHistory();

  } catch (err) {
    removeTyping();
    appendErrorMessage(err.message || 'Unable to reach the AI assistant. Please try again.');
  } finally {
    setSending(false);
  }
}

/* ─────────────────────────────────────────
   Message DOM helpers
───────────────────────────────────────── */
function appendUserMessage(text) {
  const user    = RxGuard.Auth.currentUser();
  const initial = (user?.name || 'U').charAt(0).toUpperCase();

  appendMessage({
    role    : 'user',
    content : escHtml(text),
    avatar  : initial,
    time    : nowTime(),
  });
}

function appendBotMessage(text, sources) {
  appendMessage({
    role    : 'bot',
    content : formatBotText(text),
    avatar  : 'Rx',
    time    : nowTime(),
    sources,
  });
}

function appendErrorMessage(msg) {
  appendMessage({
    role    : 'bot',
    content : `<span style="color:var(--rx-red)">⛔ ${escHtml(msg)}</span>`,
    avatar  : 'Rx',
    time    : nowTime(),
    sources : [],
    isError : true,
  });
}

function appendMessage({ role, content, avatar, time, sources = [], isError = false }) {
  const feed = document.getElementById('chatFeed');
  if (!feed) return;

  const sourcesHtml = sources.length
    ? `<div class="message-sources">
         ${sources.map(s => `<span class="source-chip">${escHtml(s)}</span>`).join('')}
       </div>`
    : '';

  const row = document.createElement('div');
  row.className = `message-row ${role}`;
  row.innerHTML = `
    <div class="message-avatar">${avatar}</div>
    <div>
      <div class="message-bubble">${content}</div>
      ${sourcesHtml}
      <div class="message-time">${time}</div>
    </div>`;

  feed.appendChild(row);
  scrollToBottom();
}

function showTyping() {
  const feed = document.getElementById('chatFeed');
  if (!feed) return;

  const el = document.createElement('div');
  el.className = 'message-row bot';
  el.id = 'typingIndicator';
  el.innerHTML = `
    <div class="message-avatar">Rx</div>
    <div class="typing-indicator">
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
    </div>`;
  feed.appendChild(el);
  scrollToBottom();
}

function removeTyping() {
  document.getElementById('typingIndicator')?.remove();
}

function scrollToBottom() {
  const feed = document.getElementById('chatFeed');
  if (feed) feed.scrollTop = feed.scrollHeight;
}

/* ─────────────────────────────────────────
   Text formatting (Markdown-lite)
───────────────────────────────────────── */
function formatBotText(raw) {
  if (!raw) return '';

  return escHtml(raw)
    // Bold: **text**
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Bullet lines starting with • or -
    .replace(/^[•\-]\s(.+)$/gm, '<li>$1</li>')
    // Wrap consecutive <li> in <ul>
    .replace(/(<li>.*<\/li>(\n|$))+/g, m => `<ul style="padding-left:1.1rem;margin:.5rem 0;display:flex;flex-direction:column;gap:.3rem">${m}</ul>`)
    // Numbered lines
    .replace(/^\d+\.\s(.+)$/gm, '<li>$1</li>')
    // Line breaks
    .replace(/\n/g, '<br/>');
}

/* ─────────────────────────────────────────
   Input helpers
───────────────────────────────────────── */
function getInputValue() {
  return document.getElementById('chatInput')?.value || '';
}

function clearInput() {
  const inp = document.getElementById('chatInput');
  if (inp) { inp.value = ''; inp.style.height = 'auto'; }
}

function setSending(val) {
  ChatState.sending = val;
  const btn = document.getElementById('sendBtn');
  if (!btn) return;
  btn.disabled = val;
  btn.innerHTML = val
    ? '<div class="spinner spinner-sm" style="border-color:#fff;border-top-color:transparent"></div>'
    : '➤';
}

function hideQuickChips() {
  const chips = document.getElementById('quickChipsWrap');
  if (chips) chips.style.display = 'none';
}

/* ─────────────────────────────────────────
   New / clear session
───────────────────────────────────────── */
function newSession() {
  ChatState.sessionId    = null;
  ChatState.messageCount = 0;

  const feed = document.getElementById('chatFeed');
  if (feed) feed.innerHTML = '';

  const chips = document.getElementById('quickChipsWrap');
  if (chips) chips.style.display = 'flex';

  appendWelcomeMessage();
  document.getElementById('sessionTitle').textContent = 'New conversation';
  document.getElementById('chatInput')?.focus();
}

function appendWelcomeMessage() {
  appendBotMessage(
    `Hello! I'm the **RxGuard AI Healthcare Assistant**.\n\nI can help you with:\n• Medication information and usage\n• Drug interactions and side effects\n• Nutrition advice related to medications\n• Nigerian drug brand equivalents\n• General wellness and lifestyle guidance\n\nMy medication answers use **OpenFDA** drug monographs and pregnancy-risk information, plus **EMDEX** Nigerian brand data and interaction checks. I never guess — if I don't have verified data, I'll tell you.\n\nHow can I help you today?`,
    ['EMDEX Nigeria', 'OpenFDA']
  );
}

function updateSessionTitle(firstMessage) {
  const titleEl = document.getElementById('sessionTitle');
  if (titleEl) {
    titleEl.textContent = firstMessage.length > 50
      ? firstMessage.slice(0, 50) + '…'
      : firstMessage;
  }
}

/* ─────────────────────────────────────────
   Session history sidebar
───────────────────────────────────────── */
async function loadSessionHistory() {
  const container = document.getElementById('sessionList');
  const emptyEl   = document.getElementById('sessionListEmpty');
  if (!container || !RxGuard.Auth.isAuthenticated()) return;

  try {
    const res      = await RxGuard.Chatbot.history();
    const sessions = res.data?.data || [];

    if (sessions.length === 0) {
      container.innerHTML = '';
      if (emptyEl) emptyEl.style.display = 'block';
      return;
    }

    if (emptyEl) emptyEl.style.display = 'none';

    container.innerHTML = sessions.map(s => {
      const preview = s.latestMessage?.content || 'No messages';
      const isActive = s.id === ChatState.sessionId;
      return `
        <div class="session-item ${isActive ? 'active' : ''}"
             onclick="loadSession(${s.id})"
             title="${escHtml(s.title || 'Chat session')}">
          <div class="session-item-icon">💬</div>
          <div style="flex:1;min-width:0">
            <div class="session-item-title">
              ${escHtml(s.title || 'Chat session')}
            </div>
            <div class="session-item-preview">
              ${escHtml(String(preview).slice(0, 55))}…
            </div>
          </div>
          <button class="session-delete-btn"
                  onclick="deleteSession(event, ${s.id})"
                  title="Delete session">×</button>
        </div>`;
    }).join('');

  } catch { /* non-fatal */ }
}

async function loadSession(id) {
  if (id === ChatState.sessionId) return;

  const feed = document.getElementById('chatFeed');
  if (!feed) return;

  feed.innerHTML = `<div style="text-align:center;padding:2rem;color:var(--rx-muted)">
    <div class="spinner" style="margin:0 auto 1rem"></div>Loading session…</div>`;

  try {
    const res      = await RxGuard.Chatbot.session(id);
    const session  = res.data;
    const messages = session.messages || [];

    ChatState.sessionId    = id;
    ChatState.messageCount = messages.length;

    feed.innerHTML = '';

    if (messages.length === 0) {
      appendWelcomeMessage();
      return;
    }

    messages.forEach(m => {
      if (m.role === 'user') {
        appendUserMessage(m.content);
      } else {
        appendBotMessage(m.content, m.sources || []);
      }
    });

    document.getElementById('sessionTitle').textContent =
      session.title || 'Chat session';

    hideQuickChips();

    // Highlight in list
    document.querySelectorAll('.session-item').forEach(el => el.classList.remove('active'));
    document.querySelector(`.session-item[onclick="loadSession(${id})"]`)
      ?.classList.add('active');

  } catch (err) {
    feed.innerHTML = '';
    appendErrorMessage('Failed to load session: ' + err.message);
  }
}

async function deleteSession(e, id) {
  e.stopPropagation();
  if (!confirm('Delete this conversation?')) return;

  try {
    await RxGuard.Chatbot.destroy(id);
    if (ChatState.sessionId === id) newSession();
    loadSessionHistory();
    RxGuard.Toast.success('Deleted', 'Conversation removed.');
  } catch (err) {
    RxGuard.Toast.error('Failed', err.message);
  }
}

/* ─────────────────────────────────────────
   Quick chip topics
───────────────────────────────────────── */
const QUICK_CHIPS = [
  { label:'💊 What is Metformin?',             text:'What is Metformin used for and what is the standard dose in Nigeria?' },
  { label:'🥗 Foods to avoid with Warfarin?',  text:'What foods should I avoid while taking Warfarin?' },
  { label:'❤️ Control hypertension naturally', text:'How can I control hypertension naturally through diet and lifestyle?' },
  { label:'🤰 Safe pain relief in pregnancy?', text:'What pain relief medications are safe during pregnancy in Nigeria?' },
  { label:'💊 Metformin side effects',         text:'What are the common side effects of Metformin?' },
  { label:'🇳🇬 Paracetamol brands in Nigeria', text:'What are the available Nigerian brand names for Paracetamol?' },
  { label:'⚠️ Aspirin + Warfarin safe?',       text:'Is it safe to take Aspirin and Warfarin together?' },
  { label:'🏃 Exercise with diabetes?',        text:'What exercises are recommended for someone with type 2 diabetes?' },
];

function renderQuickChips() {
  const container = document.getElementById('quickChips');
  if (!container) return;
  container.innerHTML = QUICK_CHIPS.map(c => `
    <button class="quick-chip" onclick="sendMessage('${c.text.replace(/'/g,"\\'")}')">
      ${c.label}
    </button>`).join('');
}

/* ─────────────────────────────────────────
   Textarea auto-resize
───────────────────────────────────────── */
function initTextarea() {
  const textarea = document.getElementById('chatInput');
  if (!textarea) return;

  textarea.addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 120) + 'px';
  });

  textarea.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
}

/* ─────────────────────────────────────────
   Utility
───────────────────────────────────────── */
function nowTime() {
  return new Date().toLocaleTimeString('en-NG', { hour:'2-digit', minute:'2-digit' });
}

function escHtml(str) {
  return String(str || '')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

/* ============================================================
   CRITICAL FIX: Expose functions to window for inline onclick handlers
   This makes loadSession(), deleteSession(), and sendMessage()
   callable from HTML onclick attributes
============================================================ */
if (typeof window !== 'undefined') {
  window.loadSession = loadSession;
  window.deleteSession = deleteSession;
  window.sendMessage = sendMessage;
}

/* ─────────────────────────────────────────
   Expose globals
───────────────────────────────────────── */
window.ChatbotPage = {
  sendMessage, newSession, loadSession, deleteSession, loadSessionHistory,
};

/* ─────────────────────────────────────────
   Boot
───────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  App.injectSidebar('chatbot');

  renderQuickChips();
  initTextarea();
  appendWelcomeMessage();

  document.getElementById('sendBtn')
    ?.addEventListener('click', () => sendMessage());

  document.getElementById('newChatBtn')
    ?.addEventListener('click', newSession);

  if (RxGuard.Auth.isAuthenticated()) {
    loadSessionHistory();
  }

});