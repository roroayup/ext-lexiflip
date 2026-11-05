# CLAUDE.md

Lexiflip: a Manifest V3 browser extension (Chrome, Edge, Firefox) that turns the article on the
current page into vocabulary flashcards, shown in a floating widget in the bottom corner. Plain
JavaScript, no bundler, no npm dependencies. UI copy is Indonesian; README is Indonesian;
code, comments, PRIVACY.md and docs/STORE.md are English.

## Commands

- `npm test` (node:test, runs `src/` scripts inside `vm` with stubbed browser APIs)
- `npm run build` → `dist/<browser>/` + `dist/lexiflip-<browser>-<version>.zip`. It also
  checks that every manifest-referenced file exists and syntax-checks every script.
- `npm run icons` regenerates `src/icons/*.png`; `npm run lint:firefox` runs `web-ext lint`.

## Architecture

- There is no manifest in `src/`. `scripts/build.mjs` generates one per browser: Chrome/Edge get
  `background.service_worker`, Firefox gets `background.scripts` + `browser_specific_settings`.
  Never change `GECKO_ID` (AMO identifies the add-on by it).
- Use `const api = globalThis.browser ?? globalThis.chrome` and promise-style calls only. Don't
  pass callbacks (Firefox's `browser.*` rejects them). For `runtime.onMessage`, reply with
  `sendResponse` + `return true`. Chrome ignores a returned promise.
- All scripts are classic scripts, not modules. Content scripts share one isolated world and
  talk through globals: `LexiflipExtract` (extract.js), `LexiflipCSS` (styles.js); widget.js
  loads last.
- `background.js` is the only writer of `deck:<id>` and `decks`, and it serialises writes
  through `serial()`. Content scripts send messages for deck changes and write only `ui` and
  `settings` directly. Every tab re-renders from `storage.onChanged`, which is what keeps the
  widget in sync across tabs and windows. Don't add direct deck writes from content scripts.
- Storage keys: `settings`, `ui`, `decks` (meta list), `activeDeckId`, `deck:<id>`,
  `cache:<CACHE_VERSION>:<src>:<tgt>:<word>`. Bump `CACHE_VERSION` when lookup output or
  cleaning changes.
- The widget lives in a closed shadow root under `<lexiflip-widget>` on `documentElement`.
  Styles go in through `adoptedStyleSheets` (exempt from page CSP). Don't use inline `style=""`
  attributes in rendered HTML. Set styles through the CSSOM after render (see the progress bar).
  Sizes are in px because rem follows the host page.
- Rendering is a full `innerHTML` re-render with `data-act` event delegation. Every
  interpolated value must go through `esc()`. Elements that should keep focus across
  re-renders get `data-focus-key`.

## External services

- Definitions: `api.dictionaryapi.dev` (English only, 404 = not found).
- Translations: MyMemory `api.mymemory.translated.net` (anonymous quota ≈5k chars/day/IP).
  Output is crowd-sourced. `cleanTranslation()` decodes entities and normalises case and
  punctuation, and has tests.
- Adding another host requires updating `host_permissions` in build.mjs, PRIVACY.md and the
  permission table in docs/STORE.md.
