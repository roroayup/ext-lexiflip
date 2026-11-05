# Store listing

Text to paste into the Chrome Web Store, Edge Partner Center and AMO forms. Indonesian first
(primary audience), English second (add it as a second listing language where the store allows).

## Name

Lexiflip – Flashcard Kosakata

## Summary (max 132 characters)

- **ID**: Flashcard kosakata dari artikel, dokumen, atau kata pilihanmu, lengkap dengan arti. Selalu siap di pojok layar.
- **EN**: Vocabulary flashcards from articles, documents or your own words, with meanings. Always ready in the corner of your screen.

## Description

### Bahasa Indonesia

Hafalkan kosakata dari bacaan yang memang kamu baca setiap hari.

Lexiflip membuat flashcard (kata di depan, arti di belakang) dari mana saja: artikel yang sedang
dibuka, dokumen yang kamu upload, kata yang kamu blok, atau kata yang kamu ketik sendiri. Widget
kecilnya ada di pojok bawah layar dan tetap muncul saat kamu pindah tab atau jendela. Halaman
belajar penuh bisa dibuka kapan saja dari ikon di toolbar.

Fitur:
• Blok sebuah kata, klik "Flashcard", lalu pilih Tambah atau Batal. Arti, definisi, dan kalimat asalnya langsung muncul.
• Tambah kata sendiri lengkap dengan arti dan contoh kalimat, atau minta arti otomatis.
• Ubah artikel atau dokumen (PDF, Word, EPUB, PowerPoint, ODT, TXT, subtitle) menjadi kartu. Pilih sendiri kata mana yang dijadikan kartu.
• Terjemahan ke Bahasa Indonesia (atau 13 bahasa lain), definisi bahasa Inggris, kelas kata, dan cara baca.
• Tandai sudah hafal atau belum hafal, ulangi yang belum hafal, acak kartu, dan dengarkan pelafalannya.
• Daftar kata dengan pencarian, edit, dan hapus. Progres sama di semua tab dan jendela.
• Pintasan Alt+Shift+K, mode gelap, posisi kiri atau kanan.

Privasi: tanpa akun, tanpa iklan, tanpa pelacakan. Dek tersimpan di browser kamu. Dokumen dibaca
di komputer kamu sendiri. Hanya kata yang kamu pilih yang dikirim ke layanan kamus dan terjemahan.

### English

Memorize vocabulary from what you actually read.

Lexiflip makes flashcards (word on the front, meaning on the back) from anywhere: the article you
have open, a document you upload, a word you select, or words you type in yourself. A small widget
sits in the bottom corner and stays with you across tabs and windows, and a full study page is one
click away in the toolbar.

Features:
• Select a word, click "Flashcard", then Add or Cancel. Its meaning, definition and sentence appear instantly.
• Add your own words with meaning and example sentence, or let Lexiflip suggest the meaning.
• Turn an article or a document (PDF, Word, EPUB, PowerPoint, ODT, TXT, subtitles) into cards. You pick which words become cards.
• Translations into Indonesian or 13 other languages, plus English definitions, part of speech and pronunciation.
• Mark cards as known or not yet, review only unknown cards, shuffle, and hear the pronunciation.
• Word list with search, edit and delete. Progress is the same in every tab and window.
• Alt+Shift+K shortcut, dark mode, left or right position.

Privacy: no account, no ads, no tracking. Decks stay in your browser. Documents are read on your
device. Only the words you choose are sent to the dictionary and translation services.

## Category

- Chrome: **Education**
- Edge: **Education**
- Firefox: **Language Support**, plus **Education** if offered

## Single purpose (Chrome)

Lexiflip helps the user memorize vocabulary with flashcards made from words they read on web pages,
words in their own documents, or words they enter, with translations and definitions, shown in a
floating widget and a study page.

## Permission justifications (Chrome "Privacy practices" tab)

| Permission | Justification |
| --- | --- |
| `storage` | Saves the user's flashcard decks, learning progress, settings and a cache of word meanings locally. |
| `contextMenus` | Adds "Add “word” to Lexiflip" and "Create flashcards from this page" to the right-click menu. |
| `scripting` | After an install or update, puts the flashcard widget back into tabs that were already open (the previous copy in those tabs stops working when the extension updates). No other script injection. |
| Host permissions `http://*/*`, `https://*/*` (and content script on them) | The flashcard widget appears on every page the user reads; selecting a word shows the "Flashcard" button; and the page's text is read locally when the user asks to make cards from it. Also needed for `scripting` above. Page text never leaves the device; only words the user picks are looked up. |
| Host permission `api.dictionaryapi.dev` | Fetches English definitions and pronunciation for the words on the cards. |
| Host permission `api.mymemory.translated.net` | Fetches translations of the words on the cards into the user's chosen language. |
| Remote code | No. All code is in the package, including Mozilla's pdf.js for reading PDF files. |

## Data usage disclosure (Chrome)

- Collected: **Website content** (individual words the user picks or selects, sent for dictionary/translation lookup, only when the user creates cards or asks for a meaning).
- Not collected: personal info, health, financial, authentication, personal communications, location, web history, user activity.
- Certify: not sold, not used for unrelated purposes, not used for creditworthiness.

## Firefox data collection

The Firefox manifest declares `data_collection_permissions.required: ["websiteContent"]`, so
Firefox shows this to the user at install time. This matches the Chrome disclosure above.

## Notes for AMO reviewers

Paste into "Notes to Reviewer" on addons.mozilla.org:

> `vendor/pdf.min.mjs` and `vendor/pdf.worker.min.mjs` are unmodified files from the npm package
> `pdfjs-dist@4.10.38` (`legacy/build/`), Mozilla's PDF.js, used only to extract text from PDF files
> the user opens on the study page (`app/docparse.js`). It is called with `isEvalSupported: false`;
> the `Function` constructor warnings from the linter come from that library. Everything else is
> unminified source. Rebuild with `npm install && npm run build:firefox` (Node 20+).

## Assets needed before submitting

- Screenshots, at least one at 1280×800 (Chrome/Edge). Suggested set: the widget over an article
  (back of a card), the selection popover with Add/Cancel, the word picker, the study page.
- Store icon: `src/icons/icon-128.png` (Edge can also take a 300×300 logo; scale up with
  `npm run icons` after adding 300 to `SIZES`).
- Chrome small promo tile 440×280 (optional but recommended).
- Privacy policy URL: `https://github.com/roroayup/ext-lexiflip/blob/main/PRIVACY.md`.
