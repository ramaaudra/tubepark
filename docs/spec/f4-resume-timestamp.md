# Spec: F4 — Resume Timestamp

Part of: `docs/ROADMAP.md` F4 · Grilling: `docs/grilling/f4-resume-timestamp.md`

## Problem Statement

Roadmap awal mengusulkan "baca `t=` dari URL tab saat park" untuk resume playback. Verifikasi grilling membuktikan ini **tidak layak**: YouTube URL `?v=ID` statis saat menonton biasa — SPA tak update `?t=`. `t=` hanya muncul bila user datang dari link bertimestamp atau "Copy URL at current time". Fixture konfirmasi: tak ada `t=` di kartu mana pun. Use case utama F4 ("park di menit 5, lanjut nanti") tak terjawab — posisi tonton tak ada di URL. Tapi `video.currentTime` (posisi tonton sesungguhnya) accessible dari content script via `document.querySelector('video')?.currentTime` — standar HTML5, beberapa baris, pola G4-1. Jadi F4 layak dalam bentuk ini.

## Solution

Saat park dari tab, content script baca `video.currentTime` (posisi tonton sesungguhnya), balas detik. Simpan `resumeAt?: number` di ParkedVideo. Saat play, `openVideo` susun URL `?v={id}&t={resumeAt}` bila `resumeAt > 0`. "Park sebentar, lanjut nanti" jadi tanpa kehilangan posisi. **Konsolidasi dengan G4:** satu handler `GET_TAB_META` balas `{ channel, currentTime }` — hindari dua round-trip per tab. Hanya park dari tab (tab = halaman watch sedang menonton) yang simpan `resumeAt`; hover park & context menu (belum menonton) → `resumeAt` undefined.

## User Stories

1. As a user, I want to park a video I'm partway through and resume from the same spot later, so that I don't have to scrub back to where I was.
2. As a curator, I want a parked video I haven't started watching to play from the beginning (no `t=0`), so that resume only applies when there's an actual position to resume.
3. As a hunter, I want "Park Semua" to capture resume positions for background tabs too, so that I can resume any of them later.

## Implementation Decisions

- **ParkedVideo** (`src/shared/types.ts:1`) — tambah `resumeAt?: number` (detik integer, opsional). Field opsional keempat: `pinned?`, `order?` (F7), `collection?` (F8), `resumeAt?` (F4). Additive, backward-compatible.
- **Content script handler `GET_TAB_META`** (lihat spec G4) — balas `{ channel, currentTime }`:
  ```ts
  const v = document.querySelector("video");
  sendResponse({ channel: resolveWatchPageChannel(), currentTime: v ? Math.floor(v.currentTime) : 0 });
  ```
- **Popup `handleParkCurrentTab`/`handleParkAll`** — simpan `resumeAt` dari respons `currentTime`. Bila `currentTime === 0` (baru mulai/belum tonton), `resumeAt` undefined (jangan simpan 0 — `t=0` redundan).
- **`openVideo`** (`tab-operations.ts:56-79`) — tambah argumen `resumeAt?: number`:
  ```ts
  async openVideo(videoId: string, resumeAt?: number) {
    const targetUrl = `https://www.youtube.com/watch?v=${videoId}` +
      (resumeAt && resumeAt > 0 ? `&t=${resumeAt}` : "");
    ...
  }
  ```
  Dipanggil dari side panel `handlePlay` (`:49`) dan popup `handlePlay` (`:114`) — keduanya punya `video.resumeAt`, pass sebagai argumen.
- **Format `t=`:** detik integer (`t=90`), YouTube terima. Bukan `1m30s`.
- **Hanya park dari tab.** Hover park (`content.ts` FloatingParkButton, user belum menonton) & context menu park (klik kanan link, belum menonton) → `resumeAt` undefined. Park all: tab background juga simpan (currentTime valid meski background; Chrome throttle background video, posisi tetap).
- **Ditolak: URL `t=`** — hampir tak pernah menyala; use case utama tak terjawab. Ditolak: drop F4 — F4 layak karena `video.currentTime` accessible (pola G4-1, beberapa baris).

## Testing Decisions

- **Unit test (pola storage.ts):** `openVideo` URL construction — `resumeAt` undefined → `?v=ID`; `resumeAt=0` → `?v=ID` (no `t=0`); `resumeAt=919` → `?v=ID&t=919`. Pure, via `TestTabOperations` (`tab-operations.ts:105`) recording `openVideo` calls.
- **Fixture (wajib):** halaman watch (sama dengan G4) — konfirmasi `document.querySelector('video')` dapat player utama, bukan ad pre-roll (YouTube mungkin punya multiple `<video>`).
- **Integration (manual):** park di menit 5 → play → konfirmasi resume di 5:00; park dari awal → play → konfirmasi dari 0.

## Dependencies

- **G4** — konsolidasi `GET_TAB_META`. Handler yang sama balas `{ channel, currentTime }`. Implementasi G4+F4 satu commit.
- **F7/F8** — `resumeAt` field opsional keempat di ParkedVideo. Catatan migrasi ADR-0005: lima field opsional, semua additive.

## Verification needed before implementation

1. **`document.querySelector('video')` di halaman watch** — konfirmasi dapat player utama, bukan ad. YouTube mungkin punya multiple `<video>` (pre-roll). Mungkin perlu selector spesifik atau pilih `<video>` terbesar/terlihat.
2. **Player belum ready saat park.** Park sebelum video dimuat → `<video>` tak ada → `currentTime` 0. Spec: `resumeAt` undefined (jangan simpan 0). Park dari tab yang baru buka watch page → kemungkinan race; konfirmasi respons `currentTime: 0` ditangani sebagai "belum tonton".

## References

- Grilling: `docs/grilling/f4-resume-timestamp.md`
- Roadmap: `docs/ROADMAP.md` F4
- Konsolidasi: `docs/spec/g4-tab-channel.md`
- Code: `src/shared/types.ts:1`, `src/shared/tab-operations.ts:56-79`, `src/entrypoints/popup/App.svelte:55-101`