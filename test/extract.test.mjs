import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

function loadExtract() {
  const ctx = createContext({ Intl, console });
  ctx.globalThis = ctx;
  runInContext(readFileSync(new URL('../src/content/extract.js', import.meta.url), 'utf8'), ctx);
  return ctx.LexiflipExtract;
}

const ARTICLE = `Researchers say the glacier is retreating faster than expected.
The retreating glacier has exposed ancient forests. Scientists measured the glacier twice.
In Greenland, the ice sheet is thinning. Greenland lost billions of tonnes of ice.
NASA satellites tracked the thinning ice sheets for decades. The forests were preserved under ice.`;

test('ranks repeated content words and skips function words', () => {
  const words = loadExtract().analyze(ARTICLE, { lang: 'en', maxCards: 10, minLength: 4 }).map((w) => w.word);
  assert.equal(words[0], 'glacier');
  for (const skipped of ['the', 'than', 'have', 'were', 'under']) assert.ok(!words.includes(skipped), skipped);
});

test('drops proper nouns and acronyms', () => {
  const words = loadExtract().analyze(ARTICLE, { lang: 'en', maxCards: 30, minLength: 4 }).map((w) => w.word);
  assert.ok(!words.includes('greenland'));
  assert.ok(!words.includes('nasa'));
});

test('folds plurals into the singular and keeps the first sentence as context', () => {
  const cards = loadExtract().analyze(ARTICLE, { lang: 'en', maxCards: 30, minLength: 4 });
  const forest = cards.find((c) => c.word === 'forest' || c.word === 'forests');
  assert.ok(forest);
  const sheet = cards.find((c) => c.word === 'sheet');
  assert.ok(sheet, 'sheet/sheets merged');
  assert.equal(sheet.count, 2);
  assert.ok(!cards.some((c) => c.word === 'sheets'));
  assert.match(cards.find((c) => c.word === 'glacier').context, /glacier is retreating/);
});

test('respects maxCards and minLength', () => {
  const x = loadExtract();
  assert.equal(x.analyze(ARTICLE, { lang: 'en', maxCards: 3 }).length, 3);
  assert.ok(x.analyze(ARTICLE, { lang: 'en', maxCards: 50, minLength: 7 }).every((c) => c.word.length >= 7));
});

test('German keeps capitalised nouns', () => {
  const cards = loadExtract().analyze('Die Wohnung ist klein. Meine Wohnung hat einen Balkon.', { lang: 'de', maxCards: 5 });
  assert.equal(cards[0].display, 'Wohnung');
});

test('Japanese is segmented into words', () => {
  const cards = loadExtract().analyze('私は毎日図書館で日本語を勉強します。図書館は静かです。', { lang: 'ja', maxCards: 5 });
  assert.ok(cards.some((c) => c.word.includes('図書館')), JSON.stringify(cards.map((c) => c.word)));
});
