// Lexiflip stylesheet, shared by the widget (adopted inside its shadow root), the study page
// and the popup. Kept as a string so the content script needs no web_accessible_resource.
// Sizes are in px on purpose: rem would follow the host page's root font size.
globalThis.LexiflipCSS = `
:host { all: initial; }
*, *::before, *::after { box-sizing: border-box; }

.lf {
  --bg: #ffffff;
  --fg: #1d2030;
  --muted: #6a6f82;
  --line: #e5e6ee;
  --soft: #f3f4f9;
  --accent: #4f46e5;
  --accent-hover: #4338ca;
  --accent-fg: #ffffff;
  --accent-soft: #eceefe;
  --ok: #0b8a4c;
  --ok-soft: #e3f6ec;
  --warn: #b7410e;
  --warn-soft: #fdeee6;
  --mark: #fff0a3;
  --mark-fg: #1d2030;
  --shadow: 0 14px 36px rgba(18, 20, 38, .20), 0 2px 6px rgba(18, 20, 38, .10);

  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 2147483647;
  font: 14px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  color: var(--fg);
  text-align: left;
  -webkit-font-smoothing: antialiased;
}
.lf[data-corner="left"] { right: auto; left: 20px; }
.lf[hidden] { display: none; }
.lf.layer { position: static; }

@media (prefers-color-scheme: dark) {
  .lf {
    --bg: #1b1d27;
    --fg: #e9eaf2;
    --muted: #9a9fb3;
    --line: #2e3140;
    --soft: #252836;
    --accent: #818cf8;
    --accent-hover: #a5b4fc;
    --accent-fg: #11121a;
    --accent-soft: #2a2d48;
    --ok: #4ade80;
    --ok-soft: #173326;
    --warn: #fb923c;
    --warn-soft: #3a2418;
    --mark: #5b4d12;
    --mark-fg: #fff6cc;
    --shadow: 0 14px 36px rgba(0, 0, 0, .55), 0 2px 6px rgba(0, 0, 0, .35);
  }
}

button, select, input, textarea {
  font: inherit;
  color: inherit;
  margin: 0;
}
button {
  background: none;
  border: 0;
  padding: 0;
  cursor: pointer;
}
button:disabled { cursor: default; opacity: .45; }
button:focus-visible, select:focus-visible, input:focus-visible, textarea:focus-visible, .card:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
svg { display: block; flex: none; }
.grow { flex: 1; min-width: 0; }

/* ---------- collapsed bubble ---------- */
.fab {
  position: relative;
  width: 52px;
  height: 52px;
  border-radius: 16px;
  display: grid;
  place-items: center;
  background: var(--accent);
  color: var(--accent-fg);
  box-shadow: var(--shadow);
  transition: transform .15s ease, background .15s ease;
}
.fab:hover { transform: translateY(-2px); background: var(--accent-hover); }
.badge {
  position: absolute;
  top: -6px;
  right: -6px;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  background: var(--bg);
  color: var(--accent);
  font-size: 11px;
  font-weight: 700;
  box-shadow: 0 1px 4px rgba(0, 0, 0, .25);
}

/* ---------- panel ---------- */
.panel {
  width: 360px;
  max-width: calc(100vw - 24px);
  max-height: calc(100vh - 40px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 16px;
  box-shadow: var(--shadow);
  animation: lf-in .16s ease-out;
}
@keyframes lf-in { from { opacity: 0; transform: translateY(8px); } }
@media (prefers-reduced-motion: reduce) {
  .panel, .pop, .bubble { animation: none; }
  .inner { transition: none !important; }
}

.head {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 10px 8px 10px 12px;
  border-bottom: 1px solid var(--line);
}
.brand { flex: 1; min-width: 0; display: flex; align-items: center; gap: 9px; }
.logo {
  width: 28px; height: 28px; border-radius: 8px; flex: none;
  display: grid; place-items: center;
  background: var(--accent); color: var(--accent-fg);
}
.brand-text { min-width: 0; }
.brand-name { font-weight: 700; font-size: 14px; line-height: 1.2; }
.brand-sub {
  display: block; font-size: 12px; color: var(--muted); line-height: 1.3;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.icon-btn {
  width: 28px; height: 28px; border-radius: 8px; flex: none;
  display: grid; place-items: center;
  color: var(--muted);
}
.icon-btn:hover:not(:disabled) { background: var(--soft); color: var(--fg); }
.icon-btn[aria-pressed="true"] { color: var(--accent); background: var(--accent-soft); }

.body { padding: 14px; overflow: auto; overscroll-behavior: contain; }
.foot {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 14px; border-top: 1px solid var(--line);
  font-size: 12px; color: var(--muted);
}

.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  height: 36px; padding: 0 14px; border-radius: 10px;
  font-weight: 600; font-size: 13px;
  background: var(--soft); color: var(--fg);
}
.btn:hover:not(:disabled) { background: var(--line); }
.btn.primary { background: var(--accent); color: var(--accent-fg); }
.btn.primary:hover:not(:disabled) { background: var(--accent-hover); }
.btn.ok { background: var(--ok-soft); color: var(--ok); }
.btn.warn { background: var(--warn-soft); color: var(--warn); }
.btn.small { height: 30px; padding: 0 10px; font-size: 12px; border-radius: 8px; }
.btn.block { width: 100%; }
.btn-row { display: flex; gap: 8px; margin-top: 8px; }
.btn-row > .btn { flex: 1; }
.link-btn { display: inline-flex; align-items: center; gap: 4px; color: var(--accent); font-weight: 600; font-size: 12px; }
.link-btn:hover:not(:disabled) { text-decoration: underline; }

/* ---------- messages ---------- */
.empty { text-align: center; padding: 6px 2px 2px; }
.empty-art { width: 56px; height: 56px; margin: 0 auto 10px; border-radius: 16px; display: grid; place-items: center; background: var(--accent-soft); color: var(--accent); }
.empty h3 { margin: 0 0 6px; font-size: 15px; }
.empty p { margin: 0 0 14px; color: var(--muted); font-size: 13px; }
.tip { margin: 10px 0 0; font-size: 12px; color: var(--muted); }
.toast {
  margin: 10px 14px 0; padding: 8px 10px; border-radius: 8px;
  background: var(--warn-soft); color: var(--warn); font-size: 12px;
}
.toast.ok { background: var(--ok-soft); color: var(--ok); }

/* ---------- progress ---------- */
.progress { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; font-size: 12px; color: var(--muted); }
.bar { flex: 1; height: 6px; border-radius: 3px; background: var(--soft); overflow: hidden; }
.bar > span { display: block; height: 100%; width: 0; background: var(--ok); border-radius: 3px; transition: width .25s ease; }
.deck-line { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 10px; font-size: 15px; }

/* ---------- flip card ---------- */
.card {
  display: block; width: 100%; height: 232px;
  perspective: 1000px; border-radius: 14px;
  cursor: pointer; text-align: inherit;
}
.inner {
  position: relative; width: 100%; height: 100%;
  transform-style: preserve-3d;
  transition: transform .45s cubic-bezier(.2, .7, .2, 1);
}
.card.flipped .inner { transform: rotateY(180deg); }
.face {
  position: absolute; inset: 0;
  -webkit-backface-visibility: hidden; backface-visibility: hidden;
  border-radius: 14px; border: 1px solid var(--line);
  background: var(--soft);
  padding: 16px;
  display: flex; flex-direction: column;
}
.front { align-items: center; justify-content: center; text-align: center; gap: 6px; }
.back { transform: rotateY(180deg); background: var(--bg); overflow: auto; gap: 10px; cursor: auto; }
.word { font-size: 28px; font-weight: 700; line-height: 1.15; word-break: break-word; }
.phon { color: var(--muted); font-size: 14px; }
.hint { position: absolute; bottom: 12px; left: 0; right: 0; font-size: 11px; color: var(--muted); }
.known-tag {
  position: absolute; top: 12px; right: 12px;
  font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 99px;
  background: var(--ok-soft); color: var(--ok);
}

.back-word { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.back-word strong { font-size: 17px; }
.back-word span { font-size: 12px; color: var(--muted); }
.back-actions { margin-top: auto; display: flex; justify-content: flex-end; }
.label { font-size: 11px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: var(--muted); margin-bottom: 2px; }
.trans { font-size: 18px; font-weight: 600; color: var(--accent); line-height: 1.3; }
.trans small { display: block; font-size: 13px; font-weight: 400; color: var(--muted); }
.lf .trans.long, .lf.page .trans.long { font-size: 15px; font-weight: 500; }
.sense { font-size: 13px; margin: 0 0 4px; }
.pos { display: inline-block; font-size: 11px; font-style: italic; color: var(--muted); margin-right: 4px; }
.context { font-size: 13px; color: var(--muted); margin: 0; border-left: 3px solid var(--line); padding-left: 8px; }
.context mark { background: var(--mark); color: var(--mark-fg); border-radius: 3px; padding: 0 2px; }
.state { display: flex; align-items: center; gap: 8px; color: var(--muted); font-size: 13px; flex-wrap: wrap; }
.state.error { color: var(--warn); align-items: flex-start; flex-direction: column; }
.spinner {
  width: 14px; height: 14px; border-radius: 50%; flex: none;
  border: 2px solid var(--line); border-top-color: var(--accent);
  animation: lf-spin .8s linear infinite;
}
.spinner.big { width: 26px; height: 26px; border-width: 3px; }
@keyframes lf-spin { to { transform: rotate(360deg); } }

/* ---------- controls under the card ---------- */
.nav { display: flex; align-items: center; justify-content: space-between; margin: 10px 0; }
.nav-group { display: flex; align-items: center; gap: 2px; }
.count { font-size: 13px; font-variant-numeric: tabular-nums; min-width: 56px; text-align: center; }
.grade { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }

/* ---------- forms ---------- */
.view-title { display: flex; align-items: center; gap: 6px; margin: 0 0 12px; font-size: 15px; font-weight: 700; }
.field { display: block; margin-bottom: 12px; min-width: 0; }
.field > span { display: block; font-size: 12px; font-weight: 600; margin-bottom: 4px; }
.field > span small { font-weight: 400; color: var(--muted); }
.field select, .field input, .field textarea, .list-tools select, .pop-foot select {
  width: 100%; min-height: 36px; padding: 7px 10px; border-radius: 10px;
  border: 1px solid var(--line); background: var(--bg); color: var(--fg);
}
.field textarea { resize: vertical; min-height: 64px; line-height: 1.4; }
.field input:focus, .field textarea:focus, .field select:focus { border-color: var(--accent); outline: none; }
.field small { display: block; margin-top: 4px; font-size: 11px; color: var(--muted); }
.field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.field-row > .field:only-child { grid-column: 1 / -1; }
.field-tools { margin: -6px 0 10px; }
.form-actions { display: flex; align-items: center; gap: 8px; }
.preview { background: var(--soft); border-radius: 10px; padding: 10px; margin-bottom: 12px; display: flex; flex-direction: column; gap: 6px; }

/* ---------- chips ---------- */
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chips.pick { max-height: 260px; overflow: auto; padding: 2px; margin-bottom: 12px; }
.chip {
  display: inline-flex; align-items: baseline; gap: 4px;
  padding: 5px 10px; border-radius: 99px; font-size: 13px;
  border: 1px solid var(--line); background: var(--bg); color: var(--fg);
}
.chip small { font-size: 10px; color: var(--muted); }
.chip:hover { border-color: var(--accent); }
.chip[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); color: var(--accent-fg); }
.chip[aria-pressed="true"] small { color: inherit; opacity: .8; }
.chip.small { padding: 3px 9px; font-size: 12px; }
.pick-tools { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; font-size: 12px; color: var(--muted); }

/* ---------- word list ---------- */
.list-tools { display: flex; gap: 8px; margin-bottom: 8px; }
.list-tools select { flex: 1; min-width: 0; }
.search {
  display: flex; align-items: center; gap: 6px; margin-bottom: 10px;
  padding: 0 10px; border: 1px solid var(--line); border-radius: 10px; color: var(--muted);
}
.search input { flex: 1; min-width: 0; height: 34px; border: 0; background: none; color: var(--fg); outline: none; }
.word-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.row { display: flex; align-items: center; gap: 4px; padding: 4px 0; border-bottom: 1px solid var(--line); }
.row:last-child { border-bottom: 0; }
.tick {
  width: 22px; height: 22px; border-radius: 50%; flex: none; margin-right: 4px;
  display: grid; place-items: center; border: 1.5px solid var(--line); color: transparent;
}
.tick:hover { border-color: var(--ok); color: var(--ok); }
.tick[aria-pressed="true"] { background: var(--ok); border-color: var(--ok); color: var(--bg); }
.row-main { flex: 1; min-width: 0; display: flex; flex-direction: column; text-align: left; padding: 4px 2px; }
.row-word { font-weight: 600; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.row-mean { font-size: 12px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* ---------- decks ---------- */
.deck-list { list-style: none; margin: 12px 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.deck {
  display: flex; align-items: center; gap: 2px;
  border: 1px solid var(--line); border-radius: 10px; padding: 4px 4px 4px 0;
}
.deck.active { border-color: var(--accent); background: var(--accent-soft); }
.deck-open { flex: 1; min-width: 0; text-align: left; padding: 6px 4px 6px 10px; }
.deck-title { display: block; font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.deck-meta { display: block; font-size: 11px; color: var(--muted); }
.kbd { font-family: ui-monospace, Consolas, monospace; font-size: 11px; padding: 1px 5px; border-radius: 4px; border: 1px solid var(--line); background: var(--soft); }

/* ---------- upload ---------- */
.drop {
  position: relative; display: flex; flex-direction: column; align-items: center; gap: 6px;
  padding: 28px 16px; margin-bottom: 14px; text-align: center; cursor: pointer;
  border: 2px dashed var(--line); border-radius: 14px; color: var(--muted); font-size: 12px;
}
.drop b { color: var(--fg); font-size: 14px; }
.drop:hover, .drop.over { border-color: var(--accent); background: var(--accent-soft); }
.drop.busy { cursor: progress; }
.drop .empty-art { margin: 0 0 4px; }
.drop input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
.drop.busy input { cursor: progress; }

/* ---------- selection helper ---------- */
.bubble, .pop { position: fixed; z-index: 2147483647; animation: lf-in .12s ease-out; }
.bubble {
  display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 12px;
  border-radius: 99px; background: var(--accent); color: var(--accent-fg);
  font-size: 13px; font-weight: 600; box-shadow: var(--shadow); white-space: nowrap;
}
.bubble:hover { background: var(--accent-hover); }
.pop {
  width: 300px; max-width: calc(100vw - 16px); max-height: 70vh; overflow: auto;
  display: flex; flex-direction: column; gap: 8px; padding: 12px;
  background: var(--bg); border: 1px solid var(--line); border-radius: 14px; box-shadow: var(--shadow);
}
.pop .field { margin: 0; }
.pop .toast { margin: 0; }
.pop .link-btn { align-self: flex-start; }
.pop-head { display: flex; align-items: center; gap: 2px; }
.pop-word { flex: 1; min-width: 0; display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.pop-word b { font-size: 18px; word-break: break-word; }
.pop-foot { display: flex; gap: 6px; align-items: center; }
.pop-foot select { flex: 1; min-width: 0; min-height: 30px; padding: 4px 8px; border-radius: 8px; font-size: 12px; }

/* ---------- full study page ---------- */
.lf.page { position: static; z-index: auto; min-height: 100vh; background: var(--soft); }
.lf.page .app-head {
  position: sticky; top: 0; z-index: 2; display: flex; align-items: center; gap: 24px; flex-wrap: wrap;
  padding: 10px 24px; background: var(--bg); border-bottom: 1px solid var(--line);
}
.lf.page .brand { flex: none; }
.lf.page .brand-name { font-size: 16px; }
.lf.page .tabs { display: flex; gap: 4px; flex-wrap: wrap; }
.lf.page .tab {
  display: inline-flex; align-items: center; gap: 6px; height: 36px; padding: 0 12px;
  border-radius: 10px; color: var(--muted); font-weight: 600; font-size: 13px;
}
.lf.page .tab:hover { background: var(--soft); color: var(--fg); }
.lf.page .tab[aria-current="page"] { background: var(--accent-soft); color: var(--accent); }
.lf.page .app-main { max-width: 760px; margin: 0 auto; padding: 24px 16px 48px; }
.lf.page .toast { margin: 0 0 12px; }
.lf.page .panel { width: auto; max-width: none; max-height: none; box-shadow: none; animation: none; overflow: visible; }
.lf.page .body { padding: 22px; overflow: visible; }
.lf.page .card { height: 320px; }
.lf.page .word { font-size: 40px; }
.lf.page .trans { font-size: 22px; }
.lf.page .chips.pick { max-height: 420px; }
.lf.page .empty .btn + .btn { margin-left: 8px; }
@media (max-width: 560px) {
  .lf.page .app-head { padding: 10px 12px; gap: 8px; }
  .lf.page .tab span { display: none; }
  .lf.page .body { padding: 14px; }
  .lf.page .card { height: 260px; }
  .field-row { grid-template-columns: 1fr; }
}

/* ---------- toolbar popup ---------- */
.lf.popup { position: static; width: 300px; padding: 12px; background: var(--bg); }
.lf.popup .brand { margin-bottom: 10px; }
.lf.popup .stats { margin: 0 0 12px; font-size: 13px; color: var(--muted); }
.lf.popup .stats b { color: var(--fg); }
.lf.popup .menu { display: flex; flex-direction: column; gap: 6px; }
.lf.popup .menu .btn { justify-content: flex-start; }
`;
