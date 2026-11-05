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

const DEFAULT_SETTINGS = { target: 'id', source: 'auto', maxCards: 20, minLength: 4, corner: 'right', selectionBubble: true };
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
    lang: deck.lang,
    source: deck.source || 'page',
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

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Quiet retries for rate limits, 5xx and dropped connections. dictionaryapi.dev in particular
// answers 502 to roughly every other request at times.
const RETRY_DELAYS_MS = [800, 1600];

async function fetchJson(url) {
  const once = () => fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), credentials: 'omit' });
  for (const delay of RETRY_DELAYS_MS) {
    try {
      const res = await once();
      if (res.status !== 429 && res.status < 500) return res;
    } catch { /* network error or timeout: retry */ }
    await wait(delay);
  }
  return once();
}

// Cheap English lemma guesses, tried in order until the dictionary knows one.
function lemmaCandidates(word) {
  const out = [word];
  if (/s/.test(word)) return out; // phrases: no suffix guessing
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
  let t = decodeEntities(String(text || '')).replace(/<[^>]*>/g, '');
  t = t.replace(/[\p{Cc}\s]+/gu, ' ').trim();
  t = t.replace(/^[\s"'“”‘’.,;:!?()[\]{}-]+|[\s"'“”‘’.,;:!?()[\]{}-]+$/gu, '');
  if (t.length > 1 && t === t.toUpperCase()) t = t.toLowerCase();
  if (tgt !== 'de' && word === word.toLowerCase() && /^\p{Lu}\p{Ll}/u.test(t) && !/\s\p{Lu}/u.test(t)) {
    t = t[0].toLowerCase() + t.slice(1);
  }
  return t.length > 80 ? '' : t;
}

// Segment text reduced to bare lower-case words, so "Water. " and "<i>water</i>" both match "water".
function normSegment(s) {
  return decodeEntities(String(s || '')).replace(/<[^>]*>/g, '')
    .replace(/[^\p{L}\p{M}'\s-]/gu, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

// Raw MyMemory candidates for one query: [{ raw, mt, quality, query }].
async function translationCandidates(query, src, tgt) {
  const pair = `${MYMEMORY_CODE[src] || src}|${MYMEMORY_CODE[tgt] || tgt}`;
  const res = await fetchJson(`${TRANSLATE_URL}?q=${encodeURIComponent(query)}&langpair=${encodeURIComponent(pair)}`);
  if (!res.ok) throw new Error(`Terjemahan: HTTP ${res.status}`);
  const data = await res.json();
  const main = String(data.responseData?.translatedText || '');
  if (data.quotaFinished === true || Number(data.responseStatus) === 429 || /MYMEMORY WARNING/i.test(main)) {
    throw new Error('Kuota terjemahan gratis hari ini sudah habis. Coba lagi besok.');
  }
  if (Number(data.responseStatus) !== 200) throw new Error(data.responseDetails || 'Terjemahan gagal.');

  const q = query.toLowerCase();
  const out = (data.matches || [])
    .filter((m) => normSegment(m.segment) === q)
    .map((m) => ({
      raw: String(m.translation || ''),
      mt: m['created-by'] === 'MT!' || /machine translation/i.test(String(m.reference || '')),
      quality: Number(m.quality) || 0,
      query,
    }));
  if (!out.length && main) out.push({ raw: main, mt: false, quality: 0, query });
  return out;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// 0..1 spelling similarity (Levenshtein), used to spot loanwords: zone/zona, sediment/sedimen.
function similarity(a, b) {
  if (!a || !b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return 1 - prev[b.length] / Math.max(a.length, b.length);
}

/**
 * MyMemory's own ordering is unreliable for single words (its first answer for "water" is
 * "panas"). Score candidates instead: one vote per entry that agrees, a bonus for machine
 * translation (consistently right for single words), a penalty for ALL-CAPS UI strings
 * ("MELE"), and half a vote when a longer answer contains it ("air" in "dalam air").
 * Returns [{ text, score }] best first.
 */
function rankTranslations(candidates, word, tgt, stemWeight = 0.8) {
  const items = [];
  for (const c of candidates) {
    const raw = decodeEntities(c.raw).replace(/<[^>]*>/g, '').trim();
    if (/\p{Ll}\p{Lu}/u.test(raw)) continue; // two words glued together: "SaljuComment"
    const shouting = raw.length > 1 && raw === raw.toUpperCase() && raw !== raw.toLowerCase();
    const text = cleanTranslation(raw, word, tgt);
    const key = text.toLowerCase();
    if (!text || !/\p{L}/u.test(text) || text.split(' ').length > 4) continue;
    if (key === word.toLowerCase() || key === c.query.toLowerCase()) continue; // left untranslated
    let weight = (shouting ? 0.3 : 1) + (c.mt ? 1 : 0) + (0.2 * c.quality) / 100;
    if (c.query !== word) weight *= stemWeight;
    items.push({ text, key, weight });
  }
  const scores = new Map();
  for (const it of items) {
    const s = scores.get(it.key) || { text: it.text, score: 0 };
    s.score += it.weight;
    scores.set(it.key, s);
  }
  for (const [key, s] of scores) {
    const inside = new RegExp(`(^|\\s)${escapeRe(key)}(\\s|$)`, 'u');
    for (const it of items) if (it.key !== key && inside.test(it.key)) s.score += 0.5;
    // Indonesian (like many targets) borrows heavily, so a look-alike breaks ties between
    // equally voted answers ("zona" over "penyangga" for "zone") without beating real votes.
    if (similarity(key, word.toLowerCase()) >= 0.6) s.score += 0.3;
  }
  return [...scores.values()].sort((a, b) => b.score - a.score);
}

const STRONG_SCORE = 1.5; // machine translation, or two entries agreeing

/** Sentence translation (definitions): MyMemory's main answer, cleaned. */
async function translateText(text, src, tgt) {
  const pair = `${MYMEMORY_CODE[src] || src}|${MYMEMORY_CODE[tgt] || tgt}`;
  const res = await fetchJson(`${TRANSLATE_URL}?q=${encodeURIComponent(text.slice(0, 400))}&langpair=${encodeURIComponent(pair)}`);
  if (!res.ok) throw new Error(`Terjemahan: HTTP ${res.status}`);
  const data = await res.json();
  const out = decodeEntities(String(data.responseData?.translatedText || '')).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  if (data.quotaFinished === true || Number(data.responseStatus) !== 200 || /MYMEMORY WARNING/i.test(out)) return '';
  return out.toLowerCase() === text.trim().toLowerCase() ? '' : out;
}

async function translate(word, src, tgt, lemma) {
  let candidates = await translationCandidates(word, src, tgt);
  let ranked = rankTranslations(candidates, word, tgt);
  // Weak answer for an inflected word: also ask for its base form ("melting" -> "melt").
  if ((ranked[0]?.score ?? 0) < STRONG_SCORE && src === 'en') {
    const stems = (lemma ? [lemma] : lemmaCandidates(word).slice(1, 3)).filter((s) => s !== word);
    if (stems.length) {
      const more = await Promise.allSettled(stems.map((s) => translationCandidates(s, src, tgt)));
      candidates = candidates.concat(...more.filter((r) => r.status === 'fulfilled').map((r) => r.value));
      ranked = rankTranslations(candidates, word, tgt);
    }
  }
  // With a confident winner, show close runners-up as alternatives; with a weak one, only
  // answers that are practically tied, so noise doesn't pass as a second meaning.
  const top = ranked[0]?.score ?? 0;
  const keep = top >= STRONG_SCORE ? 0.75 : 0.9;
  return ranked.filter((r) => r.score >= top * keep).slice(0, 3).map((r) => r.text);
}

// Bump CACHE_VERSION when the shape or cleaning of a lookup result changes.
const CACHE_VERSION = 'v4';
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

  // Dictionary first: its lemma ("retreat" for "retreating") helps pick the translation.
  const [dict] = await Promise.allSettled([src === 'en' ? define(word) : Promise.resolve(null)]);
  const lemma = dict.status === 'fulfilled' ? dict.value?.lemma : '';
  const [tr] = await Promise.allSettled([src !== tgt ? translate(word, src, tgt, lemma) : Promise.resolve([])]);
  const failure = [dict, tr].find((r) => r.status === 'rejected');
  const d = dict.status === 'fulfilled' ? dict.value : null;
  const result = {
    lemma: d?.lemma || '',
    phonetic: d?.phonetic || '',
    senses: d?.senses || [],
    translations: tr.status === 'fulfilled' ? tr.value : [],
    defTranslation: '',
    error: '',
  };
  // No usable word translation (MyMemory often just echoes the word: "chamber" -> "chamber"):
  // translate the first definition instead, so the card still has a meaning in the user's
  // language ("A room or compartment" -> "Sebuah ruangan atau kompartemen").
  if (!result.translations.length && result.senses.length && src !== tgt) {
    try {
      result.defTranslation = await translateText(result.senses[0].def, src, tgt);
    } catch { /* the English definition is still shown */ }
  }
  const found = result.senses.length > 0 || result.translations.length > 0;
  if (!found && failure) {
    return { ...result, status: 'error', error: String(failure.reason?.message || failure.reason) };
  }
  result.status = found ? 'ready' : 'empty';
  if (!failure) await local.set({ [cacheKey]: { ...result, at: Date.now() } });
  return result;
}

// ---------- cards and decks ----------

const MINE = 'mine';
const MINE_TITLE = 'Kosakata saya';
const cardKey = (s) => String(s || '').normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

async function getSettings() {
  return { ...DEFAULT_SETTINGS, ...(await readOne('settings', {})) };
}

// Merge a lookup into a card. A meaning the user typed in themselves always wins; the
// lookup then only adds pronunciation and definitions.
function applyLookup(card, result) {
  const { translations, ...rest } = result;
  const keepMeaning = card.manualMeaning && card.translations?.length;
  Object.assign(card, rest);
  if (keepMeaning) {
    card.status = 'ready';
    card.error = '';
  } else {
    card.translations = translations || [];
  }
}

async function lookupWords(deckId, items, tgt) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const { word, lang } = items[next++];
      let result;
      try {
        result = await lookup(word, lang, tgt);
      } catch (err) {
        result = { status: 'error', error: String(err?.message || err) };
      }
      await updateDeck(deckId, (deck) => {
        const card = deck.cards.find((c) => c.word === word);
        if (card) applyLookup(card, result);
      });
    }
  };
  await Promise.all(Array.from({ length: LOOKUP_WORKERS }, worker));
}

const lookupItems = (deck, cards) => cards.map((c) => ({ word: c.word, lang: c.lang || deck.lang }));

function newDeck({ id, title, url, lang, source }, target) {
  const now = Date.now();
  return {
    id: id || newId(),
    title: String(title || 'Tanpa judul').slice(0, 140),
    url: String(url || ''),
    lang: String(lang || 'en'),
    source: source || 'page',
    target,
    createdAt: now,
    updatedAt: now,
    cards: [],
  };
}

// Newest first, with "Kosakata saya" pinned on top and never pruned.
function orderMeta(list) {
  const mine = list.filter((d) => d.id === MINE);
  const rest = list.filter((d) => d.id !== MINE).sort((a, b) => b.createdAt - a.createdAt);
  return [...mine, ...rest];
}

/**
 * Add or merge cards into a deck, creating the deck when needed (`deckId` 'new' with
 * `deckInfo`, or the "Kosakata saya" deck on first use). Cards that still need a meaning or
 * a definition are looked up afterwards.
 */
async function addCards({ deckId, deckInfo, cards: inputs, activate }) {
  const settings = await getSettings();
  const toLookup = [];
  let added = 0;
  let updated = 0;

  const deck = await serial(async () => {
    let d = deckId && deckId !== 'new' ? await readOne(deckKey(deckId), null) : null;
    if (!d) {
      if (deckId === MINE) d = newDeck({ id: MINE, title: MINE_TITLE, lang: deckInfo?.lang || 'en', source: 'manual' }, settings.target);
      else if (deckId === 'new' || !deckId) d = newDeck(deckInfo || {}, settings.target);
      else throw new Error('Dek tidak ditemukan.');
    }

    for (const input of inputs || []) {
      const key = cardKey(input.word || input.display);
      if (!key) continue;
      const translations = (input.translations || []).map((t) => String(t).trim()).filter(Boolean);
      let card = d.cards.find((c) => c.word === key);
      if (card) {
        if (translations.length) {
          card.translations = translations;
          card.manualMeaning = Boolean(input.manualMeaning) || card.manualMeaning;
          if (card.status !== 'ready') { card.status = 'ready'; card.error = ''; }
        }
        if (input.context && !card.context) card.context = input.context;
        if (input.senses?.length && !card.senses?.length) card.senses = input.senses;
        updated++;
        continue;
      }
      card = {
        word: key,
        display: String(input.display || input.word).trim().replace(/\s+/g, ' '),
        lang: input.lang || d.lang,
        count: input.count || 1,
        context: input.context || '',
        translations,
        senses: input.senses || [],
        phonetic: input.phonetic || '',
        lemma: input.lemma || '',
        manualMeaning: Boolean(input.manualMeaning && translations.length),
        known: false,
        error: '',
        addedAt: Date.now(),
      };
      // A complete preview (selection popover) needs no second lookup; anything without a
      // meaning, or a hand-typed meaning without definitions, does.
      const complete = input.lookup === false || (translations.length > 0 && card.senses.length > 0);
      if (complete) card.status = translations.length || card.senses.length ? 'ready' : 'empty';
      else {
        card.status = 'loading';
        toLookup.push(card);
      }
      d.cards.push(card);
      added++;
    }

    d.updatedAt = Date.now();
    const list = orderMeta([deckMeta(d), ...(await readOne('decks', [])).filter((m) => m.id !== d.id)]);
    const keep = [];
    const dropped = [];
    let others = 0;
    for (const m of list) (m.id === MINE || others++ < MAX_DECKS ? keep : dropped).push(m);
    if (dropped.length) await local.remove(dropped.map((m) => deckKey(m.id)));
    const patch = { [deckKey(d.id)]: d, decks: keep };
    // With nothing being studied yet, the deck that just got a card becomes the one shown.
    if (activate || !(await readOne('activeDeckId', null))) patch.activeDeckId = d.id;
    await local.set(patch);
    return d;
  });

  if (toLookup.length) lookupWords(deck.id, lookupItems(deck, toLookup), deck.target);
  return { deckId: deck.id, added, updated };
}

// ---------- message handlers ----------

const handlers = {
  // Article/selection/document -> a new deck of the words the user picked.
  async createDeck({ deck: input }) {
    const res = await addCards({ deckId: 'new', deckInfo: input, cards: input.words || [], activate: true });
    await patchUi({ hidden: false, open: true, index: 0, onlyUnknown: false });
    return { id: res.deckId };
  },

  // Manual add, selection popover, or picked words saved into an existing deck.
  async addCards({ deckId, deckInfo, cards, activate }) {
    const res = await addCards({ deckId: deckId || MINE, deckInfo, cards, activate });
    if (activate) await patchUi({ index: 0, onlyUnknown: false });
    return res;
  },

  async updateCard({ deckId, word, patch }) {
    let relookup = null;
    let newKey = word;
    const deck = await updateDeck(deckId, (d) => {
      const card = d.cards.find((c) => c.word === word);
      if (!card) throw new Error('Kartu tidak ditemukan.');
      if (patch.display !== undefined) {
        const display = String(patch.display).trim().replace(/\s+/g, ' ');
        const key = cardKey(display);
        if (!key) throw new Error('Kata tidak boleh kosong.');
        if (key !== card.word && d.cards.some((c) => c.word === key)) throw new Error('Kata itu sudah ada di dek ini.');
        if (key !== card.word) {
          Object.assign(card, { word: key, senses: [], phonetic: '', lemma: '' });
          relookup = card;
        }
        card.display = display;
        newKey = key;
      }
      if (patch.context !== undefined) card.context = String(patch.context).trim();
      if (patch.translations !== undefined) {
        card.translations = patch.translations.map((t) => String(t).trim()).filter(Boolean);
        card.manualMeaning = card.translations.length > 0;
        if (!card.manualMeaning) relookup = card;
      }
      if (relookup) {
        card.status = 'loading';
        card.error = '';
      } else if (card.translations?.length || card.senses?.length) {
        card.status = 'ready';
        card.error = '';
      }
    });
    if (deck && relookup) lookupWords(deck.id, lookupItems(deck, [relookup]), deck.target);
    return { word: newKey };
  },

  // Preview for the selection popover and the "Cari arti otomatis" button. Uses the cache.
  async lookupWord({ word, lang }) {
    const settings = await getSettings();
    const result = await lookup(cardKey(word), lang || 'en', settings.target);
    return { result, target: settings.target };
  },

  async openApp({ hash }) {
    await api.tabs.create({ url: api.runtime.getURL('app/app.html') + (hash ? `#${hash}` : '') });
    return {};
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
      // A single-card retry must not re-run lookups that are already in flight for other cards.
      const cards = deck.cards.filter((c) => (word ? c.word === word : c.status === 'loading'));
      lookupWords(deck.id, lookupItems(deck, cards), deck.target);
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

// ---------- shortcut, context menu, install ----------

async function toggleWidget() {
  const ui = { ...DEFAULT_UI, ...(await readOne('ui', {})) };
  const show = ui.hidden || !ui.open;
  await patchUi(show ? { hidden: false, open: true } : { hidden: true });
}

api.commands?.onCommand.addListener((command) => {
  if (command === 'toggle-widget') toggleWidget();
});

const menus = api.contextMenus ?? api.menus;

function createMenus() {
  if (!menus) return;
  // Promise form only: Firefox's browser.* namespace does not take callbacks.
  Promise.resolve(menus.removeAll()).then(() => {
    menus.create({ id: 'lexiflip-selection', title: 'Tambahkan “%s” ke Lexiflip', contexts: ['selection'] });
    menus.create({ id: 'lexiflip-page', title: 'Buat flashcard dari halaman ini', contexts: ['page'] });
  }).catch(() => {});
}

menus?.onClicked.addListener((info, tab) => {
  if (!tab?.id || tab.id < 0) return;
  const message = info.menuItemId === 'lexiflip-selection'
    ? { type: 'build', mode: 'selection', text: info.selectionText || '' }
    : { type: 'build', mode: 'page' };
  // Pages where extensions may not run (browser pages, web stores, PDF viewer): open the
  // full Lexiflip page instead so the click still does something.
  Promise.resolve(api.tabs.sendMessage(tab.id, message)).catch(() => {
    const word = message.mode === 'selection' ? message.text.trim() : '';
    const short = word && word.split(/\s+/).length <= 4;
    handlers.openApp({ hash: short ? `add=${encodeURIComponent(word)}` : '' }).catch(() => {});
  });
});

// Tabs opened before an install or update have no widget (or a disconnected one, which
// would throw "Extension context invalidated" on every click). Inject a fresh copy; the new
// widget removes the stale one.
async function injectIntoOpenTabs() {
  const files = api.runtime.getManifest().content_scripts?.[0]?.js || [];
  if (!api.scripting || !files.length) return;
  const tabs = await api.tabs.query({ url: ['http://*/*', 'https://*/*'] });
  await Promise.all(tabs
    .filter((t) => t.id >= 0 && !t.discarded)
    .map((t) => Promise.resolve(api.scripting.executeScript({ target: { tabId: t.id }, files })).catch(() => {})));
}

api.runtime.onInstalled.addListener(async () => {
  createMenus();
  const settings = await readOne('settings', null);
  if (!settings) await local.set({ settings: DEFAULT_SETTINGS, ui: DEFAULT_UI, decks: [], activeDeckId: null });
  pruneCache().catch(() => {});
  injectIntoOpenTabs().catch(() => {});
});

api.runtime.onStartup.addListener(() => {
  createMenus();
  pruneCache().catch(() => {});
});
