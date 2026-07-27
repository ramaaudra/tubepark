# Grilling: F7 — Drag-to-Reorder

Sesi 2026-07-27. Status: **keputusan desain selesai, belum jadi spec, belum ada kode.**
Berbagi gestur dengan F8 (sudah digrill) — konflik itu di kepala sejak awal.

Rujukan: `docs/ROADMAP.md` F7 · `docs/grilling/f8-collections.md` (konflik gestur).

**Tanda:** ✅ terverifikasi di kode · ⚠️ asumsi, belum diuji · 🔓 masih terbuka

---

## Ringkasan keputusan

Reorder **hanya di Up Next**, disimpan sebagai field `order` numerik di item,
picu via drag handle eksplisit yang hanya muncul di kartu pinned. `addedAt`
tetap otoritas tunggal di luar Up Next.

### F7-1 — Cakupan: **hanya di dalam Up Next**

`pinned` multi-allowed (CONTEXT.md) tapi N item pinned tidak punya urutan di
antara mereka — itulah celah asli yang diisi F7. Reorder terbatas pada Up Next;
Baru/Lebih Lama tetap `sort by addedAt` (`grouping.ts:20`).

**Konsekuensi domain:** `addedAt` punya dua pekerjaan — urutan tampilan **dan**
klasifikasi usia (`grouping.ts:26`, `:43`). Reorder menyerang yang pertama;
yang kedua tetap utuh. `addedAt` TETAP jadi otoritas di mana pun kecuali Up Next.

⚠️ Ini membuat nama grup "Up Next" akhirnya jujur — ia selalu menyiratkan
urutan, dan sekarang ia punya urutan nyata.

Ditolak: *di dalam setiap grup* — `order` wajib di semua item, dan item yang
menua dari Baru ke Lebih Lama harus migrasi grup sambil bawa order — interaksi
rumit tanpa keuntungan jelas. Ditolak: *lintas seluruh queue* — menghancurkan
grouping waktu (fitur inti sejak MVP) dan langsung lawan F8-9.

### F7-2 — Basis order: **field `order` numerik di item**

```ts
ParkedVideo {
  …
  pinned?: boolean
  order?: number     // hanya meaningful bila pinned
}

// Up Next sort
sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
```

⚠️ Dua risiko yang harus dijawab di spec:
- **gap order** (hapus item tengah → 1, 3, 5) — pecahkan dengan komparator
  non-rigid (urutan tetap benar meski gap) atau renumber lazy saat gap besar.
- **race order** (dua pin bersamaan → max+1) — DARI G5 D3, kepemilikan tulis
  sudah di background, jadi assignment `order` dijalankan di sana: satu
  pembaca `max`, tanpa race. **Bukan masalah baru; F7 hanya memanfaatkan
  keputusan G5 yang sudah ada.**

Ditolak: *array id terpisah* (`tubepark_upnext_order`) — key storage ke-2
(selain `tubepark_ui_state` F8), bisa desync dengan queue (item dihapus tapi
masih di order array). Ditolak: *fractional indexing* — konsep asing dari basis
kode, presisi float menurun setelah ~50 reorder.

### F7-3 — Siklus hidup order vs pin: **pin baru → akhir Up Next**

```
Pin A → order = max(order)+1 = 1   → muncul paling bawah
Pin B → order = 2
Pin C → order = 3

Unpin B → order B = undefined (dibuang)
Pin B lagi → order = 4 (akhir lagi)
```

Default paling jujur — kita tidak tahu prioritas relatif item yang baru dipin;
user drag ke atas kalau mau. Drag handle sudah ada persis untuk itu.

⚠️ Banyak pin cepat berurutan → muncul terbalik dari urutan klik (C paling
bawah meski diklik terakhir). Diterima: urutan klik bukan sinyal prioritas,
dan user langsung bisa drag.

Ditolak: *pin baru → puncak* — asumsi "baru = paling ingin ditonton" bisa
salah; user yang hanya mengarsipkan ke Up Next akan kewalahan. Ditolak:
*unpin simpan order lama* — field order jadi sampah tak terpakai, dan re-pin
kembali ke posisi lama yang mungkin tidak relevan.

### F7-4 — Pemicu drag: **drag handle eksplisit**

Ikon genggam (⋮⋮) kecil di kartu; tahan dan seret dari sana saja. **Hanya
muncul di kartu pinned** (Up Next) — Baru/Lebih Lama tidak dapatnya, sesuai F7-1.

✅ Tidak ada konflik dengan apa pun:
- play (thumb) — kontrol terpisah
- hover (content script park button) — di halaman YouTube, bukan panel
- **F8-4 seleksi massal bebas** — checkbox **atau** long-press; drag handle
  tidak mengambil gestur itu. Ini menyelesaikan konflik yang ditandai sejak
  awal: dua mekanisme (drag vs select) kini pakai kontrol berbeda.

⚠️ Kontrol ke-5 di kartu yang sudah padat (`Putar`/`Pin`/`×` + thumb + handle)
di panel ~320px. Diterima karena hanya kartu pinned yang dapatnya, dan pinned
adalahminoritas queue.

Ditolak: *long-press body kartu* — konflik dengan F8-4 bila F8-4 juga pakai
long-press; dua ambang waktu (250ms drag vs 600ms select) rapuh. Ditolak:
*seret dari thumb* — thumb punya dua pekerjaan (klik=play, seret=reorder),
gestur ambigu, dan thumb "mati" untuk drag di Baru/Lebih Lama (F7-1) → membingungkan.

---

## Interaksi yang sudah diselesaikan (tidak butuh keputusan baru)

**G5 pending removal di Up Next.** D4 (pending = fakta global, `getQueue`
menyaring) berarti item pending tidak dirender. Drag hanya pada item yang
terlihat. Undo mengembalikan item ke posisi `order`-nya di storage — konsisten,
bukan masalah baru. F7 memanfaatkan D4, bukan menambah kompleksitas.

**Popup.** `popup/App.svelte:119` menampilkan `recentItems` sorted by `addedAt`,
BUKAN Up Next. Reorder Up Next tidak terlihat di popup — konsisten dengan
pemisahan domain (popup = recent, panel = priority). Bukan konflik.

**F8 collection.** Lensa memfilter, lalu grouping (termasuk Up Next manual order)
berlaku pada hasil. Reorder di Up Next bekerja di dalam lensa aktif — ortogonal,
tidak ada interaksi.

## Yang masih terbuka

🔓 **Strategi gap order** (F7-2) — komparator non-rigid vs renumber lazy.
Detail implementasi, tapi harus eksplisit di spec.

🔓 **Ikon handle** — ⋮⋮ (grip) vs ↔ (arrows). `icons.ts` saat ini punya 12 ikon,
tidak ada grip. Tambah path atau pakai yang ada?

## Yang harus diverifikasi sebelum spec

1. ⚠️ Tidak ada infra drag. Butuh pustaka (`svelte-dnd-action`) atau hand-rolled?
   Keputusan dependensi — `package.json` saat ini sangat ramping (svelte saja).
2. ⚠️ `animate:flip` (4 tempat) berinteraksi dengan drag — flip menganimasi
   reorder; drag library harus koordinasi agar tidak bertabrakan animasi.

## Dampak pada dokumen lain

- **`CONTEXT.md`** — entitas `ParkedVideo` bertambah `order?: number`; catat
  bahwa `order` hanya meaningful saat `pinned` (degenerate otherwise).
- **`ADR-0005`** "Ordering precedence" — F7 menyelesaikan: *collection filters*
  (ortogonal, F8), *manual reorder* (hanya Up Next, F7), *grouping* (strategi
  time/channel, F8-9). Tiga sumbu kini non-konflik: filter → group → order-within-group.
  Manual reorder tidak bersaing dengan grouping karena terbatas di Up Next.
  ADR perlu catatan bahwa precedence problem selesai, dengan satu peringatan:
  reorder *lintas* grup masih dilarang, dan bila suatu hari diinginkan, F7-1
  harus dibuka kembali.
- **F8** — F7-4 menyelesaikan konflik gestur yang ditandai F8-4: drag handle
  (F7) vs seleksi (F8-4) pakai kontrol berbeda, bebas berdampingan. F8-4
  mekanisme seleksi tetap 🔓 tapi tidak lagi dibatasi oleh F7.
- **`grouping.ts`** — F8-9 sudah mengubahnya jadi strategi; F7 menambah satu
  strategi-sort (Up Next by `order` alih-alih addedAt). Kedua perubahan
  berbagi modul yang sama — spec harus memetakan sebagai satu langkah
  restrukturisasi, bukan dua yang terpisah.