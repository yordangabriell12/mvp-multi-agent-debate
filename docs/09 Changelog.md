---
title: Changelog
aliases:
  - Riwayat
  - History
  - Perubahan
tags:
  - vma/riwayat
created: 2026-09-10
updated: 2026-09-10
---

# 📜 Changelog

> [!abstract] Tentang
> Riwayat perubahan VMA, terbaru di atas. Nomor versi mengikuti tanggal kerja, bukan semver, karena proyek ini masih berjalan cepat.

[[VMA|← Kembali ke Home]]

---

## 2026-09-10

### 🔍 Audit menyeluruh dan 19 perbaikan
Audit menemukan **enam kontrol yang terlihat berfungsi padahal tidak**, tiga celah keamanan, tiga masalah keandalan, dan sisa masalah aksesibilitas. Semua diperbaiki.

#### Fitur yang akhirnya benar-benar berjalan
| Fitur | Masalah sebelumnya |
| --- | --- |
| **Max Rounds** | Semua nilai dibatasi paksa ke 2, jadi memilih 20 pun hanya satu putaran tambahan |
| **Pause** | Tombol menulis status `paused`, tetapi loop tidak pernah membacanya |
| **Pencarian web** | Blok prompt selalu kosong, endpoint tidak pernah dipanggil |
| **Uji koneksi provider** | Fungsinya ada lengkap, tombolnya tidak pernah dirender |
| **Temperature per agent** | Route menulis `0.7` secara hardcode |
| **Role Lock** | Toggle disimpan tetapi tidak dibaca logika mana pun |

#### Keamanan
- **Batas biaya `/api/chat`**: 150 permintaan per 5 menit per IP, body maksimal 1 MB, keduanya bisa diatur lewat env
- **Sandbox iframe**: `allow-same-origin` dihapus. Kombinasi dengan `allow-scripts` memungkinkan frame melepas sandbox-nya sendiri dan mencapai origin aplikasi yang menyimpan API key
- **Celah SSRF IPv4-mapped**: parser URL menulis ulang `::ffff:127.0.0.1` menjadi `::ffff:7f00:1`, sehingga loopback lolos. Ditemukan oleh test, bukan pemeriksaan manual

#### Keandalan
- Penyimpanan yang gagal tidak lagi ditelan diam-diam; muncul banner dengan tombol dismiss
- Menghapus sesi kini ikut menghapus pesannya, yang sebelumnya menumpuk selamanya di `localStorage`
- Ditambahkan `error.tsx`, `global-error.tsx`, dan `not-found.tsx`

#### Aksesibilitas
- Peran token dipisahkan: teks memakai `ink-muted` (5.7:1), `ink-faint` hanya untuk border dan ikon
- Nilai `ink-faint` digelapkan dari `#9c9590` ke `#8a8480` agar elemen non-teks melewati ambang 3:1
- Cincin fokus dinaikkan dari `sand-400` (2.3:1) ke `sand-500`
- 22 referensi CSS var yang salah nama diperbaiki (`var(--border)` menjadi `var(--color-border)`), yang membuat border jatuh ke nilai fallback

#### Dihapus karena menyesatkan
- Toggle Chat/Code/Browse di kotak input hanya mengubah placeholder, tidak mengubah permintaan
- Tombol attach hanya menampung data yang kemudian dibuang
- `TokenMeter` berhenti menampilkan biaya karena angkanya berasal dari tarif karangan

#### Alat pengembangan
- `npm run lint` diperbaiki: `next lint` sudah dihapus di Next.js 16, jadi sebelumnya tidak memeriksa apa pun
- 82 test ditambahkan (vitest) untuk logika moderator, SSRF guard, rate limit, autentikasi, dan penyimpanan
- GitHub Actions menjalankan typecheck, pemeriksaan dead code, test, dan build

> [!bug] Commit: `93f0e27` `9e16a16` `71fbac1` `5bbbbe8`

### 🎨 Dokumentasi Obsidian
Menambahkan vault dokumentasi di folder `docs/` dengan callout, diagram Mermaid, tabel, dan wikilink. Frontmatter YAML di setiap catatan untuk tag dan alias.

### ♿ Perbaikan kontras
Label dan catatan di halaman login dipindah dari `ink-faint` (sekitar 2.9:1) ke `ink-muted` (sekitar 5.7:1) supaya lolos WCAG AA.

> [!bug] Commit: `fix(a11y): raise login label contrast to WCAG AA`

### 🛡️ Backstop global anti brute force
- Prioritas header `CF-Connecting-IP` di atas `X-Forwarded-For`
- Hitungan kegagalan global: lewat 15 dalam 10 menit, jeda naik sampai 3,5 detik; lewat 40, login ditolak 2 menit

> [!success] Hasil uji
> 42 percobaan dengan IP palsu berbeda tiap request: percobaan 1-40 membalas `401` dengan jeda naik 564 ms ke 3554 ms, percobaan 41 dan seterusnya `429`. Login sah tetap `200`.

> [!bug] Commit: `feat: add a global brute-force backstop and trust CF-Connecting-IP`

### 🔑 Perbaikan format hash password
Docker Compose mengosongkan nilai `.env` yang memuat `$`, sehingga hash `pbkdf2$...` rusak dan login selalu gagal. Format diganti ke pemisah `:`.

> [!bug] Commit: `fix: use colon separators in the password hash`

### 🐳 Perbaikan network Docker
NPM yang berjalan di container tidak bisa menjangkau `127.0.0.1:3100`. Container `vma` disambungkan ke network `3_jaringan-lokal` dan proxy diarahkan ke `vma:3000`.

> [!bug] Commit: `fix: join the proxy Docker network so NPM can reach the container`

### 🔐 Login, anti brute force, dan guard SSRF
- Halaman `/login` mengikuti design token VMA
- Cookie sesi `HttpOnly` + `Secure` + `SameSite=strict` bertanda tangan HMAC, berlaku 12 jam
- Verifikasi password PBKDF2-SHA256, 210.000 iterasi, perbandingan constant-time
- Rate limit per-IP: 5 gagal lalu terkunci 15 menit
- `src/proxy.ts` mengunci seluruh route
- SSRF ditutup: `baseUrl` ke alamat privat ditolak
- Header keamanan: HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy
- Tombol Sign out di sidebar

> [!bug] Commit: `feat: add authentication gate and SSRF hardening`

### 🚀 Deploy ke VPS
Live di https://vma.yordangabriell.my.id. Docker multi-tahap (node:22-alpine, standalone), NPM sebagai reverse proxy, Let's Encrypt untuk SSL.

> [!bug] Commit: `chore: add Docker deployment setup`

### 📄 Dokumentasi awal
Menambahkan catatan review codebase pertama.

> [!bug] Commit: `docs: add codebase review baseline (10-sept-2026-1.md)`

### 📦 Commit awal
Seluruh kode VMA masuk repo, 66 file.

> [!bug] Commit: `feat: initial VMA multi-agent debate app`

---

## Rencana Berikutnya

> [!todo] Belum dikerjakan
> - [ ] Ganti password Portainer dan open-webui
> - [ ] Audit kontras `ink-faint` di seluruh aplikasi
> - [ ] Implementasi atau hapus tombol Share Room dan Share
> - [ ] Backend Python untuk code interpreter, browser, knowledge panel, presentasi
> - [ ] Backup off-site (saat ini backup hanya di server yang sama)

---

Terkait: [[06 Deployment]] · [[08 Troubleshooting]]
