# Spec Index — TubePark

Spesifikasi pra-issue dari hasil grilling. Tiap spec = satu issue calon (konvensi repo:
issue per ticket, format PRD). Status: **siap dijadikan issues**, beberapa butuh verifikasi
lapangan/fixture sebelum implementasi.

Lihat juga: `docs/ROADMAP.md` (peta lengkap + status), `docs/grilling/` (keputusan
desain detail per item), `docs/adr/0005-lightweight-organization.md` (arah organisasi).

## Spec

| Spec | Item | Dependensi | Butuh verifikasi |
|---|---|---|---|
| [g7-now-playing-spa](g7-now-playing-spa.md) | G7 | mandiri | onUpdated noise |
| [g3-context-menu-scoping](g3-context-menu-scoping.md) | G3 | korelasi G2 (shorts) | documentUrlPatterns interaksi |
| [g2-shorts](g2-shorts.md) | G2 | korelasi G3 | fixture Shorts, tab reuse feed 🔓 |
| [g4-tab-channel](g4-tab-channel.md) | G4 | F4 (konsolidasi) | fixture halaman watch, CS termuat |
| [f4-resume-timestamp](f4-resume-timestamp.md) | F4 | G4 (konsolidasi) | `<video>` selector, player ready |
| [g5-undo-model](g5-undo-model.md) | G5+G6 | fondasi F1-3, F6 | SW setTimeout, getQueue async |
| [f6-undo-popup](f6-undo-popup.md) | F6 | G5 (kuat) | blur-close timing |
| [f8-collections](f8-collections.md) | F8 | F7, F9 (grouping.ts) | content script lensa, ui_state |
| [f7-drag-reorder](f7-drag-reorder.md) | F7 | G5, F8, F9 | pustaka drag, ikon grip |
| [f9-group-by-channel](f9-group-by-channel.md) | F9 | G4, F8, F7 | channel quality home feed |
| [f1-f2-feedback-loop](f1-f2-feedback-loop.md) | F1+F2 | G5 (F1-2/F1-3) | warna aksen, badge theme |
| [f3-duration](f3-duration.md) | F3 | mandiri | fixture baru (kritikal) |
| [f5-search](f5-search.md) | F5 | F8-7 (kejelasan) | perf live filter |
| [f10-watch-page-park-close](f10-watch-page-park-close.md) | F10 | mandiri (korelasi F8 lensa) | SPA nav detection, `sender.tab.id`, Shorts `<video>` |

## Urutan implementasi (dari dependensi)

1. **G7** — mandiri, sepele. Ship kapan saja.
2. **G3 + G2** — korelasi (scoping URL), satu commit.
3. **G5** — fondasi undo. Sebelum F1-2/F1-3, F6.
4. **G4 + F4** — konsolidasi `GET_TAB_META`, satu commit.
5. **F8 + F7 + F9** — satu restrukturisasi `grouping.ts` untuk ketiganya.
6. **F1+F2** — F1-1 sebelum G5; F1-2/F1-3 + F2 setelah G5.
7. **F6** — setelah G5.
8. **F5** — mandiri (konsumen grouping), ship kapan saja setelah grouping stabil.
9. **F3** — mandiri, tapi butuh fixture baru dulu.
10. **F10** — mandiri (capture surface baru, reuse F4/G4 capture + G5 park). Ship kapan saja; cocok digabung fixture `watch-page.html` dgn G4+F4.

## Yang butuh verifikasi lapangan sebelum implementasi

- **F3**: fixture durasi baru (>1 jam, EN, <1 menit) — kritikal, parsing tebakan tanpa ini.
- **G2**: fixture Shorts — konfirmasi struktur kartu + anchor.
- **G4 + F4**: fixture halaman watch — konfirmasi selector channel + `<video>`.
- **G5**: `setTimeout` 5 detik andal di MV3 SW.
- **F1**: broadcast `PENDING_REMOVAL_CHANGED` perf di content script.
- **F10**: mekanisme deteksi SPA nav (`yt-navigate-finish`+`popstate` vs poll `location.href`); posisi responsif di viewport sempit.

## Yang masih terbuka (untuk spec, bukan implementasi)

- G5: strategi gap order (komparator non-rigid vs renumber).
- F8: collision-merge saat rename; mode seleksi konkret; normalisasi nama collection.
- F7: ikon handle (grip path); pustaka drag.
- F9: deteksi "tak dikenal" (string literal vs field boolean).
- F4/F3: detail parsing/format.
- F10: mekanisme deteksi SPA nav pasti; posisi `top` responsif vs topbar YouTube di viewport sempit.