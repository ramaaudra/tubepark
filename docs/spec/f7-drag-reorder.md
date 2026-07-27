# Spec: F7 — Drag-to-Reorder (Up Next)

Part of: `docs/ROADMAP.md` F7 · Grilling: `docs/grilling/f7-drag-reorder.md` · ADR: `docs/adr/0005-lightweight-organization.md`

## Problem Statement

TubePark disebut *queue*, tapi user tak bisa mengatur urutannya. Satu-satunya kontrol prioritas adalah `pinned` (`storage.ts:60`), dan itu biner — N item pinned tak punya urutan di antara mereka. `groupAndSortVideos` (`grouping.ts:20`) mengurutkan murni by `addedAt`. Celah asli: 10 pinned di Up Next tak ada urutan prioritas.

## Solution

Reorder **hanya di Up Next**, via drag handle eksplisit yang hanya muncul di kartu pinned. Disimpan sebagai field `order?: number` di item (hanya meaningful saat `pinned`). `addedAt` tetap otoritas tunggal di luar Up Next — punya dua pekerjaan (urutan + klasifikasi usia), reorder menyerang yang pertama, yang kedua tetap utuh. Pin baru → akhir Up Next (`order = max+1`); unpin → buang `order`. Toggle pin menyentuh `order`; race order diselesaikan di background (G5 D3 sudah pindahkan kepemilikan tulis ke sana).

## User Stories

1. As a curator, I want to drag pinned videos within Up Next to set their priority order, so that "what I watch next" is under my control.
2. As a curator, I want Baru and Lebih Lama to stay sorted by recency (not draggable), so that time grouping remains meaningful outside Up Next.
3. As a curator, I want a newly pinned video to appear at the bottom of Up Next, so that I can drag it up if it's high priority — not have it jump to the top by assumption.
4. As a curator, I want unpin to clear the order, so that re-pinning starts fresh at the bottom (not resurrect an old position).
5. As a curator, I want the drag handle to not collide with play/select/hover, so that each gesture has one meaning.

## Implementation Decisions

- **F7-1 — Cakupan: hanya Up Next.** `addedAt` tetap otoritas di Baru/Lebih Lama. Celah asli (N pinned tanpa urutan) terisi. ⚠️ "Up Next" akhirnya jujur — selalu menyiratkan urutan, sekarang punya urutan nyata.
- **F7-2 — Basis order: field numerik di item.**
  ```ts
  ParkedVideo { …, pinned?: boolean, order?: number }
  // Up Next sort:
  sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  ```
  ⚠️ Gap order (hapus tengah → 1,3,5): komparator non-rigid (urutan tetap benar) atau renumber lazy. 🔓 untuk spec. ⚠️ Race order (dua pin bersamaan → max+1): D3 G5 — assignment `order` di background, satu pembaca `max`, tanpa race.
- **F7-3 — Pin baru → akhir; unpin buang order.**
  ```
  Pin A → order = max(order)+1 = 1   → bottom
  Unpin B → order B = undefined
  Pin B lagi → order = max+1 (bottom lagi)
  ```
  Default jujur — tak tahu prioritas relatif; user drag ke atas. ⚠️ Banyak pin cepat → terbalik dari urutan klik; diterima (urutan klik bukan sinyal prioritas).
- **F7-4 — Drag handle eksplisit, hanya kartu pinned.** Ikon genggam (⋮⋮) kecil di kartu; tahan-seret dari sana. Hanya muncul di Up Next. ✅ Tak konflik: play (thumb, kontrol terpisah), hover (content script, di YouTube), seleksi F8-4 (checkbox/long-press, kontrol berbeda). ⚠️ Kontrol ke-5 di kartu yang padat di ~320px; diterima karena hanya kartu pinned (minoritas). 🔓 Ikon handle — `icons.ts` (12 ikon) tak punya grip; tambah path atau pakai yang ada.
- **Ditolak: di setiap grup** — `order` wajib semua item, item menua migrasi grup bawa order (rumit). Ditolak: lintas seluruh queue — menghancurkan grouping waktu, lawan F8-9.
- **Ditolak: long-press body** — konflik F8-4 bila F8-4 pakai long-press; dua ambang waktu rapuh. Ditolak: seret dari thumb — thumb dua pekerjaan (play+drag), ambigu.

## Testing Decisions

- **Unit test (pola storage.ts):** pure fungsi — `pinVideoPure` (assign order = max+1), `unpinVideoPure` (clear order), `sortUpNext(items)` (by order, gap-tolerant). Tanpa browser. Test gagal-dulu: penghapusan beruntun tidak renumber yang lama (gap OK), pin bersamaan tidak duplikasi order.
- **`grouping.test.ts` restrukturisasi** — Up Next sort berubah dari `addedAt` ke `order`. Dibagi dengan F8/F9.
- **Integration (manual):** drag kartu pinned → urutan berubah + persist; pin baru → bottom; unpin → order hilang; drag handle tak memicu play/select.

## Dependencies

- **G5 D3** — assignment `order` di background (race order). F7 bergantung G5 untuk tulis yang aman.
- **F8, F9 berbagi `grouping.ts` restrukturisasi.** F7 menambah strategi-sort Up Next by `order`. F8-9 membuat grouping strategi; F9 menambah strategi channel. Satu restrukturisasi untuk ketiganya.
- **F8-4** — F7-4 menyelesaikan konflik gestur: drag handle (F7) vs seleksi (F8-4) pakai kontrol berbeda, bebas berdampingan.

## Verification needed before implementation

1. **Pustaka drag** — repo sangat ramping (svelte saja). `svelte-dnd-action` atau hand-rolled? Keputusan dependensi. `animate:flip` (4 tempat) berinteraksi dengan drag — koordinasi agar tak bertabrakan animasi.
2. **Ikon handle** — `icons.ts:14` punya 12 ikon, tak ada grip. Tambah path Phosphor grip atau pakai yang ada.

## References

- Grilling: `docs/grilling/f7-drag-reorder.md`
- ADR: `docs/adr/0005-lightweight-organization.md`
- Roadmap: `docs/ROADMAP.md` F7
- Berbagi: `docs/spec/f8-collections.md` F8-9, `docs/spec/f9-group-by-channel.md`
- Code: `src/shared/grouping.ts:20-23`, `src/shared/storage.ts:60`, `src/shared/types.ts:1`, `src/shared/icons.ts:14`