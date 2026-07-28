# Grilling: F10 — Tombol "Park & close" di watch page

Sesi 2026-07-28. Status: **keputusan desain selesai, belum jadi spec resmi, belum ada kode.**

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

### F10-2 — Floating button portaled ke `<body>`, fixed, always-visible

Button baru di-portalkan ke `<body>` dengan `position: fixed`, always-visible,
scoped ke watch/shorts page. **Nol coupling ke DOM YouTube** — arsitektur sama
persis dengan `FloatingParkButton` (`content.ts:84-260`) yang sudah terbukti tahan
churn.

✅ Selaras filosofi churn-resistance repo (docstring `FloatingParkButton` + 4-layer
fallback `capture-predicates.ts`). Full styling control. Always-visible =
discoverable, gak perlu hover-hint.

Ditolak: *inject ke action bar YouTube* (`#top-level-buttons-computed` /
`ytd-menu-renderer`) — feel native tapi coupling tinggi ke DOM yang sering berubah;
berlawanan filosofi repo. Ditolak: *hover-triggered di player* — discoverability
jelek + aneh di page yang sedang ditonton.

### F10-3 — Coexist dgn `FloatingParkButton` (component baru terpisah)

Component baru `WatchPageParkButton` (video utama: park+close+`resumeAt`);
`FloatingParkButton` tetap (sidebar recs: park-only). Dua button, dua niat.

✅ "Park related video di sidebar" (gak berhenti nonton) vs "udahan, park+close
tab" adalah dua intent berbeda — capture beda (`resumeAt` hanya relevan utk video
utama), action beda (close vs no-close). Tiap button deep dgn satu tanggung jawab
— selaras prinsip codebase-design repo ("one adapter = hypothetical, two = real").
⚠️ Di watch page, dua button TubePark bisa tampil bersama (always-visible utk
video utama + hover utk sidebar). Diterima: niat + posisi berbeda (utama pojok
kanan-atas viewport, sidebar hover di kartu).

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
status parked. Tampil subtle "already parked" indicator (badge/dot kecil) agar
user tahu close itu aman. **Bukan toggle** — tidak pernah unpark dari sini.

✅ Konsisten dgn popup (`handleParkCurrentTab` close pada `success || duplicate`).
Menghindari toggle-confusion: button berlabel "park & close" tidak boleh
berperilaku "unpark" saat parked-state (lawan `FloatingParkButton` yang memang
toggle — tapi itu park-only, tanpa close).
⚠️ Indikator parked hanya cosmetic (badge/dot), bukan kontrol; klik tetap close.

Ditolak: *toggle unpark di parked-state* — label "park & close" jadi membingungkan
(klik parked-state = unpark + tidak close?). Ditolak: *hide/disable saat parked* —
user tidak bisa close-and-keep-parked dari page (mis. re-watch dari queue lalu
selesai).

### F10-6 — Scope: `/watch?v=` + `/shorts/{id}`

Button muncul di watch page DAN Shorts.

✅ Button viewport-fixed (F10-2) → nol DOM work extra untuk Shorts. Capture sudah
handle Shorts: `extractYouTubeVideoId` (`capture-predicates.ts:39`) kenal
`/shorts/`, `readMainVideoCurrentTime` (`:217`) cari `<video>` terbesar (berlaku
untuk player Shorts). Konsisten dgn popup `currentTabIsWatch` yang sudah treat
Shorts sbg watchable (`popup/App.svelte:91`).
⚠️ Shorts = player vertikal fullscreen; posisi pojok kanan-atas viewport tetap
bebas (tidak nabrak kontrol Shorts). `resumeAt` untuk video 30-detik kurang
berharga tapi tidak salah — park tetap masuk akal (klik link Short → park+close).

Ditolak: *watch only (MVP)* — sacrifice konsistensi dgn popup untuk delay dgn
value kecil; biaya inklusi Shorts sudah rendah karena viewport-fixed.

### F10-7 — Posisi: viewport-fixed top-right, di bawah topbar YouTube

`position: fixed; top: ~70px; right: 16px`. Pill icon + label "Park & close".

✅ Bersih dari topbar YouTube (search+avatar paling atas), jauh dari bottom
controls (miniplayer/autoplay countdown kanan-bawah), tidak overlap kolom
rekomendasi (rekomendasi mulai di bawah topbar; button kecil di atasnya).
Fully decoupled (viewport-fixed, no DOM read).

Ditolak: *anchored ke player (baca rect player)* — kontekstual tapi minor
position-coupling (butuh selector player + fallback); F10-2 menetapkan nol
coupling. Ditolak: *bottom-right viewport* — deket miniplayer + autoplay
countdown, rawan overlap.

## Yang harus diverifikasi sebelum spec

1. ⚠️ **Deteksi navigasi SPA** — YouTube SPA: pindah `/watch↔/watch` atau
   `/watch↔/shorts` tidak reload content script. Button always-visible harus
   re-resolve `videoId`/`title`/`channel`/`currentTime`/`parked-state` per
   navigasi + toggle visibility (hide di home/search/channel). Mekanisme:
   `yt-navigate-finish` event (YouTube-internal) + `popstate`? Atau poll
   `location.href`? Konfirmasi mana yang andal lintas `/watch`↔`/shorts`.
2. ⚠️ **`sender.tab.id` tersedia** di `chrome.runtime.onMessage` listener
   background (`background.ts:197`, saat ini `_sender`) untuk content-script
   sender — wajib untuk `chrome.tabs.remove`. Hampir pasti ya (content script
   sender selalu punya `tab`), konfirmasi.
3. ⚠️ **`readMainVideoCurrentTime` di Shorts** — konfirmasi `<video>` terbesar di
   `/shorts/` adalah video konten (bukan ad stub), sehingga `resumeAt` benar.

## Dampak pada dokumen lain

- **`CONTEXT.md`** — tambah capture mechanism ke "Capture Mechanisms": "Watch-page
  Park & Close Capture: tombol always-visible portaled ke body, scoped `/watch` +
  `/shorts`; park + `resumeAt` (dari `readMainVideoCurrentTime` lokal, tanpa
  round-trip) + close tab via relay background." Sebut juga coexist dgn
  Hover-to-Park.
- **`messages.ts`** — tambah `MSG.PARK_AND_CLOSE_TAB` (content script → background:
  park + close `sender.tab.id`).
- **`ROADMAP.md`** — F10 ditambahkan ke Bagian 2 (Tier 1), ditandai "Sudah digrill".
- **Tidak bergantung fitur lain** — F10 mandiri. `resumeAt` capture reuse
  `readMainVideoCurrentTime` (sudah ada dari F4/G4); `chrome.tabs.remove` reuse
  permission `tabs` (sudah ada). Bisa ship kapan saja.