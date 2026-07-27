# Grilling: G7 — Now Playing basi saat navigasi SPA

Sesi 2026-07-27. Status: **keputusan desain selesai, belum jadi spec, belum ada kode.**
Kecil, mandiri — sepele.

Rujukan: `docs/ROADMAP.md` G7.

**Tanda:** ✅ terverifikasi di kode · ⚠️ asumsi, belum diuji · 🔓 masih terbuka

---

## Ringkasan masalah

Side panel memasang `chrome.tabs.onActivated` → `loadData()` (`sidepanel/App.svelte:43`)
saja. YouTube adalah SPA — pindah video di tab yang sama tidak mengganti tab aktif,
jadi `onActivated` tak menyala. `nowPlaying` (`:24`, dipakai 4 tempat: 3 border
kartu `class:playing` + Equalizer `:239`) tetap menunjuk video sebelumnya sampai user
pindah tab.

## Keputusan

### G7-1 — Side panel saja via `onUpdated`

Tambah `chrome.tabs.onUpdated` di side panel, filter `changeInfo.url` di tab YouTube
→ `loadData()`.

```ts
chrome.tabs.onUpdated.addListener((_id, changeInfo) => {
  if (changeInfo.url && extractYouTubeVideoId(changeInfo.url)) {
    loadData();
  }
});
```

✅ `tabs.onUpdated` menyala saat URL berubah, termasuk SPA `pushState` — Chrome
deteksi URL change. `loadData()` selalu query active tab (`getNowPlayingTab`,
`tab-operations.ts:81`), jadi tak peduli tab mana yang trigger; aman dipanggil.
✅ Sepele — beberapa baris di `sidepanel/App.svelte` onMount.

Popup tak diubah: tidak punya listener tab (hanya `storage.onChanged`), `nowPlaying`
(`:21`) di-load di `onMount`. Popup dibuka sesaat — `loadData` di onMount sudah segar
saat buka — dan menutup diri sendiri saat play/park (`:110`, `:115`).
⚠️ Kalau popup terbuka lama sementara user navigasi YouTube di belakang, popup
`nowPlaying` basi. Diterima: popup jarang dipakai lama, dan tutup-buka segar.

Ditolak: *kedua surface via onUpdated* — popup menutup diri sendiri segera setelah
dipakai; listener di popup mati nyaris seketika setelah dipasang, nyaris tak pernah
menyala. Kerja tambahan tanpa manfaat. Ditolak: *webNavigation API*
(`onHistoryStateUpdated`) — lebih presisi untuk SPA, tapi permission tambahan
(`webNavigation` belum ada di `wxt.config.ts:11`) untuk perbaikan kecil;
`onUpdated` sudah cukup.

## Yang harus diverifikasi sebelum spec

1. ⚠️ `onUpdated` noise — menyala sangat sering (loading, title, favicon, status).
   Filter `changeInfo.url` sudah ketat (hanya URL change), tapi konfirmasi tak ada
   event storm yang menyebabkan `loadData` berlebihan. `loadData` query active tab
   + storage — murah, tapi tetap perlu konfirmasi tak ada jank.

## Dampak pada dokumen lain

- **`CONTEXT.md`** — tak butuh perubahan. `nowPlaying` adalah state UI turunan,
  bukan konsep domain.
- **Tidak bergantung fitur lain** — G7 benar-benar mandiri, bisa ship kapan saja.