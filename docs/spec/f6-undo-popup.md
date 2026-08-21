# Spec: F6 — Undo di Popup

Part of: `docs/ROADMAP.md` F6 · Grilling: `docs/grilling/f6-undo-popup.md`

## Problem Statement

Popup `handleRemove` uses the G5 background transaction instead of committing directly. The popup now has the same five-second Undo contract as the Side Panel while keeping the Undo affordance local to the initiating surface.

## Solution

Popup `handleRemove` pakai seam G5 D3: kirim `PENDING_REMOVE` ke background, mutasi optimis (hilangkan dari list), toast "Video dihapus [Undo]". Undo (dalam 5 detik, selama popup terbuka) kirim `CANCEL_REMOVE`. Popup tetap terbuka setelah hapus (tidak `window.close()`), jadi undo biasanya tersedia. Bila popup tertutup (blur/play) dalam <5 detik, undo hilang, item commit permanen — jujur (user "meninggalkan" surface itu). D6 bulk tak relevan: popup hanya tampilkan 3 item terbaru (`recentItems`, `:118`), hapus tunggal, tak ada "Hapus Semua".

## User Stories

1. As a user, I want to undo a delete in the popup within 5 seconds, so that a misclick in the popup is recoverable like it is in the Side Panel.
2. As a user, I want the popup to stay open after I delete (not auto-close), so that the undo button is reachable.
3. As a user, I want honest behavior if I close the popup mid-undo-window — the deletion commits, not silently resurrects — so that close-then-reopen doesn't surprise me with a returned item.

## Implementation Decisions

- **Popup `handleRemove`** (`popup/App.svelte`) — sends the full `(id, addedAt)` video identity through the G5 D3 seam, applies the visible removal optimistically, and enables Undo only after the background returns the operation ID.
- **Undo handler** — `CANCEL_REMOVE` ke background dengan `operationId` + owner `popup`, restore optimis.
- **Toast infra popup.** Popup 330px (`:233`), belum punya toast (hanya `flyChip` untuk park feedback, `:50`). Tambah toast undo fixed-bottom (pola side panel `:597`). Detail layout spec.
- **D6 bulk tak berlaku** — popup hapus tunggal saja. Slot pending selalu 1 item. "Hapus Semua" hanya di Side Panel.
- **D5 (undo menang vs cap)** — berlaku via background (D3). Popup hanya konsumen seam; tak implementasi D5 sendiri.
- **Ditolak: tanpa undo (peran berbeda)** — inkonsisten; hapus popup permanen, side panel undo; aksi destruktif tetap layak jaring. Ditolak: undo survive popup close atau muncul di surface lain — setiap pending membawa owner, sehingga side panel tidak menampilkan Undo untuk aksi popup dan sebaliknya.

## Testing Decisions

- **Unit test (pola storage.ts):** `pending-removal.ts` (spec G5) sudah menguji seam. F6 hanya wiring popup ke seam — verifikasi manual.
- **Integration (manual):** hapus di popup → toast undo → klik undo → item kembali; hapus di popup → tutup popup (blur) → buka → item hilang (commit); hapus di popup → klik play item lain → popup tutup → item commit.
- **Regression guard:** `pending-removal.test.ts` covers the reducer and identity/ownership rules; popup wiring remains a browser-surface verification item.

## Dependencies

- **G5 (wajib, kuat).** F6 mustahil tanpa D3 (kepemilikan pending di background) + broadcast `PENDING_REMOVAL_CHANGED`. F6 = konsumen seam D3 kedua (setelah side panel; F1-3 konsumen ketiga dari YouTube). Spec G5 harus ship sebelum F6.
- **F1-3** — bersama membuktikan D3 adalah seam 3-surface (side panel, popup, YouTube). Validasi arsitektur: spec G5 harus memastikan seam mendukung tiga konsumen.

## Verification needed before implementation

1. **Popup blur-close timing** — konfirmasi `window.close()` via blur terjadi seketika, sehingga jendela 5 detik undo memang terbatas pada popup yang tetap fokus.
2. **`recentItems` re-derive setelah undo** — `recentItems` (`:118`) = queue sort `addedAt` slice 3. Undo → item kembali ke queue → recentItems re-derive → item muncul lagi di top-3 bila masih `addedAt` tertinggi. Konfirmasi tak ada edge case (item dihapus adalah item ke-4+, undo tak terlihat di popup tapi tetap di queue penuh — bukan bug, popup hanya tunjukkan 3).

## References

- Grilling: `docs/grilling/f6-undo-popup.md`
- Roadmap: `docs/ROADMAP.md` F6
- Dependensi: `docs/spec/g5-undo-model.md` D3
- Code: `src/entrypoints/popup/App.svelte:103-106,118,233`
