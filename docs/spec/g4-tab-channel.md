# Spec: G4 — Channel di-hardcode 'YouTube' saat park dari tab

Part of: `docs/ROADMAP.md` G4 · Grilling: `docs/grilling/g4-tab-channel.md`

## Problem Statement

Popup park current/all hardcode `channel: 'YouTube'` (`src/entrypoints/popup/App.svelte:64`, `:90`). Title dari `tab.title` (dibersihkan "- YouTube"). **`tab.title` hanya judul video, BUKAN channel** — channel tak tersedia di `chrome.tabs` API. Ini merusak premis produk: `CONTEXT.md` menyebut channel bagian konteks visual, `Thumbnail.svelte:15` pakai huruf pertama channel sebagai placeholder. Setiap item tab-park menampilkan "Y", bukan inisial channel asli. F9 grouping channel (lihat `docs/spec/f9-group-by-channel.md`) menghasilkan satu bucket raksasa "YouTube" untuk semua item tab-park.

F9-3 sudah menetapkan G4 bukan blokir F9 — data lama → bucket "tak dikenal". Tapi G4 tetap punya nilai mandiri (memperbaiki placeholder + grouping channel untuk item baru).

## Solution

Popup kirim pesan ke content script di tab itu → content script baca DOM halaman watch (channel di `#owner`/`ytd-channel-name`, bukan kartu) → balas channel. Tanpa network, tanpa permission baru. Pola sama dengan yang sudah dipakai content script untuk `CONTEXT_MENU_PARK` (`content.ts:295`). Fallback `'YouTube'` saat content script gagal (tab loading, selector tak ketemu) — konsisten dengan F9-3 (item tetap masuk queue sebagai "tak dikenal"). **Konsolidasi dengan F4:** satu handler `GET_TAB_META` yang balas `{ channel, currentTime }` menghindari dua round-trip per tab (park all N tab = 2N pesan → N pesan).

## User Stories

1. As a hunter, I want a video parked from the current tab to show its real channel name (not "YouTube"), so that the thumbnail placeholder shows the correct initial.
2. As a hunter, I want "Park Semua" to capture real channel names for each tab, so that grouping by channel works on tab-parked items.
3. As a curator, I want grouping by channel to not dump every tab-parked item into one "YouTube" bucket, so that channel grouping is useful.
4. As a user, I want a park that fails to get the channel to still park the video (with "unknown" channel), so that I don't lose the item just because metadata capture failed.

## Implementation Decisions

- **Content script handler baru** (`content.ts`, tambah ke `onMessage` listener `:295`):
  ```ts
  if (message?.type === "GET_TAB_META") {
    const channel = resolveWatchPageChannel();
    const t = document.querySelector("video")?.currentTime ?? 0;
    sendResponse({ channel, currentTime: Math.floor(t) });
    return true;
  }
  ```
  `resolveWatchPageChannel()` — fungsi baru, baca channel dari halaman watch (selector `#owner ytd-channel-name`, `#owner #channel-name`, fallback `ytd-watch-metadata ytd-channel-name`). ⚠️ Selector belum diverifikasi — butuh fixture halaman watch.
- **Popup `handleParkCurrentTab`** (`popup/App.svelte:55-73`) — ganti `channel: 'YouTube'` dengan pesan:
  ```ts
  chrome.tabs.sendMessage(currentTabInfo.id, { type: 'GET_TAB_META' }, (resp) => {
    const channel = resp?.channel ?? 'YouTube';
    parkVideo({ id: videoId, title, channel, addedAt: Date.now(), resumeAt: ... });
  });
  ```
- **Popup `handleParkAll`** (`:75-101`) — pesan per tab, fallback `'YouTube'` bila `chrome.runtime.lastError` (tab loading, CS belum termuat).
- **Konsolidasi G4+F4** (lihat `docs/spec/f4-resume-timestamp.md`): handler `GET_TAB_META` balas `{ channel, currentTime }`. Park all kirim satu pesan per tab, dapat keduanya.
- **Fallback `'YouTube'`** — item tetap masuk queue, channel "tak dikenal" (F9-3). Channel salah permanen karena tab ditutup setelah park (`:70`, `:96`) — user harus buka ulang video untuk re-park fix. Diterima: F9-3 sudah menerima bucket "tak dikenal".
- **Konsolidasi fungsi:** `resolveWatchPageChannel()` juga dipakai fallback `CONTEXT_MENU_PARK` (`content.ts:324`) saat kartu tak ketemu — satu fungsi, dua konsumen.
- **Ditolak: oEmbed** — network per tab, SW ephemeral, rate-limit, privat/dihapus gagal. Ditolak: hybrid CS+oEmbed — dua jalur kegagalan, kompleksitas.

## Testing Decisions

- **Unit test (pola storage.ts):** `resolveWatchPageChannel()` murni dengan fixture halaman watch (linkedom, pola `capture-predicates.test.ts:26`). Konfirmasi selector dapat channel.
- **Fixture baru (wajib):** `src/shared/__fixtures__/watch-page.html` — capture halaman watch YouTube nyata. Yang ada saat ini hanya kartu (card-channel-grid/home/search). Konfirmasi selector `#owner ytd-channel-name` (atau setara) bekerja, dan fallback chain seperti `THUMBNAIL_SELECTORS`.
- **Integration (manual):** park current tab → konfirmasi channel asli di queue; park all dengan satu tab loading → konfirmasi fallback `'YouTube'`.

## Dependencies

- **F4** — konsolidasi `GET_TAB_META`. Spec F4 menyatakan handler yang sama balas `currentTime`. Implementasi G4+F4 satu commit.
- **F9** — F9-3 menerima data lama sebagai "tak dikenal". G4 fallback adalah sumber data "tak dikenal" baru (tab loading). Konsisten.

## Verification needed before implementation

1. **Selector halaman watch belum diverifikasi** (kritikal). `resolveChannel` (`capture-predicates.ts:135`) cari channel di **kartu**. Di halaman watch, channel di `#owner`/`ytd-channel-name` — selector berbeda. Butuh fixture halaman watch + mungkin fallback chain (YouTube churn DOM halaman watch sama seperti kartu).
2. **Content script termuat saat park all.** Tab loading → CS belum injek → `chrome.runtime.lastError`. Konfirmasi error terdeteksi (bukan hang), fallback `'YouTube'` jalan.

## References

- Grilling: `docs/grilling/g4-tab-channel.md`
- Roadmap: `docs/ROADMAP.md` G4
- Konsolidasi: `docs/spec/f4-resume-timestamp.md`
- Code: `src/entrypoints/popup/App.svelte:55-101`, `src/entrypoints/content.ts:295-356`, `src/shared/capture-predicates.ts:135-154`