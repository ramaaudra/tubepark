# Spec: F5 — Search / Filter di Side Panel

Part of: `docs/ROADMAP.md` F5 · Grilling: `docs/grilling/f5-search.md`

## Problem Statement

Kapasitas 200 item (`types.ts:18`), tak ada satu pun cara mencari di Side Panel. Side Panel adalah surface triase, dan triase pada 200 item butuh penyaring. User hunting "video Rust minggu lalu" tak punya rute selain scroll.

## Solution

Live search (ketik → filter real-time) di Side Panel. Hasil dalam grup (struktur Up Next/Baru/Lebih Lama tetap; grup kosong tak tampil). Mencari di dalam lensa collection aktif (F8) — collection → search → grouping, tiga filter bertingkat non-konflik. Field: `title` + `channel`, case-insensitive substring. Query reset tiap buka panel (ephemeral, tak disimpan `tubepark_ui_state`). `groupAndSortVideos` murni — filter diterapkan sebelum grouping, tak menyentuh logika grouping.

## User Stories

1. As a curator, I want to type a few letters and see matching videos instantly, so that I can find a parked video without scrolling 200 items.
2. As a curator, I want search results to stay grouped by time, so that I keep recency context while searching.
3. As a curator, I want search to look within my active collection lens, so that "narrow to topic, then search" works as one flow.
4. As a curator, I want an empty search to bring back the full grouped view, so that search is a momentary tool, not a permanent filter.
5. As a curator, I want search to reset when I reopen the panel, so that a stale query from yesterday doesn't hide today's queue.

## Implementation Decisions

- **F5-1 — Hasil dalam grup, struktur tetap.** Filter `queue.filter(matches(query))` diterapkan **sebelum** `groupAndSortVideos`. Grup kosong tak tampil. ✅ Konteks kelompok tetap. ⚠️ Grup kecil berongga; diterima (konsistensi triase normal > kerapatan hasil).
- **F5-2 — Scope: di dalam lensa collection aktif.** Dua filter bertingkat: **collection → search → grouping**. Search cari di dalam lensa aktif. ✅ Intuitif (persempit dulu, cari di dlm). ⚠️ Lupa lensa aktif → "search tak temukan" — diamankan F8-7 (indikator lensa jelas).
- **F5-3 — Reset tiap buka.** Query tak disimpan di `tubepark_ui_state` (beda dari lensa/mode grouping yang bertahan). Search ephemeral. ⚠️ Tak konsisten dengan lensa/mode, tapi cocok karakter search (target spesifik saat ini). Ditolak: bertahan (query lama menyandera, butuh indikator search aktif).
- **Field:** `title` + `channel`, case-insensitive substring. Tidak termasuk `collection` (itu filter lensa, bukan konten).
- **Live real-time:** ketik → filter seketika, tanpa submit. 200 item kecil, debounce tak perlu.
- **Posisi input:** 🔓 header side panel padat (brand + ParkMeter + lensa F8 + mode grouping F9 + search). Detail layout spec — search di header atau baris sendiri di bawah header.
- **Ditolak: flat (grouping hilang)** — grouping waktu hilang, transisi search↔grouped membingungkan. Ditolak: ikut mode grouping aktif — hasil search di mode channel bisa sebar, kompleksitas dua strategi × search.

## Testing Decisions

- **Unit test (pola storage.ts):** `matchesSearch(video, query)` murni — case-insensitive, title+channel, substring. Plus integrasi dengan grouping: `groupAndSortVideos(queue.filter(v => matchesSearch(v, query)))` — konfirmasi grup kosong tak tampil, struktur tetap. Pure, tanpa browser.
- **Integration (manual):** ketik 'rust' → hanya yang cocok, dalam grup; kosongkan → kembali penuh; lensa aktif + search → cari di lensa; tutup-buka → search reset.

## Dependencies

- **Mandiri dari restrukturisasi grouping.** F5 adalah konsumen `groupAndSortVideos` (`queue.filter(matches).then(group)`), bukan modifier. Bisa ship terpisah dari F8-9/F7/F9 yang merestrukturisasi `grouping.ts`.
- **F8-7** — F5-2 bergantung indikator lensa aktif (F8-7) untuk kejelasan. F5 bergantung F8 untuk kejelasan, bukan fungsi.

## Verification needed before implementation

1. **Performa live filter di 200 item** — hampir pasti trivial (filter 200 string), tapi konfirmasi tak ada jank saat mengetik cepat.

## References

- Grilling: `docs/grilling/f5-search.md`
- Roadmap: `docs/ROADMAP.md` F5
- Stack filter: `docs/spec/f8-collections.md` F8-7, `docs/spec/f9-group-by-channel.md`
- Code: `src/shared/grouping.ts:9-36`, `src/entrypoints/sidepanel/App.svelte:107-258`