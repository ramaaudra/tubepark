# Grilling: F8 — Collections

Sesi 2026-07-27. Status: **keputusan desain selesai, belum jadi spec, belum ada kode.**
Pemicu ADR-0005 — ini fitur yang paling banyak pertanyaan terbuka, dan menahan F7 + F9.

Rujukan: `docs/ROADMAP.md` F8 · `docs/adr/0005-lightweight-organization.md`.

**Tanda:** ✅ terverifikasi di kode · ⚠️ asumsi, belum diuji · 🔓 masih terbuka

---

## Ringkasan keputusan

Collections adalah **lensa** yang memfilter queue, bukan wadah tempat item dipindahkan.
Penugasan tepat-satu-atau-tanpa, diturunkan dari item (nol entitas storage baru),
dan ortogonal terhadap `pinned`.

### F8-1 — Pekerjaan: **konteks** ("tunjukkan satu topik saja")

User punya beberapa hunt berjalan dan ingin menyembunyikan yang tidak relevan saat ini.
Collection = lensa/filter, bukan partisi permanen. Item tetap satu queue; collection
hanya memilih apa yang terlihat.

**Ini melarutkan sebagian masalah precedence di ADR-0005.** Collection memfilter,
waktu mengelompokkan — dua sumbu berbeda, tidak berebut satu sumbu tampilan.
⚠️ Tapi F9 (group-by-channel) **benar-benar** bersaing dengan grouping waktu,
karena itu adalah grouping. Dipecahkan di F8-9.

Ditolak: *batching* (kelompokkan sejenis) — berebut sumbu dengan grouping waktu.
Ditolak: *prioritas* — wilayah `pinned` dan F7. Ditolak: *retrieval* — F5 (search)
lebih baik untuk itu.

### F8-2 — Kardinalitas: **tepat satu atau tanpa**

Partisi sejati: hitungan menjumlah ke total, "Tanpa label" tidak ambigu, UI penugasan
= satu pilihan (radio). Cocok dengan surface yang keunggulannya minim kontrol.

Ditolak: *banyak (tag)* — hitungan tidak menjumlah, UI multi-select, dan membuka
pertanyaan AND vs OR untuk filter multi-tag. Ditolak: *hierarkis* — itu folder,
dan ADR-0005 batasan 2 menolak semantik containment.

### F8-3 — Istilah: **Collection**

Sudah tertanam di ADR-0005 + roadmap. ⚠️ Menyiratkan containment, jadi
**wajib** kalimat penyangkal di CONTEXT.md:

> **Collection**: A user-assigned label that acts as a LENS over the Queue —
> not a container. Items are never moved into a collection; the Side Panel
> filters to one.

Ditolak: *Label* — bertabrakan dengan triage labels (`docs/agents/triage-labels.md`)
dan `.group-label` di CSS. Ditolak: *Tag* — nyaris universal berarti banyak-per-item.
Ditolak: *Lens* — jargon yang aneh di tombol, meski paling akurat.

### F8-4 — Penugasan: **aksi massal saat lensa aktif**

Pilih beberapa kartu → "Masukkan ke Collection". Cocok dengan cara parking
terjadi: bursty dan topikal — 6 video dari satu hunt ditugaskan sekali, bukan
satu per satu. Nol tambahan kontrol per-kartu.

Harga: butuh **mode seleksi** (checkbox/long-press) yang belum ada di panel.

Ditolak: *per-kartu* — baris aksi sudah 3 pill (`Putar`/`Pin`/`×`) di panel
~320px; keempat berdesakan, dan menugaskan 6 item butuh 6 interaksi.
Ditolak: *saat park dengan default* — menyerempet tripwire ADR-0005 (lihat F8-7
untuk versi yang aman). Ditolak: *drag ke collection* — F7 juga memakai drag pada
kartu yang sama; dua makna untuk satu gestur.

### F8-5 — Sumber daftar: **diturunkan dari item**

```ts
collections = [...new Set(queue.map(v => v.collection).filter(Boolean))]
```

Nol key storage tambahan, nol CRUD, tidak bisa desync. Collection lahir saat
item pertama diberi nama itu, mati saat item terakhirnya hilang.

⚠️ Konsekuensi yang harus dijawab di spec:
- collection kosong tidak bisa ada (tak bisa disiapkan lebih dulu)
- rename = tulis ulang N item (lihat F8-8)
- salah ketik memunculkan collection kembar (lihat F8-8)
- **tak ada tempat menyimpan warna/urutan collection** — bila ini dibutuhkan
  nanti, harus naik ke entitas tersendiri, yang membatalkan keputusan ini.

Ditolak: *entitas tersendiri di storage* — butuh CRUD, bisa desync, dan
menimbulkan pertanyaan item-yatim saat collection dihapus.

### F8-6 — `pinned`: **tetap terpisah dan ortogonal**

`pinned` menjawab **kapan** (prioritas tonton), collection menjawab **apa** (topik).
Beda pertanyaan, hidup berdampingan.

```ts
ParkedVideo {
  pinned?: boolean      // kapan
  collection?: string   // apa
}
```

✅ `grouping.ts:23` **tidak berubah** — Up Next tetap sticky-sorted, kini
beririsan dengan lensa yang aktif: `pinned ∩ collection`.

Ditolak: *pinned jadi collection istimewa* — kardinalitas satu-per-item membuat
memberi collection ke item yang dipin **menghapus pin-nya**; user kehilangan
prioritas saat memberi topik. Regresi nyata dari perilaku sekarang.

### F8-7 — Persistensi lensa + park saat lensa aktif

Lensa **bertahan** setelah panel ditutup (disimpan di `tubepark_ui_state`, key
baru, **bukan** bagian dari queue). ⚠️ Wajib indikator yang tak bisa
diabaikan + jalan keluar eksplisit:

```
[ 🔍 Riset kerja (12)  ✕ ]   ← reset ke Semua
```

**Park saat lensa aktif → item otomatis masuk collection itu.** Tetap nol klik
(tripwire ADR-0005 aman: default implisit, bukan prompt). Item langsung terlihat.
Ini alur terbaiknya: pilih lensa sekali, lalu berburu — seluruh burst terlabeli.

⚠️ Toast content script **wajib menyebutkannya** ("Diparkir ke Riset kerja") agar
penugasan tidak diam-diam — user yang lupa lensa aktif adalah risiko utama,
dan diam-diam memperburuknya.

⚠️ **Konsekuensi teknis untuk spec:** content script harus tahu lensa aktif untuk
mengirim `collection` bersama payload park. Dua jalur — (a) content script membaca
`tubepark_ui_state` sendiri, atau (b) background melampirkan lensa saat menerima
`PARK_VIDEO_REQUEST`. Yang (b) lebih bersih: satu pembaca state, content script
tetap bodoh soal storage key UI.

Ditolak: *reset ke Semua tiap buka* — menyebalkan untuk sesi triase panjang.
Ditolak: *item masuk tanpa collection + panel beri tanda* — UI tambahan, alur
berburu terputus. Ditolak: *park mereset lensa* — menghancurkan konteks triase
saat user berburu, kebalikan alasan memilih "bertahan".

### F8-8 — Rename + salah ketik: **tulis ulang semua item**

```ts
rename(old, new):
  queue.forEach(v => { if (v.collection === old) v.collection = new })
  await saveQueue(queue)
```

Salah ketik **tidak dicegah** — 'Riset kerja' dan 'riset kerja' jadi dua collection.
Pemaaf: hapus item terakhir → collection lenyap.

🔓 **Untuk spec — collision-merge:** bila `new` sudah ada, dua nama resmi jadi satu.
Apakah itu merge diam-diam, atau perlu konfirmasi? Belum diputuskan.

Ditolak: *autokomplit cegah duplikat* — UI baru, dan perbedaan kecil (case, plural)
tetap lolos. Ditolak: *tidak bisa rename* — penamaan buruk melekat selamanya.

### F8-9 — Konflik F9: **grouping jadi strategi**

Grouping saat ini mengembalikan bentuk tetap 3-bucket (`grouping.ts:3`,
`GroupedVideos`), dikunci 14 test. F9 (group-by-channel) benar-benar bersaing
dengan grouping waktu — keduanya grouping, satu slot tampilan.

**Putusan:** grouping menjadi strategi, dipilih via mode switch di header:

```ts
type Grouping =
  | { kind: 'time' }      // upNext / baru / lebihLama (3-bucket)
  | { kind: 'channel' }   // N-bucket dinamis
```

Collection tetap ortogonal — ia memfilter, lalu grouping apa pun yang dipilih
berlaku pada hasil filter.

⚠️ **Dampak nyata:** `groupAndSortVideos` berubah dari "fungsi dengan return tetap"
jadi "strategi yang mengembalikan bentuk generik." 14 test yang menyebut
`upNext`/`baru`/`lebihLama` secara literal (`grouping.test.ts`) perlu direstrukturisasi.
Ini perubahan interface pada modul yang paling teruji di repo. Spec harus
memetakan ini sebagai langkah eksplisit, bukan efek samping.

---

## Yang masih terbuka

🔓 **Collision-merge saat rename** (F8-8) — bila `new` sudah ada: diam-diam atau konfirmasi?

🔓 **Bentuk API grouping generik persisnya** (F8-9) — `{label, items}[]`?
Bagaimana `pinned` sticky-sort berperilaku under `kind: 'channel'`?

🔓 **Mode seleksi yang konkret** (F8-4) — checkbox, long-press, atau toggle
"Pilih" di header? Belum diputuskan.

🔓 **Normalisasi nama collection** — case-sensitive apa tidak. F8-8 memilih tidak
mencegah; tapi tampilan pemilih ("Riset kerja" vs "riset kerja" berdekatan)
mungkin mendorong normalisasi tampilan tanpa normalisasi data.

## Yang harus diverifikasi sebelum spec

1. ⚠️ Apakah `chrome.storage.local` cukup untuk `tubepark_ui_state` (key kecil)?
   Hampir pasti ya (10MB default, record kecil), tapi konfirmasi tidak butuh
   permission tambahan.

2. ⚠️ Content script membaca state lintas-context — verifikasi jalur pesan
   background yang melampirkan lensa (F8-7) tidak menambah round-trip yang
   merusak responsivitas tombol park.

## Dampak pada dokumen lain

- **`CONTEXT.md`** — entitas baru **Collection** (lensa, bukan wadah) +
  pembedaan "tersimpan" vs "terlihat" yang sama dengan G5 D4. Kalimat
  penyangkal containment wajib.
- **`ADR-0005`** bagian "Deferred to design" — keputusan F8 menjawab tiga
  dari empat pertanyaan terbuka di sana (istilah, kardinalitas, di mana
  `pinned` mendarat). ADR perlu diperbarui, atau dirujuk dari sini.
- **F7 (drag-to-reorder)** — F8-4 secara eksplisit menolak drag-ke-collection
  karena F7 memakai drag pada kartu yang sama. F7 harus digrill dengan
  konflik gestur ini di kepala.
- **F9 (group-by-channel)** — kini punya bentuk (strategi grouping) tapi masih
  butuh grill sendiri, terutama: `pinned` under channel grouping, dan
  **G4 memblokir F9** — selama channel di-hardcode `'YouTube'`, group-by-channel
  menghasilkan satu keranjang raksasa.
- **Bug sampingan ditemukan** (bukan F8): `popup/App.svelte:123` —
  `baruCount = queue.filter(v => !v.pinned).length` menghitung semua yang
  tidak dipin termasuk yang >7 hari. Popup bilang "53 Baru" sementara side
  panel bilang "3 Baru, 50 Lebih Lama". Dua surface, dua angka, label sama.
  Perlu dicatat ke roadmap sebagai gap baru.