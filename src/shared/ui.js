// The Lexiflip interface, shared by the floating widget (mode 'widget', inside a shadow root
// on every page) and the full study page (mode 'page', app/app.html). State that must be the
// same everywhere (settings, decks, current card) lives in storage.local; deck changes go
// through background.js. View state (open form, word picker) is local to each instance.
(() => {
  'use strict';

  const {
    api, DEFAULT_SETTINGS, DEFAULT_UI, MINE, MINE_TITLE, LANGS, LANG_NAME, ICON,
    alive, send, esc, highlight, splitMeanings, fmtDate, morph,
  } = globalThis.LX;
  const X = () => globalThis.LexiflipExtract;

  const STALE_MS = 90000; // a card still "loading" this long after the last deck write was orphaned
  const PICK_MAX = 60; // candidates offered in the word picker
  const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
  const DOC_ACCEPT = '.pdf,.docx,.epub,.pptx,.odt,.txt,.md,.markdown,.csv,.html,.htm,.srt,.vtt';

  const langName = (code) => LANG_NAME[code] || code || '';
  const deckTitle = (d) => (d?.id === MINE ? MINE_TITLE : d?.title || '');

  function createUI(opts) {
    const { root, mode = 'widget', extractPage, parseDocument, defaultLang } = opts;
    const page = mode === 'page';
    const local = api.storage.local;

    const S = { settings: { ...DEFAULT_SETTINGS }, ui: { ...DEFAULT_UI }, decks: [], activeId: null, deck: null };
    const V = {
      view: 'study',
      flipped: false,
      shownKey: null,
      busy: '',
      toast: null,
      pick: null,
      form: null,
      formSeq: 0,
      filter: '',
      returnTo: 'study',
      uploadLang: 'auto',
    };
    let raf = 0;
    let toastTimer = 0;
    let destroyed = false;

    // ---------- helpers ----------

    function render() {
      if (destroyed || raf) return;
      raf = requestAnimationFrame(() => { raf = 0; draw(); });
    }

    function setUi(patch) {
      S.ui = { ...S.ui, ...patch };
      render();
      if (alive()) local.set({ ui: S.ui }).catch(() => {});
    }

    function flash(text, kind = 'warn') {
      V.toast = { text, kind };
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { V.toast = null; render(); }, kind === 'ok' ? 3500 : 7000);
      render();
    }

    function go(view) {
      if (V.view === 'add') syncForm();
      V.view = view;
      if (!page && !S.ui.open) setUi({ open: true, hidden: false });
      render();
    }

    function cardsInView() {
      if (!S.deck) return [];
      return S.ui.onlyUnknown ? S.deck.cards.filter((c) => !c.known) : S.deck.cards;
    }

    function currentIndex(list) {
      return list.length ? Math.min(Math.max(0, S.ui.index | 0), list.length - 1) : 0;
    }

    function cardStatus(card) {
      if (card.status === 'loading' && S.deck && Date.now() - (S.deck.updatedAt || S.deck.createdAt) > STALE_MS) return 'error';
      return card.status;
    }

    function guessWordLang(word, fallback) {
      if (CJK.test(word) || /[\p{Script=Cyrillic}\p{Script=Arabic}]/u.test(word)) return X()?.guessLang(word.repeat(30)) || fallback;
      return fallback;
    }

    function baseLang() {
      if (S.settings.source !== 'auto') return S.settings.source;
      return defaultLang?.() || 'en';
    }

    function deckOptions(selected, extra = []) {
      const list = [[MINE, MINE_TITLE], ...S.decks.filter((d) => d.id !== MINE).map((d) => [d.id, d.title]), ...extra];
      return list.map(([id, title]) => `<option value="${esc(id)}" ${id === selected ? 'selected' : ''}>${esc(title)}</option>`).join('');
    }

    function langOptions(selected, withAuto) {
      const list = withAuto ? [['auto', withAuto], ...LANGS] : LANGS;
      return list.map(([v, l]) => `<option value="${esc(v)}" ${v === selected ? 'selected' : ''}>${esc(l)}</option>`).join('');
    }

    // ---------- drawing ----------

    function draw() {
      if (destroyed) return;
      if (V.view === 'add') syncForm();
      if (!page) {
        root.dataset.corner = S.settings.corner === 'left' ? 'left' : 'right';
        root.hidden = Boolean(S.ui.hidden);
        if (S.ui.hidden) { morph(root, ''); return; }
        if (!S.ui.open) { morph(root, fab()); return; }
      }
      morph(root, page ? pageShell() : panelShell());
      afterDraw();
    }

    function afterDraw() {
      const bar = root.querySelector('.bar > span');
      if (bar) bar.style.width = `${bar.dataset.pct}%`; // CSSOM: a strict page CSP can't block it
      if (V.form?.fill) {
        const form = root.querySelector('form[data-form]');
        for (const [name, value] of Object.entries(V.form.fill)) {
          const el = form?.elements.namedItem(name);
          if (el) el.value = value;
        }
        V.form.fill = null;
      }
      if (V.focus) {
        root.querySelector(V.focus)?.focus();
        V.focus = null;
      }
    }

    function fab() {
      const left = S.deck ? S.deck.cards.filter((c) => !c.known).length : 0;
      return `
        <button class="fab" data-key="fab" data-act="open" title="Buka Lexiflip (Alt+Shift+K)" aria-label="Buka Lexiflip">
          ${ICON.logo(26)}${left ? `<span class="badge">${left}</span>` : ''}
        </button>`;
    }

    function toastHtml() {
      return V.toast ? `<div class="toast ${V.toast.kind}" role="status">${esc(V.toast.text)}</div>` : '';
    }

    function panelShell() {
      const iconBtn = (act, icon, title, extra = '') => `<button class="icon-btn" data-act="${act}" ${extra} title="${esc(title)}">${icon}</button>`;
      return `
        <section class="panel" data-key="panel" role="dialog" aria-label="Lexiflip">
          <header class="head">
            <div class="brand">
              <div class="logo">${ICON.logo()}</div>
              <div class="brand-text">
                <div class="brand-name">Lexiflip</div>
                <span class="brand-sub" title="${esc(deckTitle(S.deck))}">${esc(deckTitle(S.deck) || 'Flashcard kosakata')}</span>
              </div>
            </div>
            ${iconBtn('nav', ICON.plus, 'Tambah kata', `data-view="add" aria-pressed="${V.view === 'add'}"`)}
            ${iconBtn('nav', ICON.decks, 'Dek & daftar kata', `data-view="decks" aria-pressed="${['decks', 'list'].includes(V.view)}"`)}
            ${iconBtn('nav', ICON.gear, 'Pengaturan', `data-view="settings" aria-pressed="${V.view === 'settings'}"`)}
            ${iconBtn('open-app', ICON.external, 'Buka halaman belajar (tab penuh)')}
            ${iconBtn('minimize', ICON.minus, 'Kecilkan')}
            ${iconBtn('hide', ICON.close, 'Sembunyikan (tampilkan lagi lewat ikon Lexiflip di toolbar atau Alt+Shift+K)')}
          </header>
          ${toastHtml()}
          ${body()}
        </section>`;
    }

    function pageShell() {
      const tab = (view, label, icon) => `
        <button class="tab" data-act="nav" data-view="${view}" aria-current="${V.view === view || (view === 'decks' && V.view === 'list') ? 'page' : 'false'}">${icon}<span>${label}</span></button>`;
      return `
        <div class="app" data-key="app">
          <header class="app-head">
            <div class="brand"><div class="logo">${ICON.logo()}</div><div class="brand-name">Lexiflip</div></div>
            <nav class="tabs" aria-label="Menu">
              ${tab('study', 'Belajar', ICON.logo(16))}
              ${tab('add', 'Tambah kata', ICON.plus)}
              ${tab('upload', 'Upload dokumen', ICON.upload)}
              ${tab('decks', 'Dek & kata', ICON.decks)}
              ${tab('settings', 'Pengaturan', ICON.gear)}
            </nav>
          </header>
          <main class="app-main">
            ${toastHtml()}
            <div class="panel">${body()}</div>
          </main>
        </div>`;
    }

    function body() {
      switch (V.view) {
        case 'add': return formView();
        case 'pick': return pickView();
        case 'decks': return decksView();
        case 'list': return listView();
        case 'settings': return settingsView();
        case 'upload': return page ? uploadView() : studyView();
        default: return studyView();
      }
    }

    const title = (text, back = 'study') => `
      <h3 class="view-title">${page && back === 'study' ? '' : `<button class="icon-btn" data-act="nav" data-view="${back}" title="Kembali">${ICON.back}</button>`}${esc(text)}</h3>`;

    // ---------- study ----------

    function emptyStudy() {
      const buttons = page
        ? `<button class="btn primary" data-act="nav" data-view="add">${ICON.plus} Tambah kata</button>
           <button class="btn" data-act="nav" data-view="upload">${ICON.upload} Upload dokumen</button>`
        : `<button class="btn primary block" data-act="build" ${V.busy ? 'disabled' : ''}>${V.busy ? esc(V.busy) : 'Buat dari halaman ini'}</button>
           <div class="btn-row">
             <button class="btn" data-act="nav" data-view="add">${ICON.plus} Tambah kata</button>
             <button class="btn" data-act="open-app" data-hash="upload">${ICON.upload} Dokumen</button>
           </div>`;
      return `
        <div class="body" data-key="v:empty">
          <div class="empty">
            <div class="empty-art">${ICON.sparkle}</div>
            <h3>Belum ada kartu</h3>
            <p>${page
              ? 'Tambahkan kata yang belum kamu tahu, atau upload dokumen untuk dijadikan kartu.'
              : 'Ubah artikel di halaman ini menjadi flashcard, atau tambahkan kata sendiri.'}</p>
            ${buttons}
            ${page ? '' : '<div class="tip">Blok sebuah kata di halaman mana pun, lalu klik tombol <b>Flashcard</b> yang muncul untuk menambahkannya.</div>'}
          </div>
        </div>`;
    }

    function renderBack(card, status, lang) {
      let meaning = '';
      if (status === 'loading' && !card.translations?.length) {
        meaning = '<div class="state"><span class="spinner"></span>Mencari arti…</div>';
      } else if (status === 'error' && !card.translations?.length) {
        meaning = `<div class="state error">
            <span>${esc(card.error || 'Pencarian arti terhenti.')}</span>
            <button class="btn small warn" data-act="retry" data-word="${esc(card.word)}">Coba lagi</button>
          </div>`;
      } else {
        const tr = card.translations || [];
        const senses = card.senses || [];
        if (tr.length) {
          meaning += `<div><div class="label">Arti (${esc(langName(S.deck.target))})</div>
            <div class="trans">${esc(tr[0])}${tr.length > 1 ? `<small>${tr.slice(1).map(esc).join(', ')}</small>` : ''}</div></div>`;
        } else if (card.defTranslation) {
          meaning += `<div><div class="label">Arti (${esc(langName(S.deck.target))}) · dari definisi</div>
            <div class="trans long">${esc(card.defTranslation)}</div></div>`;
        }
        if (senses.length) {
          meaning += `<div><div class="label">Definisi</div>${senses.map((s) => `
            <p class="sense" lang="en"><span class="pos">${esc(s.pos)}</span>${esc(s.def)}</p>`).join('')}</div>`;
        }
        if (!meaning) {
          meaning = `<div class="state">Arti tidak ditemukan. <button class="link-btn" data-act="edit-card" data-word="${esc(card.word)}">Isi sendiri</button></div>`;
        }
      }
      return `
        <div class="back-word"><strong lang="${esc(lang)}">${esc(card.display)}</strong>
          ${card.lemma ? `<span>bentuk dasar: <b lang="${esc(lang)}">${esc(card.lemma)}</b></span>` : ''}
          ${card.count > 1 ? `<span>${card.count}× muncul</span>` : ''}</div>
        ${meaning}
        ${card.context ? `<div><div class="label">Contoh kalimat</div><p class="context" lang="${esc(lang)}">${highlight(card.context, card.display)}</p></div>` : ''}
        <div class="back-actions"><button class="link-btn" data-act="edit-card" data-word="${esc(card.word)}">${ICON.edit} Edit kartu</button></div>`;
    }

    function studyView() {
      if (!S.deck || !S.deck.cards.length) return emptyStudy();

      const total = S.deck.cards.length;
      const known = S.deck.cards.filter((c) => c.known).length;
      const list = cardsInView();
      const failed = S.deck.cards.filter((c) => cardStatus(c) === 'error' && !c.translations?.length).length;
      const footer = `
        <footer class="foot">
          <span class="grow">${failed
            ? `${failed} kartu gagal dimuat. <button class="link-btn" data-act="retry-all">Coba lagi</button>`
            : `${total} kartu · ${esc(langName(S.deck.lang))} → ${esc(langName(S.deck.target))}`}</span>
          ${page ? `<button class="link-btn" data-act="nav" data-view="list">${ICON.list} Daftar kata</button>`
            : `<button class="link-btn" data-act="build" ${V.busy ? 'disabled' : ''}>${V.busy ? esc(V.busy) : 'Buat dari halaman ini'}</button>`}
        </footer>`;

      if (!list.length) {
        return `
          <div class="body" data-key="v:done">
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
      if (card.word !== V.shownKey) { V.flipped = false; V.shownKey = card.word; }
      const lang = card.lang || S.deck.lang;
      const pct = Math.round((known / total) * 100);

      return `
        <div class="body" data-key="v:study">
          ${page ? `<div class="deck-line"><b>${esc(deckTitle(S.deck))}</b><button class="link-btn" data-act="nav" data-view="decks">Ganti dek</button></div>` : ''}
          <div class="progress"><div class="bar"><span data-pct="${pct}"></span></div><span>${known}/${total} hafal</span></div>
          <div class="card ${V.flipped ? 'flipped' : ''}" data-key="card:${esc(card.word)}" data-act="flip" role="button" tabindex="0"
               aria-label="${V.flipped ? 'Sembunyikan arti' : 'Tampilkan arti'} ${esc(card.display)}">
            <div class="inner">
              <div class="face front">
                ${card.known ? '<span class="known-tag">Hafal</span>' : ''}
                <div class="word" lang="${esc(lang)}">${esc(card.display)}</div>
                ${card.phonetic ? `<div class="phon">${esc(card.phonetic)}</div>` : ''}
                <div class="hint">Klik atau tekan <span class="kbd">Spasi</span> untuk melihat arti</div>
              </div>
              <div class="face back">${renderBack(card, cardStatus(card), lang)}</div>
            </div>
          </div>
          <div class="nav">
            <div class="nav-group">
              <button class="icon-btn" data-act="speak" title="Dengarkan pelafalan">${ICON.speak}</button>
              <button class="icon-btn" data-act="shuffle" title="Acak urutan">${ICON.shuffle}</button>
              <button class="icon-btn" data-act="only-unknown" title="Hanya kartu yang belum hafal" aria-pressed="${S.ui.onlyUnknown}">${ICON.filter}</button>
            </div>
            <div class="nav-group">
              <button class="icon-btn" data-act="prev" title="Sebelumnya (←)" ${list.length < 2 ? 'disabled' : ''}>${ICON.prev}</button>
              <span class="count">${idx + 1} / ${list.length}</span>
              <button class="icon-btn" data-act="next" title="Berikutnya (→)" ${list.length < 2 ? 'disabled' : ''}>${ICON.next}</button>
            </div>
          </div>
          <div class="grade">
            <button class="btn warn" data-act="grade" data-known="0">Belum hafal</button>
            <button class="btn ok" data-act="grade" data-known="1">Sudah hafal</button>
          </div>
        </div>${footer}`;
    }

    // ---------- word list ----------

    function listView() {
      if (!S.deck) return decksView();
      const q = V.filter.trim().toLowerCase();
      const cards = S.deck.cards.filter((c) => !q || c.word.includes(q) || (c.translations || []).some((t) => t.toLowerCase().includes(q)));
      const rows = cards.map((c) => {
        const status = cardStatus(c);
        const meaning = c.translations?.length ? c.translations.join(', ')
          : c.defTranslation ? c.defTranslation
          : status === 'loading' ? 'mencari arti…' : status === 'error' ? 'gagal dimuat' : c.senses?.[0]?.def || 'arti belum ada';
        return `
          <li class="row" data-key="w:${esc(c.word)}">
            <button class="tick" data-act="toggle-known" data-word="${esc(c.word)}" aria-pressed="${Boolean(c.known)}" title="${c.known ? 'Tandai belum hafal' : 'Tandai sudah hafal'}">${ICON.check}</button>
            <button class="row-main" data-act="study-card" data-word="${esc(c.word)}" title="Belajar kartu ini">
              <span class="row-word" lang="${esc(c.lang || S.deck.lang)}">${esc(c.display)}</span>
              <span class="row-mean">${esc(meaning)}</span>
            </button>
            <button class="icon-btn" data-act="edit-card" data-word="${esc(c.word)}" title="Edit">${ICON.edit}</button>
            <button class="icon-btn" data-act="delete-card" data-word="${esc(c.word)}" title="Hapus">${ICON.trash}</button>
          </li>`;
      }).join('');
      return `
        <div class="body" data-key="v:list">
          ${title('Daftar kata', 'decks')}
          <div class="list-tools">
            <select data-deck-select aria-label="Pilih dek">${deckOptions(S.activeId)}</select>
            <button class="btn small primary" data-act="nav" data-view="add">${ICON.plus} Tambah</button>
          </div>
          <label class="search">${ICON.search}<input type="search" data-filter placeholder="Cari kata atau arti…" value="${esc(V.filter)}" autocomplete="off"></label>
          ${cards.length ? `<ul class="word-list">${rows}</ul>` : `<p class="tip">${q ? 'Tidak ada kata yang cocok.' : 'Dek ini masih kosong.'}</p>`}
          <p class="tip">${S.deck.cards.length} kata · ${S.deck.cards.filter((c) => c.known).length} hafal</p>
        </div>`;
    }

    // ---------- decks ----------

    function decksView() {
      const items = S.decks.map((d) => `
        <li class="deck ${d.id === S.activeId ? 'active' : ''}" data-key="d:${esc(d.id)}">
          <button class="deck-open" data-act="open-deck" data-id="${esc(d.id)}" title="${esc(d.url || deckTitle(d))}">
            <span class="deck-title">${esc(deckTitle(d))}</span>
            <span class="deck-meta">${d.known}/${d.total} hafal · ${d.id === MINE ? 'kata yang kamu tambahkan' : `${{ document: 'dokumen', selection: 'teks pilihan', manual: 'manual' }[d.source] || 'halaman web'} · ${fmtDate(d.createdAt)}`}</span>
          </button>
          <button class="icon-btn" data-act="list-deck" data-id="${esc(d.id)}" title="Daftar kata">${ICON.list}</button>
          <button class="icon-btn" data-act="delete-deck" data-id="${esc(d.id)}" title="Hapus dek">${ICON.trash}</button>
        </li>`).join('');
      return `
        <div class="body" data-key="v:decks">
          ${title('Dek tersimpan')}
          <div class="btn-row">
            ${page ? `<button class="btn" data-act="nav" data-view="upload">${ICON.upload} Upload dokumen</button>`
              : `<button class="btn" data-act="build" ${V.busy ? 'disabled' : ''}>${V.busy ? esc(V.busy) : 'Dari halaman ini'}</button>`}
            <button class="btn" data-act="nav" data-view="add">${ICON.plus} Tambah kata</button>
          </div>
          ${S.decks.length ? `<ul class="deck-list">${items}</ul>` : '<p class="tip">Belum ada dek.</p>'}
        </div>`;
    }

    // ---------- add / edit form ----------

    function openForm(prefill = {}) {
      const editing = prefill.mode === 'edit';
      V.formSeq += 1;
      V.form = {
        mode: editing ? 'edit' : 'add',
        word: prefill.word || '',
        display: prefill.display || '',
        meaning: prefill.meaning || '',
        context: prefill.context || '',
        deckId: prefill.deckId || (V.form?.mode === 'add' ? V.form.deckId : MINE),
        lang: prefill.lang || guessWordLang(prefill.display || '', baseLang()),
        preview: null,
        origMeaning: prefill.meaning || '',
        fill: null,
      };
      V.returnTo = prefill.returnTo || (['list', 'study'].includes(V.view) ? V.view : 'study');
      V.focus = prefill.display ? 'form [name="meaning"]' : 'form [name="display"]';
      go('add');
      if (prefill.autoLookup && prefill.display) lookupForm();
    }

    function syncForm() {
      const form = root.querySelector('form[data-form]');
      // Only read back the form currently on screen: after a save the state is reset and the
      // old inputs (still in the DOM until the next draw) must not refill it.
      if (!form || !V.form || form.dataset.key !== `form:${V.formSeq}`) return;
      for (const name of ['display', 'meaning', 'context', 'deckId', 'lang']) {
        const el = form.elements.namedItem(name);
        if (el) V.form[name] = el.value;
      }
    }

    function formView() {
      if (!V.form) openFormState();
      const f = V.form;
      const editing = f.mode === 'edit';
      const p = f.preview;
      let preview = '';
      if (p?.status === 'loading') preview = '<div class="state"><span class="spinner"></span>Mencari arti…</div>';
      else if (p?.status === 'error') preview = `<div class="state error"><span>${esc(p.error)}</span></div>`;
      else if (p?.status === 'ready') {
        const r = p.result;
        const options = r.translations?.length ? r.translations : r.defTranslation ? [r.defTranslation] : [];
        const sugg = options.map((t) => `<button type="button" class="chip small" data-act="use-meaning" data-value="${esc(t)}">${esc(t)}</button>`).join('');
        preview = `
          <div class="preview">
            ${r.phonetic ? `<div class="phon">${esc(r.phonetic)}</div>` : ''}
            ${sugg ? `<div class="label">Saran arti (klik untuk memakai)</div><div class="chips">${sugg}</div>` : '<div class="tip">Terjemahan tidak ditemukan. Isi artinya sendiri.</div>'}
            ${(r.senses || []).slice(0, 2).map((s) => `<p class="sense" lang="en"><span class="pos">${esc(s.pos)}</span>${esc(s.def)}</p>`).join('')}
          </div>`;
      }
      return `
        <div class="body" data-key="v:form">
          ${title(editing ? 'Edit kartu' : 'Tambah kata', V.returnTo)}
          <form class="form" data-form data-key="form:${V.formSeq}" autocomplete="off">
            <label class="field"><span>Kata atau frasa</span>
              <input name="display" required maxlength="80" value="${esc(f.display)}" placeholder="mis. glacier"></label>
            <label class="field"><span>Arti <small>pisahkan dengan koma</small></span>
              <input name="meaning" maxlength="200" value="${esc(f.meaning)}" placeholder="Kosongkan untuk dicari otomatis"></label>
            <div class="field-tools">
              <button type="button" class="link-btn" data-act="form-lookup">${ICON.search} Cari arti otomatis</button>
            </div>
            ${preview}
            <label class="field"><span>Contoh kalimat <small>opsional</small></span>
              <textarea name="context" rows="3" maxlength="400" placeholder="Kalimat yang memakai kata ini">${esc(f.context)}</textarea></label>
            <div class="field-row">
              ${editing ? '' : `<label class="field"><span>Simpan ke dek</span><select name="deckId">${deckOptions(f.deckId)}</select></label>`}
              <label class="field"><span>Bahasa kata</span><select name="lang">${langOptions(f.lang)}</select></label>
            </div>
            <div class="form-actions">
              ${editing ? `<button type="button" class="btn warn" data-act="form-delete">${ICON.trash} Hapus</button>` : ''}
              <span class="grow"></span>
              <button type="button" class="btn" data-act="nav" data-view="${V.returnTo}">Batal</button>
              <button type="submit" class="btn primary" ${V.busy ? 'disabled' : ''}>${editing ? 'Simpan' : 'Tambah kartu'}</button>
            </div>
          </form>
        </div>`;
    }

    function openFormState() {
      V.formSeq += 1;
      V.form = { mode: 'add', word: '', display: '', meaning: '', context: '', deckId: MINE, lang: baseLang(), preview: null, origMeaning: '', fill: null };
    }

    async function lookupForm() {
      syncForm();
      const f = V.form;
      const word = f.display.trim();
      if (!word) { flash('Isi kata dulu.'); V.focus = 'form [name="display"]'; render(); return; }
      if (f.lang === baseLang()) f.lang = guessWordLang(word, f.lang);
      f.preview = { status: 'loading' };
      render();
      try {
        const { result } = await send({ type: 'lookupWord', word, lang: f.lang });
        if (V.form !== f) return;
        f.preview = { status: result.status === 'error' ? 'error' : 'ready', result, error: result.error };
        if (!f.meaning.trim() && result.translations?.length) {
          f.meaning = result.translations.join(', ');
          f.fill = { meaning: f.meaning };
        }
      } catch (err) {
        if (V.form === f) f.preview = { status: 'error', error: err.message };
      }
      render();
    }

    async function saveForm() {
      syncForm();
      const f = V.form;
      const display = f.display.trim();
      if (!display) { flash('Kata tidak boleh kosong.'); return; }
      const translations = splitMeanings(f.meaning);
      const lang = f.lang === baseLang() ? guessWordLang(display, f.lang) : f.lang;
      V.busy = 'Menyimpan…';
      render();
      try {
        if (f.mode === 'edit') {
          const patch = { display, context: f.context };
          if (f.meaning.trim() !== f.origMeaning.trim()) patch.translations = translations;
          await send({ type: 'updateCard', deckId: S.activeId, word: f.word, patch });
          V.form = null;
          V.busy = '';
          flash('Kartu disimpan.', 'ok');
          go(V.returnTo);
          return;
        }
        const r = f.preview?.status === 'ready' ? f.preview.result : null;
        const typed = translations.length > 0 && translations.join(', ') !== (r?.translations || []).join(', ');
        const res = await send({
          type: 'addCards',
          deckId: f.deckId,
          cards: [{
            word: display,
            display,
            lang,
            translations,
            context: f.context.trim(),
            manualMeaning: typed,
            senses: r?.senses || [],
            phonetic: r?.phonetic || '',
            lemma: r?.lemma || '',
            lookup: r && translations.length ? false : undefined,
          }],
        });
        const where = f.deckId === MINE ? MINE_TITLE : S.decks.find((d) => d.id === f.deckId)?.title || 'dek';
        flash(res.updated ? `“${display}” sudah ada di ${where}, kartunya diperbarui.` : `“${display}” ditambahkan ke ${where}.`, 'ok');
        const keep = { deckId: f.deckId, lang: f.lang };
        V.formSeq += 1;
        V.form = { ...keep, mode: 'add', word: '', display: '', meaning: '', context: '', preview: null, origMeaning: '', fill: null };
        V.focus = 'form [name="display"]';
      } catch (err) {
        flash(err.message);
      } finally {
        V.busy = '';
        render();
      }
    }

    // ---------- word picker ----------

    /** Show candidate words as toggleable chips; the first `maxCards` start selected. */
    function openPick({ source, title: t, url = '', lang, words }) {
      const n = Number(S.settings.maxCards) || 20;
      V.pick = {
        source, title: t, url, lang,
        items: words,
        selected: new Set(words.slice(0, n).map((w) => w.word)),
        target: 'new',
      };
      go('pick');
    }

    function pickView() {
      const p = V.pick;
      if (!p) return studyView();
      const chips = p.items.map((w) => `
        <button class="chip" data-key="c:${esc(w.word)}" data-act="toggle-chip" data-word="${esc(w.word)}"
                aria-pressed="${p.selected.has(w.word)}" title="${esc(w.context)}" lang="${esc(p.lang)}">${esc(w.display)}${w.count > 1 ? `<small>${w.count}×</small>` : ''}</button>`).join('');
      const n = p.selected.size;
      return `
        <div class="body" data-key="v:pick">
          ${title('Pilih kata untuk dijadikan kartu', page ? 'upload' : 'study')}
          <p class="tip">Dari: <b>${esc(p.title)}</b> · ${esc(langName(p.lang))}. Klik kata untuk memilih atau membatalkan. Arahkan kursor untuk melihat kalimatnya.</p>
          <div class="pick-tools">
            <span><b>${n}</b> dari ${p.items.length} dipilih</span>
            <span class="grow"></span>
            <button class="link-btn" data-act="pick-all">Pilih semua</button>
            <button class="link-btn" data-act="pick-none">Kosongkan</button>
          </div>
          <div class="chips pick">${chips}</div>
          <label class="field"><span>Simpan ke</span>
            <select data-pick-target>
              <option value="new" ${p.target === 'new' ? 'selected' : ''}>Dek baru: ${esc(p.title.slice(0, 60))}</option>
              ${deckOptions(p.target)}
            </select></label>
          <button class="btn primary block" data-act="pick-create" ${n && !V.busy ? '' : 'disabled'}>${V.busy ? esc(V.busy) : `Buat ${n} kartu`}</button>
        </div>`;
    }

    async function createFromPick() {
      const p = V.pick;
      const words = p.items.filter((w) => p.selected.has(w.word));
      if (!words.length) return;
      V.busy = 'Menyimpan…';
      render();
      try {
        if (p.target === 'new') {
          await send({ type: 'createDeck', deck: { title: p.title, url: p.url, lang: p.lang, source: p.source, words } });
        } else {
          await send({ type: 'addCards', deckId: p.target, cards: words.map((w) => ({ ...w, lang: p.lang })), activate: true });
        }
        V.pick = null;
        V.busy = '';
        flash(`${words.length} kartu dibuat. Artinya sedang dicari…`, 'ok');
        go('study');
      } catch (err) {
        V.busy = '';
        flash(`Gagal membuat kartu: ${err.message}`);
      }
    }

    async function buildFromPage(selectionText) {
      if (!extractPage || V.busy) return;
      V.busy = 'Membaca halaman…';
      render();
      try {
        const result = extractPage(selectionText, PICK_MAX, baseLang());
        if (!result.words.length) {
          flash(selectionText
            ? 'Teks yang dipilih tidak punya kata yang cocok untuk dijadikan kartu.'
            : 'Tidak menemukan artikel di halaman ini. Coba blok teksnya dulu.');
          return;
        }
        V.busy = '';
        openPick(result);
      } catch (err) {
        flash(`Gagal membaca halaman: ${err.message}`);
      } finally {
        V.busy = '';
        render();
      }
    }

    // ---------- upload (page only) ----------

    function uploadView() {
      return `
        <div class="body" data-key="v:upload">
          ${title('Upload dokumen')}
          <label class="drop ${V.busy ? 'busy' : ''}" data-drop>
            <span class="empty-art">${V.busy ? '<span class="spinner big"></span>' : ICON.doc}</span>
            <b>${V.busy ? esc(V.busy) : 'Pilih dokumen, atau tarik ke sini'}</b>
            <span>PDF, Word (DOCX), EPUB, PowerPoint (PPTX), ODT, TXT, Markdown, HTML, subtitle SRT/VTT · maks. 25 MB</span>
            <input type="file" data-file accept="${DOC_ACCEPT}" ${V.busy ? 'disabled' : ''}>
          </label>
          <label class="field"><span>Bahasa dokumen</span>
            <select data-upload-lang>${langOptions(V.uploadLang, 'Deteksi otomatis')}</select></label>
          <p class="tip">Dokumen dibaca di komputer kamu dan tidak diunggah ke mana pun. Hanya kata yang kamu pilih yang dicarikan artinya.</p>
        </div>`;
    }

    async function handleFile(file) {
      if (!file || V.busy) return;
      if (!parseDocument) return;
      if (file.size > 25 * 1024 * 1024) { flash('Dokumen lebih dari 25 MB.'); return; }
      V.busy = `Membaca ${file.name}…`;
      render();
      try {
        const text = await parseDocument(file, (msg) => { V.busy = msg; render(); });
        const lang = V.uploadLang === 'auto' ? X().guessLang(text) : V.uploadLang;
        const words = X().fromDocument(text, { lang, maxCards: PICK_MAX, minLength: Number(S.settings.minLength) });
        V.busy = '';
        if (!words.length) { flash('Tidak ada kata yang bisa dijadikan kartu di dokumen ini.'); return; }
        openPick({ source: 'document', title: file.name.replace(/\.[^.]+$/, ''), lang, words });
      } catch (err) {
        V.busy = '';
        flash(err.message || 'Dokumen tidak bisa dibaca.');
      }
    }

    // ---------- settings ----------

    function select(name, value, options) {
      return `<select data-setting="${name}">${options.map(([v, label]) => `
        <option value="${esc(v)}" ${String(v) === String(value) ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select>`;
    }

    function settingsView() {
      const s = S.settings;
      const detected = defaultLang?.();
      return `
        <div class="body" data-key="v:settings">
          ${title('Pengaturan')}
          <label class="field"><span>Bahasa arti</span>
            ${select('target', s.target, LANGS)}
            <small>Kata diterjemahkan ke bahasa ini. Definisi lengkap hanya ada untuk kata bahasa Inggris.</small></label>
          <label class="field"><span>Bahasa sumber</span>
            ${select('source', s.source, [['auto', `Otomatis${detected ? ` (sekarang: ${langName(detected)})` : ''}`], ...LANGS])}</label>
          <label class="field"><span>Kata yang langsung dipilih per artikel/dokumen</span>
            ${select('maxCards', s.maxCards, [[10, '10 kata'], [20, '20 kata'], [30, '30 kata'], [50, '50 kata']])}</label>
          <label class="field"><span>Panjang kata minimal</span>
            ${select('minLength', s.minLength, [[3, '3 huruf'], [4, '4 huruf'], [5, '5 huruf'], [6, '6 huruf'], [7, '7 huruf']])}</label>
          <label class="field"><span>Tombol saat memblok teks</span>
            ${select('selectionBubble', String(s.selectionBubble !== false), [['true', 'Tampilkan'], ['false', 'Jangan tampilkan']])}</label>
          <label class="field"><span>Posisi widget</span>
            ${select('corner', s.corner, [['right', 'Pojok kanan bawah'], ['left', 'Pojok kiri bawah']])}</label>
          <p class="tip">Pintasan <span class="kbd">Alt+Shift+K</span> menampilkan atau menyembunyikan widget.</p>
        </div>`;
    }

    // ---------- actions ----------

    function step(delta) {
      const list = cardsInView();
      if (!list.length) return;
      setUi({ index: (currentIndex(list) + delta + list.length) % list.length });
    }

    function speak(text, lang) {
      if (!text || !('speechSynthesis' in globalThis)) return;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang || 'en';
      u.rate = 0.9;
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    }

    function flip() {
      V.flipped = !V.flipped;
      root.querySelector('.card')?.classList.toggle('flipped', V.flipped);
    }

    async function run(act, el) {
      const deckId = S.activeId;
      const word = el?.dataset.word;
      switch (act) {
        case 'open': setUi({ open: true }); break;
        case 'minimize': setUi({ open: false }); break;
        case 'hide': setUi({ hidden: true }); break;
        case 'nav':
          if (el.dataset.view === 'add' && V.view !== 'add') { openForm({}); break; }
          go(el.dataset.view);
          break;
        case 'open-app':
          if (page) go(el.dataset.hash || 'study');
          else await send({ type: 'openApp', hash: el.dataset.hash || '' });
          break;
        case 'flip': flip(); break;
        case 'prev': step(-1); break;
        case 'next': step(1); break;
        case 'speak': {
          const list = cardsInView();
          const card = list[currentIndex(list)];
          if (card) speak(card.display, card.lang || S.deck.lang);
          break;
        }
        case 'only-unknown': setUi({ onlyUnknown: !S.ui.onlyUnknown, index: 0 }); break;
        case 'grade': {
          const list = cardsInView();
          const card = list[currentIndex(list)];
          if (!card) break;
          const known = el.dataset.known === '1';
          // With the "unknown only" filter on, a card marked known leaves the list, so the
          // next card slides into the current index by itself.
          if (!(S.ui.onlyUnknown && known) && list.length > 1) setUi({ index: (currentIndex(list) + 1) % list.length });
          await send({ type: 'setKnown', deckId, word: card.word, known });
          break;
        }
        case 'build': await buildFromPage(opts.takeSelection?.() || ''); break;
        case 'shuffle': await send({ type: 'shuffle', deckId }); break;
        case 'retry': await send({ type: 'retry', deckId, word }); break;
        case 'retry-all': await send({ type: 'retry', deckId }); break;
        case 'reset-known': await send({ type: 'resetKnown', deckId }); break;
        case 'toggle-known': {
          const card = S.deck?.cards.find((c) => c.word === word);
          if (card) await send({ type: 'setKnown', deckId, word, known: !card.known });
          break;
        }
        case 'study-card': {
          const idx = S.deck.cards.findIndex((c) => c.word === word);
          setUi({ index: Math.max(0, idx), onlyUnknown: false });
          go('study');
          break;
        }
        case 'edit-card': {
          const card = S.deck?.cards.find((c) => c.word === word);
          if (!card) break;
          openForm({
            mode: 'edit',
            word: card.word,
            display: card.display,
            meaning: (card.translations || []).join(', '),
            context: card.context,
            lang: card.lang || S.deck.lang,
            returnTo: V.view === 'list' ? 'list' : 'study',
          });
          break;
        }
        case 'delete-card':
          if (globalThis.confirm(`Hapus kartu “${S.deck?.cards.find((c) => c.word === word)?.display || word}”?`)) {
            await send({ type: 'deleteCard', deckId, word });
          }
          break;
        case 'form-lookup': await lookupForm(); break;
        case 'use-meaning': {
          syncForm();
          V.form.meaning = el.dataset.value;
          V.form.fill = { meaning: V.form.meaning };
          render();
          break;
        }
        case 'form-delete':
          if (globalThis.confirm('Hapus kartu ini?')) {
            await send({ type: 'deleteCard', deckId, word: V.form.word });
            V.form = null;
            go(V.returnTo);
          }
          break;
        case 'toggle-chip': {
          const sel = V.pick.selected;
          if (sel.has(word)) sel.delete(word); else sel.add(word);
          render();
          break;
        }
        case 'pick-all': V.pick.items.forEach((w) => V.pick.selected.add(w.word)); render(); break;
        case 'pick-none': V.pick.selected.clear(); render(); break;
        case 'pick-create': await createFromPick(); break;
        case 'open-deck':
          await send({ type: 'setActive', deckId: el.dataset.id });
          go('study');
          break;
        case 'list-deck':
          V.filter = '';
          if (el.dataset.id !== S.activeId) await send({ type: 'setActive', deckId: el.dataset.id });
          go('list');
          break;
        case 'delete-deck': {
          const d = S.decks.find((x) => x.id === el.dataset.id);
          if (globalThis.confirm(`Hapus dek “${deckTitle(d)}” beserta ${d?.total ?? 0} kartunya?`)) {
            await send({ type: 'deleteDeck', deckId: el.dataset.id });
          }
          break;
        }
        default: break;
      }
    }

    // ---------- events ----------

    const onClick = (e) => {
      const el = e.target.closest('[data-act]');
      if (!el || el.disabled || !root.contains(el)) return;
      if (!alive()) { opts.onDead?.(); return; }
      run(el.dataset.act, el).catch((err) => flash(err.message));
    };

    const onChange = (e) => {
      const t = e.target;
      if (t.dataset.setting) {
        const key = t.dataset.setting;
        let value = t.value;
        if (['maxCards', 'minLength'].includes(key)) value = Number(value);
        if (key === 'selectionBubble') value = value === 'true';
        S.settings = { ...S.settings, [key]: value };
        render();
        if (alive()) local.set({ settings: S.settings }).catch(() => {});
      } else if (t.matches('[data-deck-select]')) {
        send({ type: 'setActive', deckId: t.value }).catch((err) => flash(err.message));
      } else if (t.matches('[data-pick-target]')) {
        V.pick.target = t.value;
      } else if (t.matches('[data-upload-lang]')) {
        V.uploadLang = t.value;
      } else if (t.matches('[data-file]')) {
        handleFile(t.files?.[0]);
        t.value = '';
      }
    };

    const onInput = (e) => {
      if (e.target.matches('[data-filter]')) { V.filter = e.target.value; render(); }
    };

    const onSubmit = (e) => {
      if (!e.target.matches('form[data-form]')) return;
      e.preventDefault();
      saveForm();
    };

    const onKey = (e) => {
      if (e.target.closest?.('input, textarea, select, [contenteditable]')) return;
      if (V.view !== 'study' || !S.deck) return;
      if (!page && !root.contains(e.target)) return;
      let handled = true;
      if (e.key === ' ' || (e.key === 'Enter' && e.target.closest?.('.card'))) flip();
      else if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === 'ArrowRight') step(1);
      else handled = false;
      if (handled) { e.preventDefault(); e.stopPropagation(); }
    };

    const onDrag = (e) => {
      if (!page || V.view !== 'upload') return;
      e.preventDefault();
      root.querySelector('[data-drop]')?.classList.toggle('over', e.type === 'dragover');
      if (e.type === 'drop') handleFile(e.dataTransfer?.files?.[0]);
    };

    root.addEventListener('click', onClick);
    root.addEventListener('change', onChange);
    root.addEventListener('input', onInput);
    root.addEventListener('submit', onSubmit);
    (page ? document : root).addEventListener('keydown', onKey);
    if (page) for (const t of ['dragover', 'dragleave', 'drop']) document.addEventListener(t, onDrag);

    // ---------- storage sync ----------

    async function loadDeck(id) {
      if (!id) { S.deck = null; return; }
      const key = `deck:${id}`;
      S.deck = (await local.get(key))[key] || null;
    }

    const onStorage = async (changes, area) => {
      if (area !== 'local' || destroyed) return;
      let dirty = false;
      if (changes.settings) { S.settings = { ...DEFAULT_SETTINGS, ...changes.settings.newValue }; dirty = true; }
      if (changes.ui) { S.ui = { ...DEFAULT_UI, ...changes.ui.newValue }; dirty = true; }
      if (changes.decks) { S.decks = changes.decks.newValue || []; dirty = true; }
      if (changes.activeDeckId) {
        S.activeId = changes.activeDeckId.newValue || null;
        await loadDeck(S.activeId);
        dirty = true;
      } else if (S.activeId && changes[`deck:${S.activeId}`]) {
        S.deck = changes[`deck:${S.activeId}`].newValue || null;
        dirty = true;
      }
      if (dirty) render();
      opts.onState?.(S);
    };
    api.storage.onChanged.addListener(onStorage);

    async function init() {
      const got = await local.get(['settings', 'ui', 'decks', 'activeDeckId']);
      S.settings = { ...DEFAULT_SETTINGS, ...got.settings };
      S.ui = { ...DEFAULT_UI, ...got.ui };
      S.decks = got.decks || [];
      S.activeId = got.activeDeckId || null;
      await loadDeck(S.activeId);
      draw();
      opts.onState?.(S);
    }

    function destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      clearTimeout(toastTimer);
      try { api.storage.onChanged.removeListener(onStorage); } catch { /* context already gone */ }
      if (page) {
        document.removeEventListener('keydown', onKey);
        for (const t of ['dragover', 'dragleave', 'drop']) document.removeEventListener(t, onDrag);
      }
    }

    init().catch(() => {});

    return {
      state: S,
      render,
      go,
      flash,
      openForm,
      openPick,
      buildFromPage,
      handleFile,
      setUi,
      destroy,
      get view() { return V.view; },
    };
  }

  globalThis.LX.createUI = createUI;
})();
