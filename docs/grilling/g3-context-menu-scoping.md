# Grilling: G3 — Context Menu Scoping (silent fail di luar YouTube)

Sesi 2026-07-27. Status: **keputusan desain selesai, belum jadi spec, belum ada kode.**
Digrill terpisah dari G4 meski awalnya terhubung (perluasan via oEmbed bisa
solve keduanya) — keputusan memilih jalur berbeda.

Rujukan: `docs/ROADMAP.md` G3 · `docs/adr/0001-context-menu-scoping.md`.

**Tanda:** ✅ terverifikasi di kode · ⚠️ asumsi, belum diuji · 🔓 masih terbuka

---

## Ringkasan masalah

`background.ts:17` mendaftarkan menu dengan `targetUrlPatterns: ["*://*.youtube.com/watch*"]`.
Pola itu memfilter URL **link yang diklik-kanan**, bukan URL **halaman tempat klik
terjadi** (itu tugas `documentUrlPatterns`, yang tidak dipasang).

Konsekuensi: klik-kanan link YouTube di Reddit/Discord/mana pun → menu "Park This
Video" muncul → `background.ts:30` kirim `CONTEXT_MENU_PARK` ke `tab.id` → content
script tidak termuat (matches `*://*.youtube.com/*` di `content.ts:284`) → pesan
tak sampai → **silent fail**. User melihat menu, mengklik, tidak terjadi apa-apa.

## Keputusan

### G3-1 — Arah: **persempit (menu hanya di YouTube)**

Tambah `documentUrlPatterns: ["*://*.youtube.com/*"]`. Menu hanya muncul saat
klik-kanan link YouTube **di halaman YouTube**. Sepele, jujur, menutup silent fail.

```ts
chrome.contextMenus.create({
  id: CONTEXT_MENU_ID,
  title: "Park This Video",
  contexts: ["link"],
  targetUrlPatterns: ["*://*.youtube.com/watch*", "*://youtu.be/*"],  // G3-2
  documentUrlPatterns: ["*://*.youtube.com/*"],                        // G3-1 baru
});
```

✅ ADR-0001 tetap utuh — context menu sebagai "validated secondary path" di
konteks YouTube, sesuai keputusan asli.
⚠️ **Park-dari-luar-YouTube jadi mustahil** — kapabilitas yang sekarang terbuka
(meski rusak) ditutup. Diterima: kapabilitas itu sudah rusak hari ini (silent
fail), jadi tidak ada yang hilang secara fungsional; hanya janji menu yang
dihapus.

Ditolak: *perluas via oEmbed* — park langsung di background via oEmbed (title +
author_name=channel), menu muncul di mana pun. Justru memperluas jangkauan dan
sekaligus menyelesaikan G4. Tapi ditolak karena:
- **feedback di luar YouTube tidak ada jalur** — tidak ada content script →
  tidak ada in-page toast (`content.ts:32`). Opsi: `chrome.notifications`
  (CONTEXT.md hindari), silent success, atau inject script (berat).
- oEmbed gagal untuk video privat/dihapus (401/404) → metadata minim fallback.
- **ADR-0001 harus dibuka kembali** — eksplisit membatasi ke konteks YouTube.
- Risiko rate-limit + SW ephemeral untuk fetch.

Ditolak: *persempit dulu, perluas nanti terpisah* — valid, tapi menambahkan
putaran tanpa keuntungan; G3-1 saja sudah cukup jujur, dan perluasan (bila
diinginkan) bisa dibuat sebagai fitur tier-2 baru dengan grill sendiri (termasuk
menyelesaikan feedback + ADR-0001).

### G3-2 — Bug scoping youtu.be: **tambah youtu.be ke targetUrlPatterns**

✅ Ditemukan saat grilling: `targetUrlPatterns` hanya `*://*.youtube.com/watch*` →
link `youtu.be/ID` tak dapat context menu. Inkonsisten dengan
`extractYouTubeVideoId` yang sudah kenal youtu.be (`capture-predicates.ts:35`,
diuji `:50-57`) dan content script yang cari `a[href*="youtu.be"]` (`content.ts:300`).

Tambah `*://youtu.be/*` ke `targetUrlPatterns` (lihat G3-1 kode). `documentUrlPatterns`
tetap `youtube.com` — youtu.be sebagai halaman itu sendiri sangat jarang (biasanya
redirect ke youtube.com), tidak worth dicakup.

---

## Yang sudah terbukti

✅ `documentUrlPatterns` tidak mengubah jalur yang sudah bekerja — klik-kanan
link YouTube di halaman YouTube tetap cocok (`documentUrlPatterns: youtube.com`
match). Tidak ada regresi pada capture path yang berfungsi.

✅ ADR-0001 tetap valid. Kalimat "Shortcut Capture (hover + `P`) is the primary
driver" di ADR-0001:10 **sudah dua kali salah** (P dihapus di G1, dan context menu
bukan secondary dari shortcut). Tapi ADR mencatat keputusan pada waktunya —
tambahkan catatan koreksi, jangan edit isi historis.

## Yang masih terbuka

🔓 **Park-dari-luar-YouTube sebagai tier-2.** Bila suatu hari diinginkan, itu
fitur baru dengan grill sendiri: jalur feedback (notifications? inject script?),
handling oEmbed failure, dan pembukaan kembali ADR-0001. G3-1 menutup pintu
dengan jujur; pintu itu bisa dibuka kembali dengan kerja eksplisit, bukan
diam-diam.

## Yang harus diverifikasi sebelum spec

1. ⚠️ `documentUrlPatterns` + `targetUrlPatterns` interaksi — apakah kedua pola
   harus cocok, atau salah satu? Perilaku Chrome: menu muncul bila link URL cocok
   `targetUrlPatterns` **dan** halaman URL cocok `documentUrlPatterns`. Konfirmasi
   tak ada kasus di mana YouTube watch link ada di halaman yang hostname-nya
   tidak persis `*.youtube.com` (mis. embed di domain lain — itu sudah di-luar).

## Dampak pada dokumen lain

- **ADR-0001** — tetap Accepted; tambah catatan koreksi: G3-1 menambah
  `documentUrlPatterns`, dan kalimat "Shortcut Capture primary driver" usang
  (lihat G1). Jangan edit isi historis.
- **G4** — tidak terbawa. Karena G3 memilih persempit (bukan oEmbed), G4 tetap
  perlu grill sendiri untuk channel di tab-park. F9-3 sudah menetapkan G4
  bukan blokir F9, jadi G4 kini mandiri tanpa jalur kritis.
- **CONTEXT.md** — tak butuh perubahan; capture mechanism context-menu tetap,
  hanya scoping yang diperketat.