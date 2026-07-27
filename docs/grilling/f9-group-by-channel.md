# Grilling: F9 — Group by Channel

Sesi 2026-07-27. Status: **keputusan desain selesai, belum jadi spec, belum ada kode.**
Bentuknya ditentukan oleh F8-9 (grouping jadi strategi). Ini grill terakhir yang
menyangkut ADR-0005 — menutup ordering precedence.

Rujukan: `docs/ROADMAP.md` F9 · `docs/grilling/f8-collections.md` F8-9.

**Tanda:** ✅ terverifikasi di kode · ⚠️ asumsi, belum diuji · 🔓 masih terbuka

---

## Ringkasan keputusan

Mode grouping kedua (channel), strategi yang dipilih via mode switch di header
bersama time (F8-9). Up Next tetap lintas-channel di puncak; bucket channel hanya
item tidak dipin, sort by recency.

### F9-1 — Up Next di bawah grouping channel: **lintas-channel di puncak**

Up Next tetap satu seksi sendiri di puncak, persis seperti grouping waktu. Di
bawahnya, bucket per-channel berisi **hanya** item tidak dipin, sort by `addedAt`.

```
▸ Up Next  (3, manual order F7)
    [pinned] Rust deep-dive   (channel: Jon Gjengset)
    [pinned] Tokio internals    (channel: Jon Gjengset)
    [pinned] Async book         (channel: book-channel)

▸ Jon Gjengset  (7)        ← hanya tidak dipin
▸ Fireship      (4)
▸ tak dikenal   (2)
```

✅ **F7 manual order utuh** — Up Next tunggal, lintas-channel, urutan `order`
field dipertahankan. ✅ Satu tempat lihat semua prioritas.
⚠️ Pinned tidak muncul di bucket channel-nya — user harus tahu pinned hidup di
Up Next. Diterima: itu sudah perilaku grouping waktu (`grouping.ts:23`).

Ditolak: *pinned tersebar ke bucket channel* — Up Next tunggal hilang, F7 order
pecah jadi N sub-list, dan "lihat semua prioritas saya" butuh gulir tiap channel.
Ditolak: *sembunyikan pinned di mode channel* — item yang user tandai prioritas
(pinned + F7 order) jadi tak terlihat; bertabrakan F8-6 (pinned ortogonal, harus
selalu terlihat).

### F9-2 — Urutan bucket channel: **by recency**

Channel dengan item terbaru (`max(addedAt)` di antara itemnya) tampil duluan.
Channel yang baru saja dipark muncul di puncak; channel tak aktif turun.

```
▾ Fireship      (4)  ← parkir 2 menit lalu
▾ Jon Gjengset  (9)  ← parkir 1 jam lalu
▾ book-channel  (1)
```

✓ Channel aktif muncul dulu — sesuai mental model berburu ("channel mana yang
baru saya jelajahi").
⚠️ Bucket berpindah posisi tiap park baru — gerakan visual. ✅ `animate:flip`
(sudah dipakai 4 tempat) menganimasinya halus; bukan masalah baru.

Dalam-bucket: sort by `addedAt` desc, konsisten dengan grouping waktu. Tidak
dibahas terpisah karena tidak ada alternatif yang masuk akal.

Ditolak: *by count* — "channel kebanyakan" di puncak bagus untuk pangkas, tapi
"mana yang baru" tak terlihat, dan count berubah lambat (kurang hidup).
Ditolak: *alfabetis* — stabil tapi tak menyampaikan info apa pun.

### F9-3 — Data lama + blokir G4: **terima sebagai bucket "tak dikenal"**

F9 rilis apa adanya. Item dengan channel hardcode (`'YouTube'` dari G4 lama) atau
fallback (`'YouTube Channel'`) tampil sebagai satu bucket samar di bawah,
dibedakan dari channel asli secara visual (abu-abu / label "tak dikenal").

```
▾ Fireship      (4)
▾ Jon Gjengset  (3)
▾ tak dikenal   (12)   ← item G4 lama (abu-abu)
```

✅ **G4 bukan lagi blokir F9.** G4 jadi fix-forward: item baru dapat channel
asli; item lama bisa di-park ulang dari hover untuk terkoreksi (kartu punya
`#channel-name`, lihat F9-fakta di bawah). Nol kerja migrasi.
⚠️ User dengan banyak item lama lihat satu bucket besar "tak dikenal" sampai
mereka re-park. Diterima: re-park dari hover sudah ada, dan bucket samar jujur
soal kenapa.

Ditolak: *migrasi via oEmbed* — F9 diblokir G4 + kerja jaringan di SW ephemeral,
rate-limit oEmbed, video hilang/privat gagal. Menunda F9 signifikan untuk data
yang akan terkoreksi sendiri saat user re-park. Ditolak: *sembunyikan item lama
di mode channel* — user tak melihat sebagian queue; terasa rusak, tidak jujur.

### F9-4 — Persistensi mode: **bertahan, default time**

Mode grouping (`'time' | 'channel'`) bertahan di `tubepark_ui_state`, bersama
lensa collection (F8-7). Dua state UI independen — bisa aktif bareng (lensa
"Riset" + mode "channel"). Default baru = `{ lens: null, grouping: 'time' }`.

Sama persis filosofi F8-7: konteks kerja berlanjut lintas buka-tutup. Mode switch
di header; tidak ada state tersembunyi yang bisa menyandera user tanpa indikator
(sudah wajib dari F8-7 untuk lensa; mode grouping terlihat dari label switch
itu sendiri, jadi risiko "queue saya kosong?!" lebih rendah).

---

## Fakta yang membentuk keputusan

✅ **Hover-park sudah menangkap channel yang baik.** `resolveChannel`
(`capture-predicates.ts:135`) baca `#channel-name`/`ytd-channel-name` dari kartu,
fallback ke `@handle` dari URL di halaman channel. Hanya tab-park (popup, G4)
yang hardcode `'YouTube'`, dan fallback `'YouTube Channel'` saat tak ada keduanya.
Jadi G4 adalah **satu-satunya** blokir kualitas data — hover-park sudah bersih,
dan re-park item lama dari hover akan mengoreksi channel.

✅ `grouping.ts:23` — `pinned` selalu ditarik ke `upNext` terlepas usia. Dasar
F9-1: perilaku ini dipertahankan di mode channel.

## Yang masih terbuka

🔓 **Deteksi "tak dikenal"** — apakah string literal (`'YouTube'`,
`'YouTube Channel'`) di-hardcode di grouping, atau field boolean baru
`channelKnown?: boolean`? Hardcode literal rapuh (G4 mungkin mengubah string
fallback); field boolean eksplisit lebih tahan. Untuk spec.

🔓 **Bentuk API grouping generik** (sama dengan F8-9) — `{label, items}[]`?
F8-9 dan F9 berbagi satu restrukturisasi `grouping.ts`; spec harus memetakan
sebagai satu langkah, bukan dua. Up Next lintas-channel (F9-1) dan strategi
time/channel (F8-9) harus muat dalam satu tipe return.

🔓 **Tampilan label channel** — apakah bucket channel tampilkan nama saja,
atau nama + jumlah + (channel terbaru)? Header grouping waktu saat ini pakai
ikon + label + `group-count` (`sidepanel/App.svelte:142-145`); mode channel
mungkin butuh layout berbeda karena label (nama channel) lebih panjang.

## Yang harus diverifikasi sebelum spec

1. ⚠️ Kualitas channel hover-park di luar fixture yang ada. Fixture
   `card-channel-grid/home` punya data channel baik via `@handle` path, dan
   `card-search` via `ytd-channel-name`. Tapi tidak ada fixture untuk home feed
   (rekomendasi) — perlu konfirmasi `#channel-name` terisi di sana.

## Dampak pada dokumen lain

- **`ADR-0005`** — ordering precedence **selesai penuh**. Tiga sumbu non-konflik:
  filter (F8) → group (F8-9 strategi time/channel) → order-within-group
  (F7 manual, hanya Up Next). F9 menambah strategi grouping kedua tanpa
  menambah sumbu yang bersaing. ADR-0005 sudah diperbarui dengan catatan F7+F9.
- **G4** — diturunkan dari "blokir F9" menjadi "fix-forward". G4 masih punya
  nilai mandiri (memperbaiki placeholder thumbnail `Thumbnail.svelte:15` yang
  menampilkan "Y" untuk semua item tab-park), tapi tak lagi di jalur kritis F9.
  Roadmap G4 perlu catatan ini.
- **`grouping.ts`** — restrukturisasi tunggal yang dipakai bersama F8-9 dan F7.
  14 test literal `upNext`/`baru`/`lebihLama` perlu direstrukturisasi sekali untuk
  ketiga fitur. Spec harus memetakan sebagai satu langkah.
- **F8-7 `tubepark_ui_state`** — kini menyimpan dua state (lens + grouping).
  Bentuk key tetap satu, tapi spec harus konfirmasi keduanya ditulis bareng
  (atomic) atau independen (dua tulisan kecil).