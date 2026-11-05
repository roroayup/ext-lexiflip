// Widget stylesheet. Kept as a string so widget.js can adopt it inside its shadow root
// without exposing a web_accessible_resource. Sizes are in px on purpose: rem would follow
// the host page's root font size.
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

button, select {
  font: inherit;
  color: inherit;
  background: none;
  border: 0;
  margin: 0;
  padding: 0;
  cursor: pointer;
}
button:disabled { cursor: default; opacity: .45; }
button:focus-visible, select:focus-visible, .card:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
svg { display: block; flex: none; }

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
  width: 344px;
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
  .panel { animation: none; }
  .inner { transition: none !important; }
}

.head {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 10px 8px 10px 14px;
  border-bottom: 1px solid var(--line);
}
.brand { flex: 1; min-width: 0; display: flex; align-items: center; gap: 9px; }
.logo {
  width: 28px; height: 28px; border-radius: 8px;
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
  width: 30px; height: 30px; border-radius: 8px;
  display: grid; place-items: center;
  color: var(--muted);
}
.icon-btn:hover:not(:disabled) { background: var(--soft); color: var(--fg); }
.icon-btn[aria-pressed="true"] { color: var(--accent); background: var(--accent-soft); }

.body { padding: 14px; overflow: auto; }
.foot {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 14px; border-top: 1px solid var(--line);
  font-size: 12px; color: var(--muted);
}
.foot .grow { flex: 1; min-width: 0; }

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
.btn.small { height: 28px; padding: 0 10px; font-size: 12px; border-radius: 8px; }
.btn.block { width: 100%; }
.link-btn { color: var(--accent); font-weight: 600; font-size: 12px; }
.link-btn:hover { text-decoration: underline; }

/* ---------- empty / message states ---------- */
.empty { text-align: center; padding: 10px 4px 4px; }
.empty-art { width: 56px; height: 56px; margin: 0 auto 10px; border-radius: 16px; display: grid; place-items: center; background: var(--accent-soft); color: var(--accent); }
.empty h3 { margin: 0 0 6px; font-size: 15px; }
.empty p { margin: 0 0 14px; color: var(--muted); font-size: 13px; }
.tip { margin-top: 12px; font-size: 12px; color: var(--muted); }
.toast {
  margin: 0 14px 0; padding: 8px 10px; border-radius: 8px;
  background: var(--warn-soft); color: var(--warn); font-size: 12px;
}
.toast:first-child { margin-top: 12px; }

/* ---------- progress ---------- */
.progress { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; font-size: 12px; color: var(--muted); }
.bar { flex: 1; height: 6px; border-radius: 3px; background: var(--soft); overflow: hidden; }
.bar > span { display: block; height: 100%; width: 0; background: var(--ok); border-radius: 3px; transition: width .25s ease; }

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
.label { font-size: 11px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: var(--muted); margin-bottom: 2px; }
.trans { font-size: 18px; font-weight: 600; color: var(--accent); line-height: 1.3; }
.trans small { display: block; font-size: 13px; font-weight: 400; color: var(--muted); }
.sense { font-size: 13px; margin: 0 0 4px; }
.pos { display: inline-block; font-size: 11px; font-style: italic; color: var(--muted); margin-right: 4px; }
.context { font-size: 13px; color: var(--muted); margin: 0; border-left: 3px solid var(--line); padding-left: 8px; }
.context mark { background: var(--mark); color: var(--mark-fg); border-radius: 3px; padding: 0 2px; }
.state { display: flex; align-items: center; gap: 8px; color: var(--muted); font-size: 13px; }
.state.error { color: var(--warn); align-items: flex-start; flex-direction: column; }
.spinner {
  width: 14px; height: 14px; border-radius: 50%;
  border: 2px solid var(--line); border-top-color: var(--accent);
  animation: lf-spin .8s linear infinite;
}
@keyframes lf-spin { to { transform: rotate(360deg); } }

/* ---------- controls under the card ---------- */
.nav { display: flex; align-items: center; justify-content: space-between; margin: 10px 0; }
.nav-group { display: flex; align-items: center; gap: 2px; }
.count { font-size: 13px; font-variant-numeric: tabular-nums; min-width: 56px; text-align: center; }
.grade { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }

/* ---------- settings / decks ---------- */
.view-title { display: flex; align-items: center; gap: 6px; margin: 0 0 12px; font-size: 15px; font-weight: 700; }
.field { display: block; margin-bottom: 12px; }
.field > span { display: block; font-size: 12px; font-weight: 600; margin-bottom: 4px; }
.field select {
  width: 100%; height: 36px; padding: 0 10px; border-radius: 10px;
  border: 1px solid var(--line); background: var(--bg);
}
.field small { display: block; margin-top: 4px; font-size: 11px; color: var(--muted); }
.deck-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.deck {
  display: flex; align-items: center; gap: 6px;
  border: 1px solid var(--line); border-radius: 10px; padding: 4px 4px 4px 0;
}
.deck.active { border-color: var(--accent); background: var(--accent-soft); }
.deck-open { flex: 1; min-width: 0; text-align: left; padding: 6px 4px 6px 10px; }
.deck-title { display: block; font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.deck-meta { display: block; font-size: 11px; color: var(--muted); }
.kbd { font-family: ui-monospace, Consolas, monospace; font-size: 11px; padding: 1px 5px; border-radius: 4px; border: 1px solid var(--line); background: var(--soft); }
`;
