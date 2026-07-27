# Spec: F8 — Collections

Part of: `docs/ROADMAP.md` F8 · Grilling: `docs/grilling/f8-collections.md` · ADR: `docs/adr/0005-lightweight-organization.md`

## Problem Statement

`CONTEXT.md` membingkai Queue sebagai pure queue dengan satu sumbu (recency). Pada 200 item, recency lemah: user hunting "video Rust minggu lalu" tak punya rute selain scroll. Side Panel tak ada search/filter/grouping yang user kontrol. Musuh produk — Visual Context Loss — terciptak ulang di dalam surface yang dibangun untuk menyembuhkannya. Park bursty dan topikal (6 video satu channel satu hunt), tapi recency tak ekspresikan kepemilikan itu.

ADR-0005 mencatat arah: Queue boleh punya organisasi user-controlled, dengan batasan — Park tetap nol keputusan, no archive, no history, no `watched` flag, organisasi = metadata bukan storage growth.

## Solution

Collection adalah **lensa** yang memfilter queue, bukan wadah tempat item dipindahkan. Penugasan tepat-satu-atau-tanpa, diturunkan dari item (nol entitas storage baru), ortogonal terhadap `pinned`. Side Panel punya pemilih lensa; pilih "Riset kerja" → list menampilkan item collection itu, tetap dikelompokkan Up Next/Baru/Lebih Lama. Park saat lensa aktif → item otomatis masuk collection itu (default implisit, nol klik — tripwire ADR-0005 aman); toast content script menyebut collection agar tak diam-diam.

## User Stories

1. As a curator, I want to filter the queue to one collection ("Riset kerja"), so that I see only my work-research videos without unrelated noise.
2. As a curator, I want the collection picker to show counts that sum to the total, so that I can trust the partition is complete.
3. As a hunter, I want to assign a collection to a burst of videos at once (select → "Masukkan ke Collection"), so that triaging a topical hunt is one action, not six.
4. As a hunter, I want parking to stay a zero-decision action — no prompt for collection at capture — so that TubePark's frictionless promise holds.
5. As a hunter, I want parking while a lens is active to auto-assign to that collection, so that a hunt under "Riset kerja" lens files every parked video correctly without extra clicks.
6. As a curator, I want the active lens to persist across panel close/open, so that my triage session continues.
7. As a curator, I want a clear indicator + exit when a lens is active, so that I never wonder "where did my queue go?"
8. As a curator, I want to rename a collection, so that I can fix a bad name.
9. As a maintainer, I want `pinned` and collection to stay orthogonal, so that "what (topic)" and "when (priority)" don't collide.

## Implementation Decisions

- **F8-1 — Pekerjaan: konteks (lensa).** Collection memfilter; grouping waktu tetap. Dua sumbu berbeda, tak berebut tampilan.
- **F8-2 — Kardinalitas: tepat satu atau tanpa.** `ParkedVideo` (`types.ts:1`) tambah `collection?: string`. Partisi sejati; hitungan menjumlah.
- **F8-3 — Istilah: Collection.** Wajib kalimat penyangkal containment di `CONTEXT.md`: "A Collection is a user-assigned label that acts as a LENS over the Queue — not a container. Items are never moved into a collection; the Side Panel filters to one."
- **F8-4 — Penugasan: aksi massal saat lensa aktif.** Mode seleksi (checkbox) di Side Panel → "Masukkan ke Collection". Nol kontrol per-kartu tambahan. ⚠️ Butuh mode seleksi baru di panel.
- **F8-5 — Sumber daftar: diturunkan.** `collections = [...new Set(queue.map(v => v.collection).filter(Boolean))]`. Nol key storage tambahan. Collection lahir saat item pertama diberi nama itu, mati saat item terakhirnya hilang. ⚠️ Konsekuensi: collection kosong tak bisa ada; rename = tulis ulang N item; salah ketik = collection kembar; tak ada tempat warna/urutan.
- **F8-6 — `pinned` ortogonal.** `ParkedVideo { pinned?: boolean; collection?: string }`. `grouping.ts:23` tak berubah — Up Next tetap sticky-sorted, kini beririsan dengan lensa (`pinned ∩ collection`).
- **F8-7 — Lensa bertahan + park saat lensa aktif = default implisit.** `tubepark_ui_state` (key storage baru): `{ lens: string | null, grouping: 'time' | 'channel' }` (grouping = F9). Lensa bertahan. Wajib indikator + jalan keluar: `[ 🔍 Riset kerja (12)  ✕ ]`. Park saat lensa aktif → `collection` = lensa otomatis. ⚠️ Content script harus tahu lensa aktif — background melampirkan lensa saat menerima `PARK_VIDEO_REQUEST` (content script tetap bodoh soal storage key UI). Toast content script wajib menyebut: "Diparkir ke Riset kerja" (agar tak diam-diam; user lupa lensa aktif = risiko utama).
- **F8-8 — Rename: tulis ulang.** `rename(old, new)`: `queue.forEach(v => { if (v.collection === old) v.collection = new })`; `saveQueue`. Salah ketik tak dicegah. 🔓 collision-merge saat `new` sudah ada — diam-dalam atau konfirmasi? Untuk spec.
- **F8-9 — Grouping jadi strategi.** `groupAndSortVideos` (`grouping.ts:9`) berubah dari return tetap 3-bucket jadi strategi:
  ```ts
  type Grouping = { kind: 'time' } | { kind: 'channel' }
  type GroupedItems = { label: string; items: ParkedVideo[] }[]
  ```
  Mode switch di header (`[ Waktu ▾ ]` / `[ Channel ▾ ]`). Collection tetap ortogonal — filter dulu, lalu grouping berlaku. ⚠️ 14 test `grouping.test.ts` yang menyebut `upNext`/`baru`/`lebihLama` literal perlu direstrukturisasi. Dibagi dengan F7 dan F9 — satu restrukturisasi `grouping.ts` untuk ketiganya.

## Testing Decisions

- **Unit test (pola storage.ts):** pure fungsi — `deriveCollections(queue)` (F8-5), `renameCollection(queue, old, new)` (F8-8), `groupAndSortVideos` strategi (F8-9). Tanpa browser.
- **`grouping.test.ts` restrukturisasi** — 14 test literal perlu dipecah: test grouping time (3-bucket via strategi) + test grouping channel (N-bucket). Satu langkah untuk F8/F7/F9.
- **Integration (manual):** pilih lensa → list filter; park saat lensa aktif → item masuk lensa + toast sebut; tutup-buka panel → lensa tetap; rename → item pindah collection.

## Dependencies

- **F7, F9 berbagi `grouping.ts` restrukturisasi.** Spec F7 (`docs/spec/f7-drag-reorder.md`) dan F9 (`docs/spec/f9-group-by-channel.md`) juga menyentuh `grouping.ts`. Satu restrukturisasi untuk ketiganya — spec harus dikoordinasi, bukan tiga commit terpisah yang bertabrakan.
- **G4/F4** — park saat lensa aktif butuh lensa aktif dilampirkan ke `PARK_VIDEO_REQUEST`. Background (D3 G5) adalah tempat natural untuk melampirkan lensa (sudah punya akses `tubepark_ui_state`).

## Verification needed before implementation

1. **Content script baca state lensa** — verifikasi jalur pesan background melampirkan lensa tak menambah round-trip yang merusak responsivitas tombol park (F8-7).
2. **`chrome.storage.local` untuk `tubepark_ui_state`** — key kecil, hampir pasti aman (10MB default); konfirmasi tak butuh permission tambahan.

## References

- Grilling: `docs/grilling/f8-collections.md`
- ADR: `docs/adr/0005-lightweight-organization.md`
- Roadmap: `docs/ROADMAP.md` F8
- Berbagi: `docs/spec/f7-drag-reorder.md`, `docs/spec/f9-group-by-channel.md`
- Code: `src/shared/types.ts:1`, `src/shared/grouping.ts:9-36`, `src/entrypoints/sidepanel/App.svelte:107-258`