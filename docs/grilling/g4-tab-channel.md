# Grilling: G4 — Channel di-hardcode 'YouTube' saat park dari tab

Sesi 2026-07-27. Status: **keputusan desain selesai, belum jadi spec, belum ada kode.**
Mandiri sekarang — F9-3 menetapkan G4 bukan blokir F9 (data lama = bucket "tak dikenal").

Rujukan: `docs/ROADMAP.md` G4 · `docs/grilling/f9-group-by-channel.md` F9-3.

**Tanda:** ✅ terverifikasi di kode · ⚠️ asumsi, belum diuji · 🔓 masih terbuka

---

## Ringkasan masalah

Popup park current/all hardcode `channel: 'YouTube'` (`popup/App.svelte:64`, `:90`).
Title dari `tab.title` (dibersihkan "- YouTube"). **`tab.title` hanya judul video,
BUKAN channel** — channel tak tersedia di `chrome.tabs` API.

Ini merusak premis produk: `CONTEXT.md` menyebut channel bagian konteks visual,
`Thumbnail.svelte:15` pakai huruf pertama channel sebagai placeholder. Setiap item
tab-park menampilkan "Y", bukan inisial channel asli.

F9-3 sudah menetapkan G4 bukan blokir F9 — data lama → bucket "tak dikenal".
Tapi G4 tetap punya nilai mandiri (memperbaiki placeholder + grouping channel).

## Keputusan

### G4-1 — Jalur: **pesan ke content script**

Popup kirim pesan ke content script di tab itu → content script baca DOM halaman
watch → balas channel. Tanpa network, tanpa permission baru.

```ts
// popup park:
chrome.tabs.sendMessage(tab.id, { type: 'GET_WATCH_CHANNEL', videoId }, (resp) => {
  const channel = resp?.channel ?? 'YouTube';
  parkVideo({ ..., channel });
});

// content script (handler baru):
if (message?.type === 'GET_WATCH_CHANNEL') {
  const channel = resolveWatchPageChannel();
  sendResponse({ channel });
}
```

✅ Park current: tab aktif, content script pasti termuat (`content.ts:284`
matches `*://*.youtube.com/*`). Tanpa network, tanpa permission baru.

Ditolak: *oEmbed dari background* — satu jalur, tak peduli content script, andal
untuk park all. Tapi network per tab (park all 20 tab = 20 fetch), SW ephemeral,
rate-limit, video privat/dihapus gagal (401/404). Ditolak: *hybrid CS+oEmbed* —
dua jalur kode, dua kegagalan berbeda, kompleksitas untuk nilai marjinal.

### G4-2 — Fallback saat CS gagal: **'YouTube'**

Park dengan `channel: 'YouTube'` (fallback lama). Item tetap masuk queue, channel
"tak dikenal" (F9-3). Konsisten dengan F9-3 — data lama/channel salah → bucket
"tak dikenal", re-park fix.

⚠️ **Channel salah permanen karena tab ditutup setelah park** (`popup/App.svelte:70`,
`:96`). User harus buka ulang video untuk re-park fix — tidak bisa re-park dari hover
(tab sudah ditutup). Tapi item tetap bisa di-play; hanya grouping channel tak
akurat untuk item itu. Diterima: F9-3 sudah menerima bucket "tak dikenal" sebagai
realitas data lama, dan G4 fallback adalah sumber data lama itu.

Ditolak: *fallback ke oEmbed* — G4-1 menolak oEmbed sebagai jalur utama; fallback
oEmbed berarti dua jalur kegagalan, dan oEmbed tetap rapuh (privat/dihapus). Ditolak:
*skip tab* — park all tujuannya tutup semua tab YouTube; skip = beberapa tab tetap
terbuka, tujuan tak tercapai. Park current tab aktif tak akan pernah gagal (CS
pasti ada), jadi skip hanya park all.

---

## Konsolidasi yang harus masuk spec

Content script handler `CONTEXT_MENU_PARK` (`content.ts:324`) juga punya fallback
`channel: 'YouTube'`. Fungsi `resolveWatchPageChannel()` baru — yang baca channel
dari halaman watch (selector `#owner`/`ytd-channel-name`, bukan kartu) — bisa
dipakai bersama oleh:

1. `GET_WATCH_CHANNEL` (park dari popup, G4-1)
2. `CONTEXT_MENU_PARK` fallback (saat kartu tidak ketemu, content.ts:324)

Satu fungsi, dua konsumen. Hindari duplikasi.

## Yang harus diverifikasi sebelum spec

1. ⚠️ **Selector channel di halaman watch belum diverifikasi.** `resolveChannel`
   (`capture-predicates.ts:135`) cari `#channel-name, ytd-channel-name` di **kartu**.
   Di halaman watch, channel ada di `#owner` / `ytd-channel-name` di atas/bawah
   player — selector berbeda. Tidak ada fixture halaman watch di
   `src/shared/__fixtures__/` (yang ada: card-channel-grid, card-channel-home,
   card-search — semua kartu, bukan halaman watch). **Harus di-capture** untuk
   konfirmasi selector `#owner ytd-channel-name` (atau yang setara) bekerja.

2. ⚠️ **Content script termuat saat park all.** Tab yang sedang loading → content
   script mungkin belum injek. Konfirmasi: `chrome.tabs.sendMessage` ke tab loading
   → error apa? `chrome.runtime.lastError` handling. Tapi karena G4-2 fallback
   'YouTube', kegagalan ditangani — perlu konfirmasi error terdeteksi (bukan hang).

## Yang masih terbuka

🔓 **Selector halaman watch persis** — `#owner ytd-channel-name`? `#owner #channel-name`?
`ytd-watch-metadata ytd-channel-name`? YouTube churn DOM halaman watch sama
seperti kartu. Butuh fixture + mungkin beberapa fallback selector seperti
`THUMBNAIL_SELECTORS` (`capture-predicates.ts:22`).

## Dampak pada dokumen lain

- **F9** — F9-3 menerima data lama sebagai bucket "tak dikenal". G4 adalah sumber
  data baru yang baik (channel asli), tapi fallback 'YouTube' (G4-2) tetap
  menghasilkan item "tak dikenal". F9 grouping channel akan punya bucket
  "tak dikenal" berisi: item lama (pre-G4) + item yang CS gagal (park all tab
  loading). Konsisten, bukan masalah baru.
- **`CONTEXT.md`** — tak butuh entitas baru. Channel sudah field `ParkedVideo`;
  G4 hanya mengisi field itu dengan benar untuk tab-park, bukan hardcode.
- **G3** — G3-1 memilih persempit (bukan oEmbed) untuk context menu. G4-1 juga
  memilih content script (bukan oEmbed) untuk channel. Konsisten: kedua grill
  menolak oEmbed, memilih jalur yang sudah ada (content script). Jalur oEmbed
  tetap tersimpan sebagai opsi tier-2 bila content script terbukti rapuh.