# Spec: F10 — Tombol "Park & close" di watch page

Part of: `docs/ROADMAP.md` F10 · Grilling: `docs/grilling/f10-watch-page-park-close.md`

## Problem Statement

Kombinasi "park video + close tab + capture `resumeAt`" saat ini **hanya ada di
Popup** (`src/entrypoints/popup/App.svelte:116` `handleParkCurrentTab`): user klik
ikon ekstensi → buka popup → klik "Park this tab & close". Tiga gerak untuk satu
aksi yang filosofinya "nol keputusan" (`CONTEXT.md`).

`FloatingParkButton` (`src/entrypoints/content.ts:85`) hanya park (tanpa close,
tanpa `resumeAt`) dan hanya muncul di **kartu** video (feed/search/channel/watch
sidebar) — bukan video utama yang sedang diputar di watch page (`/watch?v=…`).
Context-menu capture (`content.ts:395` `CONTEXT_MENU_PARK`) park tanpa close tanpa
`resumeAt` juga. Jadi di tempat user paling sering ingin "udahan, simpan ini"
(watch page), tidak ada kontrol in-page satu klik.

Celah: bawa "park & close" ke watch page, satu klik, tanpa buka popup. Tantangan:
content script tidak bisa `chrome.tabs.*` (harus relay ke background), tab
content-script-nya sendiri hancur saat di-close, dan YouTube SPA menyulitkan
deteksi "video mana yang sedang diputar" tanpa reload.

## Solution

Component baru `WatchPageParkButton` di `src/entrypoints/content.ts`, button
portaled ke `<body>`, `position: fixed` pojok kanan-atas viewport (di bawah
topbar YouTube), always-visible, scoped ke `/watch?v=` + `/shorts/{id}`. Klik =
park (dengan `resumeAt` dari `readMainVideoCurrentTime` lokal — tanpa round-trip)
+ relay ke background untuk `chrome.tabs.remove(sender.tab.id)`. Nol coupling ke
DOM YouTube (arsitektur sama `FloatingParkButton`). Coexist dgn `FloatingParkButton`
yang tetap park sidebar recs. 1-klik langsung, no confirm, no undo; queue +
`resumeAt` = safety net. Parked-state ditampilkan subtle indicator (bukan toggle).
Detect SPA navigation untuk re-resolve `videoId`/state + toggle visibility.

## User Stories

1. As a watcher, I want a single button on the YouTube watch page that parks the
   video and closes the tab, so that I can save-and-dismiss without opening the
   extension popup.
2. As a watcher, I want the button to capture my playback position, so that
   resuming from the queue continues where I left off (mid-watch park).
3. As a watcher, I want the button visible without hovering, so that I can find it
   instantly when I decide I'm done.
4. As a watcher, I want the button to also appear on Shorts, so that a Short I
   landed on via a link can be parked+closed just like a regular video.
5. As a watcher, I want a subtle indicator when the current video is already in my
   queue, so that I know closing the tab is safe — without the button pretending
   it can unpark.
6. As a curator, I want to still be able to park a sidebar recommendation without
   closing my tab (existing hover button), so that "park related video" and "done
   watching, park+close" stay separate intents.
7. As a maintainer, I want the button to survive YouTube's SPA navigation without
   a page reload, so that it stays accurate as I click between videos in one tab.

## Implementation Decisions

- **F10-1 — "Close" = `chrome.tabs.remove`.** Mirror popup `handleParkCurrentTab`
  (`popup/App.svelte:116`): park + `resumeAt` + close tab. Content script relay ke
  background (gak bisa `chrome.tabs.*` langsung); tab content-script hancur
  setelah message terkirim → aman. ⚠️ Wajib `sender.tab.id` di listener background.
- **F10-2 — Floating portaled ke `<body>`, `position: fixed`, always-visible.**
  Arsitektur sama `FloatingParkButton` (`content.ts:85`); nol DOM coupling.
  Full styling control; discoverable tanpa hover.
- **F10-3 — Component baru terpisah, coexist dgn `FloatingParkButton`.**
  `WatchPageParkButton` (video utama: park+close+`resumeAt`) + `FloatingParkButton`
  tetap (sidebar recs: park-only). Dua button, dua niat. ⚠️ Di watch page dua
  button bisa tampil bersama (utama always-visible pojok kanan-atas, sidebar
  hover di kartu) — diterima, niat + posisi berbeda.
- **F10-4 — 1-klik langsung, no confirm, no undo.** Konsisten popup + ethos
  "zero-decision park". Queue+`resumeAt` = safety net. ⛔ Undo toast in-page
  mustahil — content script hancur bersama tab.
- **F10-5 — Always "ensure-parked + close"; indikator parked subtle (bukan
  toggle).** Klik selalu close tab terlepas dari status parked; tampil badge/dot
  kecil kalau sudah parked. **Tidak pernah unpark** dari sini (lawan
  `FloatingParkButton` yang toggle — tapi itu park-only tanpa close).
- **F10-6 — Scope `/watch?v=` + `/shorts/{id}`.** Viewport-fixed → nol DOM work
  extra untuk Shorts. Capture sudah handle Shorts (`extractYouTubeVideoId`
  `capture-predicates.ts:39` kenal `/shorts/`; `readMainVideoCurrentTime` `:226`
  cari `<video>` terbesar).
- **F10-7 — Posisi `fixed; top: ~70px; right: 16px`.** Pill icon + label
  "Park & close". Bersih dari topbar, jauh dari bottom controls, tidak overlap
  rekomendasi.
- **F10-8 — Pesan baru `MSG.PARK_AND_CLOSE_TAB`** (`src/shared/messages.ts:11`):
  ```ts
  /** Content script → background: park one video AND close the sender's tab.
   * Responds with ParkResult. Background closes the tab only on success/duplicate
   * (full → no close, so the video is not lost). */
  PARK_AND_CLOSE_TAB: "PARK_AND_CLOSE_TAB",
  ```
  Background handler (`background.ts:197` area): reuse `mutations.run` +
  `getRawQueue` + `getUiState` + `tryParkWithPending` (`storage.ts:85`) +
  `saveQueue` (sama persis handler `PARK_VIDEO_REQUEST` `:197`), **lalu pada
  `success || duplicate` → `chrome.tabs.remove(sender.tab.id)`**; pada `full` →
  respons `{ full: true }`, **jangan close**. Lampirkan `ui.activeCollection` ke
  payload (sama handler `PARK_VIDEO_REQUEST`) agar park+close saat lensa F8 aktif
  masuk collection itu. ⚠️ `sender` (arg ke-2 listener, saat ini `_sender`
  `background.ts:197`) harus dibaca untuk `sender.tab.id`.
- **F10-9 — Capture lokal, tanpa round-trip.** Content script langsung baca:
  `videoId = extractYouTubeVideoId(location.href)` (`capture-predicates.ts:39`),
  `title = document.title.replace("- YouTube","").trim()`,
  `channel = resolveWatchPageChannel(document)` (`:209`),
  `resumeAt = readMainVideoCurrentTime(document)` (`:226`) jika `> 0` (F4: tak
  simpan `t=0`). ⚠️ Lebih murah daripada popup (popup butuh `GET_TAB_META`
  round-trip `popup/App.svelte:55`); content script IS pembaca DOM.
- **F10-10 — Sinkron `parkedIds` + SPA navigation.** Pakai pola sinkron
  `FloatingParkButton` (`content.ts` `syncParkedIds` + `storage.onChanged` +
  `PENDING_REMOVAL_CHANGED`) untuk render indikator parked. Reuse
  `parkedVideoIds` (`parked-set.ts`) + `withoutPendingIds`. ⚠️ YouTube SPA:
  pindah video tak reload content script. Listener nav (rekomendasi:
  `yt-navigate-finish` + `popstate`, fallback poll `location.href`) → re-resolve
  `videoId`/`title`/`channel`/`currentTime`/`parked-state` + toggle visibility
  (hide di home/search/channel via `isYouTubeWatchUrl` `capture-predicates.ts:67`).
  ✅ Mekanisme terimplementasi: `onLocationChange` = `yt-navigate-finish` +
  `popstate` + poll `location.href` 1s (idempotent) — lihat Verification.
- **F10-11 — Toast feedback.** Pada `full` (park ditolak, tab tidak di-close):
  `showToast("Queue full (200/200) — remove old videos first.", "full")`
  (`content.ts:37`, sama `FloatingParkButton` onClick `:249`). Pada
  `success`/`duplicate`: **tidak ada toast** — tab ditutup bersama content
  script; feedback = tab hilang + video muncul di queue (popup badge F2 / side
  panel). Konsisten dgn popup `handleParkCurrentTab` yang `launchChip` lalu close.
- **Ditolak: extend `PARK_VIDEO_REQUEST` dgn flag `closeTab`** — dua semantics
  (close vs no-close) di satu type membingungkan kontrak; type baru lebih grep-able
  (konvensi `messages.ts`). Ditolak: inject ke action bar YouTube — coupling churn
  (F10-2). Ditolak: undo close — content script hancur, mustahil (F10-4).

## Testing Decisions

- **Unit test (terimplementasi):** capture di-faktor ke helper murni
  `buildWatchPagePayload(url, doc, now?)` (`capture-predicates.ts`) →
  `ParkedVideo | null`. 7 test di `capture-predicates.test.ts` pakai inline
  linkedom `watchDoc()` helper (pola `readMainVideoCurrentTime` test di
  atasnya): /watch, /shorts, resumeAt >0, resumeAt=0 omit (F4), title fallback,
  channel fallback, non-watch → null.
- **Fixture `watch-page.html` (DEFERRED, cross-feature):** dir `__fixtures__/`
  berisi capture REAL YouTube saja (card-search/channel-grid/channel-home) —
  file sintetik di sana melanggar konvensi + menyesatkan (terlihat seperti
  capture padahal tebakan). Tanpa akses browser, capture real mustahil di sesi
  ini. Maka F10 pakai inline synthetic DOMs (sama dgn pendekatan G4 yg sudah
  ada — lihat `resolveWatchPageChannel` tests di `capture-predicates.test.ts`).
  Shared `__fixtures__/watch-page.html` adalah artifact cross-feature G4/F4/F10
  yg menunggu capture live; ketika dibuat, semua konsumen otomatis ter-cover.
  ⚠️ Bukan blokir F10 — logika selector + `<video>` sudah diuji sintetik.
- **Integration (manual):** (a) watch page → klik → park + tab close + item di
  queue dgn `resumeAt`; (b) mid-watch → `resumeAt` > 0; (c) video sudah di queue →
  indikator parked tampil, klik → tab close (item tetap, no duplikat); (d) queue
  full → toast "Queue full", tab tidak close; (e) Shorts → klik → park+close; (f)
  SPA nav `/watch→/watch` → button re-resolve videoId + parked-state; (g) navigasi
  ke home → button hide; (h) sidebar recs hover → `FloatingParkButton` tetap park
  (coexist).
- **Regression guard:** `capture-predicates.test.ts` (23 test) tak tersentuh
  (reuse fungsi). `storage.test.ts` tak tersentuh (reuse `tryParkWithPending`).

## Dependencies

- **Mandiri.** Reuse `readMainVideoCurrentTime` (F4/G4), `resolveWatchPageChannel`
  (G4), `extractYouTubeVideoId` (G2 shorts), `tryParkWithPending` + `mutations.run`
  (G5 D3), `parkedVideoIds`/`withoutPendingIds` (F1). Tak butuh permission baru
  (`tabs` sudah ada `wxt.config.ts`). Bisa ship kapan saja.
- **Korelasi F8 (collection lens):** handler `PARK_AND_CLOSE_TAB` wajib lampirkan
  `ui.activeCollection` (F8-7) — park+close saat lensa aktif masuk collection itu.
- **Korelasi G4/F4 fixture:** `watch-page.html` dibutuhkan bersama (selector
  channel + `<video>` diverifikasi sekali untuk G4/F4/F10).

## Verification needed before implementation

Post-implementation status (kode = source of truth):

1. ✅ **Deteksi navigasi SPA** (terimplementasi) — `onLocationChange` di
   `content.ts` pakai 3 sinyal idempotent: `yt-navigate-finish` (event YouTube),
   `popstate` (back/forward), + poll `location.href` 1 detik (safety net utk
   transisi yg event lewat). `refresh()` re-resolve dari `location.href` jadi
   hanya re-render saat benar berubah. ⚠️ Konfirmasi live: `yt-navigate-finish`
   menyala andal utk `/watch↔/shorts` (poll menutup celah bila tidak).
2. ✅ **`sender.tab.id`** (terimplementasi) — listener background rename
   `_sender`→`sender`; `chrome.tabs.remove(sender.tab?.id)` di-guard
   `typeof tabId === "number"`. Content-script sender selalu punya `tab`.
3. ⚠️ **`readMainVideoCurrentTime` di Shorts** — reuse logika F4 (pilih `<video>`
   terbesar by area); di `/shorts/` player fullscreen = terbesar. Konfirmasi live
   bahwa itu video konten (bukan ad stub) — belum diverifikasi lapangan.
4. 🔓 **Posisi `top: 70px`** (terimplementasi fixed) — topbar YouTube tinggi
   variable (~56px desktop, lebih di mobile); `70px` aman di desktop, 🔓 responsif
   di viewport sempit (sembunyi/geser?) — follow-up, bukan blokir.

## References

- Grilling: `docs/grilling/f10-watch-page-park-close.md`
- Roadmap: `docs/ROADMAP.md` F10
- Korelasi: `docs/spec/g4-tab-channel.md`, `docs/spec/f4-resume-timestamp.md`
  (fixture watch-page + capture), `docs/spec/f8-collections.md` F8-7 (lensa),
  `docs/spec/f1-f2-feedback-loop.md` (sinkron parkedIds)
- Code: `src/entrypoints/content.ts:37,85,194-260,335-433`,
  `src/entrypoints/popup/App.svelte:55,116`,
  `src/entrypoints/background.ts:197`,
  `src/shared/capture-predicates.ts:39,67,209,226`,
  `src/shared/messages.ts:11`, `src/shared/storage.ts:51,85`,
  `src/shared/parked-set.ts`