# Spec: F3 — Durasi Video

Part of: `docs/ROADMAP.md` F3 · Grilling: `docs/grilling/f3-duration.md`

## Problem Statement

Pertanyaan paling sering saat triase: *"saya punya 10 menit, mana yang muat?"* — queue tak bisa menjawab. Durasi video ada di DOM kartu YouTube (badge `ytBadgeShapeText` di thumbnail overlay, mis. `15.19`) tapi tak ditangkap. ParkedVideo hanya simpan `id, title, channel, addedAt`. Tanpa durasi, filter "Pendek/Sedang/Panjang" mustahil.

⚠️ **Koreksi roadmap:** `card-search.html` **punya** badge (`ytBadgeShapeText">LIVE<`), bukan string kosong — search fixture berisi LIVE/streams. Hanya satu contoh durasi (`15.19`) di seluruh fixture; format ambigu (15:19 atau 15.19 menit?), tak ada >1 jam / EN. Parsing lintas-locale rapuh tanpa fixture baru.

## Solution

Parse badge text durasi ke detik numerik saat capture. Simpan `durationSec?: number` di ParkedVideo. Tampilkan durasi di kartu; filter "Pendek <5m / Sedang 5-20m / Panjang >20m / Semua". Item tak berdurasi (LIVE, capture gagal) tetap tampil default, tak masuk filter durasi. Durasi adalah filter ke-4 non-konflik (collection → search → durasi → grouping).

## User Stories

1. As a curator, I want each parked video to show its duration, so that I can triage "what fits 10 minutes" at a glance.
2. As a curator, I want to filter the queue by duration (Pendek/Sedang/Panjang), so that I can find a short video when I have a small window.
3. As a curator, I want items without duration (LIVE, failed capture) to still appear in the default view, so that I don't lose them.
4. As a curator, I want duration filter to honestly exclude items it can't categorize, so that "Pendek" only shows things actually known to be short.
5. As a maintainer, I want duration parsing unit-tested against real fixtures, so that locale variants don't silently break it.

## Implementation Decisions

- **F3-1 — Sumber: badge text → parse ke detik.** `resolveCardMeta` (`capture-predicates.ts:79`) tambah `durationSec` ke `CardMeta`. Fungsi baru `parseDurationSec(badgeText: string): number | undefined` di `capture-predicates.ts` (murni, teruji seperti `resolveChannel`). ⚠️ Format lintas-locale: `15.19` (ID, titik) vs `15:19` (EN, titik dua) vs `1:02:33` (>1 jam). Butuh normalisasi + fixture baru.
  - ⚠️ Badge durasi vs badge lain: `ytBadgeShapeText` juga berisi `Subtitel` (channel-home fixture), `LIVE` (search fixture). Parser harus bedakan — posisi (thumbnail overlay `yt-thumbnail-badge-view-model` vs metadata) atau pola regex. Konfirmasi struktur di fixture baru.
- **F3-2 — Item tak berdurasi tetap tampil, tak masuk filter durasi.** `durationSec` undefined → kartu tampilkan badge kosong/tanda khusus. Default "Semua durasi" menampilkan semuanya. Filter "Pendek" → item tak berdurasi tak terlihat (jujur). Ditolak: grup "tak diketahui" terpisah (kompleksitas), tolak park item tak berdurasi (konflik G2-1 Shorts warga kelas satu).
- **Field:** `ParkedVideo` (`types.ts:1`) tambah `durationSec?: number`. Field opsional keempat: `pinned?`, `order?` (F7), `collection?` (F8), `resumeAt?` (F4), `durationSec?` (F3). Lima field opsional, semua additive.
- **Ambang filter:** `<5 menit` Pendek, `5-20 menit` Sedang, `>20 menit` Panjang (dari preview yang dipilih).
- **Stack filter non-konflik:** durasi filter ke-4 — **collection (F8) → search (F5) → durasi (F3) → grouping (F8-9/F9)**. Empat filter ortogonal, grouping tetap bekerja pada hasil semua filter.
- **Ditolak: simpan string mentah** — ambigu ditampilkan, filter mustahil. Ditolak: drop F3 — use case triase nyata, `video.currentTime` accessible (pola G4-1 analog untuk DOM parsing).

## Testing Decisions

- **Unit test (wajib, pola storage.ts):** `parseDurationSec` murni — `15.19` → 919, `1:02:33` → 3753, `LIVE` → undefined, `Subtitel` → undefined, `` → undefined, `0:45` → 45. Pure, tanpa browser.
- **Fixture baru (wajib, kritikal):** recapture dari YouTube nyata:
  - Durasi >1 jam (format `1:02:33` atau `1.02.33` ID?).
  - Durasi <1 menit (`0:45` / `45` / `45 detik`?).
  - Format EN (`15:19`) untuk normalisasi locale.
  - Lebih banyak ID untuk konfirmasi `15.19` = 15:19.
  Tanpa fixture ini, parsing tebakan.
- **Integration (manual):** park video → durationSec di queue → tampil di kartu; filter Pendek → hanya <5m; LIVE → tak masuk filter.

## Dependencies

- **Mandiri secara desain.** Tidak bergantung fitur lain. `durationSec` additive; parser di `capture-predicates.ts` (murni).
- **F5/F8/F9** — durasi filter ke-4 non-konflik; tak mengubah keputusan mereka, hanya menambah konsumen pola filter.
- **G2** — Shorts durasi pendek; parsing durasi berlaku sama (badge Short = badge video biasa? konfirmasi di fixture Shorts G2).

## Verification needed before implementation

1. **Fixture baru (kritikal)** — tanpa itu parsing lintas-locale tebakan. Recapture: >1 jam, <1 menit, EN, lebih banyak ID.
2. **Badge durasi vs badge lain** — konfirmasi cara bedakan (posisi overlay thumbnail vs metadata, atau regex pola durasi `^\d+[.:]\d+`). Struktur badge di fixture baru.

## References

- Grilling: `docs/grilling/f3-duration.md`
- Roadmap: `docs/ROADMAP.md` F3
- Stack filter: `docs/spec/f5-search.md`, `docs/spec/f8-collections.md`, `docs/spec/f9-group-by-channel.md`
- Code: `src/shared/capture-predicates.ts:63-94`, `src/shared/types.ts:1`