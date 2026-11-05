# Lexiflip

Ekstensi browser yang mengubah artikel yang sedang kamu baca menjadi flashcard kosakata
beserta artinya. Widget-nya ada di pojok bawah layar dan tetap muncul di setiap tab dan
jendela browser, dengan dek dan posisi kartu yang sama.

Satu kode sumber untuk **Chrome**, **Microsoft Edge**, dan **Firefox** (Manifest V3).
Tanpa akun dan tanpa server sendiri. Semua data tersimpan di browser pengguna.

## Fitur

- **Artikel → kartu**: mengambil isi utama halaman (bukan menu atau footer), membuang kata
  umum, nama orang, nama tempat, dan singkatan, lalu memilih kata yang paling sering muncul.
- **Blok teks → kartu**: blok sebagian teks lalu klik *Buat dari halaman ini*, atau klik kanan →
  *Buat flashcard dari teks terpilih*.
- **Arti lengkap**: terjemahan (default Bahasa Indonesia, bisa diganti ke 14 bahasa), definisi
  bahasa Inggris dengan kelas kata, transkripsi fonetik, bentuk dasar (*retreating → retreat*),
  dan kalimat asal dari artikel dengan kata yang di-highlight.
- **Belajar**: kartu bolak-balik (klik atau Spasi), ←/→ untuk pindah kartu, tandai
  *Sudah hafal*/*Belum hafal*, filter hanya yang belum hafal, acak urutan, dan pelafalan suara.
- **Tetap terlihat**: posisi kanan atau kiri bawah, bisa dikecilkan jadi tombol bulat (dengan
  jumlah kartu yang belum hafal) atau disembunyikan. Tampilkan lagi lewat ikon toolbar atau
  <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>K</kbd>.
- **Dek tersimpan**: sampai 30 dek terakhir, lengkap dengan progres hafalannya.
- Mode gelap mengikuti pengaturan sistem.

Bahasa artikel yang didukung: semua bahasa berspasi, plus Jepang, Mandarin, dan Korea (dipecah
dengan `Intl.Segmenter`). Definisi lengkap hanya tersedia untuk artikel berbahasa Inggris. Untuk
bahasa lain, kartu hanya berisi terjemahan.

## Struktur

```
ext-lexiflip/
├─ src/                    kode ekstensi (tanpa manifest; manifest dibuat saat build)
│  ├─ background.js        service worker: cari arti, cache, satu-satunya penulis data dek
│  ├─ content/
│  │  ├─ extract.js        artikel/teks → daftar kata + kalimat asal
│  │  ├─ styles.js         CSS widget (dipasang di dalam Shadow DOM)
│  │  └─ widget.js         UI widget mengambang
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

Butuh Node.js 20+. Tidak ada `npm install` karena tidak ada dependency.

```bash
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

Setelah mengubah kode: build ulang, klik tombol reload ekstensi, lalu **muat ulang tab** yang
sudah terbuka. Widget lama di tab itu akan berhenti bekerja sampai halamannya dimuat ulang. Ini
juga berlaku untuk tab yang sudah terbuka sebelum ekstensi dipasang.

Add-on sementara di Firefox hilang saat Firefox ditutup. Firefox butuh versi 140 atau lebih baru.

## Upload ke store

Naikkan `version` di `package.json` setiap kali upload, lalu `npm run build`.
Isi listing (deskripsi, kategori, alasan izin) sudah disiapkan di [docs/STORE.md](docs/STORE.md).
Kebijakan privasi ada di [PRIVACY.md](PRIVACY.md). Store meminta URL publik untuk kebijakan
privasi. Selama repo ini publik, cukup pakai
`https://github.com/roroayup/ext-lexiflip/blob/main/PRIVACY.md`.

| Store | File | Catatan |
| --- | --- | --- |
| [Chrome Web Store](https://chrome.google.com/webstore/devconsole) | `dist/lexiflip-chrome-<versi>.zip` | Biaya pendaftaran developer sekali bayar US$5. Wajib mengisi tab *Privacy practices*. |
| [Microsoft Edge Add-ons](https://partner.microsoft.com/dashboard/microsoftedge/overview) | `dist/lexiflip-edge-<versi>.zip` | Gratis, lewat Partner Center. |
| [Firefox Add-ons (AMO)](https://addons.mozilla.org/developers/) | `dist/lexiflip-firefox-<versi>.zip` | Gratis. Kode tidak di-minify, jadi tidak perlu mengunggah source code terpisah. |

Semua store butuh minimal satu screenshot 1280×800 atau 640×400. Ambil dari widget yang
sedang terbuka di atas sebuah artikel.

Karena ekstensi ini berjalan di semua situs (agar widget bisa muncul di mana saja), review
pertama biasanya lebih lama, sekitar beberapa hari.

**Jangan pernah mengubah `GECKO_ID`** di `scripts/build.mjs` setelah upload pertama ke Firefox,
karena Firefox mengenali add-on dari ID itu.

## Batasan

- Widget tidak bisa muncul di halaman milik browser (`chrome://`, `edge://`, `about:`), di Chrome
  Web Store/Edge Add-ons/AMO, di penampil PDF bawaan, dan di halaman tab baru. Ini aturan semua
  browser untuk ekstensi.
- Widget hanya ada di dalam jendela browser. Ekstensi tidak bisa menampilkan jendela yang selalu
  di atas aplikasi lain di luar browser.
- Arti diambil dari layanan gratis:
  [Free Dictionary API](https://dictionaryapi.dev) untuk definisi dan
  [MyMemory](https://mymemory.translated.net) untuk terjemahan. MyMemory membatasi pemakaian
  anonim sekitar 5.000 karakter per hari per IP (±500–1.000 kata). Hasil yang sudah pernah dicari
  disimpan di cache, jadi kata yang sama tidak dihitung lagi. Terjemahan satu kata tanpa konteks
  kadang kurang tepat, dan kalimat asal di kartu membantu menutupi kekurangan itu.
