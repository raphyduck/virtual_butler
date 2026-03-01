/**
 * app.js — Application entry point
 * ─────────────────────────────────────────────────────────────
 * Bootstraps the Store, Sidebar, and Chat modules in the
 * correct order once the DOM is ready.
 */

document.addEventListener('DOMContentLoaded', () => {
  /* 1. Initialise the data store (loads from localStorage) */
  Store.init();

  /* 2. Initialise the sidebar (subscribes to store, renders list) */
  Sidebar.init();

  /* 3. Initialise the chat view (subscribes to store, renders messages) */
  Chat.init();

  /* 4. Focus the input for immediate typing */
  const $input = document.getElementById('chatInput');
  if ($input) $input.focus();
});
