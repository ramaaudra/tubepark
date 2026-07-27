# Spec: G3 — Context Menu Scoping (silent fail di luar YouTube)

Part of: `docs/ROADMAP.md` G3 · Grilling: `docs/grilling/g3-context-menu-scoping.md`

## Problem Statement

`background.ts:17` mendaftarkan menu dengan `targetUrlPatterns: ["*://*.youtube.com/watch*"]`. Pola itu memfilter URL **link yang diklik-kanan**, bukan URL **halaman tempat klik terjadi** (itu tugas `documentUrlPatterns`, yang tidak dipasang). Konsekuensi: klik-kanan link YouTube di Reddit/Discord/mana pun → menu "Park This Video" muncul → `background.ts:30` kirim `CONTEXT_MENU_PARK` ke `tab.id` → content script tidak termuat (`content.ts:284` matches `*://*.youtube.com/*`) → pesan tak sampai → **silent fail**. User melihat menu, mengklik, tidak terjadi apa-apa.

Bug scoping kedua ditemukan saat grilling: `targetUrlPatterns` hanya `*://*.youtube.com/watch*` → link `youtu.be/ID` tak dapat context menu, meski `extractYouTubeVideoId` (`capture-predicates.ts:35`) dan content script (`content.ts:300`) sudah kenal `youtu.be`.

## Solution

Persempit menu ke halaman YouTube via `documentUrlPatterns`, dan tambahkan `youtu.be` ke `targetUrlPatterns`. Menu hanya muncul saat klik-kanan link YouTube di halaman YouTube — menutup silent fail dengan jujur. ADR-0001 tetap utuh (context menu sebagai "validated secondary path" di konteks YouTube). Park-dari-luar-YouTube (kapabilitas yang sudah rusak) ditutup; bila diinginkan nanti = fitur tier-2 baru dengan grill sendiri (feedback di luar YouTube, oEmbed, buka ADR-0001).

## User Stories

1. As a user, I want the "Park This Video" menu to appear only when it can actually park, so that clicking it never silently does nothing.
2. As a user, I want the menu to NOT appear when I right-click a YouTube link on Reddit/Discord, so that I am not offered an action that cannot complete.
3. As a user, I want to right-click a `youtu.be` short link on YouTube and see the menu, so that short-URL captures work like watch-URL captures.
4. As a maintainer, I want ADR-0001's scoping rationale preserved, so that the context menu remains a YouTube-scoped secondary capture path.

## Implementation Decisions

- **`background.ts:12-19`** — ubah `chrome.contextMenus.create`:
  ```ts
  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: "Park This Video",
    contexts: ["link"],
    targetUrlPatterns: ["*://*.youtube.com/watch*", "*://youtu.be/*"],   // G3-2 baru
    documentUrlPatterns: ["*://*.youtube.com/*"],                          // G3-1 baru
  });
  ```
- **Tidak mengubah `onClicked` handler** (`background.ts:23-37`) — logika routing ke content script tak berubah; scoping dilakukan deklaratif di pendaftaran.
- **Tidak menambah permission.** `contextMenus` sudah ada.
- **ADR-0001:** tetap Accepted. Tambah catatan koreksi (jangan edit isi historis): G3-1 menambah `documentUrlPatterns`; kalimat "Shortcut Capture (hover + `P`) is the primary driver" (`adr/0001:10`) sudah usang (P dihapus di G1, context menu bukan secondary shortcut).
- **Ditolak: perluas via oEmbed** — park langsung di background via oEmbed (title + author_name) dari mana pun. Menyentuh ADR-0001 (batas konteks YouTube), feedback di luar YouTube tak ada jalur (no content script → no toast; `chrome.notifications` dihindari `CONTEXT.md`), oEmbed gagal untuk privat/dihapus. Ditetapkan sebagai opsi tier-2 terpisah bila diinginkan.

## Testing Decisions

- **Tidak ada logika murni baru** — ini deklaratif manifest. Verifikasi manual: (a) buka YouTube, klik-kanan link video → menu muncul, park bekerja; (b) buka Reddit, klik-kanan link YouTube → menu tak muncul; (c) di YouTube, klik-kanan link `youtu.be/ID` → menu muncul.
- **Regression guard:** `capture-predicates.test.ts` (23 test) tak tersentuh. `extractYouTubeVideoId` sudah kenal `youtu.be` (`:35`, diuji `:50-57`).

## Dependencies

- **Mandiri.** Tidak bergantung fitur lain.
- **Korelasi G2:** G2-1 menetapkan Shorts warga kelas satu — `targetUrlPatterns` juga perlu `*://*.youtube.com/shorts*`. Spec G2 menyatakan ini; implementasi G3+G2 bisa satu commit (tambah `/shorts*` sekalian).

## Verification needed before implementation

1. `documentUrlPatterns` + `targetUrlPatterns` interaksi: konfirmasi kedua pola harus cocok (AND) — menu muncul bila link URL cocok `targetUrlPatterns` **dan** halaman URL cocok `documentUrlPatterns`. Konfirmasi tak ada kasus YouTube watch link di halaman non-`*.youtube.com` yang tertutup (embed di domain lain sudah di-luar scope, sesuai ADR-0001).

## References

- Grilling: `docs/grilling/g3-context-menu-scoping.md`
- ADR: `docs/adr/0001-context-menu-scoping.md`
- Roadmap: `docs/ROADMAP.md` G3
- Code: `src/entrypoints/background.ts:12-37`, `src/entrypoints/content.ts:284,300`