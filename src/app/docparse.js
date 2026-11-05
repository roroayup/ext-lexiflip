// Uploaded document -> plain text, entirely in the browser (nothing is uploaded anywhere).
// ZIP-based formats (DOCX, PPTX, ODT, EPUB) are unpacked with the built-in
// DecompressionStream; PDF goes through Mozilla's pdf.js, bundled under vendor/.
// Exposes globalThis.LexiflipDocs = { parse(file, onProgress) -> Promise<string> }.
(() => {
  'use strict';

  const api = globalThis.browser ?? globalThis.chrome;
  const MAX_CHARS = 500000;

  // ---------- ZIP ----------

  async function inflateRaw(bytes) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  function unzip(buffer) {
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);
    let eocd = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
      if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('Berkas ini rusak atau bukan dokumen yang didukung.');
    const count = view.getUint16(eocd + 10, true);
    let p = view.getUint32(eocd + 16, true);
    const entries = new Map();
    const utf8 = new TextDecoder();
    for (let n = 0; n < count && p + 46 <= bytes.length; n++) {
      if (view.getUint32(p, true) !== 0x02014b50) break;
      const nameLen = view.getUint16(p + 28, true);
      entries.set(utf8.decode(bytes.subarray(p + 46, p + 46 + nameLen)), {
        method: view.getUint16(p + 10, true),
        size: view.getUint32(p + 20, true),
        offset: view.getUint32(p + 42, true),
      });
      p += 46 + nameLen + view.getUint16(p + 30, true) + view.getUint16(p + 32, true);
    }
    return {
      names: [...entries.keys()],
      async text(name) {
        const e = entries.get(name);
        if (!e) return null;
        const start = e.offset + 30 + view.getUint16(e.offset + 26, true) + view.getUint16(e.offset + 28, true);
        const raw = bytes.subarray(start, start + e.size);
        if (e.method === 0) return utf8.decode(raw);
        if (e.method === 8) return utf8.decode(await inflateRaw(raw));
        throw new Error('Kompresi dokumen ini tidak didukung.');
      },
    };
  }

  // ---------- markup -> text ----------

  const parseXml = (s) => new DOMParser().parseFromString(s, 'application/xml');
  const BLOCKS = new Set(['P', 'DIV', 'LI', 'TR', 'BR', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'SECTION', 'ARTICLE', 'DD', 'DT', 'PRE', 'TD', 'TH']);

  /** Text of an HTML document, one line per block element, without scripts and chrome. */
  function htmlText(source) {
    const doc = new DOMParser().parseFromString(source, 'text/html');
    doc.querySelectorAll('script, style, noscript, template, nav, footer, header, aside, svg').forEach((n) => n.remove());
    const out = [];
    const walk = (node) => {
      for (const child of node.childNodes) {
        if (child.nodeType === 3) out.push(child.nodeValue);
        else if (child.nodeType === 1) {
          const block = BLOCKS.has(child.nodeName.toUpperCase());
          if (block) out.push('\n');
          walk(child);
          if (block) out.push('\n');
        }
      }
    };
    walk(doc.body || doc.documentElement);
    return out.join('');
  }

  /** Paragraph texts of an OOXML/ODF part: `para` and `run` are qualified tag names. */
  function xmlParagraphs(source, para, run, extra = {}) {
    const doc = parseXml(source);
    const lines = [];
    for (const p of doc.getElementsByTagName(para)) {
      let line = '';
      for (const n of p.getElementsByTagName('*')) {
        if (n.nodeName === run) line += n.textContent;
        else if (extra[n.nodeName]) line += extra[n.nodeName];
      }
      if (!run) line = p.textContent;
      if (line.trim()) lines.push(line);
    }
    return lines.join('\n');
  }

  async function docx(buffer) {
    const zip = unzip(buffer);
    const parts = ['word/document.xml', ...zip.names.filter((n) => /^word\/(footnotes|endnotes)\.xml$/.test(n))];
    const texts = [];
    for (const name of parts) {
      const xml = await zip.text(name);
      if (xml) texts.push(xmlParagraphs(xml, 'w:p', 'w:t', { 'w:tab': ' ', 'w:br': '\n' }));
    }
    if (!texts.length) throw new Error('Isi dokumen Word tidak ditemukan.');
    return texts.join('\n');
  }

  async function pptx(buffer) {
    const zip = unzip(buffer);
    const slides = zip.names
      .filter((n) => /^ppt\/(slides\/slide|notesSlides\/notesSlide)\d+\.xml$/.test(n))
      .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
    const texts = [];
    for (const name of slides) texts.push(xmlParagraphs(await zip.text(name), 'a:p', 'a:t', { 'a:br': '\n' }));
    return texts.join('\n');
  }

  async function odt(buffer) {
    const xml = await unzip(buffer).text('content.xml');
    if (!xml) throw new Error('Isi dokumen ODT tidak ditemukan.');
    const doc = parseXml(xml);
    const lines = [];
    for (const el of doc.getElementsByTagName('*')) {
      if (el.nodeName === 'text:p' || el.nodeName === 'text:h') lines.push(el.textContent);
    }
    return lines.join('\n');
  }

  async function epub(buffer, onProgress) {
    const zip = unzip(buffer);
    const container = await zip.text('META-INF/container.xml');
    const opfPath = container && parseXml(container).getElementsByTagName('rootfile')[0]?.getAttribute('full-path');
    let files;
    if (opfPath) {
      const opf = parseXml(await zip.text(opfPath));
      const dir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';
      const hrefs = new Map([...opf.getElementsByTagName('item')].map((i) => [i.getAttribute('id'), i.getAttribute('href')]));
      files = [...opf.getElementsByTagName('itemref')]
        .map((r) => hrefs.get(r.getAttribute('idref')))
        .filter(Boolean)
        .map((h) => decodeURIComponent(dir + h.split('#')[0]));
    } else {
      files = zip.names.filter((n) => /\.x?html?$/i.test(n)).sort();
    }
    const texts = [];
    let size = 0;
    for (let i = 0; i < files.length && size < MAX_CHARS; i++) {
      onProgress?.(`Membaca bab ${i + 1} dari ${files.length}…`);
      const html = await zip.text(files[i]);
      if (!html) continue;
      const t = htmlText(html);
      texts.push(t);
      size += t.length;
    }
    return texts.join('\n');
  }

  async function pdf(buffer, onProgress) {
    // Literal path, resolved against app/app.html: the bundled copy, never remote code.
    const pdfjs = await import('../vendor/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = api.runtime.getURL('vendor/pdf.worker.min.mjs');
    let doc;
    try {
      // Text only: no eval, no font loading, and no warnings about fonts we never render.
      doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), isEvalSupported: false, disableFontFace: true, verbosity: 0 }).promise;
    } catch (err) {
      if (err?.name === 'PasswordException') throw new Error('PDF ini dikunci kata sandi.');
      throw new Error('PDF ini rusak atau tidak bisa dibaca.');
    }
    const lines = [];
    let size = 0;
    try {
      for (let i = 1; i <= doc.numPages && size < MAX_CHARS; i++) {
        onProgress?.(`Membaca halaman ${i} dari ${doc.numPages}…`);
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        let line = '';
        for (const item of content.items) {
          if (typeof item.str !== 'string') continue;
          line += item.str;
          if (item.hasEOL) { lines.push(line); size += line.length; line = ''; }
        }
        lines.push(line, '');
        page.cleanup();
      }
    } finally {
      await doc.destroy();
    }
    // Words hyphenated across a line break: "gla-\ncier" -> "glacier".
    const text = lines.join('\n').replace(/(\p{L})-\n(\p{Ll})/gu, '$1$2');
    if (!/\p{L}{3}/u.test(text)) throw new Error('PDF ini berupa gambar hasil scan, jadi teksnya tidak bisa dibaca.');
    return text;
  }

  function subtitles(text) {
    return text
      .replace(/^﻿/, '')
      .split(/\r?\n/)
      .filter((l) => !/^(WEBVTT|NOTE\b|STYLE\b|\d+\s*$)/.test(l.trim()) && !l.includes('-->'))
      .map((l) => l.replace(/<[^>]+>/g, '').replace(/\{\\[^}]*\}/g, ''))
      .join('\n');
  }

  function markdown(text) {
    return text
      .replace(/```[\s\S]*?```/g, '\n')
      .replace(/`[^`]*`/g, ' ')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/^\s{0,3}(#{1,6}|[-*+>]|\d+\.)\s+/gm, '')
      .replace(/[*_~]{1,3}/g, '');
  }

  const READERS = {
    pdf: (f, p) => f.arrayBuffer().then((b) => pdf(b, p)),
    docx: (f) => f.arrayBuffer().then(docx),
    pptx: (f) => f.arrayBuffer().then(pptx),
    odt: (f) => f.arrayBuffer().then(odt),
    epub: (f, p) => f.arrayBuffer().then((b) => epub(b, p)),
    html: (f) => f.text().then(htmlText),
    htm: (f) => f.text().then(htmlText),
    xhtml: (f) => f.text().then(htmlText),
    srt: (f) => f.text().then(subtitles),
    vtt: (f) => f.text().then(subtitles),
    md: (f) => f.text().then(markdown),
    markdown: (f) => f.text().then(markdown),
    txt: (f) => f.text(),
    csv: (f) => f.text(),
  };

  async function parse(file, onProgress) {
    const ext = (file.name.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
    const reader = READERS[ext];
    if (!reader) {
      if (ext === 'doc' || ext === 'ppt') throw new Error(`Format .${ext} lama belum didukung. Simpan ulang sebagai .${ext}x lalu upload lagi.`);
      throw new Error(`Format .${ext || '?'} belum didukung.`);
    }
    onProgress?.(`Membaca ${file.name}…`);
    const text = String(await reader(file, onProgress) || '').replace(/\r\n?/g, '\n').slice(0, MAX_CHARS);
    if (!/\p{L}{3}/u.test(text)) throw new Error('Tidak ada teks yang bisa dibaca di dokumen ini.');
    return text;
  }

  globalThis.LexiflipDocs = { parse, unzip, htmlText };
})();
