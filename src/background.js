// Background worker (service worker in Chrome/Edge, event page in Firefox).
// It is the only writer of deck data, so tabs never overwrite each other: content scripts
// send messages, this file mutates storage one change at a time, and every tab re-renders
// from storage.onChanged.
'use strict';

const api = globalThis.browser ?? globalThis.chrome;

const DICT_URL = 'https://api.dictionaryapi.dev/api/v2/entries/en/';
const TRANSLATE_URL = 'https://api.mymemory.translated.net/get';
const MAX_DECKS = 30;
const LOOKUP_WORKERS = 3;
const TIMEOUT_MS = 10000;

const DEFAULT_SETTINGS = { target: 'id', source: 'auto', maxCards: 20, minLength: 4, corner: 'right' };
const DEFAULT_UI = { hidden: false, open: false, index: 0, onlyUnknown: false };

// MyMemory wants a region for a few languages.
const MYMEMORY_CODE = { zh: 'zh-CN', pt: 'pt-PT' };

const local = api.storage.local;
const deckKey = (id) => `deck:${id}`;

// ---------- serialised storage writes ----------

let queue = Promise.resolve();
function serial(task) {
  const run = queue.then(task, task);
  queue = run.catch(() => {});
  return run;
}

async function readOne(key, fallback) {
  const got = await local.get(key);
  return got[key] ?? fallback;
}

function deckMeta(deck) {
  return {
    id: deck.id,
    title: deck.title,
    url: deck.url,
    createdAt: deck.createdAt,
    total: deck.cards.length,
    known: deck.cards.filter((c) => c.known).length,
  };
}

async function writeDeck(deck) {
  deck.updatedAt = Date.now();
  const decks = await readOne('decks', []);
  const meta = deckMeta(deck);
  await local.set({
    [deckKey(deck.id)]: deck,
    decks: decks.map((d) => (d.id === deck.id ? meta : d)),
  });
}

function updateDeck(id, change) {
  return serial(async () => {
    const deck = await readOne(deckKey(id), null);
    if (!deck) return null;
    change(deck);
    await writeDeck(deck);
    return deck;
  });
}

async function patchUi(patch) {
  const ui = { ...DEFAULT_UI, ...(await readOne('ui', {})), ...patch };
  await local.set({ ui });
  return ui;
}

// ---------- dictionary + translation ----------

function fetchJson(url) {
  return fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), credentials: 'omit' });
}

// Cheap English lemma guesses, tried in order until the dictionary knows one.
function lemmaCandidates(word) {
  const out = [word];
  const add = (w) => { if (w.length >= 3 && !out.includes(w)) out.push(w); };
  if (word.endsWith('ies')) add(`${word.slice(0, -3)}y`);
  if (word.endsWith('ied')) add(`${word.slice(0, -3)}y`);
  if (word.endsWith('es')) add(word.slice(0, -2));
  if (word.endsWith('s') && !word.endsWith('ss')) add(word.slice(0, -1));
  if (word.endsWith('ed')) {
    if (/(.)\1ed$/.test(word)) add(word.slice(0, -3));
    add(word.slice(0, -2));
    add(word.slice(0, -1));
  }
  if (word.endsWith('ing')) {
    if (/(.)\1ing$/.test(word)) add(word.slice(0, -4));
    add(word.slice(0, -3));
    add(`${word.slice(0, -3)}e`);
  }
  if (word.endsWith('ly')) add(word.slice(0, -2));
  return out.slice(0, 4);
}

async function define(word) {
  for (const candidate of lemmaCandidates(word)) {
    const res = await fetchJson(DICT_URL + encodeURIComponent(candidate));
    if (res.status === 404) continue;
    if (res.status === 429) throw new Error('Kamus sedang sibuk, coba lagi sebentar lagi.');
    if (!res.ok) throw new Error(`Kamus: HTTP ${res.status}`);
    const entries = await res.json();
    if (!Array.isArray(entries)) continue;

    const phonetic = entries
      .map((e) => e.phonetic || e.phonetics?.find((p) => p.text)?.text)
      .find(Boolean) || '';
    const senses = [];
    for (const entry of entries) {
      for (const meaning of entry.meanings || []) {
        if (senses.length >= 3 || senses.some((s) => s.pos === meaning.partOfSpeech)) continue;
        const d = meaning.definitions?.find((x) => x.definition);
        if (d) senses.push({ pos: meaning.partOfSpeech || '', def: d.definition, example: d.example || '' });
      }
    }
    return { lemma: candidate === word ? '' : candidate, phonetic, senses };
  }
  return { lemma: '', phonetic: '', senses: [] };
}

const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-f]+);?/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);?/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => NAMED_ENTITIES[n.toLowerCase()] ?? m);
}

// MyMemory returns crowd-sourced segments: strip markup, stray brackets and shouting caps,
// and lower-case a title-cased result for a lower-case word ("Peneliti" -> "peneliti").
function cleanTranslation(text, word, tgt) {
  let t = decodeEntities(String(text || '').replace(/<[^>]*>/g, ''));
  t = t.replace(/[\p{Cc}\s]+/gu, ' ').trim();
  t = t.replace(/^[\s"'“”‘’.,;:!?()[\]{}-]+|[\s"'“”‘’.,;:!?()[\]{}-]+$/gu, '');
  if (t.length > 1 && t === t.toUpperCase()) t = t.toLowerCase();
  if (tgt !== 'de' && word === word.toLowerCase() && /^\p{Lu}\p{Ll}/u.test(t) && !/\s\p{Lu}/u.test(t)) {
    t = t[0].toLowerCase() + t.slice(1);
  }
  return t.length > 80 ? '' : t;
}

async function translate(word, src, tgt) {
  const pair = `${MYMEMORY_CODE[src] || src}|${MYMEMORY_CODE[tgt] || tgt}`;
  const res = await fetchJson(`${TRANSLATE_URL}?q=${encodeURIComponent(word)}&langpair=${encodeURIComponent(pair)}`);
  if (!res.ok) throw new Error(`Terjemahan: HTTP ${res.status}`);
  const data = await res.json();
  const main = String(data.responseData?.translatedText || '');
  if (data.quotaFinished === true || Number(data.responseStatus) === 429 || /MYMEMORY WARNING/i.test(main)) {
    throw new Error('Kuota terjemahan gratis hari ini sudah habis. Coba lagi besok.');
  }
  if (Number(data.responseStatus) !== 200) throw new Error(data.responseDetails || 'Terjemahan gagal.');

  const out = [];
  const add = (raw) => {
    const t = cleanTranslation(raw, word, tgt);
    if (!t || t.toLowerCase() === word.toLowerCase()) return;
    if (out.some((o) => o.toLowerCase() === t.toLowerCase())) return;
    out.push(t);
  };
  add(main);
  const matches = (data.matches || [])
    .filter((m) => String(m.segment || '').trim().toLowerCase() === word.toLowerCase())
    .sort((a, b) => Number(b.match) - Number(a.match) || Number(b.quality) - Number(a.quality));
  for (const m of matches) {
    if (out.length >= 3) break;
    add(m.translation);
  }
  return out;
}

// Bump CACHE_VERSION when the shape or cleaning of a lookup result changes.
const CACHE_VERSION = 'v1';
const CACHE_LIMIT = 4000;

async function pruneCache() {
  const all = await local.get(null);
  const entries = Object.entries(all).filter(([k]) => k.startsWith('cache:'));
  const stale = entries.filter(([k]) => !k.startsWith(`cache:${CACHE_VERSION}:`)).map(([k]) => k);
  const current = entries.filter(([k]) => k.startsWith(`cache:${CACHE_VERSION}:`));
  if (current.length > CACHE_LIMIT) {
    current.sort((a, b) => (a[1].at || 0) - (b[1].at || 0));
    stale.push(...current.slice(0, current.length - CACHE_LIMIT).map(([k]) => k));
  }
  if (stale.length) await local.remove(stale);
}

async function lookup(word, src, tgt) {
  const cacheKey = `cache:${CACHE_VERSION}:${src}:${tgt}:${word}`;
  const cached = await readOne(cacheKey, null);
  if (cached) return cached;

  const [dict, tr] = await Promise.allSettled([
    src === 'en' ? define(word) : Promise.resolve(null),
    src !== tgt ? translate(word, src, tgt) : Promise.resolve([]),
  ]);
  const failure = [dict, tr].find((r) => r.status === 'rejected');
  const d = dict.status === 'fulfilled' ? dict.value : null;
  const result = {
    lemma: d?.lemma || '',
    phonetic: d?.phonetic || '',
    senses: d?.senses || [],
    translations: tr.status === 'fulfilled' ? tr.value : [],
    error: '',
  };
  const found = result.senses.length > 0 || result.translations.length > 0;
  if (!found && failure) {
    return { ...result, status: 'error', error: String(failure.reason?.message || failure.reason) };
  }
  result.status = found ? 'ready' : 'empty';
  if (!failure) await local.set({ [cacheKey]: { ...result, at: Date.now() } });
  return result;
}

async function lookupWords(deckId, words, src, tgt) {
  let next = 0;
  const worker = async () => {
    while (next < words.length) {
      const word = words[next++];
      let result;
      try {
        result = await lookup(word, src, tgt);
      } catch (err) {
        result = { status: 'error', error: String(err?.message || err) };
      }
      await updateDeck(deckId, (deck) => {
        const card = deck.cards.find((c) => c.word === word);
        if (card) Object.assign(card, result);
      });
    }
  };
  await Promise.all(Array.from({ length: LOOKUP_WORKERS }, worker));
}

// ---------- message handlers ----------

const handlers = {
  async createDeck({ deck: input }) {
    const settings = { ...DEFAULT_SETTINGS, ...(await readOne('settings', {})) };
    const now = Date.now();
    const deck = {
      id: `${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      title: String(input.title || 'Tanpa judul').slice(0, 140),
      url: String(input.url || ''),
      lang: String(input.lang || 'en'),
      target: settings.target,
      createdAt: now,
      updatedAt: now,
      cards: (input.words || []).map((w) => ({
        word: w.word,
        display: w.display || w.word,
        count: w.count || 1,
        context: w.context || '',
        status: 'loading',
        known: false,
      })),
    };
    await serial(async () => {
      const decks = [deckMeta(deck), ...(await readOne('decks', []))];
      const dropped = decks.slice(MAX_DECKS).map((d) => deckKey(d.id));
      if (dropped.length) await local.remove(dropped);
      await local.set({ [deckKey(deck.id)]: deck, decks: decks.slice(0, MAX_DECKS), activeDeckId: deck.id });
    });
    await patchUi({ hidden: false, open: true, index: 0, onlyUnknown: false });
    lookupWords(deck.id, deck.cards.map((c) => c.word), deck.lang, deck.target);
    return { id: deck.id };
  },

  async retry({ deckId, word }) {
    const deck = await updateDeck(deckId, (d) => {
      for (const c of d.cards) {
        if (word ? c.word === word : c.status === 'error' || c.status === 'loading') {
          c.status = 'loading';
          c.error = '';
        }
      }
    });
    if (deck) {
      const words = deck.cards.filter((c) => c.status === 'loading').map((c) => c.word);
      lookupWords(deck.id, words, deck.lang, deck.target);
    }
    return {};
  },

  async setKnown({ deckId, word, known }) {
    await updateDeck(deckId, (d) => {
      const card = d.cards.find((c) => c.word === word);
      if (card) card.known = Boolean(known);
    });
    return {};
  },

  async resetKnown({ deckId }) {
    await updateDeck(deckId, (d) => { for (const c of d.cards) c.known = false; });
    await patchUi({ index: 0, onlyUnknown: false });
    return {};
  },

  async deleteCard({ deckId, word }) {
    await updateDeck(deckId, (d) => { d.cards = d.cards.filter((c) => c.word !== word); });
    return {};
  },

  async shuffle({ deckId }) {
    await updateDeck(deckId, (d) => {
      for (let i = d.cards.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [d.cards[i], d.cards[j]] = [d.cards[j], d.cards[i]];
      }
    });
    await patchUi({ index: 0 });
    return {};
  },

  async setActive({ deckId }) {
    await local.set({ activeDeckId: deckId });
    await patchUi({ index: 0, onlyUnknown: false });
    return {};
  },

  async deleteDeck({ deckId }) {
    await serial(async () => {
      const decks = (await readOne('decks', [])).filter((d) => d.id !== deckId);
      const active = await readOne('activeDeckId', null);
      await local.remove(deckKey(deckId));
      await local.set({ decks, activeDeckId: active === deckId ? (decks[0]?.id ?? null) : active });
    });
    await patchUi({ index: 0 });
    return {};
  },
};

api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const handler = handlers[msg?.type];
  if (!handler) return false;
  Promise.resolve()
    .then(() => handler(msg, sender))
    .then(
      (result) => sendResponse({ ok: true, ...result }),
      (err) => sendResponse({ ok: false, error: String(err?.message || err) }),
    );
  return true; // keep the channel open for the async reply (works in Chrome and Firefox)
});

// ---------- toolbar button, shortcut, context menu ----------

async function toggleWidget() {
  const ui = { ...DEFAULT_UI, ...(await readOne('ui', {})) };
  const show = ui.hidden || !ui.open;
  await patchUi(show ? { hidden: false, open: true } : { hidden: true });
}

api.action.onClicked.addListener(() => { toggleWidget(); });

api.commands?.onCommand.addListener((command) => {
  if (command === 'toggle-widget') toggleWidget();
});

const menus = api.contextMenus ?? api.menus;

function createMenus() {
  if (!menus) return;
  // Promise form only: Firefox's browser.* namespace does not take callbacks.
  Promise.resolve(menus.removeAll()).then(() => {
    menus.create({ id: 'lexiflip-selection', title: 'Buat flashcard dari teks terpilih', contexts: ['selection'] });
    menus.create({ id: 'lexiflip-page', title: 'Buat flashcard dari halaman ini', contexts: ['page'] });
  }).catch(() => {});
}

menus?.onClicked.addListener((info, tab) => {
  if (!tab?.id || tab.id < 0) return;
  const message = info.menuItemId === 'lexiflip-selection'
    ? { type: 'build', mode: 'selection', text: info.selectionText || '' }
    : { type: 'build', mode: 'page' };
  // Fails on pages where extensions may not run (browser settings, web stores, PDF viewer).
  Promise.resolve(api.tabs.sendMessage(tab.id, message)).catch(() => {});
});

api.runtime.onInstalled.addListener(async () => {
  createMenus();
  const settings = await readOne('settings', null);
  if (!settings) await local.set({ settings: DEFAULT_SETTINGS, ui: DEFAULT_UI, decks: [], activeDeckId: null });
  pruneCache().catch(() => {});
});

api.runtime.onStartup.addListener(() => {
  createMenus();
  pruneCache().catch(() => {});
});
