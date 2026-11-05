import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

// Loads background.js against an in-memory storage and a fake network.
function loadBackground(fetchImpl) {
  const store = {};
  const listeners = {};
  const event = (name) => ({ addListener: (fn) => { listeners[name] = fn; } });
  const chrome = {
    storage: {
      local: {
        async get(keys) {
          const list = Array.isArray(keys) ? keys : [keys];
          return Object.fromEntries(list.filter((k) => k in store).map((k) => [k, structuredClone(store[k])]));
        },
        async set(obj) { Object.assign(store, structuredClone(obj)); },
        async remove(keys) { for (const k of [].concat(keys)) delete store[k]; },
      },
    },
    runtime: { onMessage: event('message'), onInstalled: event('installed'), onStartup: event('startup') },
    action: { onClicked: event('action') },
    commands: { onCommand: event('command') },
    contextMenus: { onClicked: event('menu'), removeAll: async () => {}, create() {} },
    tabs: { sendMessage: async () => {} },
  };
  const ctx = createContext({ chrome, fetch: fetchImpl, AbortSignal, structuredClone, console, Promise, setTimeout });
  ctx.globalThis = ctx;
  runInContext(readFileSync(new URL('../src/background.js', import.meta.url), 'utf8'), ctx);
  const send = (msg) => new Promise((resolve) => listeners.message(msg, {}, resolve));
  return { store, send, listeners, ctx };
}

const json = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body });

function fakeNetwork(log = []) {
  return async (url) => {
    log.push(url);
    if (url.includes('dictionaryapi')) {
      const word = decodeURIComponent(url.split('/').pop());
      if (word === 'glacier') {
        return json(200, [{ word, phonetic: '/ˈɡleɪʃə/', meanings: [{ partOfSpeech: 'noun', definitions: [{ definition: 'A slowly moving mass of ice.' }] }] }]);
      }
      if (word === 'retreat') {
        return json(200, [{ word, meanings: [{ partOfSpeech: 'verb', definitions: [{ definition: 'To move back.' }] }] }]);
      }
      return json(404, { title: 'No Definitions Found' });
    }
    const q = new URL(url).searchParams.get('q');
    const tr = { glacier: 'gletser', retreating: 'mundur' }[q];
    return json(200, {
      responseStatus: 200,
      responseData: { translatedText: tr || q },
      matches: tr ? [{ segment: q, translation: tr.toUpperCase(), match: 1 }, { segment: q, translation: 'sungai es', match: 0.9 }] : [],
    });
  };
}

async function waitFor(check) {
  for (let i = 0; i < 100; i++) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error('timed out');
}

test('createDeck fills cards with definitions and translations', async () => {
  const { store, send } = loadBackground(fakeNetwork());
  const res = await send({
    type: 'createDeck',
    deck: { title: 'Ice', url: 'https://example.com', lang: 'en', words: [
      { word: 'glacier', display: 'glacier', count: 3, context: 'The glacier melts.' },
      { word: 'retreating', display: 'retreating', count: 2, context: '' },
      { word: 'zzzz', display: 'zzzz', count: 1, context: '' },
    ] },
  });
  assert.equal(res.ok, true);
  const key = `deck:${res.id}`;
  await waitFor(() => store[key].cards.every((c) => c.status !== 'loading'));

  const [glacier, retreating, unknown] = store[key].cards;
  assert.equal(glacier.status, 'ready');
  assert.equal(glacier.phonetic, '/ˈɡleɪʃə/');
  assert.deepEqual([...glacier.translations], ['gletser', 'sungai es']); // uppercase duplicate folded
  assert.equal(glacier.senses[0].pos, 'noun');
  assert.equal(retreating.lemma, 'retreat');
  assert.equal(unknown.status, 'empty');
  assert.equal(store.activeDeckId, res.id);
  assert.equal(store.ui.open, true);
  assert.equal(store.decks[0].total, 3);
});

test('lookups are cached per language pair', async () => {
  const log = [];
  const { store, send } = loadBackground(fakeNetwork(log));
  const words = [{ word: 'glacier', display: 'glacier', count: 1, context: '' }];
  const a = await send({ type: 'createDeck', deck: { title: 'A', lang: 'en', words } });
  await waitFor(() => store[`deck:${a.id}`].cards[0].status === 'ready');
  const calls = log.length;
  const b = await send({ type: 'createDeck', deck: { title: 'B', lang: 'en', words } });
  await waitFor(() => store[`deck:${b.id}`].cards[0].status === 'ready');
  assert.equal(log.length, calls);
});

test('network failure marks the card as error and retry recovers', async () => {
  let down = true;
  const ok = fakeNetwork();
  const { store, send } = loadBackground(async (url) => {
    if (down) throw new Error('offline');
    return ok(url);
  });
  const res = await send({ type: 'createDeck', deck: { title: 'X', lang: 'en', words: [{ word: 'glacier', display: 'glacier', count: 1 }] } });
  const key = `deck:${res.id}`;
  await waitFor(() => store[key].cards[0].status === 'error');
  down = false;
  await send({ type: 'retry', deckId: res.id });
  await waitFor(() => store[key].cards[0].status === 'ready');
});

test('known flags, deletion and the deck limit', async () => {
  const { store, send } = loadBackground(fakeNetwork());
  const words = [{ word: 'glacier', display: 'glacier', count: 1 }];
  const ids = [];
  for (let i = 0; i < 32; i++) ids.push((await send({ type: 'createDeck', deck: { title: `D${i}`, lang: 'en', words } })).id);
  await waitFor(() => ids.every((id) => !store[`deck:${id}`] || store[`deck:${id}`].cards[0].status !== 'loading'));
  assert.equal(store.decks.length, 30);
  assert.equal(store[`deck:${ids[0]}`], undefined);

  const last = ids.at(-1);
  await send({ type: 'setKnown', deckId: last, word: 'glacier', known: true });
  assert.equal(store[`deck:${last}`].cards[0].known, true);
  assert.equal(store.decks[0].known, 1);

  await send({ type: 'deleteDeck', deckId: last });
  assert.equal(store[`deck:${last}`], undefined);
  assert.equal(store.activeDeckId, ids.at(-2));
});

test('toolbar button toggles between hidden and open', async () => {
  const { store, listeners } = loadBackground(fakeNetwork());
  store.ui = { hidden: false, open: false, index: 0, onlyUnknown: false };
  await listeners.action();
  await waitFor(() => store.ui.open === true);
  await listeners.action();
  await waitFor(() => store.ui.hidden === true);
});

test('translation cleanup decodes entities, trims brackets and fixes casing', () => {
  const { ctx } = loadBackground(fakeNetwork());
  assert.equal(ctx.cleanTranslation('diakselerasi&#x0D', 'accelerated', 'id'), 'diakselerasi');
  assert.equal(ctx.cleanTranslation('pengukuran)', 'measurements', 'id'), 'pengukuran');
  assert.equal(ctx.cleanTranslation('Peneliti', 'researchers', 'id'), 'peneliti');
  assert.equal(ctx.cleanTranslation('MEMBUAT', 'make', 'id'), 'membuat');
  assert.equal(ctx.cleanTranslation('Gletscher', 'glacier', 'de'), 'Gletscher');
  assert.equal(ctx.cleanTranslation('Luar Biasa Sekali', 'remarkable', 'id'), 'Luar Biasa Sekali');
  assert.equal(ctx.cleanTranslation('<b>hutan</b> &amp; rimba', 'forest', 'id'), 'hutan & rimba');
});
