# Lexiflip

Ekstensi browser untuk menghafal kosakata dengan flashcard. Kartunya bisa dibuat dari artikel
yang sedang dibaca, dari dokumen yang di-upload, dari teks yang diblok, atau dari kata yang kamu
ketik sendiri, lengkap dengan arti dan contoh kalimat. Widget-nya ada di pojok bawah layar dan
muncul di setiap tab dan jendela browser dengan dek dan posisi kartu yang sama. Ada juga halaman
belajar penuh yang bisa dibuka kapan saja.

Satu kode sumber untuk **Chrome**, **Microsoft Edge**, dan **Firefox** (Manifest V3).
Tanpa akun dan tanpa server sendiri. Semua data tersimpan di browser pengguna.

## Fitur

**Membuat kartu**
- **Tambah kata sendiri**: isi kata, arti, dan contoh kalimat. Tombol *Cari arti otomatis*
  memberi saran arti, definisi, dan cara baca. Kata masuk ke dek **Kosakata saya** atau dek lain.
- **Blok teks**: blok sebuah kata di halaman mana pun, lalu klik tombol **Flashcard** yang
  muncul. Popover menampilkan arti, definisi, dan kalimat asalnya. Kamu bisa mengubah artinya,
  lalu pilih **Tambah** atau **Batal**. Kalau yang diblok satu paragraf, muncul **Pilih kata dari
  teks ini**. Menu klik kanan juga tersedia.
- **Artikel → kartu**: *Buat dari halaman ini* mengambil isi utama halaman (menu, footer,
  referensi, dan link "edit" diabaikan). Kata umum, nama orang/tempat, dan singkatan dibuang.
- **Upload dokumen**: PDF, Word (DOCX), EPUB, PowerPoint (PPTX), ODT, TXT, Markdown, HTML, dan
  subtitle SRT/VTT, maksimal 25 MB. Dokumen dibaca di komputer pengguna dan tidak dikirim ke
  mana pun. Bahasanya dideteksi otomatis.
- **Pilih kata dulu**: dari artikel, paragraf, atau dokumen, Lexiflip menawarkan sampai 60 kata
  sebagai chip. Klik untuk memilih atau membatalkan, lalu simpan ke dek baru atau dek yang ada.

**Arti**
- Terjemahan (default Bahasa Indonesia, bisa diganti ke 14 bahasa), definisi bahasa Inggris
  dengan kelas kata, cara baca, bentuk dasar (*retreating → retreat*), dan kalimat asal dengan
  kata yang di-highlight.
- Kalau sebuah kata tidak punya terjemahan, definisinya yang diterjemahkan
  (*chamber* → "Kamar atau seperangkat kamar…").
- Arti yang kamu ketik atau edit sendiri tidak akan ditimpa oleh pencarian otomatis.

**Belajar**
- Kartu bolak-balik (klik atau <kbd>Spasi</kbd>), <kbd>←</kbd>/<kbd>→</kbd> untuk pindah, tombol
  *Sudah hafal*/*Belum hafal*, filter kartu yang belum hafal, acak urutan, dan pelafalan suara.
- **Halaman belajar penuh** (tab tersendiri): belajar, tambah kata, upload dokumen, kelola dek,
  dan **daftar kata** dengan pencarian, centang hafal, edit, dan hapus. Bisa dibuka dari popup
  di ikon toolbar, tombol ↗ di widget, atau saat widget tidak bisa tampil (tab baru, halaman
  browser).
- **Widget mengambang**: pojok kanan atau kiri bawah. Bisa dikecilkan jadi tombol bulat (dengan
  jumlah kartu yang belum hafal) atau disembunyikan. Tampilkan lagi lewat popup toolbar atau
  <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>K</kbd>.
- Mode gelap mengikuti pengaturan sistem.

Bahasa sumber yang didukung: semua bahasa berspasi, plus Jepang, Mandarin, dan Korea (dipecah
dengan `Intl.Segmenter`). Definisi lengkap hanya tersedia untuk kata bahasa Inggris. Untuk bahasa
lain, kartu berisi terjemahan.

## Struktur

```
ext-lexiflip/
├─ src/                    kode ekstensi (tanpa manifest; manifest dibuat saat build)
│  ├─ background.js        cari arti, cache, satu-satunya penulis data dek, pasang ulang widget
│  ├─ shared/              dipakai widget, halaman belajar, dan popup
│  │  ├─ core.js           konstanta, helper, dan morph() (render tanpa membongkar DOM)
│  │  ├─ extract.js        teks → daftar kata + kalimat asal, deteksi bahasa
│  │  ├─ styles.js         CSS (dipasang di dalam Shadow DOM untuk widget)
│  │  └─ ui.js             seluruh tampilan: belajar, daftar, form, pilih kata, dek, upload
│  ├─ content/widget.js    widget mengambang + tombol saat memblok teks
│  ├─ app/                 halaman belajar penuh + pembaca dokumen (docparse.js)
│  ├─ popup/               popup ikon toolbar
│  └─ icons/               ikon PNG (dibuat oleh scripts/make-icons.mjs)
├─ scripts/
│  ├─ build.mjs            manifest per browser + folder dist/ + ZIP siap upload
│  ├─ make-icons.mjs       menggambar ikon
│  └─ util.mjs             encoder PNG & ZIP tanpa dependency
├─ test/                   test Node (node:test)
├─ docs/STORE.md           teks listing store & alasan setiap izin
└─ PRIVACY.md              kebijakan privasi (dibutuhkan saat upload ke store)
```

## Menjalankan

Butuh Node.js 20+.

```bash
npm install       # sekali saja: memasang pdf.js (pembaca PDF)
npm test          # test ekstraksi kata & alur background
npm run build     # dist/chrome, dist/edge, dist/firefox + ZIP-nya
npm run icons     # gambar ulang ikon (hanya kalau desainnya diubah)
```

### Memasang versi lokal

Jalankan `npm run build` dulu, lalu:

| Browser | Langkah |
| --- | --- |
| Chrome | `chrome://extensions` → aktifkan **Developer mode** → **Load unpacked** → pilih `dist/chrome` |
| Edge | `edge://extensions` → aktifkan **Developer mode** → **Load unpacked** → pilih `dist/edge` |
| Firefox | `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** → pilih `dist/firefox/manifest.json` |

Setelah mengubah kode: build ulang, lalu klik tombol reload ekstensi. Widget di tab yang sudah
terbuka akan diganti otomatis dengan versi baru, jadi tab tidak perlu dimuat ulang.

Add-on sementara di Firefox hilang saat Firefox ditutup. Firefox butuh versi 140 atau lebih baru.

## Upload ke store

Naikkan `version` di `package.json` setiap kali upload, lalu `npm run build`.
Isi listing (deskripsi, kategori, alasan izin, catatan untuk reviewer) sudah disiapkan di
[docs/STORE.md](docs/STORE.md). Kebijakan privasi ada di [PRIVACY.md](PRIVACY.md). Store meminta
URL publik untuk kebijakan privasi. Selama repo ini publik, cukup pakai
`https://github.com/roroayup/ext-lexiflip/blob/main/PRIVACY.md`.

| Store | File | Catatan |
| --- | --- | --- |
| [Chrome Web Store](https://chrome.google.com/webstore/devconsole) | `dist/lexiflip-chrome-<versi>.zip` | Biaya pendaftaran developer sekali bayar US$5. Wajib mengisi tab *Privacy practices*. |
| [Microsoft Edge Add-ons](https://partner.microsoft.com/dashboard/microsoftedge/overview) | `dist/lexiflip-edge-<versi>.zip` | Gratis, lewat Partner Center. |
| [Firefox Add-ons (AMO)](https://addons.mozilla.org/developers/) | `dist/lexiflip-firefox-<versi>.zip` | Gratis. Kode Lexiflip tidak di-minify. pdf.js adalah rilis resmi Mozilla tanpa perubahan (lihat catatan reviewer di STORE.md). |

Semua store butuh minimal satu screenshot 1280×800 atau 640×400. Ambil dari widget yang
sedang terbuka di atas sebuah artikel, popover saat memblok kata, dan halaman belajar.

Karena ekstensi ini berjalan di semua situs (agar widget bisa muncul di mana saja), review
pertama biasanya lebih lama, sekitar beberapa hari.

**Jangan pernah mengubah `GECKO_ID`** di `scripts/build.mjs` setelah upload pertama ke Firefox,
karena Firefox mengenali add-on dari ID itu.

## Batasan

- Widget tidak bisa muncul di halaman milik browser (`chrome://`, `edge://`, `about:`), di Chrome
  Web Store/Edge Add-ons/AMO, di penampil PDF bawaan, dan di halaman tab baru. Ini aturan semua
  browser untuk ekstensi. Di halaman seperti itu, pakai popup toolbar → *Buka halaman belajar*.
- Widget hanya ada di dalam jendela browser. Ekstensi tidak bisa menampilkan jendela yang selalu
  di atas aplikasi lain di luar browser.
- PDF hasil scan (berupa gambar) tidak bisa dibaca karena tidak ada teksnya. Format lama .doc dan
  .ppt belum didukung; simpan ulang sebagai .docx/.pptx.
- Arti diambil dari layanan gratis:
  [Free Dictionary API](https://dictionaryapi.dev) untuk definisi dan
  [MyMemory](https://mymemory.translated.net) untuk terjemahan. MyMemory membatasi pemakaian
  anonim sekitar 5.000 karakter per hari per IP (±500–1.000 kata). Free Dictionary API juga
  sesekali menolak sementara (HTTP 429/502). Lexiflip mencoba ulang otomatis, dan kartu yang
  tetap gagal punya tombol *Coba lagi*. Hasil yang sudah pernah dicari disimpan di cache.
  Terjemahan otomatis kadang kurang tepat. Arti bisa diedit kapan saja, dan editan tidak akan
  ditimpa.
