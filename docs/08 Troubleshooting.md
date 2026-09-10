---
title: Troubleshooting
aliases:
  - Masalah
  - Errors
  - Perbaikan
tags:
  - vma/ops
  - vma/troubleshooting
created: 2026-09-10
updated: 2026-09-10
---

# 🔧 Troubleshooting

> [!abstract] Isi
> Kumpulan masalah nyata yang pernah muncul, penyebabnya, dan cara memperbaikinya. Diurutkan dari yang paling sering.

[[VMA|← Kembali ke Home]] · [[06 Deployment]]

---

## 1. Build gagal: `Cannot find module 'lightningcss'`

> [!failure] Gejala
> ```
> Error: Cannot find module '../lightningcss.darwin-arm64.node'
> Import trace: ./src/app/globals.css
> ```

**Penyebab.** Turbopack (default Next 16) mengevaluasi config PostCSS/Tailwind di dalam konteks ter-*bundle*, sehingga tidak bisa me-resolve binary native `lightningcss`. Ini masalah lingkungan, bukan bug kode.

**Perbaikan.** Bangun dengan webpack:

```bash
npx next build --webpack
```

Dockerfile sudah memakai perintah ini. Konsekuensinya, `npm run build` biasa (Turbopack) akan gagal di sebagian mesin.

---

## 2. Situs membalas `502 Bad Gateway`

> [!failure] Gejala
> Cloudflare membalas `502`. Container `vma` terlihat `healthy` dan `curl` ke `127.0.0.1:3100` dari host berhasil.

**Penyebab.** Nginx Proxy Manager berjalan **di dalam container**. Saat proxy diarahkan ke `127.0.0.1:3100`, dari sisi NPM alamat itu menunjuk ke container NPM sendiri, bukan ke host.

**Perbaikan.** Sambungkan container ke network yang sama dengan NPM, lalu arahkan ke nama container:

```yaml
networks:
  proxy:
    external: true
    name: 3_jaringan-lokal
```

Lalu di proxy host NPM:

| Field | Nilai |
| --- | --- |
| Forward Hostname | `vma` |
| Forward Port | `3000` |

> [!tip] Cara memastikan container berada di network yang benar
> ```bash
> docker inspect vma --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}'
> ```
> Output harus memuat `3_jaringan-lokal`.

---

## 3. Login selalu gagal walau password benar

> [!failure] Gejala
> `docker compose config` atau `build` memunculkan peringatan seperti:
> ```
> level=warning msg="The \"aYLq...\" variable is not set. Defaulting to a blank string."
> ```
> Password yang benar tetap ditolak.

**Penyebab.** Docker Compose memperlakukan `$` di file `.env` sebagai awal variabel. Hash lama berformat `pbkdf2$210000$salt$hash`, sehingga setiap bagian setelah `$` dianggap variabel dan diganti kosong.

**Perbaikan.** Gunakan format pemisah titik dua yang tidak mengandung `$`:

```
pbkdf2:<iterasi>:<salt-base64url>:<hash-base64url>
```

Buat hash baru:

```bash
node scripts/hash-password.mjs 'password-baru'
```

> [!important] Pelajaran umum
> Jangan menaruh tanda dolar di nilai `.env` untuk Docker Compose. Kalau terpaksa, tulis `$$` untuk literal satu `$`.

---

## 4. Error: kedua file `middleware` dan `proxy` terdeteksi

> [!failure] Gejala
> ```
> Both middleware file and proxy file are detected.
> Please use "./src/proxy.ts" only.
> ```

**Penyebab.** Next.js 16 mengganti konvensi `middleware` menjadi `proxy`. Keduanya tidak boleh ada bersamaan.

**Perbaikan.** Hapus `src/middleware.ts`, lalu di `src/proxy.ts` ekspor fungsi bernama `proxy` (bukan `middleware`):

```ts
export async function proxy(req: NextRequest) { /* ... */ }

export const config = { matcher: ['/((?!_next/static|_next/image).*)'] }
```

---

## 5. TypeScript: `Uint8Array` tidak bisa dipakai sebagai `BufferSource`

> [!failure] Gejala
> ```
> Type 'Uint8Array<ArrayBufferLike>' is not assignable to type 'BufferSource'.
> ```

**Penyebab.** TypeScript versi baru membedakan `Uint8Array<ArrayBuffer>` dari `Uint8Array<ArrayBufferLike>`. API Web Crypto menuntut yang pertama.

**Perbaikan.** Anotasi tipe secara eksplisit:

```ts
function fromBase64Url(input: string): Uint8Array<ArrayBuffer> {
  // ...
}
```

---

## 6. Peringatan: `process.cwd is not supported in the Edge Runtime`

> [!warning] Gejala
> Muncul sebagai peringatan saat build, build tetap berhasil.

**Penyebab.** Rantai impor dari `next/server` menarik sebagian modul Node. Ini peringatan bawaan, bukan kesalahan konfigurasi.

**Perbaikan.** Tidak perlu apa-apa. Kalau mengganggu, abaikan.

---

## 7. Teks samar sulit dibaca, kontras gagal WCAG

> [!failure] Gejala
> Label atau catatan kecil terlihat pucat di atas latar putih.

**Penyebab.** Token `ink-faint` bernilai `#9c9590` dan hanya mencapai kontras sekitar **2.95:1**, di bawah ambang WCAG AA (4.5:1) untuk teks normal. Token itu dipakai untuk label, timestamp, dan role agent di hampir seluruh komponen.

**Perbaikan.** Peran token dipisahkan:

| Peran | Token | Kontras |
| --- | --- | --- |
| Teks sekunder dan label | `ink-muted` `#6b6560` | 5.7:1 |
| Border, pembatas, ikon | `ink-faint` `#8a8480` | 3.7:1 |

Nilai `ink-faint` juga digelapkan dari `#9c9590` supaya border dan indikator fokus melewati ambang 3:1 untuk elemen non-teks.

> [!note] Kenapa tidak sekadar menggelapkan satu token
> Agar `ink-faint` lolos 4.5:1 di semua permukaan yang dipakai (termasuk `surface-hover`), nilainya harus sekitar `#6f6964`, yang hampir identik dengan `ink-muted`. Hierarki empat tingkat tidak menyisakan ruang untuk tingkat keempat yang tetap lolos AA, jadi pemisahan peran adalah jalan keluarnya.

**Status.** Selesai. Seluruh teks memakai `ink-muted`, dan `ink-faint` tinggal untuk elemen non-teks. Cincin fokus juga dinaikkan dari `sand-400` ke `sand-500` karena yang lama hanya sekitar 2.3:1.

---

## 7b. `npm run lint` gagal: "Invalid project directory"

> [!failure] Gejala
> ```
> > next lint
> Invalid project directory provided, no such directory: .../lint
> ```

**Penyebab.** Perintah `next lint` **sudah dihapus di Next.js 16**. Karena bukan lagi perintah yang dikenal, `lint` dianggap sebagai nama direktori dan gagal. Tidak ada linting yang berjalan sama sekali.

**Perbaikan.** Script diganti menjadi pemeriksaan tipe yang ketat:

```json
"lint": "tsc --noEmit --noUnusedLocals --noUnusedParameters",
"typecheck": "tsc --noEmit"
```

> [!warning] Kenapa bukan ESLint
> `eslint-config-next` sudah dicoba dan **tidak bisa jalan di proyek ini**. Paket `typescript-eslint` yang dibundelnya menolak TypeScript 7 (yang dipakai proyek ini) dan langsung melempar error saat di-import:
> ```
> typescript-eslint does not support TS 7.0.
> ```
> Kembalikan ESLint setelah `typescript-eslint` mendukung TypeScript 7. Sementara ini, pemeriksaan tipe sudah menangkap hal yang paling penting: import dan variabel yang tidak terpakai.

---

## 7c. "Connection failed" padahal endpoint dan key benar

> [!failure] Gejala
> Base URL dan API key sudah benar, tetapi Test connection selalu gagal dengan pesan yang tidak menjelaskan apa pun.

**Penyebab.** Dua hal bertumpuk:

1. **Pesannya tidak informatif.** Provider membungkus alasan asli di dalam JSON bersarang, kadang di dalam JSON lagi, dan kadang dengan newline literal di dalam string sehingga JSON-nya bahkan tidak valid. Aplikasi hanya menampilkan "Connection failed".
2. **Kegagalannya sering di tingkat model, bukan provider.** Kalau memakai gateway seperti 9Router, kunci dan base URL bisa benar sementara satu model tertentu gagal karena saldo upstream habis.

**Perbaikan.** Dua-duanya sudah ditangani:

- Alasan asli sekarang dibuka dari sarangnya dan ditampilkan. Lihat [[11 Provider AI]]
- Ada tombol **Fetch models** supaya id model tidak perlu diketik manual

> [!example] Kasus nyata: 9Router
> Ditemukan dengan menguji langsung:
>
> | Model | Hasil | Arti |
> | --- | --- | --- |
> | `gpt-4o` | `429` | Saldo OpenAI habis |
> | `olagon/claude-opus-4-8` | `402` | Butuh pembayaran |
> | `Cline-Combo` | `200` | Berfungsi |
> | `for-hermes` | `200` | Berfungsi |
> | `opencode-model` | `200` | Berfungsi |
>
> Jadi **base URL dan key-nya benar**. Yang gagal adalah model-model tertentu. Solusinya pilih model yang berfungsi, atau isi ulang saldo upstream.

**Cara memastikan sendiri:**

```bash
KEY='sk-...'; BASE='https://9router.yordangabriell.my.id/v1'
# Key dan endpoint benar kalau ini membalas daftar model
curl -s -H "Authorization: Bearer $KEY" "$BASE/models" | head -c 200
# Lalu uji model spesifik
curl -s -X POST "$BASE/chat/completions" -H "Authorization: Bearer $KEY" \
  -H 'Content-Type: application/json' \
  -d '{"model":"Cline-Combo","messages":[{"role":"user","content":"Say OK"}],"max_tokens":10}'
```

**Status.** Selesai. Pesan gagal sekarang bisa dibaca, misal: *"You have no credits remaining. Add credits to continue using the API at https://platform.openai.com/settings/organization/billing/."*

---

## 7d. Pesan berhenti tersimpan tanpa peringatan

> [!failure] Gejala
> Percakapan panjang berjalan normal, tetapi setelah refresh sebagian pesan hilang.

**Penyebab.** `localStorage` dibatasi sekitar 5 MB. Semua penulisan dibungkus `catch { /* ignore */ }`, sehingga begitu kuota penuh, penyimpanan berhenti **tanpa pesan apa pun** sementara tampilan tetap terlihat sehat.

**Perbaikan.** `src/lib/storage.ts` melaporkan kegagalan, store menyimpannya sebagai state, dan sebuah banner di atas area kerja menampilkannya. Banner hilang sendiri begitu penulisan berikutnya berhasil.

Jika banner ini muncul:

1. **Export** sesi yang penting (tombol Export di topbar)
2. Hapus sesi lama; menghapus sesi kini sekaligus menghapus pesannya
3. Muat ulang halaman

> [!note] Perbaikan terkait
> `clearMessages` sebelumnya hanya didefinisikan dan tidak pernah dipanggil, sehingga setiap sesi yang dihapus meninggalkan pesannya di `localStorage` selamanya. Sekarang penghapusan sesi ikut membersihkan pesannya.

---

## 8. Diagnostik Cepat

> [!example] Perintah yang sering dipakai
> ```bash
> # Container sehat?
> docker compose ps
>
> # Lihat log terbaru
> docker compose logs --tail=50 vma
>
> # Aplikasi membalas dari host?
> curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3100/login
>
> # Container ada di network proxy?
> docker inspect vma --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}'
>
> # NPM bisa menjangkau container?
> docker exec nginx-proxy-manager getent hosts vma
>
> # Ulangi dari nol
> cd ~/apps/vma && docker compose down && docker compose up -d --build
> ```

---

## 9. Di Mana Mencari

| Kebutuhan | Lokasi |
| --- | --- |
| Log aplikasi | `docker compose logs vma` |
| Log NPM | container `nginx-proxy-manager`, folder `/data/logs/` |
| Konfigurasi env | `~/apps/vma/.env` |
| Data NPM | volume container `nginx-proxy-manager`, `/data` |
| Backup harian | `/root/backups/` di server |

---

Terkait: [[06 Deployment]] · [[07 Keamanan]] · [[09 Changelog]]
