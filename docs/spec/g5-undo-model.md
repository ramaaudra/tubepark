# Spec: G5 — Model Undo (4 bug, 2 kehilangan data deterministik)

Part of: `docs/ROADMAP.md` G5+G6 · Grilling: `docs/grilling/g5-undo-model.md`

## Problem Statement

Model undo Side Panel saat ini (`src/entrypoints/sidepanel/App.svelte:56-101`) — mutasi optimis di memori + commit ke storage tertunda 5 detik via `setTimeout` — menghasilkan **empat bug**, dua di antaranya kehilangan data deterministik (bukan race):

1. **Undo bulk rusak** (`:69-81`): `handleUndo` memanggil `clearTimeout` di cabang `undoItem` (`:74`) tapi **tidak** di cabang `undoBulk` (`:76-80`). Undo bulk terlihat berhasil, lalu 5 detik kemudian timer `handleRemoveAllOlder` (`:92`) tetap menyala dan menghapus semuanya dari storage. "Hapus Semua" bisa menghapus puluhan item — kehilangan data terbesar di aplikasi.
2. **Penghapusan beruntun membatalkan commit sebelumnya** (`:59`): `clearTimeout(undoTimer)` membatalkan timer item sebelumnya tanpa mengomitnya. Hapus A lalu B → A muncul kembali di list (storage masih punya A) dan tidak pernah terhapus.
3. **Race dengan `storage.onChanged`** (`:41`): `loadData` menimpa `queue` dari storage. Storage belum berubah selama jendela 5 detik, jadi event apa pun (park dari YouTube, toggle pin) memunculkan kembali item yang "dihapus" — berkedip keluar-masuk.
4. **Tutup panel membatalkan penghapusan, diam-diam**: tidak ada `onDestroy`/handler unload. Tutup panel dalam jendela 5 detik → timer mati bersama dokumen → item tidak jadi terhapus. User melihat item hilang, menutup panel, membukanya lagi, item kembali.

Lolos review karena keempatnya hidup di `.svelte` — tidak ada `vitest.config.*`, tidak ada testing-library; 88 test hijau semuanya menguji modul murni di `src/shared/`.

## Solution

Grace period dengan pending dimiliki background (bukan panel): penghapusan adalah permintaan ke background; background menyimpan pending, menjalankan timer, dan mengomit ke storage. Undo = pesan pembatalan. Satu slot pending berisi daftar (1 atau N item); penghapusan berikutnya mengomit yang lama. `getQueue` menyaring pending (fakta global — semua pembaca konsisten). Undo menang atas cap; overflow 201/200 diizinkan sementara. Model pending sebagai reducer murni di `src/shared/` (pola `storage.ts`), teruji tanpa browser.

## User Stories

1. As a curator, I want to undo a single delete within 5 seconds, so that a misclick doesn't lose a video.
2. As a curator, I want to undo "Hapus Semua" (bulk) within 5 seconds, so that a bulk mistake is recoverable — and the undo actually cancels the commit (not just visually).
3. As a curator, I want deleting A then B to commit A permanently (not silently keep A), so that rapid deletes don't leave ghost items.
4. As a curator, I want deleting a video to NOT make it reappear when another tab parks a new video, so that undo and park don't race.
5. As a curator, I want closing the Side Panel mid-undo-window to still commit the deletion, so that "delete then close" doesn't resurrect the item.
6. As a curator, I want to delete one item from a full (200) queue, park a new one, then undo — and have the undo succeed (queue 201), so that undo never fails at the moment I click it.
7. As a curator, I want the undo toast to say "12 video dihapus" for bulk, so that the count is honest about scale.
8. As a maintainer, I want the undo state model unit-tested without a browser, so that the four bugs are regression-guarded.

## Implementation Decisions

- **D1 — Grace period.** Penghapusan = permintaan tertunda, bukan commit segera. Undo tidak pernah gagal (alasan memilih ini vs "hapus dulu + tulis balik"). Item masih di storage selama 5 detik.
- **D2 — Satu slot pending.** `PendingRemoval = { operationId: string, owner: "popup" | "sidepanel" | "content", videos: ParkedVideo[], requestedAt: number, expiresAt: number }`. Identitas target penghapusan adalah pasangan `(id, addedAt)`, bukan id saja, sehingga request UI yang terlambat tidak dapat menghapus re-park item yang sama. Hapus B saat A pending → A langsung dikomit permanen, B jadi pending. Perbaikan langsung bug #2. Slot selalu daftar (1 atau N) — perbaikan bug #1 secara struktural (satu jalur kode, satu timer, satu toast; tidak ada dua cabang `handleUndo` yang bisa berbeda).
- **D3 — Background pemilik pending.** Panel kirim `PENDING_REMOVE`; background memvalidasi owner dari sender, menyelesaikan target dan queue transition di satu MutationQueue + storage write, lalu persist pending transaction + timer akselerator + recovery alarm/startup dan commit berdasarkan `expiresAt`. Undo = `CANCEL_REMOVE` dengan `operationId` dan owner surface; owner wajib cocok dan tidak pernah menjadi wildcard. Queue tetap difilter global, tetapi summary Undo hanya dikirim ke surface pemiliknya agar Popup, Side Panel, dan content script tidak saling mengambil alih affordance. Broadcast `PENDING_REMOVAL_CHANGED` hanya membawa owner/count/ids — operation ID tidak dibocorkan ke surface lain; pemilik membaca ID melalui queue request-nya sendiri. Perbaikan bug #4 (panel ditutup → timer tetap di background → commit), sekaligus membuat restart worker aman. **Wajib: broadcast `PENDING_REMOVAL_CHANGED`** dari background ke content script saat pending berubah — `storage.onChanged` tidak cukup sebagai feedback UI.
- **D4 — Pending fakta global via `getQueue`.** Semua pembaca lihat queue yang sama (park, capacity, popup, panel). Hapus di panel → meter langsung turun, park lihat slot bebas.
  - ⛔ **Jebakan wajib dihindari:** `getQueue` (`storage.ts:74`) juga basis read-modify-write untuk `parkVideo` (`:88`), `removeVideo` (`:99`), `togglePinned` (`:106`), `removeManyVideos` (`:113`). Kalau `getQueue` menyaring pending, `togglePinned` akan tulis ulang storage TANPA item pending → terhapus permanen lebih awal. **Pisahkan seam:** `getQueue()` (baca-untuk-tampil, menyaring pending) vs `getRawQueue()` (baca-untuk-menulis, storage mentah). `parkVideo`/`togglePinned`/dst. pakai `getRawQueue`. Penamaan harus membuat kesalahan ini sulit dilakukan.
- **D5 — Undo menang atas cap.** `parkVideoPure` (`storage.ts:36`) tetap tolak di `>= 200`. Jalur restore (`restorePending`) lewati cek cap. Queue 201/200 diizinkan sementara; park baru ditolak sampai user memangkas. `ParkMeter.svelte:14` sudah `Math.min(1, …)` (bar mentok), `deriveCapacityState` sudah `>= max → 'full'`. Hanya teks banner yang perlu jujur ("201/200").
- **D6 — Bulk = N item.** `PendingRemoval.videos` daftar. Toast: `videos.length === 1 ? 'Video dihapus' : '{n} video dihapus'`. G6 (copy) diserap.
- **D7 — Reducer murni + test.** `src/shared/pending-removal.ts`: `requestRemoval(state, video)`, `cancelRemoval(state)`, `commitRemoval(state)`, `visibleQueue(raw, state)`. Background + panel shell tipis di atasnya. Test tanpa browser (pola `storage.ts`). Test gagal-dulu per bug:
  - penghapusan beruntun mengomit yang lama (bug #2)
  - undo membatalkan commit di semua jalur (bug #1)
  - restore melewati cek cap; park baru tidak (D5)
  - baca-untuk-tampil menyaring; baca-untuk-menulis tidak (D4 jebakan)
  - park melihat slot yang dibebaskan (D4)
- **Ditolak: hapus dulu + undo tulis balik** — undo bisa gagal (queue penuh). Ditolak: soft-delete `deletedAt` + sweep — butuh sweep SW ephemeral (masalah ADR-0002 hidup lagi), item terhapus memakan slot.

## Testing Decisions

- **Unit test (wajib, pola storage.ts):** `pending-removal.ts` murni — semua keputusan D1-D7 sebagai test. Tanpa browser, tanpa DOM. Ini inti perlindungan regresi.
- **Tidak menambah infra test komponen** (testing-library/jsdom) — logika undo pindah ke murni, jadi tak perlu. `linkedom` manual tetap untuk fixture HTML.
- **Integration (manual):** empat bug repro — hapus bulk + undo + tunggu 5s (item harus kembali, bukan hilang); hapus A lalu B + tunggu (A hilang permanen, B undo-able); hapus + park dari tab lain (item tak reappear); hapus + tutup panel + buka (item hilang).

## Dependencies

- **Fondasi untuk F1-3, F6.** Keduanya konsumen seam D3 (`PENDING_REMOVE`/`CANCEL_REMOVE` + broadcast). Spec F1 (`docs/spec/f1-f2-feedback-loop.md`) dan F6 (`docs/spec/f6-undo-popup.md`) menyatakan dependensi ini. G5 harus ship sebelum F1-2/F1-3 dan F6.
- **`broadcast PENDING_REMOVAL_CHANGED`** — wajib sebagai bagian D3, bukan tambahan F1. Side panel juga butuh (D4 lewat `getQueue` sudah menangani panel; tapi sinkronisasi Set content script butuh pesan). Spec harus nyatakan ini sebagai deliverable G5.

## Verification recorded after implementation

1. **Worker lifecycle:** deadline disimpan di `chrome.storage.local`; `setTimeout` hanya mempercepat jalur normal, sedangkan `chrome.alarms` dan startup reconciliation menyelesaikan transaction yang sudah kedaluwarsa.
2. **Operation ownership:** `CANCEL_REMOVE` dan `COMMIT_PENDING` membawa `operationId`; surface lama tidak dapat membatalkan atau mengomit operation baru.
3. **Display/write seam:** display membaca snapshot visible dari background, sedangkan semua read-modify-write memakai raw queue di background.

## References

- Grilling: `docs/grilling/g5-undo-model.md`
- Roadmap: `docs/ROADMAP.md` G5, G6
- Konsumen: `docs/spec/f1-f2-feedback-loop.md` F1-3, `docs/spec/f6-undo-popup.md`
- Code: `src/entrypoints/sidepanel/App.svelte:32-101`, `src/shared/storage.ts:74-123`
