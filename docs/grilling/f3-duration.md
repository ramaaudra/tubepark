# Grilling: F3 — Durasi Video

Sesi 2026-07-27. Status: **keputusan desain selesai, belum jadi spec, belum ada kode.**
Grill terakhir. Mulai dengan koreksi fakta roadmap.

Rujukan: `docs/ROADMAP.md` F3.

**Tanda:** ✅ terverifikasi di kode · ⚠️ asumsi, belum diuji · 🔓 masih terbuka

---

## Verifikasi yang mengoreksi roadmap

Roadmap berkata "durasi sudah terbukti ada di DOM" lalu mengoreksi diri: ada di
view-model fixture, **tidak ada** di `card-search.html`. Grill verifikasi lebih lanjut:

- ✅ View-model fixtures (channel-grid, channel-home): badge `ytBadgeShapeText">15.19<`
  + `aria-label="... 15 menit"`. Durasi ada.
- ✅ **Koreksi roadmap:** `card-search.html` **punya** badge, isinya `ytBadgeShapeText">LIVE<`
  — kartu siaran langsung, bukan string kosong. Jadi search fixture berisi LIVE/streams,
  bukan video biasa tanpa durasi.
- ⚠️ Hanya **satu contoh durasi** (`15.19`) di seluruh fixture — tak ada >1 jam, <1 menit,
  atau format EN (`15:19`). Format `15.19` ambigu: 15 menit 19 detik (lokal ID, titik
  pemisah) atau 15.19 menit? `aria-label "15 menit"` membulatkan, tak konfirmasi.
- Durasi hanya dari DOM (oEmbed/YouTube API tak beri durasi tanpa key).

## Keputusan

### F3-1 — Sumber: **badge text → parse ke detik**

Parse badge text (mis. `15.19`) ke detik numerik. Paling presisi (15:19, bukan
`aria-label` "15 menit" yang membulatkan). Memungkinkan filter "Pendek/Sedang/Panjang"
(use case triase utama F3: "saya punya 10 menit, mana yang muat?").

```
badge '15.19' (ID)  → 15 menit 19 detik = 919 detik
badge '1:02:33' (EN) → 3753 detik
badge 'LIVE'        → undefined (tak berdurasi)
```

⚠️ **Format lintas-locale rapuh.** `15.19` (ID, titik) vs `15:19` (EN, titik dua)
vs `1:02:33` (>1 jam). Butuh normalisasi locale + fixture baru untuk verifikasi.
Kerja nyata, bukan beberapa baris.

Ditolak: *simpan string mentah, tak filter* — `15.19` ditampilkan ambigu (15:19
atau 15.19 menit?); filter use case utama tak jalan; setengah fitur. Ditolak:
*drop F3* — F3 layak karena use case triase nyata; parsing rapuh tapi bukan tak
mungkin (butuh fixture + normalisasi).

### F3-2 — Item tak berdurasi: **tetap tampil, tak masuk filter durasi**

Item tak berdurasi (LIVE, capture gagal) tetap tampil di queue dengan badge durasi
kosong/tanda khusus. Default "Semua durasi" menampilkan semuanya. Saat filter
durasi aktif (Pendek/Sedang/Panjang), item tak berdurasi **tak terlihat di filter
mana pun** — jujur, filter durasi tak klaim LIVE itu pendek.

```
Default (Semua durasi):
  [kartu] 9:30    Pendek
  [kartu] LIVE    (tak berdurasi)
  [kartu] 1:20:00 Panjang

Filter 'Pendek' aktif:
  [kartu] 9:30    ✓
  (LIVE hilang, tak masuk filter)
```

Ditolak: *grup 'tak diketahui' terpisah saat filter* — kompleksitas UI tambahan
untuk grup yang jarang berisi banyak item. Ditolak: *tolak park item tak berdurasi*
— kehilangan kemampuan park LIVE; konflik dengan G2-1 (Shorts warga kelas satu —
kalau Shorts boleh, kenapa LIVE ditolak?); inkonsisten.

## Detail yang implisit dari keputusan (untuk spec, bukan keputusan baru)

- **Ambang filter:** `<5 menit` Pendek, `5-20 menit` Sedang, `>20 menit` Panjang
  (dari preview yang dipilih di F3-1).
- **Stack filter non-konflik:** durasi adalah filter ke-4 yang bertingkat ortogonal:
  **collection (F8) → search (F5) → durasi (F3) → grouping (F8-9/F9)**. Empat filter,
  tak berebut sumbu tampilan; grouping tetap bekerja pada hasil semua filter.
- **Field:** `ParkedVideo` bertambah `durationSec?: number` (detik integer) — field
  opsional keempat (setelah `pinned?`, `order?` F7, `collection?` F8, `resumeAt?` F4).
  Item tak berdurasi: `durationSec` undefined.

## Yang harus diverifikasi sebelum spec

1. ⚠️ **Fixture baru wajib.** Recapture dari YouTube nyata:
   - Durasi >1 jam (format `1:02:33` atau `1.02.33` lokal ID?).
   - Durasi <1 menit (format `0:45` atau `45` atau `45 detik`?).
   - Format EN (`15:19` titik dua) untuk konfirmasi normalisasi locale.
   - Lebih banyak contoh ID untuk konfirmasi `15.19` = 15:19, bukan 15.19 menit.
   Tanpa fixture ini, parsing adalah tebakan.

2. ⚠️ **Badge durasi vs badge lain.** `ytBadgeShapeText` juga berisi badge non-durasi
   (`Subtitel` di channel-home fixture, `LIVE` di search). Parser harus bedakan
   badge durasi dari badge lain — posisi (thumbnail overlay vs metadata) atau
   pola regex. Konfirmasi struktur badge di fixture baru.

## Yang masih terbuka

🔓 **Posisi filter durasi di UI.** Chip "Pendek/Sedang/Panjang/Semua" di header
bersama search + lensa? Atau dropdown? Header side panel makin padat (brand +
ParkMeter + lensa F8 + search F5 + mode grouping F9 + filter durasi F3).
Detail layout spec — tapi ini kepadatan nyata yang harus dijawab.

## Dampak pada dokumen lain

- **F5/F8/F9** — durasi adalah filter ke-4 non-konflik. Stack penuh:
  collection → search → durasi → grouping. Empat filter, tak berebut. Memperkuat
  pola "filter ortogonal" yang sudah mapan (F8-1, F5-2, F8-9).
- **`ParkedVideo`** (`types.ts:1`) — field opsional keempat (`durationSec?`).
  Skema record makin kaya: `pinned?`, `order?` (F7), `collection?` (F8),
  `resumeAt?` (F4), `durationSec?` (F3). Catatan migrasi ADR-0005 makin relevan
  — lima field opsional, semuanya additive (backward-compatible dengan instalasi
  lama), tapi `getQueue` cast langsung (`storage.ts:79`) tanpa schema version
  mulai berisiko bila ada field non-additive di masa depan.
- **`capture-predicates.ts`** — `resolveCardMeta` (`:79`) harus tambah `durationSec`
  ke `CardMeta`. Parsing durasi adalah fungsi baru di `capture-predicates.ts`
  (murni, teruji seperti `resolveChannel`/`resolveTitle`).
- **`CONTEXT.md`** — tak butuh entitas domain baru; `durationSec` metadata turunan.