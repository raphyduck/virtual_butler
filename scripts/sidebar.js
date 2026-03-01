/**
 * sidebar.js — Sidebar controller
 * ─────────────────────────────────────────────────────────────
 * Renders the session list, wires collapse/expand, handles
 * the New Chat button, delete actions, and mobile overlay.
 *
 * Depends on: store.js  (must load first)
 */

const Sidebar = (() => {
  /* ── DOM references ──────────────────────────────────────── */
  let $app, $sidebar, $sessionList, $newChatBtn,
      $collapseBtn, $openBtn, $overlay, $topbarTitle;

  /* ── SVG icons ───────────────────────────────────────────── */
  const ICON_TRASH = `
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" stroke-width="2"
         stroke-linecap="round" stroke-linejoin="round"
         aria-hidden="true">
      <polyline points="3 6 5 6 21 6"></polyline>
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
      <path d="M10 11v6"></path><path d="M14 11v6"></path>
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path>
    </svg>`;

  /* ── Render helpers ──────────────────────────────────────── */

  /**
   * Build a session list item element.
   * @param {object} session
   * @param {boolean} isActive
   * @returns {HTMLElement}
   */
  function _buildSessionItem(session, isActive) {
    const item = document.createElement('button');
    item.className = 'session-item' + (isActive ? ' session-item--active' : '');
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', isActive ? 'true' : 'false');
    item.dataset.id = session.id;

    const dotClass = session.status === 'active'
      ? 'session-dot session-dot--active'
      : 'session-dot session-dot--past';

    const dotTitle = session.status === 'active'
      ? 'Active session'
      : 'Past session';

    item.innerHTML = `
      <span class="${dotClass}" title="${dotTitle}" aria-label="${dotTitle}"></span>
      <span class="session-item__body">
        <span class="session-item__title">${_escHtml(session.title)}</span>
        <span class="session-item__meta">${Store.formatTime(session.updatedAt)}</span>
      </span>
      <span class="session-item__del" title="Delete chat" aria-label="Delete chat">
        ${ICON_TRASH}
      </span>`;

    return item;
  }

  /** Minimal HTML escaping for injected text. */
  function _escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ── Full re-render of the session list ─────────────────── */
  function render() {
    const { sessions, activeId } = Store.getState();

    $sessionList.innerHTML = '';

    if (sessions.length === 0) {
      $sessionList.innerHTML =
        '<p class="sidebar__empty">No chats yet.<br>Start a new one above!</p>';
      return;
    }

    const fragment = document.createDocumentFragment();

    sessions.forEach(session => {
      const isActive = session.id === activeId;
      fragment.appendChild(_buildSessionItem(session, isActive));
    });

    $sessionList.appendChild(fragment);

    /* Update topbar title */
    const active = Store.getActiveSession();
    if ($topbarTitle && active) {
      $topbarTitle.textContent = active.title;
    }
  }

  /* ── Collapse / expand (desktop) ────────────────────────── */
  function _toggleCollapse() {
    $app.classList.toggle('sidebar-collapsed');
    const collapsed = $app.classList.contains('sidebar-collapsed');
    $collapseBtn.setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
    $collapseBtn.setAttribute('title',      collapsed ? 'Expand sidebar' : 'Collapse sidebar');

    /* Persist preference */
    try { localStorage.setItem('pa_sidebar_collapsed', collapsed ? '1' : '0'); } catch (_) {}
  }

  /* ── Mobile open / close ─────────────────────────────────── */
  function _openMobile() {
    $app.classList.add('sidebar-open');
    $overlay.setAttribute('aria-hidden', 'false');
  }

  function _closeMobile() {
    $app.classList.remove('sidebar-open');
    $overlay.setAttribute('aria-hidden', 'true');
  }

  function _isMobile() {
    return window.matchMedia('(max-width: 768px)').matches;
  }

  /* ── Event delegation for the session list ───────────────── */
  function _onSessionListClick(e) {
    const item = e.target.closest('.session-item');
    if (!item) return;

    const id = item.dataset.id;

    /* Delete button */
    if (e.target.closest('.session-item__del')) {
      e.stopPropagation();
      Store.deleteSession(id);
      return;
    }

    /* Switch session */
    Store.switchSession(id);

    /* On mobile: close sidebar after selecting */
    if (_isMobile()) _closeMobile();
  }

  /* ── Init ────────────────────────────────────────────────── */
  function init() {
    $app          = document.getElementById('app');
    $sidebar      = document.getElementById('sidebar');
    $sessionList  = document.getElementById('sessionList');
    $newChatBtn   = document.getElementById('newChatBtn');
    $collapseBtn  = document.getElementById('sidebarCollapseBtn');
    $openBtn      = document.getElementById('sidebarOpenBtn');
    $overlay      = document.getElementById('sidebarOverlay');
    $topbarTitle  = document.getElementById('topbarTitle');

    /* Restore collapsed state preference (desktop only) */
    if (!_isMobile()) {
      try {
        if (localStorage.getItem('pa_sidebar_collapsed') === '1') {
          $app.classList.add('sidebar-collapsed');
        }
      } catch (_) {}
    }

    /* Wire events */
    $collapseBtn.addEventListener('click', _toggleCollapse);
    $openBtn.addEventListener('click', _openMobile);
    $overlay.addEventListener('click', _closeMobile);

    $newChatBtn.addEventListener('click', () => {
      Store.createSession();
      if (_isMobile()) _closeMobile();
    });

    $sessionList.addEventListener('click', _onSessionListClick);

    /* Re-render whenever state changes */
    Store.subscribe(render);

    /* Initial render */
    render();
  }

  return { init, render };
})();
