# TubePark Roadmap

Hasil sesi brainstorming 2026-07-26. Ini **catatan pra-grilling**, bukan spesifikasi.
Setiap item masih akan digrill satu per satu sebelum dipindahkan ke GitHub issues
(konvensi repo: issues = GitHub issues via `gh`, lihat `docs/agents/issue-tracker.md`).

Status keseluruhan saat penulisan: 88 test hijau, tidak ada kode yang ditulis untuk
item mana pun di bawah ini.

**Cara membaca tanda:**

- ✅ **Terverifikasi** — sudah dibaca langsung di kode/fixture, dengan rujukan `file:line`.
- ⚠️ **Asumsi** — masuk akal tapi belum dibuktikan. Harus diverifikasi saat grilling.
- 🔓 **Terbuka** — pertanyaan desain yang belum ada jawabannya.

---

## Bagian 1 — Perbaikan gap

Ini bukan fitur. Ini hal-hal di mana kode yang sudah ada berperilaku salah,
atau UI menjanjikan sesuatu yang tidak ada. Dikerjakan lebih dulu.

### G1. Copy shortcut `P` yang tidak ada → hapus

**Keputusan: hapus copy-nya, jangan bangun shortcut-nya.**

✅ Terverifikasi. Dua tempat mengiklankan shortcut yang tidak diimplementasikan:

- `src/entrypoints/popup/App.svelte:204` — "Hover video di YouTube, tekan `P`"
- `src/entrypoints/sidepanel/App.svelte:137` — "Hover video di YouTube dan tekan `P` untuk memarkirkannya"

Tidak ada listener `keydown`/`keyup` di mana pun dalam `src/`, dan tidak ada
key `commands` di `wxt.config.ts`. Shortcut ini pernah ada di desain awal —
`CONTEXT.md` versi lama menyebut "Shortcut Capture: Hover video card + press `P`",
dan `ADR-0001` masih menyebutnya "primary driver" — lalu digantikan
`FloatingParkButton` saat migrasi. Copy-nya ikut tertinggal.

**Yang dikerjakan:** ubah kedua string agar hanya menyebut hover + klik-kanan.
Hapus elemen `<kbd>` beserta CSS-nya jika tidak terpakai lagi.

⚠️ `ADR-0001` (baris 10) juga masih menyebut "Shortcut Capture (hover + `P`) is the
primary driver". ADR mencatat keputusan pada waktunya dan biasanya tidak diedit —
tapi ini sekarang menyesatkan pembaca. Perlu diputuskan: tambah catatan koreksi,
atau biarkan sebagai catatan sejarah.

---

### G2. Shorts tidak bisa di-park

> **Sudah digrill** (2026-07-27) → `docs/grilling/g2-shorts.md`.
> Dua keputusan (G2-1, G2-2). Shorts = warga kelas satu (tak ditandai khusus):
> tambah `/shorts/{id}` ke `extractYouTubeVideoId`, semua konsumen ikut.
> Play selalu `/watch` (openVideo tak berubah, kontrol penuh). Thumbnail 16:9
> pillarbox. ⚠️ Butuh fixture Shorts; 🔓 pengecualian reuse tab Shorts feed.
> **Korelasi G3-2**: context menu `targetUrlPatterns` juga harus tambah `/shorts`.

✅ Terverifikasi. Selectornya sudah terpasang, parsernya belum:

- `src/shared/capture-predicates.ts:9` — `ytd-reel-item-renderer` ada di
  `YOUTUBE_VIDEO_CARD_SELECTORS`
- `src/shared/capture-predicates.ts:40` — `extractYouTubeVideoId` hanya mengenali
  `/watch` dan `youtu.be`

Akibatnya URL `/shorts/{id}` → `null` → `resolveCardMeta` mengembalikan `null` →
tombol park tidak pernah muncul di kartu Shorts. Setengah pekerjaan sudah ada.

**Yang dikerjakan:** tambah cabang `/shorts/{id}` di `extractYouTubeVideoId`.
Semua yang membaca video id ikut terbawa (id Shorts adalah id video biasa —
thumbnail `img.youtube.com/vi/{id}/mqdefault.jpg` dan URL `/watch?v={id}` sama-sama
berlaku).

🔓 Terbuka: `openVideo` (`tab-operations.ts:58`) selalu membuka `/watch?v=`.
Untuk Shorts, apakah dibuka sebagai `/watch` (pemutar biasa, kontrol penuh) atau
`/shorts/` (pengalaman aslinya)? Keduanya bisa dibela.

⚠️ Thumbnail Shorts rasio 9:16, sedangkan `Thumbnail.svelte:45-47` mengunci
`96×54` / `aspect-ratio: 16/9`. Thumbnail YouTube untuk Shorts biasanya tetap
dilayani dalam bingkai 16:9 dengan pillarbox, jadi kemungkinan besar tidak rusak —
tapi ini belum dicek dan harus dilihat langsung.

⚠️ Tidak ada fixture Shorts di `src/shared/__fixtures__/`. Perlu di-capture.

---

### G3. Context menu di luar YouTube gagal diam-diam

> **Sudah digrill** (2026-07-27) → `docs/grilling/g3-context-menu-scoping.md`.
> Dua keputusan (G3-1, G3-2). Persempit via `documentUrlPatterns` (menu hanya
> di YouTube, tutup silent fail). Plus perbaiki bug scoping youtu.be
> (tambah ke `targetUrlPatterns`). ADR-0001 tetap utuh. Park-dari-luar-YouTube
> ditutup jujur; bila diinginkan nanti = fitur tier-2 baru + buka ADR-0001.

✅ Terverifikasi. `background.ts:17` mendaftarkan menu dengan
`targetUrlPatterns: ["*://*.youtube.com/watch*"]`. Pola itu memfilter URL **link
yang diklik-kanan**, bukan URL **halaman tempat klik terjadi** (itu tugas
`documentUrlPatterns`, yang tidak dipasang).

Konsekuensinya: klik-kanan link YouTube di Reddit / Discord / mana pun → menu
"Park This Video" muncul → `background.ts:30` mengirim `chrome.tabs.sendMessage`
ke tab yang tidak punya content script (`content.ts:284` hanya cocok
`*://*.youtube.com/*`) → pesan tidak sampai, tidak ada penerima, tidak ada toast,
tidak ada yang tersimpan. User melihat menu, mengkliknya, dan tidak terjadi apa-apa.

Dua arah perbaikan, dan pilihannya bukan sepele:

- **Persempit** — tambahkan `documentUrlPatterns: ["*://*.youtube.com/*"]`.
  Menu hilang di luar YouTube. Jujur, sepele, dan menutup kemampuan.
- **Perluas** — park langsung di background tanpa content script. Metadata diambil
  dari YouTube oEmbed (`https://www.youtube.com/oembed?url=...&format=json`),
  yang mengembalikan `title` dan `author_name`. Ini justru *menambah* jangkauan:
  park video YouTube dari mana pun di web.

⚠️ Jalur oEmbed belum diuji sama sekali. Yang harus dibuktikan sebelum dipilih:
apakah `host_permissions` saat ini cukup untuk `fetch` dari service worker;
perilaku saat video privat/dihapus; dan bagaimana memberi feedback ke user
di halaman yang tidak punya content script (toast `content.ts:32` tidak tersedia
di sana — mungkin perlu `chrome.notifications`, yang justru sengaja dihindari
`CONTEXT.md` untuk kasus queue penuh).

🔓 Terbuka: memilih "perluas" berarti menyentuh `ADR-0001`, yang secara eksplisit
membatasi capture ke konteks YouTube.

---

### G4. `channel` di-hardcode `'YouTube'` saat park dari tab

> **Sudah digrill** (2026-07-27) → `docs/grilling/g4-tab-channel.md`.
> Dua keputusan (G4-1, G4-2). Jalur: pesan ke content script (tanpa network,
> tanpa permission baru) → baca DOM halaman watch. Fallback: 'YouTube' (konsisten
> F9-3). ⚠️ Selector halaman watch belum diverifikasi — butuh fixture halaman
> watch (yang ada hanya kartu). Fungsi `resolveWatchPageChannel()` dipakai
> bersama park-popup + fallback context-menu.

> **Via F9 juga**: G4 bukan lagi blokir F9 — F9-3 menerima data lama sebagai
> bucket "tak dikenal". G4 kini fix-forward: item baru dapat channel asli, item
> lama re-park dari hover untuk terkoreksi. G4 tetap punya nilai mandiri
> (memperbaiki placeholder thumbnail yang menampilkan "Y" untuk semua item
> tab-park).

✅ Terverifikasi. Dua tempat di popup:

- `src/entrypoints/popup/App.svelte:64` — `handleParkCurrentTab`
- `src/entrypoints/popup/App.svelte:90` — `handleParkAll`

Keduanya menulis `channel: 'YouTube'`. Judul diambil dari `tab.title` (dibersihkan
dari suffix `- YouTube`), tapi channel tidak pernah dicoba diambil.

Ini merusak premis produk: `CONTEXT.md` menyebut channel sebagai bagian dari
konteks visual, dan `Thumbnail.svelte:15` memakai huruf pertama channel sebagai
placeholder saat gambar gagal dimuat — jadi setiap item yang di-park dari tab
menampilkan "Y" dan bukan inisial channel sebenarnya.

⚠️ Fallback yang sama juga ada di `content.ts:324` (jalur context-menu ketika
kartu tidak ketemu di DOM). Perbaikan sebaiknya mencakup keduanya.

🔓 Terbuka: dari mana channel diambil? Tiga kandidat, semuanya belum diuji:
(a) `chrome.scripting` ke tab untuk membaca DOM halaman watch — butuh permission
`scripting` yang belum ada di `wxt.config.ts:11`; (b) oEmbed (`author_name`) —
sama seperti G3, jadi kalau G3 memilih "perluas", keduanya berbagi satu mekanisme;
(c) pesan ke content script yang sudah jalan di tab itu — paling murah, tapi hanya
berlaku untuk tab YouTube yang content scriptnya sudah termuat.

---

### G5. Model undo rusak — empat bug, dua di antaranya kehilangan data

> **Sudah digrill** (2026-07-26) → `docs/grilling/g5-undo-model.md`.
> **Sudah diimplementasikan** (#17) → `src/shared/pending-removal.ts` (reducer
> murni + test) + `src/entrypoints/background.ts` (pemilik pending + timer +
> commit) + `src/shared/storage.ts` (split `getQueue`/`getRawQueue`) +
> `src/entrypoints/sidepanel/App.svelte` (PENDING_REMOVE/CANCEL_REMOVE).
> Keputusan desain D1–D7; G6 diserap ke D6 (toast menyebut jumlah).
>
> Ternyata bukan satu race melainkan empat bug dari satu model yang salah —
> catatan di bawah ini adalah temuan awal, baca dokumen grilling untuk yang lengkap.

✅ Terverifikasi. `sidepanel/App.svelte:56-67` (`handleRemove`) menunda commit ke
storage selama 5 detik sambil memutasi `queue` secara optimistis di memori.
Sementara itu `sidepanel/App.svelte:41` memasang `chrome.storage.onChanged` →
`loadData()`, dan `loadData` (`:32`) menimpa `queue` dengan isi storage.

Storage belum berubah selama jendela 5 detik itu. Jadi **event apa pun** yang
memicu `onChanged` dalam jendela tersebut — park satu video dari YouTube, toggle
pin, `handleParkAll` dari popup — membuat item yang sudah "dihapus" muncul kembali.
Timernya tetap jalan dan tetap menghapus 5 detik kemudian, jadi item itu berkedip
keluar-masuk.

**Bug kedua di area yang sama, lebih parah:** `handleUndo` (`:69-81`) memanggil
`clearTimeout` di cabang `undoItem` (`:74`) tapi **tidak** di cabang `undoBulk`
(`:76-80`). Artinya undo untuk "Hapus Semua" terlihat berhasil — item kembali ke
list — lalu 5 detik kemudian timer `handleRemoveAllOlder` (`:92`) tetap menyala
dan menghapus semuanya dari storage. Undo bulk tidak berfungsi sama sekali;
ini bukan race, ini hilang data yang deterministik.

⚠️ Bug kedua ini tidak tertutup test mana pun — `storage.test.ts` menguji reducer
murni (`removeVideoPure` dsb.), sedangkan logika undo hidup di dalam komponen
Svelte dan tidak punya seam yang bisa diuji. Perbaikan sebaiknya memindahkan
model undo (pending-removal) ke modul murni agar bisa diuji, bukan menambal
`clearTimeout` saja.

🔓 Terbuka: pendekatan mana yang dipilih — commit ke storage langsung lalu undo
dengan menulis balik (paling sederhana, tapi urutan item bisa berubah), atau
pertahankan model pending tapi ajari `loadData` menghormati penghapusan yang
sedang tertunda.

---

### G6. Copy undo salah untuk penghapusan bulk

> **Diserap ke G5** — lihat D6 di `docs/grilling/g5-undo-model.md`. Slot pending
> menyimpan daftar item (1 atau N), jadi teks toast mengikuti `videos.length`.
> Tidak lagi jadi item terpisah.

✅ Terverifikasi. `sidepanel/App.svelte:220` selalu menampilkan "Video dihapus",
padahal toast yang sama dipakai oleh `handleRemoveAllOlder` yang bisa menghapus
puluhan item sekaligus.

Kecil, tapi ini justru saat user paling butuh kejelasan: penghapusan bulk adalah
aksi paling merusak di aplikasi ini.

**Yang dikerjakan:** bedakan pesannya, sertakan jumlah (mis. "12 video dihapus").
Digabung dengan G5 karena menyentuh state yang sama.

---

### G7. Indikator Now Playing basi saat navigasi SPA

> **Sudah digrill** (2026-07-27) → `docs/grilling/g7-now-playing-spa.md`.
> Satu keputusan (G7-1). Side panel via `onUpdated` (filter `changeInfo.url`
> YouTube) → `loadData()`. Popup tak diubah (ephemeral, onMount loadData cukup).
> Sepele, mandiri, bisa ship kapan saja.

✅ Terverifikasi. `sidepanel/App.svelte:43-45` memasang `chrome.tabs.onActivated`
saja. YouTube adalah SPA — pindah dari satu video ke video lain di tab yang sama
tidak mengganti tab aktif, jadi `onActivated` tidak menyala.

Akibatnya `nowPlaying` (dipakai di `:151`, `:174`, `:204`, `:239` untuk border
kartu dan `Equalizer`) tetap menunjuk video sebelumnya sampai user berpindah tab.

**Yang dikerjakan:** tambahkan listener `chrome.tabs.onUpdated`, difilter ke
perubahan URL pada tab YouTube.

⚠️ Popup (`popup/App.svelte:45-48`) hanya mendengarkan `storage.onChanged` dan
tidak punya listener tab sama sekali. Untuk popup ini kemungkinan tidak masalah
(popup dibuka sesaat lalu `loadData` jalan di `onMount`), tapi perlu dikonfirmasi
bahwa `nowPlaying` di popup memang selalu segar.

⚠️ `onUpdated` menyala sangat sering. Perlu filter yang ketat agar tidak memicu
`loadData` berlebihan.

---

## Bagian 2 — Tier 1: dampak tinggi, biaya rendah

Sejalan dengan domain yang ada. Tidak butuh ADR.

### F1. Indikator "sudah diparkir" di kartu YouTube ⭐

> **Sudah digrill** (2026-07-27) → `docs/grilling/f1-f2-feedback-loop.md`.
> Tiga keputusan (F1-1 s/d F1-3). Tanda hanya di tombol saat hover (nol DOM
> churn); klik saat sudah dipark = toggle hapus; hapus-dari-YouTube pakai grace
> period G5 dengan toast Undo. ⛔ **F1 toggle-hapus mustahil tanpa G5** (D3+D4
> + broadcast `PENDING_REMOVAL_CHANGED`) — F1-1 bisa sebelum G5, F1-2/F1-3
> harus setelah.

Rekomendasi tertinggi dari sesi brainstorming.

**Masalah:** saat berburu, tidak ada cara mengetahui apa yang sudah di-park tanpa
mengkliknya. Feedback baru datang setelah aksi — `content.ts:194` menampilkan
toast "Sudah ada di queue" *setelah* user mengklik. Loop umpan balik antara
YouTube dan queue hanya berjalan satu arah.

**Yang dikerjakan:** content script menyimpan `Set<videoId>` dari queue,
disinkronkan lewat `chrome.storage.onChanged`. `FloatingParkButton.update()`
(`content.ts:108`) sudah tahu `meta.videoId` setiap kali kartu berubah — cukup
tanyakan set itu dan render ikon `pinFill` + warna aksen kalau sudah ada.

✅ Ikon `pinFill` sudah tersedia di `icons.ts` dan sudah dipakai di `content.ts:194`.
✅ Tidak butuh permission baru.

🔓 Terbuka: tanda hanya di tombol (muncul saat hover) atau penanda persisten di
setiap kartu yang sudah di-park (terlihat tanpa hover)? Yang kedua jauh lebih
berguna untuk memindai halaman hasil pencarian, tapi berarti memodifikasi banyak
kartu sekaligus dan melawan DOM churn YouTube — persis masalah yang membuat
pendekatan per-kartu ditinggalkan dulu (lihat komentar panjang di `content.ts:56-71`).

---

### F2. Badge hitungan di ikon toolbar

> **Sudah digrill** (2026-07-27) → `docs/grilling/f1-f2-feedback-loop.md`.
> Satu keputusan (F2-1). Badge = total queue + warna status (safe/warning/full),
> konsisten dengan ParkMeter. Baca `getQueue()` (D4) → hapus di panel = badge
> langsung turun. Tidak butuh permission baru.

**Yang dikerjakan:** `chrome.action.setBadgeText` dari background setiap kali
storage berubah. Kesadaran ambient tanpa membuka popup, dan status kapasitas
(`deriveCapacityState`, `storage.ts:7`) jadi terlihat tanpa satu klik pun —
warna badge bisa mengikuti `safe`/`warning`/`full`.

✅ `background.ts` sudah punya struktur listener; tinggal menambah
`chrome.storage.onChanged`.
✅ Permission `storage` sudah ada. `chrome.action` tidak butuh permission tambahan.

🔓 Terbuka: badge menampilkan total queue, atau hanya jumlah pinned (`Up Next`)?
Total lebih informatif untuk kapasitas; pinned lebih dekat ke "yang harus saya
tonton". Ini pertanyaan produk, bukan teknis.

---

### F3. Durasi video

> **Sudah digrill** (2026-07-27) → `docs/grilling/f3-duration.md`.
> Dua keputusan (F3-1, F3-2). Sumber: badge text → parse ke detik (presisi, filter
> triase jalan). Item tak berdurasi (LIVE, capture gagal) tetap tampil default,
> tak masuk filter durasi. Filter ke-4 non-konflik: collection → search → durasi
> → grouping. Field `durationSec?`. ⚠️ **Fixture baru wajib** (>1jam, EN, <1m)
> sebelum parsing bisa di-spec — parsing lintas-locale rapuh tanpa verifikasi.

**Masalah yang dipecahkan:** pertanyaan paling sering saat triase adalah
*"saya punya 10 menit, mana yang muat?"* — dan queue saat ini tidak bisa menjawabnya.

⚠️ **Koreksi dari klaim awal saya.** Saya sempat menyatakan durasi "sudah terbukti
ada di DOM". Itu terlalu kuat. Yang sebenarnya terverifikasi:

- ✅ `card-channel-grid.html` dan `card-channel-home.html` — ada, dua bentuk:
  badge `<div class="ytBadgeShapeText">15.19</div>` dan `aria-label` pada anchor
  judul: `"iOS 27 Hands-On: Top 5 New Features! 15 menit"`.
- ❌ `card-search.html` — **tidak ada durasi sama sekali**. Nol kecocokan untuk
  `time-status`, dan badge yang ada berisi `LIVE` atau string kosong.

Jadi durasi tersedia di kartu view-model, tapi belum terbukti untuk halaman
pencarian, dan **tidak ada** untuk siaran langsung.

⚠️ Format badge `15.19` ambigu — kemungkinan besar 15 menit 19 detik dengan
pemisah lokal Indonesia, dikuatkan oleh `aria-label` "15 menit" pada kartu yang
sama. Tapi ini belum dikonfirmasi, dan parsing durasi lintas-locale rapuh
(`1.02.33` untuk satu jam lebih? `1:02:33`?). Jalur `aria-label` mungkin lebih
tahan banting tapi juga terlokalisasi ("menit" vs "minutes").

**Sebelum item ini bisa digrill:** capture ulang fixture pencarian dari YouTube
saat ini, plus fixture untuk kartu LIVE dan kartu berdurasi >1 jam.

🔓 Terbuka: bagaimana menampilkan item tanpa durasi (LIVE, atau capture yang gagal)?
Menyembunyikan filter "Pendek/Sedang/Panjang" untuk item tersebut membuat filter
tidak jujur — item tak berdurasi akan hilang dari semua filter.

⚠️ Menambah field `duration` ke `ParkedVideo` (`types.ts:1`) adalah perubahan
skema pertama sejak MVP. Field opsional aman untuk instalasi lama (item lama
tidak punya durasi dan tidak akan pernah punya), tapi lihat catatan migrasi di
ADR-0005.

---

### F4. Resume timestamp

> **Sudah digrill** (2026-07-27) → `docs/grilling/f4-resume-timestamp.md`.
> Satu keputusan (F4-1). Verifikasi mengubah lanskap: URL `t=` hampir tak pernah
> ada saat menonton biasa (fixture konfirmasi), jadi versi murah tidak layak.
> Sumber: `video.currentTime` via content script (pola G4-1, beberapa baris).
> Field `resumeAt?` di ParkedVideo; `openVideo` tambah `&t=` bila >0. ⚠️ Butuh
> verifikasi `<video>` selector di halaman watch. **Konsolidasi G4+F4**: satu
> handler `GET_TAB_META` balas `{ channel, currentTime }` (hindari 2 round-trip).

**Yang dikerjakan:** saat park dari tab yang sedang diputar, simpan posisi tonton
dari `video.currentTime` (content script). Saat play, buka `?v={id}&t={detik}`.
"Park sebentar, lanjut nanti" jadi tanpa kehilangan posisi.

✅ Pola G4-1 (pesan ke content script) — beberapa baris, tanpa network/permission.
✅ `openVideo` (`tab-operations.ts:56`) satu-satunya tempat susun URL play.

⚠️ Parameter `t=` hanya ada di URL kalau user datang dari link bertimestamp atau
memakai "Salin URL pada menit ini". Menonton biasa **tidak** memperbarui URL.

⚠️ Parameter `t=` hanya ada di URL kalau user datang dari link bertimestamp atau
memakai "Salin URL pada menit ini". Menonton biasa **tidak** memperbarui URL.
Jadi fitur ini kemungkinan besar hampir tidak pernah menyala kalau hanya membaca
URL — perlu diverifikasi. Untuk mendapat posisi tonton sesungguhnya perlu membaca
`video.currentTime` lewat content script, yang lingkupnya jauh lebih besar dan
menyentuh `player` YouTube.

Ini yang paling perlu diuji lebih dulu sebelum masuk issue — kalau URL `t=` memang
jarang ada, versi murahnya tidak layak dibangun dan versi mahalnya perlu dinilai ulang.

---

### F5. Cari / filter di Side Panel

> **Sudah digrill** (2026-07-27) → `docs/grilling/f5-search.md`.
> Tiga keputusan (F5-1 s/d F5-3). Live search: hasil dalam grup (struktur tetap),
> scope di dalam lensa collection aktif (collection → search → grouping), query
> reset tiap buka (tak disimpan di ui_state). Field: title+channel, case-insensitive
> substring. Bersih, mandiri — bisa ship terpisah dari restrukturisasi grouping.

**Masalah:** kapasitas 200 item (`types.ts:18`), tanpa satu pun cara mencari.
Side Panel adalah surface triase, dan triase pada 200 item butuh penyaring.

**Yang dikerjakan:** satu input yang memfilter `title` + `channel`.

✅ Grouping sudah murni dan teruji (`grouping.ts`, 14 test) — filter bisa
diterapkan sebelum `groupAndSortVideos` tanpa menyentuh logikanya.

🔓 Terbuka: filter memangkas item di dalam grup yang ada, atau meratakan hasil
jadi satu list? Meratakan lebih mudah dibaca saat mencari, tapi membuang konteks
kelompok.

---

### F6. Undo di popup

> **Sudah digrill** (2026-07-27) → `docs/grilling/f6-undo-popup.md`.
> Satu keputusan (F6-1). Undo di popup selama terbuka, via seam G5 D3
> (PENDING_REMOVE/CANCEL_REMOVE). Popup tetap terbuka setelah hapus (tidak close),
> jadi undo biasanya tersedia. Bila popup tertutup <5 detik (blur/play) → undo
> hilang, item commit permanen (jujur). D6 bulk tak relevan (popup hanya hapus
> tunggal, 3 item terbaru). F6+F1-3 bersama membuktikan D3 adalah seam 3-surface.

✅ Terverifikasi. `popup/App.svelte:103` (`handleRemove`) langsung memanggil
`removeVideo` — commit seketika, tanpa jaring pengaman. Side Panel punya undo
5 detik; popup tidak. Aksi yang sama, dua perilaku berbeda.

⚠️ Tergantung G5 — model undo yang benar harus diputuskan dulu, baru dibagikan
ke kedua surface. Membangun undo popup di atas model yang sekarang berarti
menyalin bug-nya.

> Setelah grilling G5: F6 tidak lagi berdiri sendiri. Keputusan D3 (pending
> dimiliki background) membuat undo otomatis lintas-surface, jadi F6 tinggal
> memanggil seam yang sama. ⚠️ Tapi popup menutup dirinya sendiri saat play dan
> saat membuka side panel (`popup/App.svelte:110`, `:115`) — siklus hidup itu
> belum digrill.

---

## Bagian 3 — Butuh ADR-0005

`docs/adr/0005-lightweight-organization.md` mencatat **arah**, bukan mekanisme.
Tiga item di bawah ini semuanya menunggu pertanyaan terbuka yang sama, dan
itulah kenapa dikelompokkan bersama.

**Yang harus diputuskan sebelum salah satu dari ketiganya ditulis sebagai issue:**
keempat mekanisme di bawah (plus grouping waktu yang sudah ada) memperebutkan
**satu sumbu yang sama** — urutan list di Side Panel. Tidak semuanya bisa jadi
otoritatif sekaligus. Yang pertama dibangun akan diam-diam membatasi sisanya.

### F7. Drag-to-reorder

> **Sudah digrill** (2026-07-27) → `docs/grilling/f7-drag-reorder.md`.
> Empat keputusan (F7-1 s/d F7-4). Reorder **hanya di Up Next** via drag handle
> eksplisit (hanya kartu pinned); `order?: number` di item; pin baru → akhir.
> `addedAt` tetap otoritas di luar Up Next. Konflik gestur dengan F8-4
> terselesaikan (drag handle vs seleksi = kontrol berbeda). Beberapa
> pertanyaan untuk spec masih terbuka — baca dokumen grilling.

**Masalah:** ini disebut *queue*, tapi user tidak bisa mengatur urutannya. Satu-satunya
kontrol prioritas adalah `pinned` (`storage.ts:60`), dan itu biner — sepuluh item
pinned tidak punya urutan di antara mereka.

⚠️ `groupAndSortVideos` (`grouping.ts:20`) mengurutkan dengan
`sort((a, b) => b.addedAt - a.addedAt)` — murni berdasarkan waktu. Urutan manual
butuh field urutan eksplisit pada record, dan begitu ada, `addedAt` berhenti
menjadi otoritas urutan. Ini menyentuh modul yang punya 14 test.

🔓 Terbuka: reorder berlaku di dalam grup, atau melintasi grup? Kalau melintasi,
grouping waktu praktis berhenti berarti.

---

### F8. Collections / Tag

> **Sudah digrill** (2026-07-27) → `docs/grilling/f8-collections.md`.
> Sembilan keputusan (F8-1 s/d F8-9). Collection = **lensa** yang memfilter,
> bukan wadah; tepat-satu-atau-tanpa; diturunkan dari item; ortogonal terhadap
> `pinned`. Dipecahkan juga bentuk F9 (grouping jadi strategi). Beberapa
> pertanyaan untuk spec masih terbuka — baca dokumen grilling.

Lihat ADR-0005 bagian "Deferred to design" — istilah (`Collection` vs `Tag`
bukan sinonim; keduanya menyiratkan kardinalitas dan semantik berbeda),
kardinalitas, dan hubungannya dengan `pinned` semuanya masih terbuka.

Batasan yang sudah mengikat dari ADR-0005: park tetap satu klik tanpa keputusan
apa pun. Organisasi bersifat setelah-fakta. Tidak ada arsip.

---

### F9. Group by channel

> **Bentuknya ditentukan oleh grill F8** — lihat F8-9 di
> `docs/grilling/f8-collections.md`. Grouping jadi strategi
> (`{kind:'time'} | {kind:'channel'}`) dengan mode switch di header.
> Collection (lensa) tetap ortogonal — memfilter dulu, lalu grouping berlaku.
> F9 masih butuh grill sendiri: `pinned` under channel grouping, dll.

**Yang dikerjakan:** grouping alternatif — kelompokkan queue berdasarkan channel,
bukan waktu.

✅ Tidak butuh field baru. `channel` sudah ada di `ParkedVideo` (`types.ts:4`).

⚠️ Tapi kualitas data channel saat ini buruk, dan itu memblokir fitur ini:
**G4** menulis `'YouTube'` untuk setiap item yang di-park dari tab, dan
`capture-predicates.ts:147` mengembalikan `'YouTube Channel'` sebagai fallback.
Group-by-channel di atas data itu akan menghasilkan satu keranjang raksasa
bernama "YouTube". **G4 harus selesai lebih dulu**, dan bahkan setelah itu,
item lama yang sudah terlanjur salah tidak akan terkoreksi sendiri.

> **Sudah digrill** (2026-07-27) → `docs/grilling/f9-group-by-channel.md`.
> Empat keputusan (F9-1 s/d F9-4). Up Next lintas-channel di puncak; bucket
> channel hanya unpinned, sort by recency; data lama → bucket "tak dikenal"
> (jadi **G4 bukan lagi blokir F9** — fix-forward); mode bertahan, default time.
> Pertanyaan untuk spec masih terbuka — baca dokumen grilling.

⚠️ `groupAndSortVideos` mengembalikan bentuk tetap tiga-bucket
(`upNext`/`baru`/`lebihLama`, `grouping.ts:3`). Grouping by channel menghasilkan
jumlah grup yang dinamis — ini perubahan interface, bukan penambahan.
Lihat konsekuensi di ADR-0005.

---

## Urutan yang disarankan

Berdasarkan ketergantungan yang sebenarnya, bukan preferensi:

1. **G5 + G6** — kehilangan data. Undo bulk rusak deterministik. Paling mendesak.
2. **G1** — hapus copy `P`. Sepele, dan menghentikan kebohongan ke user.
3. **G7, G2** — perbaikan mandiri, tidak memblokir apa pun.
4. **G4** — memblokir F9, dan memperbaiki placeholder thumbnail untuk semua item.
5. **G3** — butuh keputusan (persempit vs perluas) dan mungkin menyentuh ADR-0001.
6. **F1 + F2** — satu rilis polish. Rasio kesan-per-baris tertinggi.
7. **F5, F6** — F6 menunggu model undo dari G5.
8. **F3, F4** — keduanya butuh verifikasi lapangan dulu (fixture baru untuk F3,
   uji ketersediaan `t=` untuk F4).
9. **F7, F8, F9** — setelah pertanyaan precedence di ADR-0005 dijawab. Tidak
   boleh dimulai sebelum itu.

---

## Yang dibahas tapi tidak diambil

Dicatat agar tidak dibahas ulang dari nol:

- **Play-through mode** (otomatis buka berikutnya setelah selesai) — menabrak
  alasan `CONTEXT.md` menolak deteksi selesai-menonton.
- **Export/import JSON**, **`storage.sync`** — belum diprioritaskan. Risikonya
  nyata: profil hilang = queue hilang.
- **Options page** (`maxQueueSize`, ambang 7 hari yang di-hardcode di
  `grouping.ts:14`, tema, bahasa).
- **i18n** — semua copy Indonesia di-hardcode.
- **Park saat tab ditutup** (`tabs.onRemoved`).
- **Kualitas thumbnail** — `mqdefault` cukup untuk 96px, tidak untuk kartu besar.
- **Auto-remove setelah ditonton** — ditolak `CONTEXT.md`; tidak dibuka kembali.
- **Menghidupkan auto-expire** — `ADR-0002` sudah superseded; ADR-0005 secara
  eksplisit menolaknya sebagai pengganti organisasi.
