# Grilling: F5 — Search / Filter di Side Panel

Sesi 2026-07-27. Status: **keputusan desain selesai, belum jadi spec, belum ada kode.**
Bersih, mandiri — tidak bergantung fitur lain (kecuali interaksi dengan F8 lensa).

Rujukan: `docs/ROADMAP.md` F5.

**Tanda:** ✅ terverifikasi di kode · ⚠️ asumsi, belum diuji · 🔓 masih terbuka

---

## Ringkasan keputusan

Search live (ketik → filter real-time) di Side Panel. Hasil dalam grup (struktur
tetap), mencari di dalam lensa collection aktif, query reset tiap buka panel.

### F5-1 — Hasil: **dalam grup, struktur tetap**

Filter memangkas item di tiap grup (Up Next/Baru/Lebih Lama), tapi struktur grouping
tetap. Grup kosong tak tampil.

```
Cari: 'rust'

▸ Up Next (1)
    [pinned] Rust deep-dive
▸ Baru (2)
    [kartu] Rust async
    [kartu] Rust ownership
▸ Lebih Lama (0)   ← tak tampil
```

✓ Konteks kelompok tetap — search tak menghancurkan grouping.
⚠️ Grup kecil terasa berongga (1-2 item per grup), dan untuk pencarian spesifik
grouping tak menambah info. Diterima: konsistensi dengan triase normal lebih
penting daripada kerapatan hasil pencarian.

Ditolak: *flat (grouping hilang saat search)* — grouping waktu hilang; transisi
search↔grouped membingungkan (hasil "tumbuh" tiba-tiba saat search dikosongkan).
Ditolak: *ikut mode grouping aktif* — paling konsisten dengan F8-9, tapi hasil
search di mode channel bisa sangat sebar (1 hasil di 10 channel kosong), dan
kompleksitas implementasi (dua strategi grouping × search) tinggi.

### F5-2 — Scope: **di dalam lensa collection aktif**

Search mencari di dalam lensa aktif (F8-1). Dua filter bertingkat:
**collection → search → grouping**.

```
Lensa: Riset (12)  → search 'rust' → cari di 12
Lensa: Semua (80)  → search 'rust' → cari di 80
```

✓ Intuitif — user sudah mempersempit ke satu topik, search lanjut di dalamnya.
⚠️ User yang lupa lensa aktif heran "kenapa search tak temukan video X" (X ada di
collection lain). **Diamankan oleh F8-7** — indikator lensa aktif yang jelas sudah
wajib. Bila F8-7 tidak jalan, F5-2 menjadi membingungkan; F5 bergantung pada F8-7
untuk kejelasan, bukan untuk fungsi.

Ditolak: *seluruh queue, abaikan lensa* — prediktabel tapi transisi search↔lensa
membingungkan (hasil "tumbuh" tiba-tiba saat search dikosongkan kembali ke lensa).

### F5-3 — Persistensi: **reset tiap buka panel**

Query search **tidak** disimpan di `tubepark_ui_state`. Reset ke kosong tiap kali
panel dibuka. Search adalah sesaat — user cari, temukan, mainkan, selesai.

```ts
tubepark_ui_state: {
  lens: 'Riset' | null,           // bertahan (F8-7)
  grouping: 'time' | 'channel',   // bertahan (F9-4)
  // search: TIDAK disimpan — reset tiap buka
}
```

✓ Konsisten dengan UX search di mana-mana (browser find, file manager).
⚠️ **Tak konsisten dengan lensa/mode yang bertahan** — tiga state UI dengan tiga
perilaku berbeda. Diterima: search memang karakternya berbeda (ephemeral, target
spesifik saat ini), dan menyimpan query lama menyandera user ("hanya 3 item?"
padahal filter search masih aktif tanpa indikator jelas).

Ditolak: *bertahan seperti lensa/mode* — query lama yang tak relevan menyandera;
butuh indikator search aktif (sama seperti lensa F8-7), dan search aktif yang tak
terlihat adalah risiko "queue saya kosong?!" yang sama.

---

## Detail yang diasumsikan (tak dibahas, default yang jelas)

- **Field yang dicari:** `title` + `channel` (dua field yang ada di `ParkedVideo`,
  `types.ts:1`). Tidak termasuk `collection` (itu filter lensa, bukan konten).
- **Pencocokan:** case-insensitive substring. 200 item kecil, trivial.
- **Live real-time:** ketik → filter seketika, tanpa submit. 200 item, debounce
  tak perlu.

## Yang masih terbuka

🔓 **Posisi input search di header.** Header side panel saat ini padat (brand +
ParkMeter, `sidepanel/App.svelte:107-117`). Search input butuh tempat — di header
bersama, atau di bawah header sebagai baris sendiri? Detail layout spec.

## Yang harus diverifikasi sebelum spec

1. ⚠️ Performa live filter di 200 item — hampir pasti trivial (filter array 200
   string), tapi konfirmasi tak ada jank saat mengetik cepat di panel.

## Dampak pada dokumen lain

- **F8** — F5-2 menetapkan search bertingkat di dalam lensa collection. Ini
  memperkuat lensa sebagai konsep ortogonal: collection → search → grouping,
  tiga filter/bertingkat non-konflik. Tidak mengubah keputusan F8, hanya
  menambah konsumen lensa.
- **`grouping.ts`** — F5-1 menetapkan filter diterapkan **sebelum**
  `groupAndSortVideos`. Murni: `groupAndSortVideos(queue.filter(matches(query)))`.
  Tidak menyentuh logika grouping (yang sudah direstrukturisasi oleh F8-9/F7/F9).
  F5 adalah konsumen grouping, bukan modifier — bisa ship terpisah dari
  restrukturisasi grouping itu.
- **CONTEXT.md** — tak butuh entitas baru. Search adalah operasi UI atas Queue,
  bukan konsep domain.