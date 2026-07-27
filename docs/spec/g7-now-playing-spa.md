# Spec: G7 — Now Playing basi saat navigasi SPA

Part of: `docs/ROADMAP.md` G7 · Grilling: `docs/grilling/g7-now-playing-spa.md`

## Problem Statement

Side Panel memasang `chrome.tabs.onActivated` → `loadData()` saja (`src/entrypoints/sidepanel/App.svelte:43-45`). YouTube adalah SPA — pindah dari satu video ke video lain di tab yang sama tidak mengganti tab aktif, jadi `onActivated` tak menyala. Akibatnya `nowPlaying` (`:24`, dipakai 4 tempat: 3 border kartu `class:playing` di `:151`, `:174`, `:204` + `Equalizer` di `:239`) tetap menunjuk video sebelumnya sampai user berpindah tab. Indikator "Now Playing" basi, menyesatkan user soal video mana yang sedang diputar.

## Solution

Tambah `chrome.tabs.onUpdated` listener di Side Panel `onMount`, difilter ke `changeInfo.url` yang merupakan URL YouTube → `loadData()`. `onUpdated` menyala saat URL berubah, termasuk SPA `pushState` (Chrome deteksi URL change). `loadData()` selalu query active tab via `getNowPlayingTab` (`src/shared/tab-operations.ts:81`), jadi tak peduli tab mana yang trigger — aman dipanggil. Popup tak diubah: tidak punya listener tab, `nowPlaying` di-load di `onMount` (`popup/App.svelte:39`), dan popup menutup diri sendiri saat play/park (`:110`, `:115`) sehingga listener tab di popup nyaris tak pernah menyala.

## User Stories

1. As a curator, I want the Side Panel's Now Playing indicator to update when I click a different video in the same YouTube tab, so that the equalizer + border accurately reflects what is playing.
2. As a curator, I want the indicator to update without me having to switch tabs and switch back, so that SPA navigation is enough to refresh it.
3. As a curator, I want the indicator to stay accurate without visible flicker or jank, so that triage is not interrupted.

## Implementation Decisions

- **Side Panel `onMount`** (`src/entrypoints/sidepanel/App.svelte:37-46`): tambah blok listener kedua setelah `onActivated`:
  ```ts
  if (typeof chrome !== 'undefined' && chrome.tabs?.onUpdated) {
    chrome.tabs.onUpdated.addListener((_id, changeInfo) => {
      if (changeInfo.url && extractYouTubeVideoId(changeInfo.url)) {
        loadData();
      }
    });
  }
  ```
  Perlu `import { extractYouTubeVideoId }` di side panel (saat ini tidak diimpor).
- **Filter ketat:** hanya `changeInfo.url` (URL navigation), bukan `changeInfo.status`/`title`/`favicon` yang menyala sangat sering. Ini menghindari `loadData` berlebihan.
- **Popup tak diubah.** Popup `nowPlaying` (`popup/App.svelte:21`) hanya di-load di `onMount`; popup ephemeral dan `loadData` di onMount sudah segar saat buka. Popup menutup diri sendiri (`:110`, `:115`) — listener tab di popup mati seketika.
- **Tidak menambah permission.** `tabs` sudah ada (`wxt.config.ts:11`).
- **Ditolak: webNavigation API** — `onHistoryStateUpdated` lebih presisi untuk SPA, tapi permission tambahan (`webNavigation`) untuk perbaikan kecil; `onUpdated` sudah cukup.

## Testing Decisions

- **Apa yang baik diuji:** tidak ada logika murni baru — ini wiring listener. Verifikasi manual: buka Side Panel, putar video di tab YouTube, klik video lain di sidebar rekomendasi (SPA nav), konfirmasi indikator pindah.
- **Tidak menguji:** Chrome API internals, lifecycle listener. Konsisten dengan `docs/agents` — uji perilaku eksternal, bukan API wiring.
- **Regression guard:** `grouping.test.ts` (14 test) tak tersentuh; `tab-operations.test.ts` (23 test) tak tersentuh (tak ada perubahan `tab-operations.ts`).

## Dependencies

- **Mandiri.** Tidak bergantung fitur lain. Bisa ship kapan saja.

## Verification needed before implementation

1. `onUpdated` noise: konfirmasi filter `changeInfo.url` cukup ketat — tak ada event storm yang menyebabkan `loadData` berlebihan. `loadData` query active tab + storage (murah), tapi tetap perlu konfirmasi tak ada jank saat YouTube load halaman (banyak `onUpdated` saat loading, tapi `changeInfo.url` hanya saat navigation).

## References

- Grilling: `docs/grilling/g7-now-playing-spa.md`
- Roadmap: `docs/ROADMAP.md` G7
- Code: `src/entrypoints/sidepanel/App.svelte:37-46`, `src/shared/tab-operations.ts:81`