# Grilling: F1 + F2 — Feedback Loop YouTube ↔ Queue

Sesi 2026-07-27. Status: **keputusan desain selesai, belum jadi spec, belum ada kode.**
Digrill bareng karena berbagi storage listener di content/background dan sama-sama
menutup loop umpan balik antara YouTube dan queue.

Rujukan: `docs/ROADMAP.md` F1 + F2 · `docs/grilling/g5-undo-model.md` (F1 bergantung penuh).

**Tanda:** ✅ terverifikasi di kode · ⚠️ asumsi, belum diuji · 🔓 masih terbuka

---

## F1 — Indikator "sudah diparkir" di kartu YouTube

### F1-1 — Tanda: **hanya di tombol, saat hover**

`FloatingParkButton.update()` (`content.ts:108`) sudah punya `meta.videoId` saat
kartu berubah. Cukup tanya `Set<videoId>`, render `pinFill` + warna aksen bila ada.
~30 baris di `content.ts`, **nol modifikasi DOM kartu**.

✅ Menghormati arsitektur `FloatingParkButton`, yang dibangun justru untuk
menghindari masalah DOM churn + portal hover-preview yang merusak pendekatan
per-kartu (komentar `content.ts:56-71`).
⚠️ Pemindaian massal (lihat mana sudah dipark di hasil pencarian tanpa hover
satu-satu) tidak terpenuhi. Diterima: feedback tetap reaktif, bukan proaktif
untuk pemindaian, dan biaya alternatif (mutation observer + re-attach) tinggi.

Ditolak: *penanda persisten di setiap kartu* — persis masalah DOM churn yang
ditinggalkan; mutation observer wajib, badge re-attach terus, risiko maintenance
tinggi. Ditolak: *persisten hanya saat hover (tengah)* — tak memenuhi pemindaian
massal dan tetap butuh track kartu aktif.

### F1-2 — Klik saat sudah dipark: **toggle park → hapus**

Tombol berubah jadi "hapus dari queue". Satu klik di YouTube = hapus, tanpa buka
panel. Feedback loop dua arah.

Ditolak: *nonaktif (no-op)* — tombol "mati" terasa seperti kontrol rusak, dan
hapus masih butuh buka panel (loop tetap satu arah untuk penghapusan). Ditolak:
*tetap park (duplikat no-op)* — toast "sudah ada" setelah tanda visual jenuh.

### F1-3 — Undo untuk hapus-dari-YouTube: **toast beri Undo (konsisten G5)**

Grace period G5 D1 berlaku di semua surface. Toast content script (infra sudah
ada, `content.ts:32`) beri tombol Undo; klik = kirim `CANCEL_REMOVE` ke background
(D3). Undo tidak pernah gagal, di mana pun aksi dilakukan.

⛔ **Konsekuensi teknis wajib — F1 bergantung penuh pada G5 D3+D4:**

1. **Sinkronisasi tanda.** Saat klik hapus, storage belum berubah selama 5 detik
   (grace period), jadi `storage.onChanged` **tak menyala** → `Set<videoId>` di
   content script tetap punya id → tanda masih muncul 5 detik. **Butuh broadcast
   pesan `PENDING_REMOVAL_CHANGED` dari background ke content script saat pending
   berubah** (bukan saat storage). Content script dengarkan pesan itu, kurangi
   id dari Set, tanda langsung hilang.

2. **Set di content script harus pakai `getQueue()` (D4, menyaring pending),
   BUKAN raw storage.** `getQueue()` async ke background — content script tidak
   bisa baca raw storage sendiri dan tetap konsisten dengan pending. Ini
   mengubah bentuk pembacaan content script dari "baca storage lokal" jadi
   "tanya background".

⚠️ Ini membuat F1 **mustahil tanpa G5**. Bukan dependensi longgar — F1 toggle-hapus
mengasumsikan grace period, kepemilikan pending di background (D3), dan `getQueue`
yang menyaring (D4) sudah ada. Spec harus menyatakan urutan ini eksplisit.

Ditolak: *permanen tanpa undo* — inkonsisten dengan G5 (panel punya undo, YouTube
tidak); kebalikan alasan G5 memilih grace period; hapus tak sengaja = hilang
selamanya tanpa jaring. Tapi dicatat bahwa opsi permanen lebih sederhana secara
sinkronisasi (storage langsung berubah → onChanged → Set update) — bila G5
ternyata terlalu berat untuk F1, opsi ini jadi fallback dengan harga inkonsistensi.

## F2 — Badge count di ikon toolbar

### F2-1 — Isi: **total queue + warna status**

`chrome.action.setBadgeText` dari background saat storage berubah. Angka = total
queue; warna ikut status kapasitas (`deriveCapacityState`, `storage.ts:7`):
safe (abu) / warning (kuning, ≥160) / full (merah, 200). Queue 0 = tak ada badge.

✅ Konsisten dengan `ParkMeter` popup (`ParkMeter.svelte`, juga total + status).
Kesadaran ambient penuh — meter kapasitas terlihat tanpa satu klik pun.

Ditolak: *jumlah pinned* — 0 pinned = badge hilang meski queue 199, tak ada sinyal
beban, membingungkan. Ditolak: *dua angka* — `setBadgeText` satu string ~4 char,
tak layak tanpa custom icon canvas (jauh lebih berat).

**Interaksi dengan G5 D4 (tidak butuh keputusan baru):** badge baca `getQueue()`
yang menyaring pending → hapus di panel = badge langsung turun, bukan tunggu
5 detik. Background adalah pemilik pending (D3), jadi badge bisa hitung
`storage.length - pending.length` langsung. Konsisten, bukan masalah baru.

---

## Fakta yang membentuk keputusan

✅ `FloatingParkButton.update()` sudah punya `meta.videoId` (`content.ts:123`) —
mekanisme setengah ada untuk F1-1.
✅ Ikon `pinFill` + `check` sudah ada di `icons.ts:33,47` — tak butuh aset baru.
✅ Content script bisa baca `chrome.storage.local` (permission `storage` ada) —
tapi F1-3 mengubahnya jadi tanya background (D4), bukan baca sendiri.
✅ Background belum punya `storage.onChanged` sama sekali — F2 mulai dari nol.
✅ `chrome.action` (badge) tidak butuh permission tambahan.

## Yang masih terbuka

🔓 **Warna aksen tanda "sudah dipark"** — apakah pakai `--tp-accent` (hijau, sama
dengan pinned di panel) atau warna berbeda untuk membedakan "di queue" dari
"prioritas"? Content script pakai warna hardcode (di luar token Svelte), jadi
tak bisa langsung pakai `--tp-accent`.

🔓 **Tanda saat kartu di-hover-preview** — `FloatingParkButton` sudah survive
portal hover-preview via `elementsFromPoint`. Tanda F1-1 mewarisi ini tanpa
kerja tambahan, tapi perlu konfirmasi.

## Yang harus diverifikasi sebelum spec

1. ⚠️ `chrome.action.setBadgeBackgroundColor` perilaku lintas-theme — apakah
   warna badge tetap terbaca di toolbar terang/gelap? Chrome mengelola kontras
   badge sendiri, tapi kuning/merah mungkin perlu penyesuaian.

2. ⚠️ Performa `getQueue()` dari content script pada setiap `storage.onChanged`
   + `PENDING_REMOVAL_CHANGED` — round-trip ke background per event. YouTube
   halaman dengan banyak scroll tak memicu event ini (hanya park/hapus), jadi
   kemungkinan aman, tapi perlu konfirmasi tak ada event storm.

## Dampak pada dokumen lain

- **G5** — F1-3 membuat dependensi **kuat dan eksplisit**: F1 toggle-hapus
  mustahil tanpa D3 (kepemilikan pending di background), D4 (`getQueue` menyaring),
  dan broadcast `PENDING_REMOVAL_CHANGED` (baru, akibat F1-3). Spec G5 harus
  memasukkan broadcast ini sebagai bagian dari D3, bukan tambahan F1 — karena
  panel juga butuh sinkronisasi yang sama (D4 sudah menyelesaikan panel via
  `getQueue`; content script butuh jalur pesan terpisah karena tak bisa pakai
  `getQueue` reaktif tanpa event pemicu).
- **F6 (undo popup)** — F1-3 tidak menggantikan F6; surface berbeda. Tapi F1-3
  membuktikan seam undo (D3) bekerja lintas-surface, memperkuat argumen bahwa
  F6 tinggal memanggil seam yang sama.
- **Urutan implementasi** — F1 toggle-hapus harus setelah G5. F1-1 (tanda tanpa
  toggle) bisa sebelum G5, tapi toggle-hapus tidak. Roadmap urutan perlu
  memisahkan F1-1 dari F1-2/F1-3.
- **CONTEXT.md** — tak butuh entitas baru; F1+F2 murni UI feedback.