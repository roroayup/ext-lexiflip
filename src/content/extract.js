// Turns the readable part of a page (or a piece of selected text) into a ranked list of
// vocabulary words, each with the first sentence it appeared in. No network, no storage:
// background.js does the lookups. Exposed as globalThis.LexiflipExtract for widget.js.
(() => {
  'use strict';
  if (globalThis.LexiflipExtract) return;

  const MAX_CHARS = 60000;

  // English function words plus very common words that make poor flashcards.
  const SKIP_EN = `a about above after again against all almost also although always am among an and
    another any anyone anything are around as at away back based be because been before being below
    best better between both but by came can cannot come comes could did different do does doing done
    down during each early either else even ever every everyone everything example few first for found
    from further get gets getting give given gives going gone good got great had has have having he her
    here hers herself him himself his how however i if in including into is it its itself just keep know
    known large last later least less let like likely little long look made make makes making many may
    maybe me might more most much must my myself need never new next no nor not nothing now number of
    off often old on once one only onto or other others our ours ourselves out over own part people
    perhaps place point put quite rather really right said same say says see seem seems several shall
    she should show since small so some someone something sometimes soon still such sure take taken than
    that the their theirs them themselves then there these they thing things think this those though
    three through thus time times to today together too took toward towards two under until up upon us
    use used uses using very want wants was way ways we well went were what whatever when where whether
    which while who whole whom whose why will with within without would year years yes yet you your
    yours yourself yourselves day days week weeks month months world life work works told tell tells
    called call able according across already actually along became become becomes begin began behind
    believe brought certain clear close course enough especially far feel felt full gave general group
    groups half hand high important instead kind became largely lot mean means mostly near nearly needs
    open order particular possible probably public reason recent recently second show shown simply
    start started taking thought turn usually various whatever whose retrieved archived`;

  // Indonesian function words, for pages written in Indonesian.
  const SKIP_ID = `yang dan di ke dari ini itu untuk dengan pada adalah dalam tidak akan juga atau karena
    oleh sebagai bahwa ada mereka kami kita saya anda dia ia telah sudah bisa dapat lebih harus seperti
    saat setelah tersebut hanya masih jika agar namun tetapi serta antara para sangat banyak semua secara
    sehingga hingga bagi kepada tentang bagaimana apa siapa mengapa kenapa kapan dimana sini sana begitu
    lagi pun lain baru sendiri sejak selama sedang belum pernah yaitu yakni maka bila kalau sebuah
    seorang beberapa setiap tanpa melalui menjadi terhadap merupakan bukan tak akan nya itulah inilah`;

  const toSet = (s) => new Set(s.split(/\s+/).filter(Boolean));
  const SKIP = new Set([...toSet(SKIP_EN), ...toSet(SKIP_ID)]);

  const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
  const HAS_LETTER = /\p{L}/u;
  const HAS_DIGIT = /\p{N}/u;
  const WORD_RE = /\p{L}+(?:['-]\p{L}+)*/gu;

  const SKIP_SEL = [
    'script', 'style', 'noscript', 'template', 'svg', 'canvas', 'code', 'pre', 'kbd', 'samp',
    'nav', 'aside', 'footer', 'form', 'button', 'select', 'textarea', 'input', 'label',
    '[hidden]', '[aria-hidden="true"]', '[role="navigation"]', '[role="complementary"]',
    // Citations, footnotes and edit links ("Retrieved …", "Archived from the original", "[edit]").
    'cite', 'sup', '.reference', '.references', '.reflist', '.refbegin', '.mw-references-wrap',
    '.mw-editsection', '.navbox', '.hatnote', '.citation', '.footnotes',
    '[role="doc-endnotes"]', '[role="doc-bibliography"]', '[role="doc-noteref"]',
    'lexiflip-widget',
  ].join(',');
  const BLOCK_SEL = 'p,li,h1,h2,h3,h4,h5,h6,blockquote,dd,dt,td,th,figcaption,div,section,article';
  const ROOT_SEL = [
    'article', 'main', '[role="main"]', '[itemprop="articleBody"]',
    '.post-content', '.entry-content', '.article-body', '.article-content', '.story-body',
  ].join(',');

  function pageLang() {
    const raw = (document.documentElement.lang || '').trim().toLowerCase().split(/[-_]/)[0];
    return /^[a-z]{2,3}$/.test(raw) ? raw : '';
  }

  function pageTitle() {
    const og = document.querySelector('meta[property="og:title"]')?.content?.trim();
    const h1 = document.querySelector('article h1, main h1, h1')?.textContent?.trim();
    return (og || h1 || document.title || location.hostname).replace(/\s+/g, ' ').slice(0, 140);
  }

  function paragraphChars(el) {
    let n = 0;
    for (const p of el.querySelectorAll('p')) n += p.textContent.length;
    return n;
  }

  // Readability-lite: prefer semantic containers, else the element holding the most paragraph text.
  function mainRoot() {
    let best = null;
    let bestLen = 0;
    for (const el of document.querySelectorAll(ROOT_SEL)) {
      const len = paragraphChars(el);
      if (len > bestLen) { best = el; bestLen = len; }
    }
    if (best && bestLen > 600) return best;

    const scores = new Map();
    for (const p of document.querySelectorAll('p')) {
      const len = p.textContent.trim().length;
      if (len < 40 || p.closest(SKIP_SEL)) continue;
      const parent = p.parentElement;
      if (!parent) continue;
      scores.set(parent, (scores.get(parent) || 0) + len);
      const grand = parent.parentElement;
      if (grand) scores.set(grand, (scores.get(grand) || 0) + len / 2);
    }
    let top = null;
    let topScore = 0;
    for (const [el, score] of scores) if (score > topScore) { top = el; topScore = score; }
    return topScore > 300 ? top : document.body;
  }

  function collectText(root) {
    const visible = new Map();
    const isVisible = (el) => {
      if (!visible.has(el)) {
        visible.set(el, typeof el.checkVisibility === 'function'
          ? el.checkVisibility({ visibilityProperty: true })
          : el.getClientRects().length > 0);
      }
      return visible.get(el);
    };
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const el = node.parentElement;
        if (!el || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        if (el.closest(SKIP_SEL) || !isVisible(el)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    const parts = [];
    let size = 0;
    let lastBlock = null;
    while (walker.nextNode() && size < MAX_CHARS) {
      const node = walker.currentNode;
      const block = node.parentElement.closest(BLOCK_SEL);
      if (block !== lastBlock) { parts.push('\n'); lastBlock = block; }
      parts.push(node.nodeValue);
      size += node.nodeValue.length;
    }
    return parts.join('');
  }

  function segmenter(lang) {
    try {
      if (typeof Intl.Segmenter === 'function') return new Intl.Segmenter(lang || undefined, { granularity: 'word' });
    } catch { /* unsupported locale: fall back to the regex tokenizer */ }
    return null;
  }

  function* tokens(sentence, seg) {
    if (seg) {
      for (const part of seg.segment(sentence)) if (part.isWordLike) yield part.segment;
    } else {
      yield* sentence.match(WORD_RE) || [];
    }
  }

  function clip(sentence, surface) {
    if (sentence.length <= 240) return sentence;
    const at = Math.max(0, sentence.toLowerCase().indexOf(surface.toLowerCase()));
    const start = Math.max(0, at - 100);
    const piece = sentence.slice(start, start + 220).trim();
    return `${start > 0 ? '… ' : ''}${piece}${start + 220 < sentence.length ? ' …' : ''}`;
  }

  function analyze(text, { lang = 'en', maxCards = 20, minLength = 4 } = {}) {
    const seg = segmenter(lang);
    const keepCase = lang === 'de'; // German capitalises every noun, so capitals don't mean "name"
    const sentences = text
      .replace(/[’‘]/g, "'")
      .split(/(?<=[.!?。！？])\s+|\n+/)
      .map((s) => s.replace(/\s+/g, ' ').trim())
      .filter((s) => s.length > 1);

    const stats = new Map();
    for (const sentence of sentences) {
      let first = true;
      for (const raw of tokens(sentence, seg)) {
        const isFirst = first;
        first = false;
        const tok = raw.replace(/^['-]+|['-]+$/g, '');
        if (!tok || !HAS_LETTER.test(tok) || HAS_DIGIT.test(tok)) continue;
        const cjk = CJK.test(tok);
        if (tok.length < (cjk ? 2 : minLength)) continue;
        const lower = tok.toLowerCase();
        if (SKIP.has(lower) || SKIP.has(lower.replace(/'s$/, ''))) continue;
        if (!cjk && tok.length > 1 && tok === tok.toUpperCase() && tok !== lower) continue; // acronym

        let s = stats.get(lower);
        if (!s) {
          s = { word: lower, count: 0, lowerSeen: false, capMid: 0, surfaces: new Map(), sentence };
          stats.set(lower, s);
        }
        s.count += 1;
        s.surfaces.set(tok, (s.surfaces.get(tok) || 0) + 1);
        if (tok === lower) s.lowerSeen = true;
        else if (!isFirst) s.capMid += 1;
      }
    }

    // Fold simple English plurals into their singular when both occur.
    for (const [key, s] of stats) {
      const base = key.endsWith('es') && stats.has(key.slice(0, -2)) ? key.slice(0, -2)
        : key.endsWith('s') && !key.endsWith('ss') && stats.has(key.slice(0, -1)) ? key.slice(0, -1)
        : null;
      if (!base) continue;
      const target = stats.get(base);
      target.count += s.count;
      target.lowerSeen ||= s.lowerSeen;
      stats.delete(key);
    }

    const ranked = [];
    for (const s of stats.values()) {
      if (!keepCase && !s.lowerSeen && s.capMid > 0) continue; // proper noun (a name or a place)
      const display = keepCase
        ? [...s.surfaces].sort((a, b) => b[1] - a[1])[0][0]
        : s.word;
      const score = s.count * (1 + Math.min(s.word.length, 12) / 6);
      ranked.push({ word: s.word, display, count: s.count, context: clip(s.sentence, display), score });
    }
    ranked.sort((a, b) => b.score - a.score || a.word.localeCompare(b.word));
    return ranked.slice(0, maxCards).map(({ score, ...card }) => card);
  }

  function fromText(text, opts) {
    return { title: `Teks pilihan · ${pageTitle()}`, words: analyze(String(text || '').slice(0, MAX_CHARS), opts) };
  }

  function fromPage(opts) {
    return { title: pageTitle(), words: analyze(collectText(mainRoot()), opts) };
  }

  globalThis.LexiflipExtract = { analyze, fromText, fromPage, pageLang };
})();
