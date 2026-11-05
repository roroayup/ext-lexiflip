// Content script: mounts the shared Lexiflip UI as a floating widget in a closed shadow root
// on every page, and adds the selection helper (select a word -> "Flashcard" button ->
// preview with Add/Cancel; select a longer passage -> pick words from it).
(() => {
  'use strict';
  if (window.top !== window) return;

  const { api, MINE, MINE_TITLE, ICON, alive, send, esc, morph } = globalThis.LX;
  const X = globalThis.LexiflipExtract;

  // ---------- one live instance per tab ----------
  // After an extension update the old copy keeps running but is disconnected (every API call
  // throws). background.js injects a fresh copy into open tabs; it retires the stale one.
  const prev = globalThis.__lexiflip;
  if (prev && typeof prev === 'object' && typeof prev.alive === 'function') {
    if (prev.alive()) return;
    try { prev.teardown(); } catch { /* already gone */ }
  }
  for (const stale of document.querySelectorAll('lexiflip-widget')) stale.remove();

  const SHORT_WORDS = 4;
  const SHORT_CHARS = 60;
  const MIN_PASSAGE = 40;

  // ---------- DOM ----------

  const host = document.createElement('lexiflip-widget');
  const shadow = host.attachShadow({ mode: 'closed' });
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(globalThis.LexiflipCSS || '');
    shadow.adoptedStyleSheets = [sheet];
  } catch { /* fall back below */ }
  if (!shadow.adoptedStyleSheets?.length) {
    const style = document.createElement('style');
    style.textContent = globalThis.LexiflipCSS || '';
    shadow.append(style);
  }
  const root = document.createElement('div');
  root.className = 'lf';
  root.hidden = true;
  const layer = document.createElement('div');
  layer.className = 'lf layer';
  shadow.append(root, layer);

  // Some single-page apps rebuild the document; put the widget back if it gets removed.
  // A disconnected copy (removed by its replacement after an update) retires instead.
  const mount = () => {
    if (!alive()) { teardown(); return; }
    if (!host.isConnected) document.documentElement.append(host);
  };
  const observer = new MutationObserver(mount);
  document.documentElement.append(host);
  observer.observe(document.documentElement, { childList: true });

  // Keys typed inside Lexiflip must not reach the page's own shortcuts (YouTube's "k",
  // GitHub's "s", Gmail's "c"…). Stopping them at the shadow root keeps them inside.
  for (const type of ['keydown', 'keyup', 'keypress']) shadow.addEventListener(type, (e) => e.stopPropagation());

  // ---------- shared UI ----------

  let pendingSelection = '';
  let ui = null;
  const sourceLang = (text = '') => {
    const s = ui?.state.settings;
    if (s && s.source !== 'auto') return s.source;
    return X.pageLang() || (text ? X.guessLang(text) : '') || 'en';
  };

  ui = globalThis.LX.createUI({
    root,
    mode: 'widget',
    defaultLang: () => X.pageLang() || 'en',
    takeSelection: () => { const t = pendingSelection; pendingSelection = ''; return t; },
    extractPage(selectionText, max, lang) {
      const settings = ui.state.settings;
      const opts = { maxCards: max, minLength: Number(settings.minLength) };
      if (selectionText) {
        const l = settings.source !== 'auto' ? lang : X.pageLang() || X.guessLang(selectionText);
        const r = X.fromText(selectionText, { ...opts, lang: l });
        return { source: 'selection', title: r.title, url: location.href, lang: l, words: r.words };
      }
      const r = X.fromPage({ ...opts, lang: settings.source !== 'auto' ? lang : '' });
      return { source: 'page', title: r.title, url: location.href, lang: r.lang, words: r.words };
    },
    onDead: () => teardown(),
  });

  // Remember the page selection before a click on "Buat dari halaman ini" moves focus.
  root.addEventListener('pointerdown', (e) => {
    if (!e.target.closest('[data-act="build"]')) return;
    const text = String(window.getSelection?.() || '').trim();
    pendingSelection = text.length >= MIN_PASSAGE ? text : '';
  });

  // ---------- selection helper ----------

  let P = null; // { mode: 'bubble' | 'pop', short, text, context, x, y, top, lang, preview, deckId, done }
  let lastDeck = MINE;

  function editableAt(node) {
    const el = node?.nodeType === 1 ? node : node?.parentElement;
    return Boolean(el?.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]'));
  }

  function position(el, width, height) {
    if (!el) return;
    const pad = 8;
    const x = Math.min(Math.max(pad, P.x - width / 2), innerWidth - width - pad);
    let y = P.y + 8;
    if (y + height > innerHeight - pad) y = Math.max(pad, P.top - height - 8);
    el.style.left = `${x}px`; // CSSOM: not blocked by the page's CSP
    el.style.top = `${y}px`;
  }

  function drawLayer() {
    if (!P) { morph(layer, ''); return; }
    if (P.mode === 'bubble') {
      const label = P.short ? 'Flashcard' : 'Pilih kata dari teks ini';
      morph(layer, `<button class="bubble" data-key="bubble" data-pact="open" title="Lexiflip">${ICON.logo(15)}<span>${label}</span></button>`);
      position(layer.firstElementChild, P.short ? 110 : 190, 32);
      return;
    }
    const pv = P.preview;
    const decks = [[MINE, MINE_TITLE], ...ui.state.decks.filter((d) => d.id !== MINE).map((d) => [d.id, d.title])];
    let status = '';
    if (!pv || pv.status === 'loading') status = '<div class="state"><span class="spinner"></span>Mencari arti…</div>';
    else if (pv.status === 'error') status = `<div class="state error"><span>${esc(pv.error)}</span></div>`;
    const sense = pv?.result?.senses?.[0];
    morph(layer, `
      <div class="pop" data-key="pop" role="dialog" aria-label="Tambah ke flashcard">
        <div class="pop-head">
          <div class="pop-word"><b lang="${esc(P.lang)}">${esc(P.text)}</b>${pv?.result?.phonetic ? `<span class="phon">${esc(pv.result.phonetic)}</span>` : ''}</div>
          <button class="icon-btn" data-pact="speak" title="Dengarkan">${ICON.speak}</button>
          <button class="icon-btn" data-pact="close" title="Batal (Esc)">${ICON.close}</button>
        </div>
        ${P.done ? `<div class="toast ok">${esc(P.done)}</div>` : `
        ${status}
        ${pv?.result && !pv.result.translations?.length && pv.result.defTranslation
          ? `<p class="sense"><span class="pos">arti dari definisi</span>${esc(pv.result.defTranslation)}</p>` : ''}
        <label class="field"><span>Arti</span>
          <input data-pinput="meaning" maxlength="200" placeholder="${pv?.status === 'ready' ? 'Arti tidak ditemukan, isi sendiri' : 'Isi arti…'}" autocomplete="off"></label>
        ${sense ? `<p class="sense" lang="en"><span class="pos">${esc(sense.pos)}</span>${esc(sense.def)}</p>` : ''}
        ${P.context ? `<p class="context" lang="${esc(P.lang)}">${globalThis.LX.highlight(P.context, P.text)}</p>` : ''}
        <div class="pop-foot">
          <select data-pinput="deck" aria-label="Simpan ke dek">${decks.map(([id, t]) => `<option value="${esc(id)}" ${id === P.deckId ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>
          <button class="btn small" data-pact="close">Batal</button>
          <button class="btn small primary" data-pact="add" ${P.saving ? 'disabled' : ''}>Tambah</button>
        </div>
        <button class="link-btn" data-pact="more">Edit lengkap…</button>`}
      </div>`);
    const input = layer.querySelector('[data-pinput="meaning"]');
    if (input && P.fill !== undefined) { input.value = P.fill; P.fill = undefined; }
    position(layer.firstElementChild, 300, layer.firstElementChild.offsetHeight || 220);
    if (P.focus) { input?.focus(); P.focus = false; }
  }

  function closeLayer() {
    P = null;
    drawLayer();
  }

  function readSelection() {
    const sel = window.getSelection?.();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
    const text = sel.toString().replace(/\s+/g, ' ').trim();
    if (!text || text.length > 20000 || !/\p{L}/u.test(text)) return null;
    if (editableAt(sel.anchorNode) || editableAt(sel.focusNode)) return null;
    const range = sel.getRangeAt(0);
    const rects = range.getClientRects();
    const rect = rects.length ? rects[rects.length - 1] : range.getBoundingClientRect();
    const first = rects.length ? rects[0] : rect;
    if (!rect || (!rect.width && !rect.height)) return null;
    return {
      text,
      short: text.split(' ').length <= SHORT_WORDS && text.length <= SHORT_CHARS,
      range,
      x: rect.right,
      y: rect.bottom,
      top: first.top,
    };
  }

  function onSelectEnd(e) {
    if (e.composedPath?.().includes(host)) return;
    setTimeout(() => {
      if (!alive()) { teardown(); return; }
      if (ui.state.settings.selectionBubble === false || P?.mode === 'pop') return;
      const s = readSelection();
      if (!s || (!s.short && s.text.length < MIN_PASSAGE)) { if (P?.mode === 'bubble') closeLayer(); return; }
      P = {
        mode: 'bubble',
        short: s.short,
        text: s.text,
        context: s.short ? X.sentenceAround(s.range, s.text) : '',
        x: s.x,
        y: s.y,
        top: s.top,
      };
      drawLayer();
    }, 10);
  }

  async function openPopover() {
    P.mode = 'pop';
    P.lang = sourceLang(P.text);
    P.deckId = lastDeck === MINE || ui.state.decks.some((d) => d.id === lastDeck) ? lastDeck : MINE;
    P.preview = { status: 'loading' };
    P.focus = true;
    drawLayer();
    const mine = P;
    try {
      const { result } = await send({ type: 'lookupWord', word: P.text, lang: P.lang });
      if (P !== mine) return;
      P.preview = { status: result.status === 'error' ? 'error' : 'ready', result, error: result.error };
      const input = layer.querySelector('[data-pinput="meaning"]');
      if (input && !input.value.trim()) P.fill = (result.translations || []).join(', ');
    } catch (err) {
      if (P === mine) P.preview = { status: 'error', error: err.message };
    }
    if (P === mine) drawLayer();
  }

  async function addFromPopover() {
    if (!P || P.saving || P.done) return;
    const meaning = layer.querySelector('[data-pinput="meaning"]')?.value || '';
    const deckId = layer.querySelector('[data-pinput="deck"]')?.value || MINE;
    const r = P.preview?.status === 'ready' ? P.preview.result : null;
    const translations = globalThis.LX.splitMeanings(meaning);
    lastDeck = deckId;
    P.saving = true;
    P.fill = meaning;
    drawLayer();
    const mine = P;
    try {
      const res = await send({
        type: 'addCards',
        deckId,
        cards: [{
          word: P.text,
          display: P.text,
          lang: P.lang,
          translations,
          context: P.context,
          manualMeaning: translations.length > 0 && translations.join(', ') !== (r?.translations || []).join(', '),
          senses: r?.senses || [],
          phonetic: r?.phonetic || '',
          lemma: r?.lemma || '',
          lookup: r && translations.length ? false : undefined,
        }],
      });
      if (P !== mine) return;
      const where = deckId === MINE ? MINE_TITLE : ui.state.decks.find((d) => d.id === deckId)?.title || 'dek';
      P.done = res.updated ? `Sudah ada di ${where}, kartunya diperbarui.` : `Ditambahkan ke ${where}.`;
      P.saving = false;
      drawLayer();
      setTimeout(() => { if (P === mine) closeLayer(); }, 1200);
    } catch (err) {
      if (P !== mine) return;
      P.saving = false;
      P.fill = meaning;
      P.preview = { ...(P.preview || {}), status: 'error', error: err.message };
      drawLayer();
    }
  }

  layer.addEventListener('click', (e) => {
    const el = e.target.closest('[data-pact]');
    if (!el || el.disabled || !P) return;
    if (!alive()) { teardown(); return; }
    const act = el.dataset.pact;
    if (act === 'close') closeLayer();
    else if (act === 'speak' && 'speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance(P.text);
      u.lang = P.lang;
      u.rate = 0.9;
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    } else if (act === 'add') addFromPopover();
    else if (act === 'more') {
      const prefill = {
        display: P.text,
        meaning: layer.querySelector('[data-pinput="meaning"]')?.value || '',
        context: P.context,
        lang: P.lang,
        deckId: layer.querySelector('[data-pinput="deck"]')?.value,
      };
      closeLayer();
      ui.setUi({ hidden: false, open: true });
      ui.openForm(prefill);
    } else if (act === 'open') {
      if (P.short) openPopover();
      else {
        const text = P.text;
        closeLayer();
        ui.setUi({ hidden: false, open: true });
        ui.buildFromPage(text);
      }
    }
  });

  // Pressing the bubble must not collapse the page selection (that would close the bubble
  // before the click lands) or move focus.
  layer.addEventListener('mousedown', (e) => {
    if (e.target.closest('.bubble')) e.preventDefault();
  });

  layer.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); closeLayer(); }
    else if (e.key === 'Enter' && e.target.matches?.('[data-pinput="meaning"]')) { e.preventDefault(); addFromPopover(); }
  });

  const onMouseUp = (e) => onSelectEnd(e);
  const onKeyUp = (e) => { if (e.shiftKey || e.key === 'Shift') onSelectEnd(e); };
  const onMouseDown = (e) => {
    if (e.composedPath?.().includes(host)) return;
    if (P) closeLayer();
  };
  const onScroll = () => { if (P?.mode === 'bubble') closeLayer(); };
  const onSelectionChange = () => {
    if (P?.mode === 'bubble' && window.getSelection?.()?.isCollapsed) closeLayer();
  };

  // Capture phase: some sites stop mouseup/keyup from bubbling.
  document.addEventListener('mouseup', onMouseUp, true);
  document.addEventListener('keyup', onKeyUp, true);
  document.addEventListener('mousedown', onMouseDown, true);
  document.addEventListener('selectionchange', onSelectionChange);
  window.addEventListener('scroll', onScroll, { capture: true, passive: true });

  // ---------- messages from background (context menu) ----------

  const onMessage = (msg) => {
    if (msg?.type !== 'build') return false;
    ui.setUi({ hidden: false, open: true });
    const text = String(msg.text || '').replace(/\s+/g, ' ').trim();
    if (msg.mode === 'selection' && text) {
      if (text.split(' ').length <= SHORT_WORDS && text.length <= SHORT_CHARS) {
        const sel = window.getSelection?.();
        const context = sel?.rangeCount ? X.sentenceAround(sel.getRangeAt(0), text) : '';
        ui.openForm({ display: text, context, lang: sourceLang(text), autoLookup: true });
      } else {
        ui.buildFromPage(text);
      }
    } else {
      ui.buildFromPage('');
    }
    return false;
  };
  api.runtime.onMessage.addListener(onMessage);

  // ---------- lifecycle ----------

  const timer = setInterval(() => { if (!alive()) teardown(); }, 5000);
  const onVisible = () => { if (!document.hidden && !alive()) teardown(); };
  document.addEventListener('visibilitychange', onVisible);

  let retired = false;
  function teardown() {
    if (retired) return;
    retired = true;
    clearInterval(timer);
    observer.disconnect();
    document.removeEventListener('mouseup', onMouseUp, true);
    document.removeEventListener('keyup', onKeyUp, true);
    document.removeEventListener('mousedown', onMouseDown, true);
    document.removeEventListener('selectionchange', onSelectionChange);
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('scroll', onScroll, { capture: true });
    try { api.runtime.onMessage.removeListener(onMessage); } catch { /* context gone */ }
    ui.destroy();
    host.remove();
    if (globalThis.__lexiflip === instance) globalThis.__lexiflip = null;
  }

  const instance = { alive, teardown };
  globalThis.__lexiflip = instance;
})();
