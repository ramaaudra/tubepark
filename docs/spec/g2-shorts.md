# Spec: G2 — Shorts tidak bisa di-park

Part of: `docs/ROADMAP.md` G2 · Grilling: `docs/grilling/g2-shorts.md`

## Problem Statement

`ytd-reel-item-renderer` ada di `YOUTUBE_VIDEO_CARD_SELECTORS` (`src/shared/capture-predicates.ts:6`) — selector siap. Tapi `extractYouTubeVideoId` (`:29-48`) hanya kenal `/watch` dan `youtu.be`, **tidak `/shorts/{id}`**. Hover kartu Shorts → `resolveCardMeta` → `resolveVideoId` → null → tombol park tak muncul. Setengah pekerjaan sudah ada (selector), parser belum.

Sekunder: `getWatchTabs` (`src/shared/tab-operations.ts:45`) pakai `extractYouTubeVideoId` → tab `/shorts/` tak dihitung sebagai watch tab. Popup "N tab video terbuka" melewatkan tab Shorts; `handleParkAll` (`popup/App.svelte:75`) tak park tab Shorts.

## Solution

Shorts adalah warga kelas satu — di-park, di-queue, di-play sama dengan video biasa, tanpa penanda atau UI khusus. Tambah `/shorts/{id}` ke `extractYouTubeVideoId`; semua konsumen (`getWatchTabs`, `handleParkAll`, `openVideo` tab reuse) ikut terbawa. Play selalu `/watch?v={id}` (pemutar biasa, kontrol penuh) — `openVideo` tak berubah. Shorts id adalah id video biasa, jadi `/watch` bekerja; kehilangan feed vertikal asli diterima (park untuk nonton fokus, bukan lanjut feed).

## User Stories

1. As a YouTube scroller, I want to hover a Shorts card and see the park button, so that I can park a Short as easily as a regular video.
2. As a hunter, I want Shorts tabs to count toward "N tab video YouTube terbuka" in the popup, so that the count reflects all my open YouTube video tabs.
3. As a hunter, I want "Park Semua Tab YT" to park Shorts tabs too, so that no Shorts tab is left behind.
4. As a curator, I want a parked Short to play in the standard watch player (seek, speed, fullscreen), so that I get full playback controls.
5. As a curator, I want a parked Short's thumbnail to render (even if pillarboxed 16:9), so that the queue stays visually consistent.

## Implementation Decisions

- **`extractYouTubeVideoId`** (`capture-predicates.ts:29-48`) — tambah cabang `/shorts/`:
  ```ts
  if (url.pathname.startsWith("/shorts/")) {
    const id = url.pathname.slice("/shorts/".length).split("?")[0];
    return id || null;
  }
  ```
  Letakkan setelah cabang `/watch`, sebelum `return null`.
- **`resolveVideoId` fallback** (`capture-predicates.ts:96-114`) — fast-path `a#thumbnail` → `extractYouTubeVideoId` akan ekstrak id dari anchor `/shorts/{id}` setelah perubahan di atas. Tapi fallback `a[href*="/watch?v="]` (`:108`) tak menemukan anchor `/shorts/`. ⚠️ **Butuh fixture Shorts** untuk konfirmasi fast-path cukup; bila tidak, tambah `a[href*="/shorts/"]` ke fallback selector.
- **`openVideo`** (`tab-operations.ts:56-79`) — tak berubah. Selalu `https://www.youtube.com/watch?v=${videoId}`. Shorts id = id video biasa, `/watch` bekerja.
- **Thumbnail** (`Thumbnail.svelte:44-53`) — tak berubah. 16:9, `mqdefault.jpg` YouTube serve 16:9 dengan pillarbox untuk video vertikal. Konsisten dengan keputusan "tak dibedakan".
- **Tidak menambah field.** ParkedVideo tak dapat `isShort` — Shorts = Parked Video biasa.
- **`capture-predicates.test.ts`** — tambah kasus `/shorts/{id}` dan `/shorts/{id}?t=10`, pola sama dengan test `youtu.be` (`:50-57`).

## Testing Decisions

- **Unit test (wajib, pola storage.ts):** `extractYouTubeVideoId` untuk `/shorts/ID`, `/shorts/ID?t=10`, `/shorts/ID/` (trailing slash). Pure function, tanpa browser.
- **Fixture baru (wajib):** capture kartu `ytd-reel-item-renderer` dari YouTube nyata → `src/shared/__fixtures__/card-shorts.html`. Konfirmasi: (a) apakah anchor `a#thumbnail` punya href `/shorts/{id}` (fast-path cukup) atau `/watch?v=` (perlu fallback selector); (b) `resolveCardMeta` end-to-end mengembalikan meta yang benar.
- **Tidak menguji:** `openVideo` (tak berubah), thumbnail rendering (visual).

## Dependencies

- **Mandiri secara desain**, tapi **korelasi G3**: G3-2 menambah `youtu.be` ke `targetUrlPatterns`. Karena Shorts warga kelas satu, context menu juga harus mencakup `/shorts` — tambah `*://*.youtube.com/shorts*` ke `targetUrlPatterns` (lihat spec G3). Implementasi G2+G3 bisa satu commit untuk scoping URL.
- **Tidak bergantung G4/F4** — Shorts dari hover park (content script, channel dari kartu), bukan park dari tab.

## Verification needed before implementation

1. **Capture fixture Shorts** (kritikal) — tanpa ini, `resolveVideoId` fallback adalah tebakan. Bisa fast-path `a#thumbnail` ekstrak dari anchor `/shorts/`, atau perlu fallback selector `a[href*="/shorts/"]`.
2. **Tab reuse mengganggu feed aktif** (🔒 open): setelah G2, tab Shorts yang sedang di-scroll dihitung watch tab → `openVideo` reuse ke `/watch`. Kalau user sedang aktif scroll feed, play dari queue mengganggu. Konfirmasi dapat diterima, atau perlu pengecualian (tab Shorts feed tak di-reuse, selalu buka tab baru). Belum diputuskan — default: ikut one-in-one-out (CONTEXT.md), bila terbukti mengganggu, buka sebagai amandemen.

## References

- Grilling: `docs/grilling/g2-shorts.md`
- Roadmap: `docs/ROADMAP.md` G2
- Korelasi: `docs/spec/g3-context-menu-scoping.md`
- Code: `src/shared/capture-predicates.ts:6,29-48,96-114`, `src/shared/tab-operations.ts:45,56-79`