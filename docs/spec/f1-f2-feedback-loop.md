# Spec: F1+F2 — Feedback Loop YouTube ↔ Queue

Part of: `docs/ROADMAP.md` F1+F2 · Grilling: `docs/grilling/f1-f2-feedback-loop.md`

## Problem Statement

Saat berburu, tak ada cara tahu apa yang sudah di-park tanpa mengkliknya. Feedback baru datang setelah aksi — `content.ts:194` menampilkan toast "Sudah ada di queue" *setelah* user mengklik. Loop umpan balik antara YouTube dan queue hanya berjalan satu arah. Sekunder: kapasitas queue (200) tak terlihat tanpa buka popup — tak ada kesadaran ambient.

## Solution

**F1:** content script simpan `Set<videoId>` dari queue (via `getQueue` D4, disinkronkan lewat `storage.onChanged` + broadcast `PENDING_REMOVAL_CHANGED`). `FloatingParkButton.update()` (`content.ts:108`) sudah tahu `meta.videoId` — tanya set, render `pinFill` + warna aksen bila sudah ada. Tanda terlihat saat hover (nol DOM churn, hormati arsitektur `FloatingParkButton`). Klik saat sudah dipark = toggle park→hapus (feedback loop dua arah). **F2:** `chrome.action.setBadgeText` dari background saat storage berubah — total queue + warna status (safe/warning/full), konsisten ParkMeter.

## User Stories

1. As a YouTube scroller, I want the park button to look different when a video is already parked, so that I don't re-park duplicates and can see my queue state at a glance.
2. As a YouTube scroller, I want to click the park button on an already-parked video to remove it from the queue, so that I can un-park from YouTube without opening the panel.
3. As a YouTube scroller, I want the removal from YouTube to be undoable (toast Undo), so that a misclick on the toggle doesn't lose the video permanently.
4. As a user, I want a toolbar badge showing my queue count + capacity color, so that I know my queue state without opening anything.
5. As a curator, I want the badge to drop immediately when I delete in the panel, so that the badge and the panel stay consistent.

## Implementation Decisions

- **F1-1 — Tanda hanya di tombol saat hover.** `FloatingParkButton.update()` (`content.ts:108-126`): saat `meta.videoId` ada di Set, render `svgMarkup('pinFill')` + warna aksen (bukan `pin`). Nol modifikasi DOM kartu — hormati `FloatingParkButton` (dibangun hindari DOM churn + portal hover-preview, komentar `content.ts:56-71`). ⚠️ Pemindaian massal (lihat mana dipark tanpa hover) tak terpenuhi; diterima.
- **F1-2 — Toggle park→hapus.** Tombol saat sudah dipark = "hapus dari queue". `onClick` (`content.ts:172`): bila `meta.videoId` di Set → kirim `PENDING_REMOVE` (bukan `PARK_VIDEO_REQUEST`); bila tidak → `PARK_VIDEO_REQUEST` seperti sekarang.
- **F1-3 — Hapus-dari-YouTube pakai grace period G5 + toast Undo.** Toast content script (infra ada, `content.ts:32`) beri tombol Undo; klik = `CANCEL_REMOVE` ke background. Konsisten G5 — undo tak pernah gagal.
  - ⛔ **Sinkronisasi tanda wajib:** saat klik hapus, storage belum berubah selama grace period → `storage.onChanged` tak menyala → Set di content script tetap punya id → tanda masih muncul 5 detik. Butuh broadcast `PENDING_REMOVAL_CHANGED` dari background ke content script saat pending berubah (bukan saat storage). Content script dengarkan pesan itu, kurangi id dari Set, tanda langsung hilang. Ini bagian D3 G5, bukan tambahan F1.
  - ⛔ **Set di content script pakai `getQueue()` (D4, menyaring pending), BUKAN raw storage.** Content script tak bisa baca raw storage sendiri dan tetap konsisten pending. `getQueue()` async ke background — content script "tanya background". Ubah bentuk pembacaan content script dari "baca storage lokal" jadi "tanya background".
- **F2-1 — Badge total queue + warna status.** `chrome.action.setBadgeText` + `setBadgeBackgroundColor` dari background saat storage berubah. Angka = total queue (`getQueue().length`, D4 menyaring pending → hapus di panel = badge langsung turun); warna ikut `deriveCapacityState`: safe (abu `#5f6368`), warning (kuning), full (merah). Queue 0 = tak ada badge (`setBadgeText('')`). ✅ Konsisten ParkMeter popup. ✅ `chrome.action` tak butuh permission.
- **Ikon sudah ada:** `pinFill` + `check` di `icons.ts:33,47`. Tidak butuh aset baru.

## Testing Decisions

- **Tidak ada logika murni baru untuk F1-1** — wiring di content script. Verifikasi manual: hover kartu yang sudah dipark → tombol pinFill; hover yang belum → pin.
- **F2 badge:** verifikasi manual — park → badge naik; hapus → badge turun; 160 → kuning; 200 → merah; 0 → hilang.
- **F1-2/F1-3 toggle + undo:** integration manual — klik tombol di kartu sudah-dipark → toast "Dihapus [Undo]" → klik undo → item kembali + tanda muncul lagi.
- **Regression guard:** `capture-predicates.test.ts` (23 test) tak tersentuh; `tab-operations.test.ts` (23 test) tak tersentuh.

## Dependencies

- **G5 (wajib, kuat) untuk F1-2/F1-3.** Toggle-hapus mustahil tanpa D3 (kepemilikan pending di background) + D4 (`getQueue` menyaring) + broadcast `PENDING_REMOVAL_CHANGED`. F1-2/F1-3 harus setelah G5. **F1-1 (tanda saja) bisa sebelum G5** — tanda baca Set dari storage.onChanged, tak butuh pending. Spec harus pisahkan F1-1 dari F1-2/F1-3 untuk urutan.
- **F6** — F1-3 + F6 bersama membuktikan D3 seam 3-surface (YouTube, popup, side panel).

## Verification needed before implementation

1. **Warna aksen tanda "sudah dipark"** — content script di luar token Svelte (inline SVG), tak bisa pakai `--tp-accent`. Hardcode warna, atau baca token dari `:root`. 🔓 Pilih warna: `--tp-accent` (hijau, sama pinned panel) atau berbeda untuk bedakan "di queue" dari "prioritas".
2. **`getQueue()` dari content script perf** — round-trip ke background per `storage.onChanged` + `PENDING_REMOVAL_CHANGED`. YouTube halaman dengan scroll tak picu event ini (hanya park/hapus), jadi kemungkinan aman; konfirmasi tak ada event storm.
3. **`chrome.action.setBadgeBackgroundColor` lintas-theme** — Chrome kelola kontras badge sendiri; kuning/merah mungkin perlu penyesuaian agar terbaca di toolbar terang/gelap.

## References

- Grilling: `docs/grilling/f1-f2-feedback-loop.md`
- Roadmap: `docs/ROADMAP.md` F1, F2
- Dependensi: `docs/spec/g5-undo-model.md` D3, D4
- Code: `src/entrypoints/content.ts:32,108-126,172-211`, `src/entrypoints/background.ts`, `src/shared/icons.ts:33,47`