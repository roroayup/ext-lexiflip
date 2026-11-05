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

// Shaped like real MyMemory answers seen for these words (en -> id), junk included.
const MT = { quality: 70, 'created-by': 'MT!' };
const MEMORY = {
  glacier: [{ translation: 'gletser', ...MT }, { segment: 'Glacier', translation: 'GLETSER' }],
  retreating: [{ translation: 'mundur' }, { segment: 'RETREATING', translation: 'Mundur' }],
  water: [{ translation: 'panas' }, { translation: 'air' }, { segment: 'water. ', translation: 'dalam air. ' }],
  melting: [{ segment: 'Melting', translation: 'Peleburan kontet', quality: 0 }, { segment: 'Melting', translation: 'MELE' }, { segment: 'MELTING', translation: 'MELE' }],
  melt: [{ translation: 'meleleh', ...MT }, { segment: 'Melt the Earth', translation: 'Melelehkan Bumi' }],
  snow: [{ segment: 'Snow', translation: 'Snow' }, { segment: 'Snow', translation: 'SaljuComment', quality: 0 }, { segment: 'Snow', translation: 'Hujan salju', quality: 0 }],
  chamber: [{ translation: 'chamber', ...MT }, { segment: 'Chamber', translation: 'Chamber' }],
  'A room or compartment.': [{ translation: 'Sebuah ruangan atau kompartemen.' }],
  zone: [{ translation: 'penyangga' }, { segment: 'zone.', translation: 'dinominasikan.' }, { segment: 'Zone', translation: 'Zona' }],
  sheet: [{ translation: 'lembar ------------------------' }, { segment: 'Sheet', translation: 'Lembar' }, { segment: 'SHEET', translation: 'LEMBAR' }],
};

function fakeNetwork(log = []) {
  return async (url) => {
    log.push(url);
    if (url.includes('dictionaryapi')) {
      const word = decodeURIComponent(url.split('/').pop());
      if (word === 'glacier') {
        return json(200, [{ word, phonetic: '/ˈɡleɪʃə/', meanings: [{ partOfSpeech: 'noun', definitions: [{ definition: 'A slowly moving mass of ice.' }] }] }]);
      }
      if (word === 'chamber') {
        return json(200, [{ word, meanings: [{ partOfSpeech: 'noun', definitions: [{ definition: 'A room or compartment.' }] }] }]);
      }
      if (word === 'retreat') {
        return json(200, [{ word, meanings: [{ partOfSpeech: 'verb', definitions: [{ definition: 'To move back.' }] }] }]);
      }
      return json(404, { title: 'No Definitions Found' });
    }
    const q = new URL(url).searchParams.get('q');
    const matches = MEMORY[q] || [];
    return json(200, {
      responseStatus: 200,
      responseData: { translatedText: matches[0]?.translation || q },
      matches: matches.map((m) => ({ segment: q, quality: 74, match: 0.98, ...m })),
    });
  };
}

async function waitFor(check) {
  for (let i = 0; i < 1000; i++) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 10));
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
  assert.deepEqual([...glacier.translations], ['gletser']); // ALL-CAPS duplicate folded in
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

test('Alt+Shift+K toggles between hidden and open', async () => {
  const { store, listeners } = loadBackground(fakeNetwork());
  store.ui = { hidden: false, open: false, index: 0, onlyUnknown: false };
  await listeners.command('toggle-widget');
  await waitFor(() => store.ui.open === true);
  await listeners.command('toggle-widget');
  await waitFor(() => store.ui.hidden === true);
});

test('manual words go to "Kosakata saya", keep a typed meaning and still get definitions', async () => {
  const { store, send } = loadBackground(fakeNetwork());
  const res = await send({
    type: 'addCards',
    cards: [{ word: 'Glacier', translations: ['sungai es'], context: 'A glacier moves slowly.', manualMeaning: true }],
  });
  assert.equal(res.ok, true);
  assert.equal(res.deckId, 'mine');
  await waitFor(() => store['deck:mine'].cards[0].status === 'ready' && store['deck:mine'].cards[0].senses?.length);
  const card = store['deck:mine'].cards[0];
  assert.equal(card.word, 'glacier');
  assert.equal(card.display, 'Glacier');
  assert.deepEqual([...card.translations], ['sungai es']); // not replaced by "gletser"
  assert.equal(card.phonetic, '/ˈɡleɪʃə/');
  assert.equal(store['deck:mine'].title, 'Kosakata saya');
  assert.equal(store.decks[0].id, 'mine');
});

test('adding the same word twice merges instead of duplicating', async () => {
  const { store, send } = loadBackground(fakeNetwork());
  await send({ type: 'addCards', cards: [{ word: 'water', translations: ['air'], senses: [{ pos: 'noun', def: 'H2O' }], lookup: false }] });
  const res = await send({ type: 'addCards', cards: [{ word: ' Water ', context: 'Fresh water.' }] });
  assert.equal(res.added, 0);
  assert.equal(res.updated, 1);
  const cards = store['deck:mine'].cards;
  assert.equal(cards.length, 1);
  assert.equal(cards[0].context, 'Fresh water.');
  assert.equal(cards[0].status, 'ready');
});

test('a word without meaning is looked up; a complete preview is stored as-is', async () => {
  const log = [];
  const { store, send } = loadBackground(fakeNetwork(log));
  await send({ type: 'addCards', cards: [{ word: 'zone' }] });
  await waitFor(() => store['deck:mine'].cards[0].status !== 'loading');
  assert.deepEqual([...store['deck:mine'].cards[0].translations], ['zona']);
  const calls = log.length;
  await send({ type: 'addCards', cards: [{ word: 'snow', translations: ['salju'], lookup: false }] });
  assert.equal(store['deck:mine'].cards[1].status, 'ready');
  assert.equal(log.length, calls); // no network for a complete preview
});

test('editing a card: new meaning sticks, a new word is looked up again, duplicates refused', async () => {
  const { store, send } = loadBackground(fakeNetwork());
  await send({ type: 'addCards', cards: [{ word: 'water', translations: ['air'], lookup: false }, { word: 'snow', translations: ['salju'], lookup: false }] });
  let res = await send({ type: 'updateCard', deckId: 'mine', word: 'water', patch: { translations: ['air', 'perairan'], context: 'Water is wet.' } });
  assert.equal(res.word, 'water');
  let card = store['deck:mine'].cards[0];
  assert.deepEqual([...card.translations], ['air', 'perairan']);
  assert.equal(card.manualMeaning, true);
  assert.equal(card.context, 'Water is wet.');

  res = await send({ type: 'updateCard', deckId: 'mine', word: 'water', patch: { display: 'Glacier', translations: [] } });
  assert.equal(res.word, 'glacier');
  await waitFor(() => store['deck:mine'].cards[0].status === 'ready');
  card = store['deck:mine'].cards[0];
  assert.deepEqual([...card.translations], ['gletser']);

  res = await send({ type: 'updateCard', deckId: 'mine', word: 'glacier', patch: { display: 'SNOW' } });
  assert.equal(res.ok, false);
  assert.match(res.error, /sudah ada/);
});

test('lookupWord previews without touching any deck', async () => {
  const { store, send } = loadBackground(fakeNetwork());
  const res = await send({ type: 'lookupWord', word: 'Water', lang: 'en' });
  assert.equal(res.ok, true);
  assert.deepEqual([...res.result.translations], ['air']);
  assert.equal(res.target, 'id');
  assert.equal(store.decks, undefined);
});

test('"Kosakata saya" survives the deck limit', async () => {
  const { store, send } = loadBackground(fakeNetwork());
  await send({ type: 'addCards', cards: [{ word: 'snow', translations: ['salju'], lookup: false }] });
  const words = [{ word: 'water', translations: ['air'], senses: [{ pos: 'n', def: 'x' }] }];
  for (let i = 0; i < 31; i++) await send({ type: 'createDeck', deck: { title: `D${i}`, lang: 'en', words } });
  assert.equal(store.decks.length, 31); // "Kosakata saya" + 30 newest
  assert.equal(store.decks[0].id, 'mine');
  assert.ok(store['deck:mine']);
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

test('picks sensible translations out of noisy translation memory', async () => {
  const { store, send } = loadBackground(fakeNetwork());
  const words = ['water', 'melting', 'snow', 'sheet', 'zone'].map((word) => ({ word, display: word, count: 1 }));
  const res = await send({ type: 'createDeck', deck: { title: 'Noise', lang: 'en', words } });
  const key = `deck:${res.id}`;
  await waitFor(() => store[key].cards.every((c) => c.status !== 'loading'));
  const got = Object.fromEntries(store[key].cards.map((c) => [c.word, [...c.translations]]));
  assert.deepEqual(got.water, ['air']); // not MyMemory's first answer "panas"
  assert.deepEqual(got.melting, ['meleleh']); // via the base form "melt", not "MELE"
  assert.deepEqual(got.snow, ['hujan salju']); // "SaljuComment" dropped
  assert.deepEqual(got.sheet, ['lembar']);
  assert.deepEqual(got.zone, ['zona']); // three-way tie broken by the look-alike loanword
});

test('5xx answers are retried before giving up', async () => {
  let calls = 0;
  const ok = fakeNetwork();
  const { store, send } = loadBackground(async (url) => {
    if (url.includes('dictionaryapi') && calls++ < 2) return json(502, {}); // two 502s in a row
    return ok(url);
  });
  const res = await send({ type: 'createDeck', deck: { title: 'R', lang: 'en', words: [{ word: 'glacier', display: 'glacier', count: 1 }] } });
  await waitFor(() => store[`deck:${res.id}`].cards[0].status !== 'loading');
  assert.equal(store[`deck:${res.id}`].cards[0].status, 'ready');
  assert.equal(store[`deck:${res.id}`].cards[0].senses.length, 1);
});

test('a word MyMemory only echoes gets its definition translated instead', async () => {
  const { store, send } = loadBackground(fakeNetwork());
  await send({ type: 'addCards', cards: [{ word: 'chamber' }] });
  await waitFor(() => store['deck:mine'].cards[0].status !== 'loading');
  const card = store['deck:mine'].cards[0];
  assert.deepEqual([...card.translations], []); // "chamber" -> "chamber" is not a translation
  assert.equal(card.defTranslation, 'Sebuah ruangan atau kompartemen.');
  assert.equal(card.status, 'ready');
});
