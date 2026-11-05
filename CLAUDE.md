# CLAUDE.md

Lexiflip: a Manifest V3 browser extension (Chrome, Edge, Firefox) for memorizing vocabulary with
flashcards made from web pages, uploaded documents, selected text, or words the user types in. A
floating widget sits in the bottom corner of every page; a full study page (`app/app.html`) and a
toolbar popup work anywhere. Plain JavaScript, no bundler. The only npm dependency is `pdfjs-dist`
(copied unmodified into `vendor/` at build). UI copy is Indonesian; README is Indonesian; code,
comments, PRIVACY.md and docs/STORE.md are English.

## Commands

- `npm install` once (pdf.js). `npm test` (node:test, runs `src/` scripts inside `vm` with stubbed
  browser APIs and a fake network shaped like real MyMemory/dictionary answers).
- `npm run build` → `dist/<browser>/` + `dist/lexiflip-<browser>-<version>.zip`. It also checks that
  every file referenced by the manifest and by the extension pages' `<script>` tags exists, and
  syntax-checks every `.js`.
- `npm run icons` regenerates `src/icons/*.png`; `npm run lint:firefox` runs `web-ext lint` (the only
  expected warnings are the pdf.js ones under `vendor/`).

## Architecture

- There is no manifest in `src/`. `scripts/build.mjs` generates one per browser: Chrome/Edge get
  `background.service_worker`, Firefox gets `background.scripts` + `browser_specific_settings`.
  Never change `GECKO_ID` (AMO identifies the add-on by it). Content script order is
  `CONTENT_SCRIPTS` there: core → extract → styles → ui → widget.
- Use `LX.api` (`browser ?? chrome`) and promise-style calls only. Don't pass callbacks (Firefox's
  `browser.*` rejects them). For `runtime.onMessage`, reply with `sendResponse` + `return true`.
- All scripts except `vendor/*.mjs` are classic scripts talking through globals: `LX` (core.js,
  plus `LX.createUI` from ui.js), `LexiflipExtract`, `LexiflipCSS`, `LexiflipDocs` (app page only).
  Shared files always overwrite their global: after an update, `background.js` re-injects the
  content scripts into open tabs (`injectIntoOpenTabs`) and the new widget retires the stale,
  disconnected one (`globalThis.__lexiflip`, `teardown()`).
- `shared/ui.js` is the whole interface for both the widget (`mode: 'widget'`) and the study page
  (`mode: 'page'`). Widget-only bits (floating button, page extraction, selection popover) live in
  `content/widget.js`; document parsing lives in `app/docparse.js`.
- `background.js` is the only writer of `deck:<id>` and `decks`, serialising writes through
  `serial()`. UIs send messages (`createDeck`, `addCards`, `updateCard`, `setKnown`, `lookupWord`…)
  and write only `ui` and `settings` directly. Every UI re-renders from `storage.onChanged`, which
  keeps all tabs and windows in sync. Don't add direct deck writes elsewhere.
- Cards are keyed by `cardKey(word)` (case-folded) within a deck; adding an existing word merges.
  `manualMeaning: true` means the user typed the meaning, and lookups must never overwrite it
  (`applyLookup`). The deck id `mine` is "Kosakata saya": created on first manual add, pinned
  first, never pruned by the 30-deck limit.
- Storage keys: `settings`, `ui`, `decks` (meta list), `activeDeckId`, `deck:<id>`,
  `cache:<CACHE_VERSION>:<src>:<tgt>:<word>`. Bump `CACHE_VERSION` when lookup output or cleaning
  changes.
- Rendering: build an HTML string, then `LX.morph(root, html)`, which patches the existing DOM
  instead of replacing it. Never go back to `innerHTML` re-renders: replacing the panel on every
  storage change replayed animations, reset the progress bar, cut the flip transition and lost
  scroll/focus (the "glitch" bug). Give a node `data-key` when it must be replaced rather than
  patched (each view's `.body`, the card per word, the form per `formSeq`). Every interpolated
  value goes through `esc()`. Inline `style=""` is never diffed; set styles through the CSSOM
  after render (progress bar, popover position).
- `<button>` defaults to `type="submit"`: buttons inside the form that aren't the submit button
  need `type="button"`. The form saves through its `submit` event.
- The widget lives in a closed shadow root under `<lexiflip-widget>` on `documentElement`. Styles
  go in through `adoptedStyleSheets` (exempt from page CSP). Key events are stopped at the shadow
  root so typing in Lexiflip never triggers site shortcuts. Sizes are in px because rem follows the
  host page.

## External services

- Definitions: `api.dictionaryapi.dev` (English only, 404 = not found, frequent 429/502 → retried
  by `fetchJson`).
- Translations: MyMemory `api.mymemory.translated.net` (anonymous quota ≈5k chars/day/IP). Its own
  ordering is unreliable for single words; `rankTranslations()` scores candidates (votes, MT bonus,
  ALL-CAPS penalty, loanword tie-break) and has tests with real-shaped data. When it only echoes
  the word, `defTranslation` (the translated English definition) is shown instead.
- Adding another host requires updating `host_permissions` in build.mjs, PRIVACY.md and the
  permission table in docs/STORE.md.
