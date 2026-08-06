# Grilling: F10 — Tombol "Park & close" di watch page

Sesi 2026-07-28, diperbarui 2026-08-01. Status: **keputusan desain diperbarui;
implementasi inline mount dan acceptance browser selesai.**

Rujukan: `docs/ROADMAP.md` F10.

**Tanda:** ✅ terverifikasi di kode · ⚠️ asumsi, belum diuji · 🔓 masih terbuka

---

## Ringkasan masalah

Kombinasi "park video + close tab + capture `resumeAt`" saat ini **hanya ada di
Popup** (`popup/App.svelte` `handleParkCurrentTab`): user harus klik ikon ekstensi
→ buka popup → klik "Park this tab & close". Tiga gerak untuk satu aksi yang
filosofinya "nol keputusan" (`CONTEXT.md`).

Sementara itu di watch page (`/watch?v=…`) — tempat user paling sering menyadari
"udahan, simpan ini" — tidak ada kontrol in-page. `FloatingParkButton`
(`content.ts:84`) hanya park (tanpa close, tanpa `resumeAt`) dan hanya muncul di
**kartu** (feed/search/sidebar), bukan video utama yang sedang diputar.

Celah: bawa aksi "park & close" ke watch page itu sendiri, satu klik, tanpa buka
popup. Tantangan: content script tidak bisa `chrome.tabs.*` (harus relay ke
background), tab content-script-nya sendiri hancur saat di-close, dan YouTube SPA
menyulitkan deteksi "video mana yang sedang diputar".

## Keputusan

### F10-1 — "Close" = close tab (mirror popup)

"Close" di "park & close" = `chrome.tabs.remove(tabId)`, persis popup
`handleParkCurrentTab` (`popup/App.svelte:103`): park + `resumeAt` + close tab.
Bukan navigasi back, bukan dismiss player.

✅ Konsisten dengan value-prop TubePark ("horizontal tab-bar mess → vertical
queue") — menutup tab menghapus kekacauan tab-bar, lawan yang TubePark kalahkan.
Navigasi-back / dismiss-player meninggalkan tab di tab-bar = musuh itu tetap hidup.
⚠️ Content script tidak bisa panggil `chrome.tabs.*` langsung — harus relay ke
background via pesan baru. Tab content-script hancur setelah close; pesan sudah
terkirim sebelum hancur → aman (fire-and-forget dari sisi content script).

Ditolak: *navigate back (SPA)* — `history.back()` ringan tapi tab tetap di
tab-bar, melawan premis produk. Ditolak: *stop & dismiss player* — nyaris tanpa
efek "close", tab + video tetap ada.

### F10-2 — Inline mount ke action row/rail, tanpa floating fallback

Pada `/watch`, button dimount ke `ytd-watch-metadata ytd-menu-renderer`, tepat
sebelum kontrol overflow (tiga titik). Pada Shorts, button icon-only dimount ke
`reel-action-bar-view-model`, setelah Share dan sebelum kontrol sound/pivot.
Resolver DOM diisolasi di `src/shared/watch-page-mount.ts` sebagai adapter kecil;
capture dan aksi park tetap bebas dari selector YouTube.

✅ Temuan browser: viewport-fixed dengan z-index maksimum tetap menutupi kontrol
live chat (termasuk tombol X pada screenshot), sehingga tidak memenuhi invariant
baru “TubePark tidak pernah menghalangi kontrol native”. Inline mount ikut layout
YouTube dan menghilangkan konflik stacking context.

Jika anchor belum ada, berubah karena eksperimen, atau tidak menyediakan ruang,
button disembunyikan dan MutationObserver mencoba mount ulang. **Tidak ada lagi
fallback `position: fixed`**; popup tetap menjadi jalur cadangan.

### F10-3 — Coexist dgn `FloatingParkButton` (component baru terpisah)

Component baru `WatchPageParkButton` (video utama: park+close+`resumeAt`);
`FloatingParkButton` tetap (sidebar recs: park-only). Dua button, dua niat.

✅ "Park related video di sidebar" (gak berhenti nonton) vs "udahan, park+close
tab" adalah dua intent berbeda — capture beda (`resumeAt` hanya relevan utk video
utama), action beda (close vs no-close). Tiap button deep dgn satu tanggung jawab
— selaras prinsip codebase-design repo ("one adapter = hypothetical, two = real").
✅ Di watch page, dua button TubePark tetap bisa tampil bersama: action-row
park+close untuk video utama dan hover button park-only di kartu sidebar. Niat dan
posisi berbeda, tanpa saling menutupi.

Ditolak: *replace hover-button di watch page* — satu sistem dua cabang, conditional
heavy. Ditolak: *unify ke `FloatingParkButton`* — class sudah 177 baris doing one
thing well; menyerap peran kedua bikin conditional-heavy.

### F10-4 — 1-klik langsung, no confirm, no undo

Klik = park + close segera. Tidak ada popover konfirmasi, tidak ada undo toast.

✅ Konsisten dgn popup "park & close" (juga 1-klik, no undo) + ethos "zero-decision
park" (`CONTEXT.md`). Queue + `resumeAt` = safety net: "oops" = klik video di
queue/side-panel untuk resume. ⚠️ Mis-click lebih mungkin daripada popup (popup
punya gerbang "buka popup dulu"); diterima karena konten recoverable dari queue.
⛔ Content script hancur bersama tab → undo toast in-page mustahil survive (harus
`chrome.notifications` / side-panel = berat & inkonsisten dgn popup). Maka undo
bukan opsi.

Ditolak: *1-klik + undo toast* — toast hancur bersama tab; pindah ke
`chrome.notifications`/side-panel berat & inkonsisten. Ditolak: *2-step confirm
popover* — friction menduplikasi gerbang popup; defeats the point of in-page
button.

### F10-5 — Always "ensure-parked + close"; indikator parked subtle (bukan toggle)

Klik selalu = ensure-parked (no-op bila duplikat) + close tab, terlepas dari
status parked. Tampil subtle "already parked" indicator (ikon pin terisi/aksen)
agar
user tahu close itu aman. **Bukan toggle** — tidak pernah unpark dari sini.

✅ Konsisten dgn popup (`handleParkCurrentTab` close pada `success || duplicate`).
Menghindari toggle-confusion: button berlabel "park & close" tidak boleh
berperilaku "unpark" saat parked-state (lawan `FloatingParkButton` yang memang
toggle — tapi itu park-only, tanpa close).
✅ Indikator parked hanya cosmetic (ikon pin terisi/aksen kuning), bukan kontrol;
klik tetap close.

Ditolak: *toggle unpark di parked-state* — label "park & close" jadi membingungkan
(klik parked-state = unpark + tidak close?). Ditolak: *hide/disable saat parked* —
user tidak bisa close-and-keep-parked dari page (mis. re-watch dari queue lalu
selesai).

### F10-6 — Scope: `/watch?v=` + `/shorts/{id}`

Button muncul di watch page DAN Shorts.

✅ Shorts memakai adapter rail terpisah dan icon-only. Button disisipkan setelah
Share, sebelum sound/pivot, sehingga mengikuti action rail native. Saat tinggi
viewport tidak cukup untuk target 44px + safe-area, TubePark disembunyikan dan
kontrol Shorts diprioritaskan. Capture tetap memakai `extractYouTubeVideoId` dan
`readMainVideoCurrentTime` terbesar.

Ditolak: *watch only (MVP)* — sacrifice konsistensi dgn popup untuk delay dgn
value kecil; adapter Shorts tetap terisolasi dan menyembunyikan diri saat rail
tidak menyediakan ruang.

### F10-7 — Posisi dan mode responsif mengikuti ruang native

Pada action row lebar, button tampil sebagai pill netral dengan label “Park &
close”. Jika ruang aktual action row hanya cukup untuk target 44px, label hilang
dan tersisa ikon pin. Jika ikon pun tidak muat, button disembunyikan. Shorts
selalu icon-only dan mengikuti batas tinggi viewport. Pada watch page, kondisi
hidden tetap menyediakan item “Park & close tab” di popup overflow tiga titik
native YouTube setelah trigger dibuka.

✅ Ukuran ditentukan dari layout aktual (rect native + target button), bukan
breakpoint viewport yang rapuh. Guard sibling-rect mencegah button menimpa
kontrol native saat layout YouTube berubah. Warna teks mengikuti action row
dengan fallback aman untuk dark mode; styling tetap netral dengan aksen TubePark
pada ikon/state parked, tanpa transform hover yang bisa menutupi kontrol tetangga.

Ditolak: *viewport-fixed top-right* — terbukti menutupi tombol X live chat.
Ditolak: *floating fallback saat anchor gagal* — menjaga kontrol native lebih
penting daripada discoverability sesaat; popup tetap tersedia.

## Status verifikasi

1. ✅ **Deteksi navigasi dan mount ulang** — `yt-navigate-finish`, `popstate`,
   poll URL 1 detik, `resize`, dan MutationObserver menjaga mount tetap akurat
   saat YouTube SPA mengganti action row/rail.
2. ✅ **Mode adaptif** — resolver menguji pill → ikon → hidden berdasarkan ruang
   aktual; watch hidden diteruskan ke overflow menu native; tidak ada fixed
   overlay ketika action row/rail tidak tersedia.
3. ✅ **Verifikasi browser acceptance matrix** — live chat terbuka/tertutup,
   watch/Shorts, SPA remount, viewport yang disepakati, dan item overflow saat
   row ditekan sudah dibuktikan.

### Acceptance matrix browser

- `/watch` live dengan chat terbuka dan tertutup: 1440×900, 1280×720,
  1024×768, 768×720, 480×800.
- `/watch` non-live: viewport desktop lebar dan sempit.
- `/shorts`: 1280×720, 1024×600, 480×800.
- Navigasi SPA: watch → watch, watch → Shorts, lalu kembali.
- Bukti: screenshot + pemeriksaan DOM/rect bahwa button berada di action row/rail,
  tidak menutup kontrol native, mode berubah label → ikon → hidden sesuai ruang,
  dan aksi tetap tersedia melalui popup overflow saat inline hidden.

## Dampak pada dokumen lain

- **`CONTEXT.md`** — capture mechanism harus menyebut inline action-row/Shorts rail
  mount, mode adaptif, dan tidak ada fixed fallback; tetap coexist dgn
  Hover-to-Park.
- **`messages.ts`** — tambah `MSG.PARK_AND_CLOSE_TAB` (content script → background:
  park + close `sender.tab.id`).
- **`ROADMAP.md`** — F10 ditambahkan ke Bagian 2 (Tier 1), ditandai "Sudah digrill".
- **Tidak bergantung fitur lain** — F10 mandiri. `resumeAt` capture reuse
  `readMainVideoCurrentTime` (sudah ada dari F4/G4); `chrome.tabs.remove` reuse
  permission `tabs` (sudah ada). Bisa ship kapan saja.
