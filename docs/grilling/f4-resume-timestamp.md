# Grilling: F4 — Resume Timestamp

Sesi 2026-07-27. Status: **keputusan desain selesai, belum jadi spec, belum ada kode.**
Mulai grill dengan verifikasi fakta kunci yang mengubah lanskap.

Rujukan: `docs/ROADMAP.md` F4.

**Tanda:** ✅ terverifikasi di kode · ⚠️ asumsi, belum diuji · 🔓 masih terbuka

---

## Verifikasi yang mengubah lanskap

Roadmap menyatakan F4 versi murah (baca `t=` dari URL tab) "mungkin tidak layak"
karena `t=` jarang ada. Grill memverifikasi:

- ✅ **Tidak ada `t=` di fixture mana pun** (`src/shared/__fixtures__/`) — kartu
  normal tak punya `t=`.
- YouTube URL `?v=ID` **statis saat menonton biasa** — SPA tak update `?t=` saat
  menonton. `t=` hanya muncul bila user datang dari link bertimestamp atau
  "Copy URL at current time". (Pengetahuan umum YouTube; fixture konsisten.)

**Konsekuensi:** F4 versi murah (baca `t=` dari URL) **hampir tidak pernah menyala**.
Use case utama F4 ("park di menit 5, lanjut nanti") tak terjawab — posisi tonton
tak ada di URL.

Tapi: `video.currentTime` (posisi tonton sesungguhnya) **accessible dari content
script** via `document.querySelector('video')?.currentTime` — standar HTML5 video,
beberapa baris, persis pola G4-1 (pesan ke content script). Jadi "versi mahal" F4
tidak seberat yang roadmap kira.

## Keputusan

### F4-1 — Sumber timestamp: **`video.currentTime` via content script**

Content script baca `document.querySelector('video')?.currentTime` saat park, balas
detik. Posisi tonton sesungguhnya — menjawab use case utama F4.

```ts
// popup park (current/all):
chrome.tabs.sendMessage(tab.id, { type: 'GET_CURRENT_TIME' }, (resp) => {
  const resumeAt = Math.floor(resp?.t ?? 0);
  parkVideo({ ..., resumeAt });
});

// content script (handler baru):
if (message?.type === 'GET_CURRENT_TIME') {
  const v = document.querySelector('video');
  sendResponse({ t: v ? Math.floor(v.currentTime) : 0 });
}
```

✅ Pola sama dengan G4-1 (pesan ke content script) — beberapa baris, tanpa network,
tanpa permission baru. ✅ Posisi sesungguhnya, bukan tebakan URL.

Ditolak: *URL `t=` (murah)* — hampir tak pernah menyala; use case utama tak terjawab;
setengah fitur yang nyaris tak berguna. Ditolak: *drop F4* — F4 layak karena versi
mahal tidak seberat yang dikira (pola G4-1, beberapa baris); nice-to-have tapi murah.

## Detail yang implisit dari keputusan (untuk spec, bukan keputusan baru)

- **Field:** `ParkedVideo` bertambah `resumeAt?: number` (detik integer). Opsional —
  item yang di-park tanpa resume (hover, context menu, park sebelum video ready)
  punya `resumeAt` undefined/0.
- **Play:** `openVideo` (`tab-operations.ts:58`) susun URL: bila `resumeAt > 0`,
  `?v=ID&t={resumeAt}`; else `?v=ID`. Signature `openVideo(videoId, resumeAt?)`.
  Dipanggil dari side panel (`handlePlay`, `:49`) dan popup (`:114`) — keduanya
  punya akses ke `video.resumeAt`, pass sebagai argumen.
- **Format `t=`:** detik integer (`t=90`), YouTube terima. Bukan `1m30s`.
- **Hanya park dari tab:** hover park (content script di kartu, user belum
  menonton) & context menu park (klik kanan link, belum menonton) → `resumeAt`
  undefined. Hanya park dari tab (popup `handleParkCurrentTab` + `handleParkAll`,
  tab = halaman watch sedang menonton) yang simpan `currentTime`. Park all: tab
  background juga simpan (currentTime valid meski background, Chrome throttle).

## Yang harus diverifikasi sebelum spec

1. ⚠️ **`document.querySelector('video')` di halaman watch YouTube.** YouTube
   player adalah embed complex; `<video>` element ada di DOM (standar HTML5), tapi
   konfirmasi selector `video` cukup (tidak perlu selector spesifik YouTube).
   YouTube mungkin punya multiple `<video>` (ads pre-roll, dll) — konfirmasi
   `querySelector('video')` dapat player utama, bukan ad.

2. ⚠️ **Player belum ready saat park.** Park sebelum video dimuat → `<video>` tak
   ada → `currentTime` 0/undefined. Spec: simpan 0 (play dari awal) atau skip
   `resumeAt`. Park dari tab yang baru buka watch page → kemungkinan race.

3. ⚠️ **`video.currentTime` presisi.** `currentTime` float (detik). `Math.floor`
   ke integer untuk `t=`. Tapi bila user park di detik 0 (baru mulu, belum tonton)
   → `resumeAt=0` → jangan tambah `t=0` (sama dengan dari awal, redundan). Spec:
   `resumeAt > 0` barusimpan.

## Yang masih terbuka

🔓 **Park all dengan N tab.** Park all kirim `GET_CURRENT_TIME` ke setiap tab —
parallel atau sequential? N pesan round-trip. Kemungkinan aman (N kecil, ~20 max),
tapi spec harus konfirmasi tak ada bottleneck. Bisa gabung dengan G4-1
(`GET_WATCH_CHANNEL`) — satu pesan `GET_TAB_META` yang balas `{ channel, currentTime }`
menghindari dua round-trip per tab. **Konsolidasi G4+F4** untuk spec.

## Dampak pada dokumen lain

- **G4** — F4-1 dan G4-1 sama-sama pesan ke content script untuk park dari tab.
  **Konsolidasi:** satu handler `GET_TAB_META` yang balas `{ channel, currentTime }`
  menghindari dua round-trip per tab (park all N tab = 2N pesan → N pesan). Spec
  G4+F4 harus dikoordinasi; jangan dua handler terpisah untuk park dari tab.
- **`ParkedVideo`** (`types.ts:1`) bertambah `resumeAt?: number` — field opsional
  ketiga (setelah `pinned?`, `order?` dari F7, `collection?` dari F8). Skema record
  makin kaya; lihat catatan migrasi ADR-0005.
- **`openVideo`** (`tab-operations.ts:58`) — satu-satunya tempat susun URL play.
  Tambah `resumeAt` argumen. Satu titik perubahan.
- **`CONTEXT.md`** — tak butuh entitas domain baru; `resumeAt` metadata turunan
  pada ParkedVideo. Bisa catatan: "Park dari tab menyimpan posisi tonton; play
  melanjutkan dari sana."