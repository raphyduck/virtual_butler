/**
 * chat.js — Chat UI controller
 * ─────────────────────────────────────────────────────────────
 * Handles rendering messages, the textarea auto-grow,
 * send button state, and the simulated AI response.
 *
 * Depends on: store.js  (must load first)
 */

const Chat = (() => {
  /* ── DOM references ──────────────────────────────────────── */
  let $messages, $chatInput, $sendBtn,
      $chatSplash, $chatViewport, $topbarTitle;

  let _isWaiting = false;   /* prevent double-send during AI response */

  /* ── AI response simulation ──────────────────────────────── */
  /*
   * In a real application this would call an API endpoint.
   * Here we generate a plausible-looking response locally
   * to demonstrate the full UI loop.
   */
  const AI_RESPONSES = [
    "That's a great question! Let me think through it carefully.\n\nBased on what you've shared, I'd say the key insight is to break the problem into smaller, manageable parts and tackle each one systematically.",
    "Interesting perspective! Here's what I know about that:\n\nThe concept you're exploring has a rich history. At its core, the idea involves balancing multiple competing factors — and the right answer often depends on context.",
    "Happy to help with that! Here's a concise breakdown:\n\n1. **First**, understand the fundamentals.\n2. **Second**, apply them in a practical context.\n3. **Third**, iterate and refine based on feedback.",
    "Great point — this is something many people wonder about. The short answer is: it depends on your specific situation, but generally the most effective approach is to start simple and scale gradually.",
    "I can see why that's confusing! Let me clarify:\n\nThe distinction you're looking for is subtle but important. The key difference lies in how each approach handles edge cases and performance at scale.",
    "Absolutely! Here's a quick summary:\n\n- The core concept is straightforward once you see the pattern.\n- Real-world applications often add complexity, but the foundation stays the same.\n- Practice is the fastest way to internalise it.",
  ];

  function _mockAIResponse(userText) {
    /* Slightly vary response based on input length for realism */
    const idx = userText.length % AI_RESPONSES.length;
    return AI_RESPONSES[idx];
  }

  /* ── Rendering ───────────────────────────────────────────── */

  /** Escape HTML in message content. */
  function _esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /**
   * Very lightweight Markdown-like formatting:
   *   **bold**, `code`, and line-break preservation.
   */
  function _formatContent(text) {
    return _esc(text)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>');
  }

  function _buildMessageEl(msg) {
    const isUser = msg.role === 'user';
    const wrapper = document.createElement('div');
    wrapper.className = `message message--${isUser ? 'user' : 'ai'}`;
    wrapper.dataset.id = msg.id;

    const avatarText = isUser ? 'Y' : '✦';
    wrapper.innerHTML = `
      <div class="message__avatar" aria-hidden="true">${avatarText}</div>
      <div class="message__bubble">${_formatContent(msg.content)}</div>`;
    return wrapper;
  }

  function _buildTypingIndicator() {
    const wrapper = document.createElement('div');
    wrapper.className = 'message message--ai';
    wrapper.id = 'typingIndicator';
    wrapper.innerHTML = `
      <div class="message__avatar" aria-hidden="true">✦</div>
      <div class="message__bubble">
        <div class="typing-indicator" aria-label="Assistant is typing">
          <span></span><span></span><span></span>
        </div>
      </div>`;
    return wrapper;
  }

  /** Scroll the viewport to the bottom. */
  function _scrollToBottom() {
    $chatViewport.scrollTo({ top: $chatViewport.scrollHeight, behavior: 'smooth' });
  }

  /** Show/hide the welcome splash based on message count. */
  function _syncSplashVisibility(messages) {
    if ($chatSplash) {
      $chatSplash.style.display = messages.length === 0 ? '' : 'none';
    }
  }

  /**
   * Full re-render: wipes the message list and rebuilds it
   * from the active session. Called on session switch.
   */
  function renderSession() {
    const session = Store.getActiveSession();
    $messages.innerHTML = '';

    if (!session) return;

    /* Update topbar title */
    if ($topbarTitle) $topbarTitle.textContent = session.title;

    _syncSplashVisibility(session.messages);

    session.messages.forEach(msg => {
      $messages.appendChild(_buildMessageEl(msg));
    });

    _scrollToBottom();
  }

  /* ── Input handling ──────────────────────────────────────── */

  function _updateSendBtn() {
    $sendBtn.disabled = $chatInput.value.trim().length === 0 || _isWaiting;
  }

  /** Auto-grow textarea up to max-height defined in CSS. */
  function _autoGrow() {
    $chatInput.style.height = 'auto';
    $chatInput.style.height = $chatInput.scrollHeight + 'px';
  }

  /* ── Send flow ───────────────────────────────────────────── */

  async function _send() {
    const text = $chatInput.value.trim();
    if (!text || _isWaiting) return;

    _isWaiting = true;
    $chatInput.value = '';
    _autoGrow();
    _updateSendBtn();

    /* 1. Persist + render user message */
    const userMsg = Store.addMessage('user', text);
    const userEl  = _buildMessageEl(userMsg);
    $messages.appendChild(userEl);

    /* Hide splash on first message */
    _syncSplashVisibility([userMsg]);

    /* Update topbar (title may have just been set) */
    const session = Store.getActiveSession();
    if ($topbarTitle && session) $topbarTitle.textContent = session.title;

    _scrollToBottom();

    /* 2. Show typing indicator */
    const typingEl = _buildTypingIndicator();
    $messages.appendChild(typingEl);
    _scrollToBottom();

    /* 3. Simulate async AI response (600 – 1800 ms) */
    const delay = 600 + Math.random() * 1200;
    await new Promise(r => setTimeout(r, delay));

    /* 4. Remove typing indicator */
    typingEl.remove();

    /* 5. Persist + render AI message */
    const aiContent = _mockAIResponse(text);
    const aiMsg     = Store.addMessage('assistant', aiContent);
    const aiEl      = _buildMessageEl(aiMsg);
    $messages.appendChild(aiEl);
    _scrollToBottom();

    _isWaiting = false;
    _updateSendBtn();
    $chatInput.focus();
  }

  /* ── Suggestion chips ────────────────────────────────────── */
  function _wireSuggestions() {
    const chips = document.querySelectorAll('.suggestion-chip');
    chips.forEach(chip => {
      chip.addEventListener('click', () => {
        $chatInput.value = chip.dataset.text || chip.textContent.trim();
        _autoGrow();
        _updateSendBtn();
        $chatInput.focus();
      });
    });
  }

  /* ── Store subscription ──────────────────────────────────── */
  let _lastActiveId = null;

  function _onStoreChange(state) {
    /* Re-render only when the active session changes */
    if (state.activeId !== _lastActiveId) {
      _lastActiveId = state.activeId;
      renderSession();
    }
  }

  /* ── Init ────────────────────────────────────────────────── */
  function init() {
    $messages      = document.getElementById('messages');
    $chatInput     = document.getElementById('chatInput');
    $sendBtn       = document.getElementById('sendBtn');
    $chatSplash    = document.getElementById('chatSplash');
    $chatViewport  = document.getElementById('chatViewport');
    $topbarTitle   = document.getElementById('topbarTitle');

    /* Input events */
    $chatInput.addEventListener('input', () => {
      _autoGrow();
      _updateSendBtn();
    });

    $chatInput.addEventListener('keydown', e => {
      /* Send on Enter (but not Shift+Enter for newlines) */
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        _send();
      }
    });

    $sendBtn.addEventListener('click', _send);

    _wireSuggestions();

    /* Subscribe to store changes */
    Store.subscribe(_onStoreChange);

    /* Render the initially active session */
    _lastActiveId = Store.getState().activeId;
    renderSession();
  }

  return { init, renderSession };
})();
