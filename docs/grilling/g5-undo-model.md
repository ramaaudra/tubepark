# Grilling: G5/G6 — Model Undo

Sesi 2026-07-26. Status: **keputusan desain selesai, belum jadi spec, belum ada kode.**
Lingkup implementasi (satu putaran vs bertahap) **belum diputuskan** — itu pertanyaan
terakhir yang belum dijawab.

Rujukan: `docs/ROADMAP.md` G5 + G6.

**Tanda:** ✅ terverifikasi di kode · ⚠️ asumsi, belum diuji · 🔓 masih terbuka

---

## Ringkasan masalah

Roadmap mencatat G5 sebagai "race" dan G6 sebagai "copy salah". Penelusuran
saat grilling menemukan itu terlalu ringan: **satu model yang salah menghasilkan
empat bug**, dua di antaranya adalah kehilangan data deterministik, bukan race.

Model sekarang (`sidepanel/App.svelte:56-101`): mutasi optimis di memori +
commit ke storage tertunda 5 detik lewat `setTimeout`. Memori dan storage
sengaja dibuat berbeda selama jendela itu, dan tidak ada yang menjaga perbedaan
tersebut.

### Bug 1 — undo bulk tidak berfungsi ✅

`handleUndo` memanggil `clearTimeout` di cabang `undoItem` (`:74`) tapi **tidak**
di cabang `undoBulk` (`:76-80`).

Undo bulk terlihat berhasil — item kembali ke list — lalu 5 detik kemudian timer
`handleRemoveAllOlder` (`:92`) tetap menyala dan menghapus semuanya dari storage.
Deterministik, bukan race. "Hapus Semua" bisa menghapus puluhan item, jadi ini
adalah kehilangan data terbesar di aplikasi.

### Bug 2 — penghapusan beruntun membatalkan commit sebelumnya ✅

`:59` — `clearTimeout(undoTimer)` membatalkan timer item sebelumnya tanpa
mengomitnya:

```
handleRemove(A) → undoItem={A}, timerA, queue -= A
handleRemove(B) → clearTimeout(timerA)   ← commit A dibatalkan
                  undoItem={B}, timerB, queue -= B
t+5s: timerB → queue = await removeVideo(B.id)
                       ^ baca ulang storage, yang masih punya A
      → A muncul kembali di list dan tidak pernah terhapus
```

Undo tunggal pun sudah rusak untuk penghapusan beruntun.

### Bug 3 — race dengan `storage.onChanged` ✅

`:41` memasang `chrome.storage.onChanged` → `loadData()`, dan `loadData` (`:32`)
menimpa `queue` dari storage. Storage belum berubah selama jendela 5 detik, jadi
**event apa pun** dalam jendela itu — park dari YouTube, toggle pin, `handleParkAll`
dari popup — memunculkan kembali item yang sudah "dihapus". Timernya tetap jalan,
jadi item berkedip keluar-masuk.

### Bug 4 — tutup panel membatalkan penghapusan, diam-diam ✅

Tidak ada `onDestroy` maupun handler unload di side panel. Tutup panel dalam
jendela 5 detik → timer mati bersama dokumen → item tidak jadi terhapus. User
melihat item hilang, menutup panel, membukanya lagi, item kembali.

### Kenapa lolos review ✅

Keempatnya hidup di dalam `.svelte`. Tidak ada `vitest.config.*`, tidak ada
`@testing-library/svelte`/jsdom/happy-dom di `package.json`; `linkedom` dipakai
manual hanya untuk parse fixture HTML di `capture-predicates.test.ts`. 88 test
hijau semuanya menguji modul murni di `src/shared/`. Logika undo tidak punya
seam yang bisa diuji, jadi tidak ada satu pun test yang bisa gagal.

---

## Keputusan

### D1 — Model: **grace period** (tunda hapus)

Jendela 5 detik adalah penundaan sebelum penghapusan, bukan jaring pengaman
setelahnya. Item baru hilang dari storage setelah jendela lewat.

**Alasan:** undo tidak pernah bisa gagal. Kalau item sudah dihapus lalu ditulis
balik (alternatif "jaring pengaman"), penulisan balik bisa ditolak — dan
menawarkan tombol Undo yang bisa gagal adalah janji yang lebih buruk daripada
tidak menawarkannya.

**Keberatan yang tetap dicatat:** grace period berarti memori ≠ storage secara
sengaja. Itu adalah state bayangan, dan permukaan itulah yang melahirkan keempat
bug di atas. Alternatif "hapus dulu, undo = tulis balik" menghilangkan seluruh
kelas bug ini *by construction* karena storage selalu jadi satu-satunya kebenaran.

Keberatan itu dinilai lebih ringan daripada undo yang bisa gagal, **dengan syarat**
D2–D5 dipenuhi — keempatnya ada justru untuk membendung state bayangan.

⚠️ Alternatif yang ditolak sepenuhnya: **soft-delete di storage** (`deletedAt` +
sweep). Butuh sweep periodik di SW ephemeral — persis masalah yang membuat
ADR-0002 di-supersede — dan item terhapus tetap memakan slot dari cap 200.

**Fakta yang menggugurkan satu keberatan lama:** `undoItem.index` (`:57`) tidak
pernah berguna. Urutan array `queue` tidak pernah dirender — side panel lewat
`groupAndSortVideos` yang `sort((a,b) => b.addedAt - a.addedAt)` (`grouping.ts:20`),
popup lewat `recentItems` yang juga sort `addedAt` (`popup/App.svelte:118`).
Roadmap menyebut "urutan item bisa berubah" sebagai harga dari commit-langsung;
itu tidak berlaku, dan `index` bisa dibuang dari model apa pun yang dipilih.

### D2 — Satu slot pending; yang lama langsung dikomit

Hapus B saat A masih pending → A **langsung dikomit permanen**, B jadi pending.

"Undo" selalu berarti "batalkan yang barusan" (model Gmail), dan itu cocok dengan
UI toast tunggal yang sudah ada. Ini perbaikan langsung untuk **bug 2**.

Ditolak: *akumulasi* (hapus A lalu B → keduanya pending, timer di-reset) — user
yang sengaja hapus A lalu tak sengaja hapus B akan mengembalikan A juga saat undo.
Ditolak: *banyak pending independen* — butuh tumpukan toast, UI baru di surface
yang keunggulannya justru minim kontrol.

### D3 — Pending dimiliki **background**, bukan panel

Panel mengirim pesan; background menyimpan pending, menjalankan timer, dan
mengomit ke storage. Undo = pesan pembatalan.

**Alasan:** memperbaiki **bug 4** secara struktural — panel ditutup jadi tidak
relevan karena timernya bukan milik panel.

⚠️ Preview yang dipilih di pertanyaan D1 sempat menulis `onDestroy(): commit()`.
Itu kemungkinan besar **tidak bekerja**: side panel adalah dokumen, dan saat
ditutup dokumennya di-unload — Svelte `onDestroy` tidak terpasang ke unload.
Bahkan bila menyala, `chrome.storage.local.set` async sering tidak selesai saat
halaman sekarat. Belum dibuktikan di browser, tapi bila benar, commit-saat-tutup
tidak bisa diandalkan dari dalam panel sama sekali. D3 membuat pertanyaannya
tidak relevan.

Bonus: undo otomatis bekerja lintas-surface, jadi **F6** (undo di popup) nanti
tinggal memanggil seam yang sama.

⚠️ **Harus diverifikasi:** MV3 service worker berhenti setelah ~30 detik idle.
`setTimeout` 5 detik di SW *seharusnya* selesai lebih dulu, tapi ini belum diuji
dan SW bisa dimatikan lebih awal karena tekanan memori. `chrome.alarms` bukan
jalan keluar — granularitas minimumnya jauh di atas 5 detik. Bila SW terbukti
bisa mati sebelum commit, D3 butuh mekanisme pemulihan (mis. commit pending yang
kedaluwarsa saat SW berikutnya bangun).

### D4 — Pending adalah fakta global: `getQueue` yang menyaring

Semua pembaca melihat queue yang sama. Park, kapasitas, popup, dan panel
konsisten; tidak ada call-site yang bisa lupa menyaring.

**Masalah yang dipecahkan:** tanpa ini, queue di 200/200 → user hapus satu untuk
memberi ruang → park langsung ditolak "Queue penuh (200/200)" karena
`parkVideoPure` (`storage.ts:45`) masih melihat 200, dan meter juga masih
menunjukkan 200 lewat `deriveCapacityState` (`storage.ts:7`). Grace period
memperkenalkan bug ini; D4 yang menutupnya.

⛔ **Jebakan — ditemukan saat verifikasi, wajib masuk spec.** `getQueue` bukan
hanya jalur baca. Ia juga basis read-modify-write untuk `parkVideo`
(`storage.ts:88`), `removeVideo` (`:99`), `togglePinned` (`:106`), dan
`removeManyVideos` (`:113`). Kalau `getQueue` menyaring pending:

```
togglePinned(X) → getQueue() → [tanpa A, karena A pending]
                → map(…) → saveQueue(hasil)
                → storage ditulis ulang TANPA A
                → A terhapus permanen, bukan pending lagi
```

Toggle pin apa pun dalam jendela 5 detik mengomit penghapusan lebih awal, diam-diam.
Ini bug kelima yang akan **diperkenalkan** oleh desain kita sendiri kalau
diterapkan naif.

**Batasan yang mengikat:** pisahkan seam baca dari basis tulis. Baca-untuk-tampil
menyaring pending; baca-untuk-menulis (`parkVideo`, `togglePinned`, dst.) harus
memakai storage mentah. Penamaan harus membuat kesalahan ini sulit dilakukan —
`getQueue` yang sekarang dipakai keduanya adalah jebakannya.

⚠️ Konsekuensi lain: `getQueue` menjadi async ke background (butuh pending set),
padahal saat ini murni membaca `chrome.storage.local`. Ini mengubah bentuk seam
yang dipakai lintas konteks (popup, panel, background). ✅ Pemanggil di luar
`storage.ts` hanya dua: `popup/App.svelte:29` dan `sidepanel/App.svelte:32`.

**Dokumentasi:** "yang tersimpan" ≠ "yang terlihat" adalah pembedaan domain baru.
Perlu masuk `CONTEXT.md`.

### D5 — Undo menang atas cap; overflow sementara diizinkan

Kasus batas: queue 200/200 → hapus A (pending, terlihat 199) → park B diterima
karena D4 → tekan Undo → slot A sudah diisi B.

**Putusan:** A tetap kembali. Queue jadi 201/200. Park **baru** tetap ditolak
sampai user memangkas.

`parkVideoPure` menegakkan cap; jalur restore melewatinya. Dua fungsi, dua aturan —
harus eksplisit di `storage.ts`, bukan efek samping. Yang dilonggarkan hanya
pemulihan sesuatu yang tadinya memang sah ada di queue.

✅ **UI sudah sanggup menampilkan overflow tanpa perubahan.** `ParkMeter.svelte:14`
sudah `Math.min(1, count/max)` → bar mentok, tidak meluber.
`deriveCapacityState` sudah `count >= max → 'full'` → status benar di 201.
Yang perlu ditulis hanya teks banner (`sidepanel/App.svelte:124`,
`popup/App.svelte:144`) agar jujur menampilkan "201/200", plus test untuk itu.

Ditolak: *cap menang* — membatalkan alasan memilih grace period, dan gagal di
momen paling menyakitkan (user sudah melihat tombol Undo dan mengkliknya).
Ditolak: *slot dipesan* (cap efektif turun jadi 199 selama pending) — park
ditolak di 199/200 dengan pesan "penuh" yang terlihat salah, dan aturan kapasitas
jadi bergantung pada state tersembunyi.

### D6 — Bulk = satu operasi pending berisi N item

Slot pending menyimpan **daftar**, bukan item tunggal. Hapus tunggal = daftar
berisi 1.

```
type PendingRemoval = {
  videos: ParkedVideo[]      // 1 atau N
  requestedAt: number
}
```

Satu jalur kode, satu timer, satu toast. **Bug 1 tidak bisa terjadi lagi secara
struktural** — tidak ada lagi dua cabang di `handleUndo` yang bisa berbeda perilaku.

Toast menyebut jumlah — ini menyelesaikan **G6** sekaligus:
`videos.length === 1 ? 'Video dihapus' : '{n} video dihapus'`.

Ditolak: *bulk tanpa undo, pakai dialog konfirmasi* — menambah friksi pada aksi
triase yang justru ingin cepat, dan menambah UI dialog yang belum ada.

### D7 — Model pending sebagai reducer murni + test

Model pending menjadi mesin state murni di `src/shared/` (nama kerja
`pending-removal.ts`): fungsi bebas efek samping, state + event → state baru.
Background dan panel jadi shell tipis di atasnya.

Mengikuti pola `storage.ts` yang sudah terbukti (`parkVideoPure`,
`removeVideoPure`, `togglePinnedPure`) — 88 test hijau tanpa satu pun butuh
browser.

Ditolak: *menambah infra test komponen* (`@testing-library/svelte` + jsdom) —
dependensi + konfigurasi baru, jauh lebih lambat, dan timer 5 detik dalam test
komponen itu rapuh. Ditolak: *uji manual saja* — keempat bug ini adalah bug
timing yang lolos review; justru jenis yang paling butuh test otomatis.

**Test yang harus ditulis (gagal dulu, satu per bug):**

- penghapusan beruntun mengomit yang lama, bukan membatalkannya (bug 2)
- undo membatalkan commit di semua jalur, tunggal maupun bulk (bug 1)
- restore melewati cek cap; park baru tidak (D5)
- baca-untuk-tampil menyaring pending; baca-untuk-menulis tidak (D4, jebakan)
- park melihat slot yang dibebaskan oleh penghapusan pending (D4)

---

## Yang masih terbuka

🔓 **Lingkup satu putaran.** Belum diputuskan. Tiga opsi yang dibahas:
G5+G6 saja dengan popup menyusul (arsitektur sudah lintas-surface, F6 tinggal
memanggil seam yang sama); G5+G6+F6 sekaligus; atau tambalan minimal dulu.
⚠️ Catatan bila F6 ikut: popup punya siklus hidup berbeda — ia menutup dirinya
sendiri saat play dan saat buka side panel (`popup/App.svelte:110`, `:115`) —
dan itu belum digrill sama sekali.

🔓 **Durasi jendela.** 5 detik diwarisi dari kode sekarang, tidak pernah
dipertanyakan.

🔓 **Nama modul dan bentuk API persisnya.** `pending-removal.ts` adalah nama kerja.

🔓 **Perilaku saat SW mati sebelum commit** — tergantung hasil verifikasi di D3.

## Yang harus diverifikasi sebelum spec

1. ⚠️ Apakah `setTimeout` 5 detik di MV3 service worker andal? (D3)
2. ⚠️ Apakah `onDestroy`/unload di side panel benar-benar tidak bisa diandalkan? (D3)
   — bila ternyata andal, D3 tetap dipilih karena manfaat lintas-surface, tapi
   argumennya berubah.

## Dampak pada dokumen lain

- `CONTEXT.md` — perlu istilah untuk pending removal, dan pembedaan
  "tersimpan" vs "terlihat" (D4).
- `docs/ROADMAP.md` — G5 perlu diperbarui: empat bug, bukan satu race; dua di
  antaranya kehilangan data deterministik. G6 diserap ke D6.
- **F6** (undo di popup) — tidak lagi berdiri sendiri; jadi konsumen seam yang
  dibangun di sini.
- ⚠️ Tidak ada ADR yang bertentangan. Nilai apakah D3 (kepemilikan state di
  background) dan D5 (cap bisa terlampaui) cukup berbobot untuk ADR sendiri —
  keduanya mengubah invarian yang selama ini dianggap keras.
