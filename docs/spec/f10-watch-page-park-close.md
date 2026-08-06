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

Component `WatchPageParkButton` di `src/entrypoints/content.ts` dimount inline ke
`ytd-watch-metadata ytd-menu-renderer`, tepat sebelum kontrol overflow (tiga titik),
pada `/watch?v=`. Pada `/shorts/{id}`, component yang sama memakai adapter rail
terpisah dan dimount setelah Share, sebelum sound/pivot, sebagai ikon. Klik = park
(dengan `resumeAt` dari `readMainVideoCurrentTime` lokal — tanpa round-trip) +
relay ke background untuk `chrome.tabs.remove(sender.tab.id)`. Selector YouTube
diisolasi di `src/shared/watch-page-mount.ts`; bila anchor belum ada atau tidak
menyediakan ruang, button disembunyikan dan aksi yang sama tersedia melalui
overflow menu tiga titik native YouTube; button di-remount saat DOM siap. Tidak
ada floating fallback. Coexist dgn `FloatingParkButton` yang tetap park sidebar
recs. 1-klik langsung, no confirm, no undo; queue + `resumeAt` = safety net.
Parked-state ditampilkan lewat ikon pin terisi/aksen, bukan toggle. Detect SPA,
MutationObserver, dan resize untuk re-resolve `videoId`/state/mount.

## User Stories

1. As a watcher, I want a single button on the YouTube watch page that parks the
   video and closes the tab, so that I can save-and-dismiss without opening the
   extension popup.
2. As a watcher, I want the button to capture my playback position, so that
   resuming from the queue continues where I left off (mid-watch park).
3. As a watcher, I want the button integrated into the action row without
   obstructing YouTube controls, so that I can find it when I decide I'm done.
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
- **F10-2 — Inline mount dengan adapter terisolasi, tanpa fixed fallback.**
  Pada `/watch`, resolver `src/shared/watch-page-mount.ts` mencari
  `ytd-watch-metadata ytd-menu-renderer` dan menyisipkan button sebelum kontrol
  overflow. Pada Shorts, resolver mencari `reel-action-bar-view-model` dan
  menyisipkan icon-only sebelum pivot/sound. Jika anchor atau ruang tidak ada,
  button disembunyikan; pada watch action tersedia melalui item di overflow
  menu tiga titik native; MutationObserver mencoba lagi. Tidak ada
  `position: fixed` fallback karena overlay terbukti menutupi live-chat X.
- **F10-3 — Component baru terpisah, coexist dgn `FloatingParkButton`.**
  `WatchPageParkButton` (video utama: park+close+`resumeAt`) + `FloatingParkButton`
  tetap (sidebar recs: park-only). Dua button, dua niat dan dua mount seam; pada
  watch page keduanya boleh tampil tanpa saling menutupi.
- **F10-4 — 1-klik langsung, no confirm, no undo.** Konsisten popup + ethos
  "zero-decision park". Queue+`resumeAt` = safety net. ⛔ Undo toast in-page
  mustahil — content script hancur bersama tab.
- **F10-5 — Always "ensure-parked + close"; indikator parked subtle (bukan
  toggle).** Klik selalu close tab terlepas dari status parked; ikon pin menjadi
  terisi/beraksen jika sudah parked. **Tidak pernah unpark** dari sini (lawan
  `FloatingParkButton` yang toggle — tapi itu park-only tanpa close).
- **F10-6 — Scope `/watch?v=` + `/shorts/{id}` dengan mount berbeda.** Watch
  memakai action row; Shorts memakai rail vertikal icon-only setelah Share,
  sebelum sound/pivot. Capture tetap memakai `extractYouTubeVideoId`
  (`capture-predicates.ts:39`) dan `readMainVideoCurrentTime` terbesar.
- **F10-7 — Mode responsif berdasarkan ruang aktual.** Action row menampilkan
  pill netral berlabel “Park & close” bila muat, turun ke ikon 44px bila label
  tidak muat, lalu hidden bila ikon pun akan overflow atau berpotensi overlap dengan
  kontrol native. Saat hidden di watch, item “Park & close tab” ditambahkan ke
  popup overflow native setelah user membuka trigger tiga titik. Warna teks
  mengikuti warna action row YouTube (dengan fallback aman untuk dark mode), bukan
  asumsi CSS variable global. Shorts selalu ikon dan hidden bila tidak muat secara
  vertikal. Tidak memakai breakpoint viewport atau overlay global.
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
- **F10-10 — Sinkron `parkedIds` + SPA/DOM/resize mount.** Pakai pola sinkron
  `FloatingParkButton` (`content.ts` `syncParkedIds` + `storage.onChanged` +
  `PENDING_REMOVAL_CHANGED`) untuk render indikator parked. Reuse
  `parkedVideoIds` (`parked-set.ts`) + `withoutPendingIds`. YouTube SPA tidak
  reload content script, jadi `yt-navigate-finish` + `popstate` + poll URL
  me-resolve route; MutationObserver menangkap action row/rail yang dibuat ulang;
  resize menguji ulang mode label/icon/hidden dan listener overflow trigger ikut
  dipasang ulang saat YouTube mengganti kontrol native.
- **F10-11 — Toast feedback.** Pada `full` (park ditolak, tab tidak di-close):
  `showToast("Queue full (200/200) — remove old videos first.", "full")`
  (`content.ts:37`, sama `FloatingParkButton` onClick `:249`). Pada
  `success`/`duplicate`: **tidak ada toast** — tab ditutup bersama content
  script; feedback = tab hilang + video muncul di queue (popup badge F2 / side
  panel). Konsisten dgn popup `handleParkCurrentTab` yang `launchChip` lalu close.
- **Ditolak: extend `PARK_VIDEO_REQUEST` dgn flag `closeTab`** — dua semantics
  (close vs no-close) di satu type membingungkan kontrak; type baru lebih grep-able
  (konvensi `messages.ts`). Ditolak: fixed viewport overlay — menutupi kontrol
  live chat. Ditolak: undo close — content script hancur, mustahil (F10-4).

## Testing Decisions

- **Mount resolver unit test (terimplementasi):** `src/shared/watch-page-mount.test.ts`
  mengunci insertion sebelum overflow watch, sebelum pivot Shorts, idempotensi
  terhadap button TubePark yang sudah ada, mode label → ikon → hidden dari rect
  kandidat aktual, first-line/wrap guard, viewport guard, overlap guard, dan
  fallback warna native row.
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
- **Integration (browser langsung):** (a) watch page → klik → park + tab close + item di
  queue dgn `resumeAt`; (b) mid-watch → `resumeAt` > 0; (c) video sudah di queue →
  indikator parked tampil, klik → tab close (item tetap, no duplikat); (d) queue
  full → toast "Queue full", tab tidak close; (e) Shorts → klik → park+close; (f)
  SPA nav `/watch→/watch` → button re-resolve videoId + parked-state; (g) navigasi
  ke home → button hide; (h) sidebar recs hover → `FloatingParkButton` tetap park
  (coexist); (i) live chat terbuka → chat X tetap di luar rect button. Ulangi pada
  1440×900, 1280×720, 1024×768, 768×720, 480×800 untuk watch dan
  1280×720, 1024×600, 480×800 untuk Shorts; simpan screenshot + DOM rect.
- **Capture regression guard:** `capture-predicates.test.ts` (23 test) tak tersentuh
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

## Verification status

Post-implementation status (kode = source of truth):

1. ✅ **Deteksi SPA + mount ulang** — `onLocationChange` di `content.ts` memakai
   `yt-navigate-finish`, `popstate`, dan poll URL 1 detik; MutationObserver
   menangkap action row/rail yang dirender ulang dan resize menguji ulang mode.
2. ✅ **`sender.tab.id`** (terimplementasi) — listener background rename
   `_sender`→`sender`; `chrome.tabs.remove(sender.tab?.id)` di-guard
   `typeof tabId === "number"`. Content-script sender selalu punya `tab`.
3. ✅ **Mount resolver + mode** — unit test mengunci insertion point dan
   label/icon/hidden; browser matrix mengonfirmasi layout aktual.
4. ✅ **Browser acceptance matrix** — live chat terbuka/tertutup, watch/Shorts,
   SPA remount, viewport, dan fallback overflow menu pada action row tertekan
   sudah diverifikasi langsung.

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
