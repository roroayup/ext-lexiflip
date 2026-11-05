// Full-tab study page: the same UI as the widget, with room to study, manage words and
// upload documents. Works on its own, so Lexiflip is usable even where the widget can't
// appear (new tab page, browser pages, web stores, PDF viewer).
(() => {
  'use strict';

  const style = document.createElement('style');
  style.textContent = globalThis.LexiflipCSS;
  document.head.append(style);

  const ui = globalThis.LX.createUI({
    root: document.getElementById('app'),
    mode: 'page',
    parseDocument: globalThis.LexiflipDocs.parse,
    defaultLang: () => '',
  });

  // #add, #add=<word>, #upload, #decks, #list, #settings (from the popup, widget or menu).
  function route() {
    const hash = decodeURIComponent(location.hash.slice(1));
    if (!hash) return;
    if (hash.startsWith('add=')) ui.openForm({ display: hash.slice(4), autoLookup: true });
    else if (hash === 'add') ui.openForm({});
    else if (['study', 'upload', 'decks', 'list', 'settings'].includes(hash)) ui.go(hash);
    history.replaceState(null, '', location.pathname);
  }
  route();
  window.addEventListener('hashchange', route);
})();
