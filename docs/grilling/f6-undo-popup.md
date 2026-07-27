# Grilling: F6 — Undo di Popup

Sesi 2026-07-27. Status: **keputusan desain selesai, belum jadi spec, belum ada kode.**
Sebagian sudah ditentukan G5 (seam lintas-surface D3). Grill-nya tentang siklus
hidup popup yang menutup diri sendiri.

Rujukan: `docs/ROADMAP.md` F6 · `docs/grilling/g5-undo-model.md` D3.

**Tanda:** ✅ terverifikasi di kode · ⚠️ asumsi, belum diuji · 🔛 masih terbuka

---

## Ringkasan masalah

Popup `handleRemove` (`popup/App.svelte:103`) langsung `removeVideo` — commit
seketika, tanpa jaring. Side panel punya undo 5 detik (G5). Aksi yang sama (hapus),
dua perilaku berbeda antar surface.

Popup menutup diri sendiri saat play (`:115`) dan buka side panel (`:110`), **tapi
tidak saat hapus** — popup tetap terbuka setelah hapus. Popup juga tutup saat user
klik luar (blur, perilaku browser default).

⚠️ **Temuan dari G5 D3:** undo lintas-surface TIDAK otomatis. Side panel undo toast
(`sidepanel/App.svelte:218`) hanya muncul untuk aksi side panel sendiri. Hapus dari
popup → pending di background → side panel **tidak tahu** ada pending untuk di-undo.
Jadi undo hidup di surface tempat aksi dilakukan, selama surface itu terbuka.

## Keputusan

### F6-1 — Undo di popup selama terbuka, via seam G5 D3

Popup `handleRemove` pakai seam G5 D3: kirim `PENDING_REMOVE` ke background,
mutasi optimis (hilangkan dari list), toast "Video dihapus [Undo]". Undo (dalam
5 detik, selama popup terbuka) kirim `CANCEL_REMOVE`.

```ts
// popup handleRemove (sebelumnya langsung removeVideo):
chrome.runtime.sendMessage({ type: 'PENDING_REMOVE', video });
// optimistis: queue = queue.filter(v => v.id !== video.id)
// toast: 'Video dihapus [Undo]'
```

✅ Konsisten dengan G5 D3 — background pemilik pending, popup hanya konsumen seam.
✅ Popup tetap terbuka setelah hapus (tidak `window.close()`), jadi undo biasanya
tersedia. ✅ Murah: seam sudah dibangun di G5, F6 tinggal panggil.
⚠️ **Bila popup tertutup (blur/play) dalam <5 detik, undo hilang, item commit
permanen.** Diterima: popup tertutup = user sudah "meninggalkan" surface itu;
jujur. Popup adalah surface ephemeral, dan grace period 5 detik adalah jendela
yang wajar untuk surface yang tetap terbuka.

Ditolak: *tanpa undo (peran berbeda)* — inkonsisten (hapus popup permanen, side
panel undo); popup memang ephemeral tapi aksi hapus tetap aksi destruktif yang
layak jaring. Ditolak: *undo survive popup close (undo di side panel untuk aksi
popup)* — side panel harus tahu pending dari surface lain, tampilkan undo toast
untuk aksi yang user tak lakukan di surface itu ("undo apa?" membingungkan),
kompleksitas broadcast/poll tinggi untuk nilai marjinal.

---

## Yang tidak relevan untuk popup (dibawa dari G5)

- **D6 (bulk = N item):** popup hanya tampilkan 3 item terbaru (`recentItems`,
  `popup/App.svelte:118`), masing-masing hapus tunggal. Tidak ada "Hapus Semua" di
  popup (itu di side panel). Slot pending di popup selalu 1 item. D6 tak berlaku.
- **D5 (undo menang vs cap):** popup hapus tunggal, restore 1 item. Kasus batas
  "queue penuh, hapus 1, park 1, undo" tetap berlaku via D5, tapi melalui background
  (D3) — popup hanya konsumen seam, takimplementasi D5 sendiri.

## Yang masih terbuka

🔓 **Toast di popup 330px.** Side panel undo toast fixed bottom (`sidepanel/App.svelte:597`).
Popup 330px lebar (`popup/App.svelte:233`). Toast undo perlu muat di popup —
detail layout spec. Popup belum punya toast infra (side panel punya; popup hanya
`flyChip` untuk park feedback).

## Yang harus diverifikasi sebelum spec

1. ⚠️ Popup blur-close timing — konfirmasi `window.close()` via blur terjadi
   seketika (bukan delayed), sehingga jendela 5 detik undo memang terbatas pada
   popup yang tetap fokus.

2. ⚠️ `recentItems` re-derive setelah undo. `recentItems` (`:118`) = queue sort
   addedAt slice 3. Undo → item kembali ke queue → recentItems re-derive → item
   muncul lagi di top-3 bila masih addedAt tertinggi. Konfirmasi tak ada edge case
   (item yang dihapus adalah item ke-4+, undo tak terlihat di popup tapi tetap di
   queue). Bukan bug — item kembali ke queue penuh, popup hanya tunjukkan 3.

## Dampak pada dokumen lain

- **G5** — F6 memvalidasi D3 (kepemilikan pending di background) bekerja lintas-surface.
  F6 adalah konsumen seam kedua (setelah side panel; F1-3 adalah konsumen ketiga dari
  YouTube). Tiga surface (side panel, popup, YouTube) semua pakai seam D3 yang sama.
  Spec G5 harus memastikan seam D3 mendukung tiga konsumen ini, bukan hanya side panel.
- **F1** — F1-3 (hapus-dari-YouTube) juga konsumen D3. F6 dan F1-3 bersama-sama
  membuktikan D3 adalah seam yang benar: satu mekanisme pending, tiga surface
  konsumen, masing-masing dengan undo sendiri selama surface terbuka.
- **`CONTEXT.md`** — tak butuh perubahan. Undo adalah operasi UI, bukan konsep domain.