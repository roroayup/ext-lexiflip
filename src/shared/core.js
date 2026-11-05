// Shared constants and helpers, loaded first in every context (content script, app page,
// popup). Classic script: exposes globalThis.LX. Always overwrites, so a re-injected copy
// after an extension update replaces a stale one in the same isolated world.
(() => {
  'use strict';

  const api = globalThis.browser ?? globalThis.chrome;

  const DEFAULT_SETTINGS = {
    target: 'id',
    source: 'auto',
    maxCards: 20,
    minLength: 4,
    corner: 'right',
    selectionBubble: true,
  };
  const DEFAULT_UI = { hidden: false, open: false, index: 0, onlyUnknown: false };
  const MINE = 'mine'; // id of the "Kosakata saya" deck that manual and selection adds go to
  const MINE_TITLE = 'Kosakata saya';

  const LANGS = [
    ['id', 'Indonesia'], ['en', 'English'], ['ms', 'Melayu'], ['ja', '日本語'], ['ko', '한국어'],
    ['zh', '中文'], ['ar', 'العربية'], ['de', 'Deutsch'], ['fr', 'Français'], ['es', 'Español'],
    ['nl', 'Nederlands'], ['pt', 'Português'], ['ru', 'Русский'], ['tr', 'Türkçe'],
  ];
  const LANG_NAME = Object.fromEntries(LANGS);

  const svg = (size, body, extra = '') => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${body}</svg>`;
  const ICON = {
    logo: (s = 18) => svg(s, '<rect x="8" y="3" width="12" height="16" rx="2" transform="rotate(12 14 11)"/><rect x="4" y="5" width="12" height="16" rx="2" fill="currentColor" fill-opacity=".25"/>'),
    decks: svg(16, '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/>'),
    gear: svg(16, '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>'),
    minus: svg(16, '<path d="M6 12h12"/>', 'stroke-width="2.2"'),
    close: svg(16, '<path d="M6 6l12 12M18 6 6 18"/>', 'stroke-width="2.2"'),
    back: svg(16, '<path d="m15 18-6-6 6-6"/>', 'stroke-width="2.2"'),
    prev: svg(18, '<path d="m15 18-6-6 6-6"/>', 'stroke-width="2.2"'),
    next: svg(18, '<path d="m9 18 6-6-6-6"/>', 'stroke-width="2.2"'),
    speak: svg(16, '<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>'),
    shuffle: svg(16, '<path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>'),
    filter: svg(16, '<path d="M3 5h18l-7 8v6l-4 2v-8L3 5Z"/>'),
    trash: svg(15, '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>'),
    edit: svg(15, '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>'),
    plus: svg(16, '<path d="M12 5v14M5 12h14"/>', 'stroke-width="2.2"'),
    list: svg(16, '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>'),
    upload: svg(16, '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5M12 3v12"/>'),
    external: svg(15, '<path d="M15 3h6v6M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>'),
    check: svg(14, '<path d="M20 6 9 17l-5-5"/>', 'stroke-width="2.6"'),
    search: svg(15, '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>'),
    sparkle: svg(26, '<rect x="9" y="3" width="11" height="15" rx="2" transform="rotate(12 14.5 10.5)"/><rect x="4" y="6" width="11" height="15" rx="2" fill="currentColor" fill-opacity=".2"/>', 'stroke-width="1.8"'),
    doc: svg(26, '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>', 'stroke-width="1.8"'),
  };

  // Context check: after an extension update/reload, scripts left in open tabs lose their
  // connection and every API call throws "Extension context invalidated".
  function alive() {
    try { return Boolean(api?.runtime?.id); } catch { return false; }
  }

  async function send(msg) {
    if (!alive()) throw new Error('Lexiflip baru diperbarui. Muat ulang halaman ini.');
    const res = await api.runtime.sendMessage(msg);
    if (!res?.ok) throw new Error(res?.error || 'Tidak ada respons dari Lexiflip.');
    return res;
  }

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
  const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

  /** Escaped `context` with every whole-word occurrence of `word` wrapped in <mark>. */
  function highlight(context, word) {
    if (!context) return '';
    if (!word) return esc(context);
    const pattern = CJK.test(word) ? reEsc(word) : `(?<!\\p{L})${reEsc(word)}(?!\\p{L})`;
    let re;
    try { re = new RegExp(pattern, 'giu'); } catch { return esc(context); }
    let out = '';
    let last = 0;
    for (const m of context.matchAll(re)) {
      out += `${esc(context.slice(last, m.index))}<mark>${esc(m[0])}</mark>`;
      last = m.index + m[0].length;
    }
    return out + esc(context.slice(last));
  }

  /** Identity of a card inside a deck: case-folded, whitespace-collapsed. */
  const cardKey = (s) => String(s || '').normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();

  /** "a, b; c" -> ["a", "b", "c"] (max 5) for the meaning field. */
  const splitMeanings = (s) => String(s || '').split(/[,;\n]/).map((x) => x.trim()).filter(Boolean).slice(0, 5);

  const fmtDate = (t) => new Date(t).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });

  // ---------- morph: patch the DOM in place instead of replacing it ----------
  // Re-rendering with innerHTML rebuilt the whole panel on every storage change (one per
  // looked-up card), which replayed the open animation, reset the progress bar to 0, cut the
  // flip transition and lost scroll and focus. morph() keeps every node whose tag (and
  // data-key, when set) still matches, and only touches what changed. Inline `style` is
  // never diffed: it is set through the CSSOM after render.

  const parser = new DOMParser();

  function sameNode(a, b) {
    if (a.nodeType !== b.nodeType || a.nodeName !== b.nodeName) return false;
    if (a.nodeType !== 1) return true;
    return (a.getAttribute('data-key') || '') === (b.getAttribute('data-key') || '');
  }

  function patchAttributes(a, b) {
    for (const { name, value } of [...b.attributes]) {
      if (name !== 'style' && a.getAttribute(name) !== value) a.setAttribute(name, value);
    }
    for (const { name } of [...a.attributes]) {
      if (name !== 'style' && !b.hasAttribute(name)) a.removeAttribute(name);
    }
  }

  function patchNode(a, b) {
    if (a.nodeType === 3 || a.nodeType === 8) {
      if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue;
      return;
    }
    patchAttributes(a, b);
    // Live form values belong to the user; templates only carry defaults.
    if (a.nodeName === 'SELECT') {
      patchChildren(a, b);
      const want = b.querySelector('option[selected]')?.value;
      if (want !== undefined && a !== a.getRootNode().activeElement && a.value !== want) a.value = want;
      return;
    }
    patchChildren(a, b);
  }

  function patchChildren(parent, fresh) {
    let cur = parent.firstChild;
    for (const node of [...fresh.childNodes]) {
      if (cur && sameNode(cur, node)) {
        patchNode(cur, node);
        cur = cur.nextSibling;
        continue;
      }
      // A keyed node further down (list reorder or a removal above it): move it up.
      if (node.nodeType === 1 && node.hasAttribute('data-key')) {
        let s = cur?.nextSibling;
        while (s && !sameNode(s, node)) s = s.nextSibling;
        if (s) {
          parent.insertBefore(s, cur);
          patchNode(s, node);
          continue;
        }
      }
      parent.insertBefore(node, cur);
    }
    while (cur) {
      const next = cur.nextSibling;
      parent.removeChild(cur);
      cur = next;
    }
  }

  /** Make `target`'s children match `html`, reusing existing nodes where possible. */
  function morph(target, html) {
    patchChildren(target, parser.parseFromString(`<body>${html}</body>`, 'text/html').body);
  }

  globalThis.LX = {
    api, DEFAULT_SETTINGS, DEFAULT_UI, MINE, MINE_TITLE, LANGS, LANG_NAME, ICON,
    alive, send, esc, reEsc, highlight, cardKey, splitMeanings, fmtDate, morph,
  };
})();
