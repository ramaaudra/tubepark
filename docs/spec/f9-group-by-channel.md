# Spec: F9 — Group by Channel

Part of: `docs/ROADMAP.md` F9 · Grilling: `docs/grilling/f9-group-by-channel.md` · ADR: `docs/adr/0005-lightweight-organization.md`

## Problem Statement

`CONTEXT.md` membingkai Queue dengan satu grouping (recency: Up Next/Baru/Lebih Lama). Recency tak cocok untuk semua triase — user yang park burst dari satu channel ingin lihat per channel. `groupAndSortVideos` (`grouping.ts:9`) return tetap 3-bucket; tak ada grouping alternatif.

## Solution

Mode grouping kedua (channel), strategi yang dipilih via mode switch di header bersama time (F8-9). Up Next tetap lintas-channel di puncak (pinned ditarik keluar bucket channel, F7 order utuh); bucket channel hanya item tidak dipin, sort by recency. Channel dengan item terbaru tampil duluan. Data lama (channel hardcode `'YouTube'` dari G4 lama, fallback `'YouTube Channel'`) tampil sebagai bucket "tak dikenal" samar — G4 bukan blokir (fix-forward, item baru dapat channel asli via `docs/spec/g4-tab-channel.md`). Mode grouping bertahan di `tubepark_ui_state` (F8-7), default time.

## User Stories

1. As a curator, I want to group the queue by channel, so that I can see which channels I've parked most from.
2. As a curator, I want Up Next (pinned) to stay at the top across-channel in channel mode, so that my manual priority (F7) survives the grouping switch.
3. As a curator, I want channel buckets sorted by recency (most recently parked channel first), so that my active hunting channels surface.
4. As a curator, I want items with unknown/legacy channel to group into a dimmed "tak dikenal" bucket, so that bad data is visible but not confused with real channels.
5. As a curator, I want the grouping mode to persist across panel close/open, so that my triage session continues.
6. As a curator, I want a collection lens + channel grouping to compose (filter then group), so that I can focus one topic and see it per-channel.

## Implementation Decisions

- **F9-1 — Up Next lintas-channel di puncak.** Up Next tetap satu seksi di puncak (pinned, manual order F7), persis seperti grouping waktu. Bucket channel hanya item tidak dipin, sort by `addedAt`. ✅ F7 order utuh; satu tempat lihat semua prioritas. ⚠️ Pinned tak muncul di bucket channelnya — user harus tahu pinned hidup di Up Next (sudah perilaku `grouping.ts:23`).
- **F9-2 — Urutan bucket by recency.** Channel dengan `max(addedAt)` di antara itemnya tampil duluan. Dalam-bucket: sort `addedAt` desc (konsisten). ⚠️ Bucket berpindah tiap park baru — `animate:flip` (sudah dipakai 4 tempat) menganimasinya halus.
- **F9-3 — Data lama = bucket "tak dikenal".** F9 rilis apa adanya. Item channel `'YouTube'`/`'YouTube Channel'` → bucket samar (abu-abu, label "tak dikenal"). ✅ G4 bukan blokir — fix-forward (item baru channel asli via spec G4); item lama re-park dari hover terkoreksi. ⚠️ Bucket besar sampai user curate. 🔓 Deteksi "tak dikenal": string literal (`'YouTube'`, `'YouTube Channel'`) di-hardcode di grouping, atau field boolean `channelKnown?`? Hardcode rapuh (G4 mungkin ubah string fallback); boolean eksplisit lebih tahan. Untuk spec.
- **F9-4 — Mode bertahan, default time.** `tubepark_ui_state: { lens: string|null, grouping: 'time'|'channel' }`. Default `{ lens: null, grouping: 'time' }`. Mode switch di header; label switch terlihat (risiko "queue kosong?!" lebih rendah dari lensa).
- **F8-9 restrukturisasi `grouping.ts`** — `groupAndSortVideos` berubah jadi strategi:
  ```ts
  type Grouping = { kind: 'time' } | { kind: 'channel' }
  type GroupedItems = { label: string; items: ParkedVideo[] }[]
  function groupAndSortVideos(queue, grouping, now = Date.now()): GroupedItems
  ```
  Time: Up Next (pinned, sort by F7 `order`) + Baru + Lebih Lama. Channel: Up Next (pinned) + N channel buckets (sort by recency). 14 test `grouping.test.ts` literal perlu direstrukturisasi — satu langkah untuk F8/F7/F9.

## Testing Decisions

- **Unit test (pola storage.ts):** `groupAndSortVideos(queue, {kind:'channel'})` — Up Next lintas-channel di puncak, channel buckets by recency, dalam-bucket `addedAt`, item "tak dikenal" di bucket samar. Pure, via fixture data (bukan DOM).
- **`grouping.test.ts` restrukturisasi** — pecah 14 test: test grouping time (strategi) + test grouping channel. Satu langkah F8/F7/F9.
- **Integration (manual):** switch mode channel → bucket per channel; Up Next tetap di puncak; park baru → bucket channel naik (recency); tutup-buka → mode tetap; lensa + channel komposisi.

## Dependencies

- **G4 (fix-forward).** F9-3 menerima data lama; G4 perbaiki item baru. F9 tak diblokir G4, tapi kualitas grouping channel bergantung G4 untuk item baru. Spec G4 menyatakan ini.
- **F8, F7 berbagi `grouping.ts` restrukturisasi.** F9 menambah strategi channel; F8-9 membuat grouping strategi; F7 menambah sort Up Next by `order`. Satu restrukturisasi.
- **F8-7 `tubepark_ui_state`** — kini dua state (lens + grouping). Konfirmasi keduanya ditulis atomic atau independen.

## Verification needed before implementation

1. **Kualitas channel hover-park di luar fixture** — fixture `card-channel-grid/home` punya data channel baik via `@handle` path, `card-search` via `ytd-channel-name`. Tidak ada fixture home feed (rekomendasi) — konfirmasi `#channel-name` terisi di sana (F9 bergantung channel hover-park baik; G4 hanya perbaiki tab-park).

## References

- Grilling: `docs/grilling/f9-group-by-channel.md`
- ADR: `docs/adr/0005-lightweight-organization.md`
- Roadmap: `docs/ROADMAP.md` F9
- Berbagi: `docs/spec/f8-collections.md` F8-9, `docs/spec/f7-drag-reorder.md`
- Fix-forward: `docs/spec/g4-tab-channel.md`
- Code: `src/shared/grouping.ts:9-36`, `src/shared/capture-predicates.ts:135`