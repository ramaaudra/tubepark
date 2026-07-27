# Grilling: G2 — Shorts tidak bisa di-park

Sesi 2026-07-27. Status: **keputusan desain selesai, belum jadi spec, belum ada kode.**
Kecil, cepat — menentukan apakah Shorts warga kelas satu.

Rujukan: `docs/ROADMAP.md` G2.

**Tanda:** ✅ terverifikasi di kode · ⚠️ asumsi, belum diuji · 🔓 masih terbuka

---

## Ringkasan masalah

`ytd-reel-item-renderer` ada di `YOUTUBE_VIDEO_CARD_SELECTORS`
(`capture-predicates.ts:6`) — selector siap. Tapi `extractYouTubeVideoId`
(`:40`) hanya kenal `/watch` dan `youtu.be`, **tidak `/shorts/{id}`**.

Akibatnya: hover kartu Shorts → `resolveCardMeta` → `resolveVideoId` → null
(kecuali fast-path `a#thumbnail` punya href yang kebetulan cocok) → tombol park
tak muncul. Setengah pekerjaan sudah ada (selector), parser belum.

Sekunder: `getWatchTabs` (`tab-operations.ts:45`) pakai `extractYouTubeVideoId`
→ tab `/shorts/` tak dihitung sebagai watch tab. Popup "N tab video terbuka"
melewatkan tab Shorts; `handleParkAll` tak park tab Shorts.

## Keputusan

### G2-1 — Status: **warga kelas satu** (tidak ditandai khusus)

Shorts di-park, di-queue, di-play sama dengan video biasa. Tidak ada field `isShort`,
tidak ada UI khusus, tidak ada badge.

Tambah `/shorts/{id}` ke `extractYouTubeVideoId`:

```ts
if (url.pathname === "/watch" || url.pathname.startsWith("/watch")) {
  return url.searchParams.get("v");
}
if (url.pathname.startsWith("/shorts/")) {           // baru
  return url.pathname.slice("/shorts/".length).split("?")[0] || null;
}
```

Semua konsumen `extractYouTubeVideoId` ikut terbawa — `getWatchTabs` menghitung
tab Shorts, `handleParkAll` park tab Shorts, `openVideo` reuse tab Shorts.
Konsisten, tak ada kelas warga berbeda.

Ditolak: *dikecualikan* — kehilangan kemampuan memarkir Short; padahal Short
sering di-skim cepat lalu ingin disimpan untuk tonton penuh nanti. Selector yang
sudah ada justru menyiratkan niat ini. Ditolak: *ditandai khusus* (`isShort?`) —
kompleksitas (field + UI + thumbnail 9:16 + openVideo beda) yang melampaui nilai;
Short id tetap id video biasa, perbedaannya hanya pengalaman pemutaran.

### G2-2 — Play: **selalu `/watch`**

`openVideo` (`tab-operations.ts:58`) tak berubah — selalu `https://www.youtube.com/watch?v={id}`,
apa pun asalnya (`/watch`, `/shorts`, `youtu.be`). Shorts dibuka sebagai pemutar
biasa dengan kontrol penuh (seek, kecepatan, fullscreen).

✅ Satu jalur, `openVideo` tak sentuh. ✅ Tab reuse (one-in-one-out) tetap bekerja
— setelah G2-1, `extractYouTubeVideoId` kenal `/shorts/`, jadi tab Shorts dihitung
watch tab dan dapat di-reuse.
⚠️ Kehilangan feed vertikal scroll-snap asli. Diterima: kebanyakan orang park
untuk nonton fokus, bukan melanjutkan feed; dan `openVideo` selalu `/watch` sudah
meratakan semua item ke pengalaman pemutar penuh sejak MVP.
⚠️ Thumbnail Shorts tetap 16:9 dengan pillarbox (background hitam kiri-kanan)
karena `Thumbnail.svelte:46` kunci aspect-ratio 16/9 dan `mqdefault.jpg` YouTube
serve 16:9 untuk video vertikal. Konsisten dengan G2-1 (tak dibedakan) — tidak
optimal tapi tidak rusak.

Ditolak: *buka `/shorts/{id}` bila asalnya Short* — butuh field asal (`isShort?`
atau `source: 'shorts'|'watch'`), `openVideo` bedakan, thumbnail 9:16. Kompleksitas
yang melampaui nilai untuk pengalaman yang sebagian besar orang tak park ulang
sebagai feed.

---

## Yang harus diverifikasi sebelum spec

1. ⚠️ **Capture fixture Shorts.** Tidak ada di `src/shared/__fixtures__/`. Harus
   di-capture untuk konfirmasi:
   - Apakah kartu Shorts (`ytd-reel-item-renderer`) punya anchor `a#thumbnail`
     dengan href `/shorts/{id}`? Jika ya, fast-path `resolveVideoId`
     (`capture-predicates.ts:101`) cukup setelah G2-1.
   - Jika tidak (Shorts card struktur berbeda), **fallback** (`:108`
     `a[href*="/watch?v="]`) tidak akan menemukan anchor `/shorts/`. Perlu tambah
     `a[href*="/shorts/"]` ke fallback selector. Tanpa fixture, ini tebakan.

2. ⚠️ **Tab reuse mengganggu feed aktif.** Setelah G2-1, tab Shorts yang sedang
   user scroll dihitung watch tab → `openVideo` reuse-nya ke `/watch?v={id}`.
   Kalau user sedang aktif scroll feed, play item dari queue mengganggu feed itu.
   Perilaku konsisten dengan one-in-one-out (CONTEXT.md), tapi Shorts feed adalah
   kasus di mana user paling mungkin sedang aktif scroll, bukan menonton satu
   video. Konfirmasi ini dapat diterima, atau perlu pengecualian (tab Shorts feed
   tak di-reuse, selalu buka tab baru). 🔓 terbuka.

## Yang masih terbuka

🔓 **Pengecualian reuse tab Shorts feed** (lihat verifikasi #2) — tab Shorts
aktif di-reuse ke /watch, atau selalu buka tab baru untuk play dari queue?

## Dampak pada dokumen lain

- **`CONTEXT.md`** — tak butuh entitas baru. Capture mechanism hover-to-park
  kini mencakup Shorts; tidak ada perubahan domain, hanya parser yang diperluas.
  Bisa tambah catatan: "Shorts adalah Parked Video biasa; play selalu /watch."
- **G3** — `targetUrlPatterns` context menu G3-2 menambah `youtu.be` tapi **tidak
  `/shorts`**. Klik-kanan link `/shorts/{id}` di YouTube → menu tak muncul. Bila
  Shorts warga kelas satu (G2-1), context menu juga harus mencakup `/shorts/`.
  **Korelasi: G3-2 perlu revisi** — tambah `*://*.youtube.com/shorts*` ke
  `targetUrlPatterns`. Catat di G3 sebagai amandemen, atau G2 spec yang
  memperluas G3.
- **`capture-predicates.test.ts`** — tambah kasus `/shorts/{id}` (dan dengan
  query `?t=`). Pola test sudah ada untuk `youtu.be` (`:50-57`), tinggal
  duplikasi.