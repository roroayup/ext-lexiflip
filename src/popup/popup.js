// Toolbar popup: show/hide the widget on this page, or open the study page. Always
// available, including on pages where the widget itself can't run.
(() => {
  'use strict';

  const { api, ICON, DEFAULT_UI, MINE, MINE_TITLE, esc, morph } = globalThis.LX;
  const style = document.createElement('style');
  style.textContent = globalThis.LexiflipCSS;
  document.head.append(style);
  const root = document.getElementById('popup');

  let ui = { ...DEFAULT_UI };

  async function draw() {
    const got = await api.storage.local.get(['ui', 'decks', 'activeDeckId']);
    ui = { ...DEFAULT_UI, ...got.ui };
    const decks = got.decks || [];
    const active = decks.find((d) => d.id === got.activeDeckId);
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    // Without the "tabs" permission the URL is only visible on http(s) pages, which are
    // exactly the pages the widget can run on.
    const canWidget = /^https?:/.test(tab?.url || '');
    const showing = !ui.hidden && ui.open;
    const left = active ? active.total - active.known : 0;

    morph(root, `
      <div class="brand"><div class="logo">${ICON.logo()}</div><div class="brand-name">Lexiflip</div></div>
      <p class="stats">${active
        ? `<b>${esc(active.id === MINE ? MINE_TITLE : active.title)}</b><br>${left ? `${left} kartu belum hafal` : 'Semua kartu sudah hafal'} · ${active.total} kartu`
        : 'Belum ada kartu. Tambahkan kata atau buat dari artikel.'}</p>
      <div class="menu">
        ${canWidget ? `<button class="btn ${showing ? '' : 'primary'}" data-act="toggle">${ICON.logo(16)} ${showing ? 'Sembunyikan widget' : 'Tampilkan widget di halaman ini'}</button>` : ''}
        <button class="btn ${canWidget ? '' : 'primary'}" data-act="app" data-hash="study">${ICON.external} Buka halaman belajar</button>
        <button class="btn" data-act="app" data-hash="add">${ICON.plus} Tambah kata</button>
        <button class="btn" data-act="app" data-hash="upload">${ICON.upload} Upload dokumen</button>
      </div>
      ${canWidget ? '' : '<p class="tip">Widget tidak bisa tampil di halaman ini (halaman browser atau toko ekstensi). Pakai halaman belajar.</p>'}
      <p class="tip">Pintasan: <span class="kbd">Alt+Shift+K</span></p>`);
  }

  root.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    if (el.dataset.act === 'toggle') {
      const showing = !ui.hidden && ui.open;
      await api.storage.local.set({ ui: { ...ui, ...(showing ? { hidden: true } : { hidden: false, open: true }) } });
    } else {
      await api.tabs.create({ url: api.runtime.getURL('app/app.html') + `#${el.dataset.hash}` });
    }
    window.close();
  });

  draw();
})();
