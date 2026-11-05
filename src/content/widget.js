// Floating flashcard widget, injected into every page. All shared state lives in
// storage.local, so the widget shows the same deck and card in every tab and window.
// Deck changes go through background.js; only `ui` and `settings` are written here.
(() => {
  'use strict';
  if (window.top !== window || globalThis.__lexiflipWidget) return;
  globalThis.__lexiflipWidget = true;

  const api = globalThis.browser ?? globalThis.chrome;
  const X = globalThis.LexiflipExtract;
  const local = api.storage.local;

  const DEFAULT_SETTINGS = { target: 'id', source: 'auto', maxCards: 20, minLength: 4, corner: 'right' };
  const DEFAULT_UI = { hidden: false, open: false, index: 0, onlyUnknown: false };
  const STALE_MS = 60000; // a card still "loading" this long after the last deck write was orphaned
  const MIN_SELECTION = 40;

  const LANGS = [
    ['id', 'Indonesia'], ['en', 'English'], ['ms', 'Melayu'], ['ja', '日本語'], ['ko', '한국어'],
    ['zh', '中文'], ['ar', 'العربية'], ['de', 'Deutsch'], ['fr', 'Français'], ['es', 'Español'],
    ['nl', 'Nederlands'], ['pt', 'Português'], ['ru', 'Русский'], ['tr', 'Türkçe'],
  ];
  const LANG_NAME = Object.fromEntries(LANGS);

  const ICON = {
    logo: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="8" y="3" width="12" height="16" rx="2" transform="rotate(12 14 11)"/><rect x="4" y="5" width="12" height="16" rx="2" fill="currentColor" fill-opacity=".25"/></svg>',
    decks: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/></svg>',
    gear: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></svg>',
    minus: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 12h12"/></svg>',
    close: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    back: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>',
    prev: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>',
    next: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>',
    speak: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>',
    shuffle: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/></svg>',
    filter: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5h18l-7 8v6l-4 2v-8L3 5Z"/></svg>',
    trash: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>',
    sparkle: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="9" y="3" width="11" height="15" rx="2" transform="rotate(12 14.5 10.5)"/><rect x="4" y="6" width="11" height="15" rx="2" fill="currentColor" fill-opacity=".2"/></svg>',
  };

  // ---------- state ----------

  let settings = { ...DEFAULT_SETTINGS };
  let ui = { ...DEFAULT_UI };
  let decks = [];
  let activeId = null;
  let deck = null;

  let view = 'cards'; // cards | decks | settings
  let flipped = false;
  let shownWord = null;
  let busy = false;
  let toast = '';
  let toastTimer = 0;
  let pendingSelection = '';

  const alive = () => { try { return Boolean(api.runtime?.id); } catch { return false; } };

  async function send(msg) {
    if (!alive()) throw new Error('Ekstensi baru diperbarui. Muat ulang halaman ini.');
    const res = await api.runtime.sendMessage(msg);
    if (!res?.ok) throw new Error(res?.error || 'Tidak ada respons dari ekstensi.');
    return res;
  }

  function setUi(patch) {
    ui = { ...ui, ...patch };
    render();
    if (alive()) local.set({ ui }).catch(() => {});
  }

  function flash(message) {
    toast = message;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast = ''; render(); }, 6000);
    render();
  }

  // ---------- DOM ----------

  const host = document.createElement('lexiflip-widget');
  const shadow = host.attachShadow({ mode: 'closed' });
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(globalThis.LexiflipCSS || '');
    shadow.adoptedStyleSheets = [sheet];
  } catch { /* handled below */ }
  if (!shadow.adoptedStyleSheets?.length) {
    const style = document.createElement('style');
    style.textContent = globalThis.LexiflipCSS || '';
    shadow.append(style);
  }
  const root = document.createElement('div');
  root.className = 'lf';
  root.hidden = true;
  shadow.append(root);

  function mount() {
    if (!host.isConnected) document.documentElement.append(host);
  }
  mount();
  // Some single-page apps rebuild the document; put the widget back if it gets removed.
  new MutationObserver(mount).observe(document.documentElement, { childList: true });

  // ---------- helpers ----------

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
  const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

  function highlight(context, word) {
    if (!context) return '';
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

  function cardsInView() {
    if (!deck) return [];
    return ui.onlyUnknown ? deck.cards.filter((c) => !c.known) : deck.cards;
  }

  function currentIndex(list) {
    if (!list.length) return 0;
    return Math.min(Math.max(0, ui.index | 0), list.length - 1);
  }

  function cardStatus(card) {
    if (card.status === 'loading' && deck && Date.now() - (deck.updatedAt || deck.createdAt) > STALE_MS) return 'error';
    return card.status;
  }

  function sourceLang() {
    return settings.source === 'auto' ? (X.pageLang() || 'en') : settings.source;
  }

  const fmtDate = (t) => new Date(t).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });

  // ---------- rendering ----------

  // Every interpolated value in the templates below goes through esc(). Parsing with DOMParser
  // (scripts never run there) and moving the nodes in keeps innerHTML out of the code.
  const parser = new DOMParser();
  function paint(html) {
    root.replaceChildren(...parser.parseFromString(html, 'text/html').body.childNodes);
  }

  function render() {
    root.dataset.corner = settings.corner === 'left' ? 'left' : 'right';
    root.hidden = ui.hidden;
    if (ui.hidden) { root.replaceChildren(); return; }

    if (!ui.open) {
      const left = deck ? deck.cards.filter((c) => !c.known).length : 0;
      paint(`
        <button class="fab" data-act="open" title="Buka Lexiflip (Alt+Shift+K)" aria-label="Buka Lexiflip">
          ${ICON.logo.replace('width="18" height="18"', 'width="26" height="26"')}
          ${left ? `<span class="badge">${left}</span>` : ''}
        </button>`);
      return;
    }

    const focusKey = shadow.activeElement?.dataset?.focusKey;
    const body = view === 'settings' ? renderSettings() : view === 'decks' ? renderDecks() : renderCards();
    paint(`
      <section class="panel" role="dialog" aria-label="Lexiflip">
        <header class="head">
          <div class="brand">
            <div class="logo">${ICON.logo}</div>
            <div class="brand-text">
              <div class="brand-name">Lexiflip</div>
              <span class="brand-sub" title="${esc(deck?.title || '')}">${esc(deck?.title || 'Flashcard dari artikel')}</span>
            </div>
          </div>
          <button class="icon-btn" data-act="view" data-view="decks" data-focus-key="decks" title="Daftar dek" aria-pressed="${view === 'decks'}">${ICON.decks}</button>
          <button class="icon-btn" data-act="view" data-view="settings" data-focus-key="settings" title="Pengaturan" aria-pressed="${view === 'settings'}">${ICON.gear}</button>
          <button class="icon-btn" data-act="minimize" title="Kecilkan">${ICON.minus}</button>
          <button class="icon-btn" data-act="hide" title="Sembunyikan (buka lagi lewat ikon Lexiflip di toolbar)">${ICON.close}</button>
        </header>
        ${toast ? `<div class="toast" role="status">${esc(toast)}</div>` : ''}
        ${body}
      </section>`);

    const bar = root.querySelector('.bar > span');
    if (bar) bar.style.width = `${bar.dataset.pct}%`; // CSSOM, so a strict page CSP can't block it
    if (focusKey) root.querySelector(`[data-focus-key="${focusKey}"]`)?.focus();
  }

  function renderEmpty() {
    return `
      <div class="body">
        <div class="empty">
          <div class="empty-art">${ICON.sparkle}</div>
          <h3>Belum ada kartu</h3>
          <p>Ubah artikel di halaman ini menjadi flashcard kosakata lengkap dengan artinya.</p>
          <button class="btn primary block" data-act="build" ${busy ? 'disabled' : ''}>
            ${busy ? 'Membaca halaman…' : 'Buat dari halaman ini'}
          </button>
          <div class="tip">Tips: blok sebagian teks dulu untuk membuat kartu dari bagian itu saja, atau klik kanan → <b>Buat flashcard dari teks terpilih</b>.</div>
        </div>
      </div>`;
  }

  function renderBack(card, status) {
    const name = esc(card.display);
    let meaning;
    if (status === 'loading') {
      meaning = '<div class="state"><span class="spinner"></span>Mencari arti…</div>';
    } else if (status === 'error') {
      meaning = `<div class="state error">
          <span>${esc(card.error || 'Pencarian arti terhenti.')}</span>
          <button class="btn small warn" data-act="retry" data-word="${esc(card.word)}">Coba lagi</button>
        </div>`;
    } else {
      const tr = card.translations || [];
      const senses = card.senses || [];
      meaning = '';
      if (tr.length) {
        meaning += `<div><div class="label">Arti (${esc(LANG_NAME[deck.target] || deck.target)})</div>
          <div class="trans">${esc(tr[0])}${tr.length > 1 ? `<small>${tr.slice(1).map(esc).join(', ')}</small>` : ''}</div></div>`;
      }
      if (senses.length) {
        meaning += `<div><div class="label">Definisi</div>${senses.map((s) => `
          <p class="sense" lang="en"><span class="pos">${esc(s.pos)}</span>${esc(s.def)}</p>`).join('')}</div>`;
      }
      if (!meaning) {
        meaning = `<div class="state">Arti tidak ditemukan.
          <button class="link-btn" data-act="delete-card" data-word="${esc(card.word)}">Hapus kartu</button></div>`;
      }
    }
    return `
      <div class="back-word"><strong lang="${esc(deck.lang)}">${name}</strong>
        ${card.lemma ? `<span>bentuk dasar: <b lang="${esc(deck.lang)}">${esc(card.lemma)}</b></span>` : ''}
        <span>${card.count}× di artikel</span></div>
      ${meaning}
      ${card.context ? `<div><div class="label">Di artikel</div><p class="context" lang="${esc(deck.lang)}">${highlight(card.context, card.display)}</p></div>` : ''}`;
  }

  function renderCards() {
    if (!deck || !deck.cards.length) return renderEmpty();

    const total = deck.cards.length;
    const known = deck.cards.filter((c) => c.known).length;
    const list = cardsInView();
    const pct = Math.round((known / total) * 100);
    const failed = deck.cards.filter((c) => cardStatus(c) === 'error').length;

    const footer = `
      <footer class="foot">
        <span class="grow">${failed ? `${failed} kartu gagal dimuat. <button class="link-btn" data-act="retry-all">Coba lagi</button>` : `${total} kartu · ${esc(LANG_NAME[deck.lang] || deck.lang)} → ${esc(LANG_NAME[deck.target] || deck.target)}`}</span>
        <button class="link-btn" data-act="build" ${busy ? 'disabled' : ''}>${busy ? 'Membaca…' : 'Buat dari halaman ini'}</button>
      </footer>`;

    if (!list.length) {
      return `
        <div class="body">
          <div class="empty">
            <div class="empty-art">${ICON.sparkle}</div>
            <h3>Semua kartu sudah hafal</h3>
            <p>${total} dari ${total} kata di dek ini sudah kamu tandai hafal.</p>
            <button class="btn primary block" data-act="reset-known">Ulangi dari awal</button>
          </div>
        </div>${footer}`;
    }

    const idx = currentIndex(list);
    const card = list[idx];
    if (card.word !== shownWord) { flipped = false; shownWord = card.word; }
    const status = cardStatus(card);

    return `
      <div class="body">
        <div class="progress"><div class="bar"><span data-pct="${pct}"></span></div><span>${known}/${total} hafal</span></div>
        <div class="card ${flipped ? 'flipped' : ''}" data-act="flip" data-focus-key="card" role="button" tabindex="0"
             aria-label="${flipped ? 'Sembunyikan arti' : 'Tampilkan arti'} ${esc(card.display)}">
          <div class="inner">
            <div class="face front">
              ${card.known ? '<span class="known-tag">Hafal</span>' : ''}
              <div class="word" lang="${esc(deck.lang)}">${esc(card.display)}</div>
              ${card.phonetic ? `<div class="phon">${esc(card.phonetic)}</div>` : ''}
              <div class="hint">Klik atau tekan <span class="kbd">Spasi</span> untuk melihat arti</div>
            </div>
            <div class="face back">${renderBack(card, status)}</div>
          </div>
        </div>
        <div class="nav">
          <div class="nav-group">
            <button class="icon-btn" data-act="speak" title="Dengarkan pelafalan">${ICON.speak}</button>
            <button class="icon-btn" data-act="shuffle" title="Acak urutan">${ICON.shuffle}</button>
            <button class="icon-btn" data-act="only-unknown" title="Hanya kartu yang belum hafal" aria-pressed="${ui.onlyUnknown}">${ICON.filter}</button>
          </div>
          <div class="nav-group">
            <button class="icon-btn" data-act="prev" data-focus-key="prev" title="Sebelumnya (←)" ${list.length < 2 ? 'disabled' : ''}>${ICON.prev}</button>
            <span class="count">${idx + 1} / ${list.length}</span>
            <button class="icon-btn" data-act="next" data-focus-key="next" title="Berikutnya (→)" ${list.length < 2 ? 'disabled' : ''}>${ICON.next}</button>
          </div>
        </div>
        <div class="grade">
          <button class="btn warn" data-act="grade" data-known="0" data-focus-key="g0">Belum hafal</button>
          <button class="btn ok" data-act="grade" data-known="1" data-focus-key="g1">Sudah hafal</button>
        </div>
      </div>${footer}`;
  }

  function renderDecks() {
    const items = decks.map((d) => `
      <li class="deck ${d.id === activeId ? 'active' : ''}">
        <button class="deck-open" data-act="open-deck" data-id="${esc(d.id)}" title="${esc(d.url)}">
          <span class="deck-title">${esc(d.title)}</span>
          <span class="deck-meta">${d.known}/${d.total} hafal · ${fmtDate(d.createdAt)}</span>
        </button>
        <button class="icon-btn" data-act="delete-deck" data-id="${esc(d.id)}" title="Hapus dek">${ICON.trash}</button>
      </li>`).join('');
    return `
      <div class="body">
        <h3 class="view-title"><button class="icon-btn" data-act="view" data-view="cards" title="Kembali">${ICON.back}</button>Dek tersimpan</h3>
        ${decks.length ? `<ul class="deck-list">${items}</ul>` : '<p class="tip">Belum ada dek. Buat dari artikel yang sedang kamu baca.</p>'}
      </div>`;
  }

  function select(name, value, options) {
    return `<select data-setting="${name}" data-focus-key="set-${name}">${options.map(([v, label]) => `
      <option value="${esc(v)}" ${String(v) === String(value) ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select>`;
  }

  function renderSettings() {
    const detected = X.pageLang();
    return `
      <div class="body">
        <h3 class="view-title"><button class="icon-btn" data-act="view" data-view="cards" title="Kembali">${ICON.back}</button>Pengaturan</h3>
        <label class="field"><span>Bahasa arti</span>
          ${select('target', settings.target, LANGS)}
          <small>Kata diterjemahkan ke bahasa ini. Definisi lengkap hanya tersedia untuk artikel berbahasa Inggris.</small></label>
        <label class="field"><span>Bahasa artikel</span>
          ${select('source', settings.source, [['auto', `Otomatis${detected ? ` (halaman ini: ${LANG_NAME[detected] || detected})` : ''}`], ...LANGS])}</label>
        <label class="field"><span>Jumlah kartu per artikel</span>
          ${select('maxCards', settings.maxCards, [[10, '10 kata'], [20, '20 kata'], [30, '30 kata'], [50, '50 kata']])}</label>
        <label class="field"><span>Panjang kata minimal</span>
          ${select('minLength', settings.minLength, [[3, '3 huruf'], [4, '4 huruf'], [5, '5 huruf'], [6, '6 huruf'], [7, '7 huruf']])}
          <small>Naikkan untuk melewati kata-kata pendek yang biasanya sudah dikenal.</small></label>
        <label class="field"><span>Posisi widget</span>
          ${select('corner', settings.corner, [['right', 'Pojok kanan bawah'], ['left', 'Pojok kiri bawah']])}</label>
        <p class="tip">Pintasan: <span class="kbd">Alt+Shift+K</span> menampilkan atau menyembunyikan Lexiflip. Pengaturan berlaku untuk dek berikutnya.</p>
      </div>`;
  }

  // ---------- actions ----------

  function step(delta) {
    const list = cardsInView();
    if (!list.length) return;
    setUi({ index: (currentIndex(list) + delta + list.length) % list.length });
  }

  function speak() {
    const list = cardsInView();
    const card = list[currentIndex(list)];
    if (!card || !('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(card.display);
    u.lang = deck.lang;
    u.rate = 0.9;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }

  async function build(mode, text) {
    if (busy) return;
    if (!X) { flash('Halaman ini belum siap. Coba muat ulang.'); return; }
    busy = true;
    view = 'cards';
    render();
    try {
      const opts = { lang: sourceLang(), maxCards: Number(settings.maxCards), minLength: Number(settings.minLength) };
      const result = mode === 'selection' ? X.fromText(text, opts) : X.fromPage(opts);
      if (!result.words.length) {
        flash(mode === 'selection'
          ? 'Teks yang dipilih tidak punya kata yang cocok untuk dijadikan kartu.'
          : 'Tidak menemukan artikel di halaman ini. Coba blok teksnya lalu buat lagi.');
        return;
      }
      await send({ type: 'createDeck', deck: { title: result.title, url: location.href, lang: opts.lang, words: result.words } });
      flipped = false;
      shownWord = null;
    } catch (err) {
      flash(`Gagal membuat kartu: ${err.message}`);
    } finally {
      busy = false;
      render();
    }
  }

  async function run(act, el) {
    switch (act) {
      case 'open': setUi({ open: true }); break;
      case 'minimize': setUi({ open: false }); break;
      case 'hide': setUi({ hidden: true }); break;
      case 'view': view = el.dataset.view; render(); break;
      case 'flip': flipped = !flipped; root.querySelector('.card')?.classList.toggle('flipped', flipped); break;
      case 'prev': step(-1); break;
      case 'next': step(1); break;
      case 'speak': speak(); break;
      case 'only-unknown': setUi({ onlyUnknown: !ui.onlyUnknown, index: 0 }); break;
      case 'build': {
        const text = pendingSelection;
        pendingSelection = '';
        await build(text ? 'selection' : 'page', text);
        break;
      }
      case 'grade': {
        const list = cardsInView();
        const card = list[currentIndex(list)];
        if (!card) break;
        const known = el.dataset.known === '1';
        // With the "unknown only" filter on, a card marked known leaves the list, so the
        // next card slides into the current index by itself.
        const advance = !(ui.onlyUnknown && known);
        if (advance && list.length > 1) setUi({ index: (currentIndex(list) + 1) % list.length });
        await send({ type: 'setKnown', deckId: deck.id, word: card.word, known });
        break;
      }
      case 'shuffle': await send({ type: 'shuffle', deckId: deck.id }); break;
      case 'retry': await send({ type: 'retry', deckId: deck.id, word: el.dataset.word }); break;
      case 'retry-all': await send({ type: 'retry', deckId: deck.id }); break;
      case 'reset-known': await send({ type: 'resetKnown', deckId: deck.id }); break;
      case 'delete-card': await send({ type: 'deleteCard', deckId: deck.id, word: el.dataset.word }); break;
      case 'open-deck': view = 'cards'; await send({ type: 'setActive', deckId: el.dataset.id }); break;
      case 'delete-deck':
        if (window.confirm('Hapus dek ini beserta progresnya?')) await send({ type: 'deleteDeck', deckId: el.dataset.id });
        break;
      default: break;
    }
  }

  // Remember the page selection before the click moves focus into the widget.
  root.addEventListener('pointerdown', (e) => {
    if (!e.target.closest('[data-act="build"]')) return;
    const text = String(window.getSelection?.() || '').trim();
    pendingSelection = text.length >= MIN_SELECTION ? text : '';
  });

  root.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    run(el.dataset.act, el).catch((err) => flash(err.message));
  });

  root.addEventListener('change', (e) => {
    const key = e.target.dataset?.setting;
    if (!key) return;
    const raw = e.target.value;
    settings = { ...settings, [key]: ['maxCards', 'minLength'].includes(key) ? Number(raw) : raw };
    render();
    if (alive()) local.set({ settings }).catch(() => {});
  });

  root.addEventListener('keydown', (e) => {
    if (e.target.closest('select, input, textarea')) return;
    if (view !== 'cards' || !deck) return;
    const onCard = e.target.closest('.card');
    let handled = true;
    if ((e.key === ' ' || e.key === 'Enter') && onCard) run('flip');
    else if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === 'ArrowRight') step(1);
    else handled = false;
    if (handled) { e.preventDefault(); e.stopPropagation(); }
  });

  // ---------- storage sync ----------

  async function loadDeck(id) {
    if (!id) { deck = null; return; }
    const key = `deck:${id}`;
    deck = (await local.get(key))[key] || null;
  }

  async function init() {
    const got = await local.get(['settings', 'ui', 'decks', 'activeDeckId']);
    settings = { ...DEFAULT_SETTINGS, ...got.settings };
    ui = { ...DEFAULT_UI, ...got.ui };
    decks = got.decks || [];
    activeId = got.activeDeckId || null;
    await loadDeck(activeId);
    render();
  }

  api.storage.onChanged.addListener(async (changes, area) => {
    if (area !== 'local') return;
    let dirty = false;
    if (changes.settings) { settings = { ...DEFAULT_SETTINGS, ...changes.settings.newValue }; dirty = true; }
    if (changes.ui) { ui = { ...DEFAULT_UI, ...changes.ui.newValue }; dirty = true; }
    if (changes.decks) { decks = changes.decks.newValue || []; dirty = true; }
    if (changes.activeDeckId) {
      activeId = changes.activeDeckId.newValue || null;
      await loadDeck(activeId);
      dirty = true;
    } else if (activeId && changes[`deck:${activeId}`]) {
      deck = changes[`deck:${activeId}`].newValue || null;
      dirty = true;
    }
    // Don't rebuild the settings form under the user's cursor for changes it didn't cause.
    if (dirty && !(view === 'settings' && !changes.settings && !changes.ui)) render();
  });

  api.runtime.onMessage.addListener((msg) => {
    if (msg?.type !== 'build') return false;
    view = 'cards';
    setUi({ hidden: false, open: true });
    build(msg.mode, msg.text);
    return false;
  });

  // Firefox and Chrome both suspend background tabs; refresh when the tab comes back so a
  // card that went stale while hidden shows its retry button.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });

  init().catch(() => {});
})();
