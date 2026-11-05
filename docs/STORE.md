# Store listing

Text to paste into the Chrome Web Store, Edge Partner Center and AMO forms. Indonesian first
(primary audience), English second (add it as a second listing language where the store allows).

## Name

Lexiflip – Flashcard dari Artikel

## Summary (max 132 characters)

- **ID**: Ubah artikel apa pun jadi flashcard kosakata beserta artinya, langsung di pojok layar saat membaca.
- **EN**: Turn any article into vocabulary flashcards with meanings, right in the corner of your screen while you read.

## Description

### Bahasa Indonesia

Belajar kosakata dari bacaan yang memang kamu baca setiap hari.

Lexiflip mengambil kata-kata penting dari artikel di halaman yang sedang terbuka dan
mengubahnya menjadi flashcard: kata di depan, arti di belakang. Widget kecilnya ada di pojok
bawah layar dan tetap muncul saat kamu pindah tab atau jendela, jadi kamu bisa terus belajar
sambil membaca.

Fitur:
• Satu klik untuk mengubah artikel menjadi 10–50 kartu. Menu, iklan, dan footer diabaikan.
• Blok teks tertentu untuk membuat kartu dari bagian itu saja, atau gunakan menu klik kanan.
• Terjemahan ke Bahasa Indonesia (atau 13 bahasa lain), definisi bahasa Inggris, kelas kata, dan transkripsi fonetik.
• Kalimat asal dari artikel, dengan kata yang di-highlight.
• Tandai sudah hafal atau belum hafal, ulangi yang belum hafal, acak kartu, dan dengarkan pelafalannya.
• Dek tersimpan otomatis. Progres sama di semua tab dan jendela.
• Pintasan Alt+Shift+K, mode gelap, posisi kiri atau kanan.

Privasi: tanpa akun, tanpa iklan, tanpa pelacakan. Dek tersimpan di browser kamu. Hanya
kata-kata tunggal yang dikirim ke layanan kamus dan terjemahan.

### English

Learn vocabulary from the articles you actually read.

Lexiflip picks the key words from the article on the current page and turns them into
flashcards: the word on the front, its meaning on the back. A small widget sits in the bottom
corner and stays with you across tabs and windows, so you can keep studying while you read.

Features:
• One click turns an article into 10–50 cards. Menus, ads and footers are ignored.
• Select a passage to make cards from just that part, or use the right-click menu.
• Translations into Indonesian or 13 other languages, plus English definitions, part of speech and phonetics.
• The original sentence from the article, with the word highlighted.
• Mark cards as known or not yet, review only unknown cards, shuffle, and hear the pronunciation.
• Decks are saved automatically. Progress is the same in every tab and window.
• Alt+Shift+K shortcut, dark mode, left or right position.

Privacy: no account, no ads, no tracking. Decks stay in your browser. Only single words are sent
to the dictionary and translation services.

## Category

- Chrome: **Education**
- Edge: **Education**
- Firefox: **Language Support**, plus **Education** if offered

## Single purpose (Chrome)

Lexiflip turns the text of the page the user is reading into vocabulary flashcards with
translations and definitions, shown in a floating widget.

## Permission justifications (Chrome "Privacy practices" tab)

| Permission | Justification |
| --- | --- |
| `storage` | Saves the user's flashcard decks, learning progress, settings and a cache of word meanings locally. |
| `contextMenus` | Adds "Create flashcards from selected text / this page" to the right-click menu. |
| Host permission `api.dictionaryapi.dev` | Fetches English definitions and pronunciation for the words on the cards. |
| Host permission `api.mymemory.translated.net` | Fetches translations of the words on the cards into the user's chosen language. |
| Content script on `http://*/*`, `https://*/*` | The flashcard widget must appear on every page the user reads, and must read that page's text when the user asks to create cards. Page text is processed locally and only individual words are sent for lookup. |
| Remote code | No. All code is in the package. |

## Data usage disclosure (Chrome)

- Collected: **Website content** (individual words from the page, sent for dictionary/translation lookup, only when the user creates a deck).
- Not collected: personal info, health, financial, authentication, personal communications, location, web history, user activity.
- Certify: not sold, not used for unrelated purposes, not used for creditworthiness.

## Firefox data collection

The Firefox manifest declares `data_collection_permissions.required: ["websiteContent"]`, so
Firefox shows this to the user at install time. This matches the Chrome disclosure above.

## Assets needed before submitting

- Screenshots: at least one at 1280×800 (Chrome/Edge) showing the widget over an article. Suggested set: front of a card, back of a card, settings, deck list.
- Store icon: `src/icons/icon-128.png` (Edge can also take a 300×300 logo; scale up with `npm run icons` after adding 300 to `SIZES`).
- Chrome small promo tile 440×280 (optional but recommended).
- Privacy policy URL: publish `PRIVACY.md` somewhere public.
