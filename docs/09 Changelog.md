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

## 2026-09-29

### 📄 Membaca PDF dan gambar kini benar-benar bisa dinyalakan

Fitur OCR sudah punya route dan tes, tetapi **tidak punya layar pengaturan**. Model
pembaca hanya bisa dipilih lewat pemanggilan API langsung, jadi upload gambar selalu
dijawab "belum diatur" dan tidak ada cara memperbaikinya dari aplikasi.

| Yang diperbaiki | Sebelumnya | Sekarang |
| --- | --- | --- |
| **Layar pengaturan OCR** | Tidak ada. Model tidak bisa dipilih | Sidebar → **Reading Documents** (khusus super admin): provider, model vision, batas halaman, sakelar aktif |
| **Batas ukuran gambar** | Hanya batas byte (12 MB) | Ditambah batas luas **40 megapiksel**, dibaca dari header |
| **Label tombol komposer** | Tombol lampiran, kirim, dan stop tanpa nama | Punya `aria-label`, jadi terbaca pembaca layar |
| **Zona unggah** | `div` dengan `onClick` saja | `role="button"`, fokus keyboard, Enter/Space, dan focus ring |
| **Sesi lama** | Sesi tanpa `settings` membuat layar Mode menampilkan `undefined` dan tidak ada preset yang aktif | Nilai default diisi saat dibaca, dan kunci preset lama disahkan |

#### Kenapa batas byte saja tidak cukup

PNG dan WebP memampatkan data, jadi ukuran berkas tidak menentukan biaya
membacanya. PNG 20000 × 20000 berwarna rata adalah **379 KB di disk**, yang lolos
batas 12 MB dengan mudah, tetapi 400 megapiksel saat dibuka. Dimensi karena itu
dibaca langsung dari header (PNG, JPEG, GIF, WebP), sebelum berkas diserahkan ke apa
pun yang akan mendekodenya. Gambar yang ukurannya tidak bisa dibaca **ditolak**,
bukan dilewatkan, karena gambar yang tidak terukur justru bentuk khas bom dekompresi.

#### Verifikasi

- 165 unit test (14 berkas), termasuk 8 tes ukuran gambar dan 6 tes sesi lama
- `scripts/e2e-ocr.sh`: **33 pemeriksaan, 0 gagal**, termasuk bom 400 megapiksel
  yang ditolak dengan 413 dan alasan yang menyebut cara memperbaikinya
- `scripts/ui-audit.sh`: **38 pemeriksaan, 0 gagal** terhadap browser sungguhan,
  termasuk layar **Reading Documents**, zona unggah yang bisa dijangkau keyboard,
  dan sidebar kanan yang bisa disembunyikan
- Rantai penuh diuji di browser: pilih provider → pilih model → aktifkan → Save →
  unggah gambar → **HTTP 200**, dan model tiruan melaporkan gambarnya benar-benar
  diterima (`image=received`, 545 byte)

> [!bug] Commit: `feat(ocr): a settings screen, and a size limit a byte count cannot give`

### 🧠 Model yang berpikir dulu tidak lagi menjawab kosong

Setiap permintaan ke model dikirim dengan `max_tokens: 4096` yang ditulis tetap di
kode. Untuk model yang punya fase berpikir, jatah itu habis dipakai **berpikir**
sebelum satu huruf jawaban ditulis. Modelnya lalu mengembalikan teks kosong dengan
`finish_reason: "length"`, dan gelembung agen tampil kosong tanpa penjelasan. Itu
terbaca seperti model yang tidak punya jawaban, padahal jatahnya yang habis.

Angka nyatanya dari pemanggilan GLM-5.3 sungguhan: **11938 token terpakai untuk
berpikir** sebelum sampai ke jawaban, pada pertanyaan satu baris. Batas lama hanya
sepertiga dari itu.

| Model | `max_tokens` | Hasil |
| --- | --- | --- |
| Punya fase berpikir | 32768 | Cukup untuk berpikir lalu menjawab |
| Tanpa fase berpikir | 4096 | Tidak berubah, sama seperti sebelumnya |

Selain itu, fase berpikir GLM bisa dimatikan lewat `thinking: {type:"disabled"}`.
Pengaruhnya besar: **92 detik menjadi 3 detik** pada pertanyaan yang sama.

> [!warning] Batas yang disengaja
> Flag `thinking` hanya dikirim ke keluarga GLM, satu-satunya yang diuji. Keluarga
> lain (`o1`, `o3`, `-reason`) memakai parameter berbeda dan menjawab HTTP 400 untuk
> field yang tidak dikenal, jadi menebak di sini akan merusak provider yang sudah
> jalan demi mempercepat satu provider. Ada 7 tes yang mengunci batas ini.

Kalau model tetap kehabisan jatah, gelembungnya sekarang menjelaskan diri alih-alih
kosong:

> `[model kehabisan jatah token saat berpikir dan tidak sempat menjawab. Coba lagi, atau pilih model tanpa mode berpikir.]`

> [!bug] Commit: `feat(ocr): a settings screen, and a size limit a byte count cannot give`

### 🔎 Pencarian akhirnya menemukan sumber, bukan hanya ensiklopedia

Pertanyaan `@Sinta` tentang dasar hukum PPh 21 dijawab dengan "pencarian saya tidak
mengembalikan hasil yang bisa saya pakai". Kalimat itu benar. Yang salah adalah
sebabnya: Sinta menyimpulkan dirinya tidak punya alat pencarian, padahal alatnya
dijalankan dua kali untuknya. Hasilnya yang nihil.

#### Tiga sebab, dan ketiganya nyata

| Sebab | Bukti |
| --- | --- |
| Hanya Wikipedia **Inggris** yang dicari | `webSearch.ts` memakai `en.wikipedia.org` untuk kueri berbahasa Indonesia |
| Hasil tidak relevan tetap dianggap hasil | Tiga artikel muncul (seorang jenderal, istilah pengadaan, perpajakan Belanda) dan tidak satu pun tentang PPh 21 |
| Lapisan browser tidak pernah dipanggil | Pemicunya "hasil kosong", padahal hasilnya tidak kosong, hanya tidak berguna |

Sehingga agen menerima: bukan konteks, dan bukan pula keterangan bahwa pencariannya
gagal. Agen lalu mengisi kekosongan itu dengan sebab yang paling masuk akal baginya,
yaitu tidak punya alat.

#### Yang berubah

**Wikipedia kini dua bahasa.** `id.wikipedia` punya artikel perpajakan Indonesia yang
tidak ada di `en.wikipedia`. Kueri berbahasa Indonesia sebelumnya mencari di tempat
yang salah.

**Pencarian lewat browser sungguhan, sebagai lapisan ketiga.** Chrome yang sudah ada
di mesin dipakai lewat Playwright untuk membuka halaman hasil yang butuh JavaScript.
Dinyalakan dengan `VMA_BROWSER_SEARCH=1`, mati secara default karena biayanya detik
per kueri.

**Mesinnya dipilih dari pengukuran, bukan selera.** Kueri uji: "PMK 168 tahun 2023
PPh 21".

| Mesin | Waktu | Hasil | Tantangan |
| --- | --- | --- | --- |
| **ecosia** | 2,6s | 21 tautan | tidak ada |
| **brave** | 9,6s | 17 tautan | tidak ada |
| bing | 0,9s | 0 | hasil tidak ada di DOM |
| startpage | 10,1s | 0 | hasil tidak ada di DOM |
| mojeek | 11,4s | 0 | hasil tidak ada di DOM |
| duckduckgo | gagal | - | sertifikat TLS ditolak jaringan ini |
| **google** | gagal | - | **CAPTCHA dalam 12,8 detik** |

Google sengaja tidak dipakai. Permintaan pertama dari koneksi rumah dijawab
`/sorry/index` dengan reCAPTCHA, jadi mesin yang gagal di percobaan pertama lebih
buruk daripada tidak ada mesin: kegagalannya tampak seperti "memang tidak ada
hasilnya".

**Halaman diperiksa isinya sebelum dipakai.** Halaman yang menjawab 200 tetapi
isinya hanya navigasi bukan sumber. Ini bukan kemungkinan teoretis: salah URL di
`pajak.go.id` mengembalikan 2119 karakter navigasi tanpa sepatah pun "PPh 21", dan
versi sebelum ini akan menyerahkannya ke agen sebagai rujukan.

#### Hasil setelah diperbaiki

Kueri yang sama, `dasar hukum PPh 21 terbaru`, 4,3 detik:

```
[pajak.go.id]  PMK 168 Tahun 2023 Tentang PPh Pasal 21 TER.pdf
[pajakku.com]  perubahan tarif pemotongan TER PPh 21 terbaru
```

Dokumen resmi yang dimaksud Sinta sekarang benar-benar ditemukan, dan bukan dari
blog ringkasan.

#### Verifikasi

- 193 unit test (18 berkas), termasuk 6 tes penjaga relevansi
- Tes penjaga itu menemukan dua kelemahan nyata pada rancangan pertama: kata kunci
  `PPh` dan `21` dibuang oleh filter panjang minimum, sehingga halaman yang seluruhnya
  tentang PPh 21 justru **ditolak**; dan pelonggaran berikutnya menerima kata umum
  seperti `dan` dan `di`, sehingga halaman yang tidak berhubungan justru **diterima**
- `typecheck` dan `lint` bersih

> [!warning] Diketahui belum selesai
> Playwright memakai Chrome yang terpasang di mesin, jadi lapisan ini tidak jalan di
> container Alpine yang dipakai `Dockerfile`. Chromium untuk musl perlu dipasang
> terpisah, dan itu belum dikerjakan.



Kanan dan kiri dulunya masing-masing punya panel, dan keduanya terbuat dari bahan yang
sama sehingga terbaca sebagai satu baris yang terpotong. Yang lebih merugikan: panel
kanan mengambil lebar tetap **288px** dari area chat, di layar yang gunanya justru
membaca debat. Area baca jadi hal tersempit di halamannya sendiri.

Sekarang hanya ada satu kolom, di kiri, dengan tiga tab: **Sessions**, **Agents**, dan
**Mode**. Kedua tab dari panel kanan pindah ke sana. `SidebarRight.tsx` dihapus, bukan
disembunyikan: panel yang tetap ter-mount hanya untuk disembunyikan tetap menyisakan
border dan urutan tab-nya.

| Yang berubah | Bukti dari browser |
| --- | --- |
| Hanya satu sidebar | `aside` berjumlah 1, lebar 240px |
| Chat dapat kembali lebar panel kanan | 1344px menjadi 1583px saat sidebar dilipat |
| Tab Agents memuat isi ruangan | kontrol hapus untuk Maya, Aldo, dan Sinta terbaca |
| Tab Mode memuat daftar preset | tombol Boardroom, Supportive, Learning, War Room, Custom |
| Berpindah tab membuang isi tab sebelumnya | "Preset Mode" hilang setelah kembali ke Sessions |
| Pelipatan bisa dikendalikan keyboard | Enter melipat ke 1px, Space memulihkan ke 240px |

Tombol pelipat sebelumnya tidak punya nama yang terbaca, jadi tidak bisa dijangkau
pembaca layar maupun dicari oleh tes. Sekarang bernama, berikut focus ring.

#### Teks billing dihapus

Baris meteran token dulu diakhiri "Billing is shown by your provider, not here". Itu
penjelasan tentang apa yang **tidak** ada di layar, dan tempatnya bukan di bilah yang
mestinya menunjukkan angka. Dihapus. Angka tokennya sudah jujur dengan sendirinya:
ditulis `~` kalau hasil perkiraan, dan tooltip-nya menyebut mana yang dilaporkan
provider dan mana yang diperkirakan.

#### Peringatan model buta gambar

Pengaturan OCR membiarkan super admin memilih model apa pun dari daftar provider.
Sebagian besar tidak bisa membaca gambar, dan salah pilih tidak memunculkan galat:
modelnya menjawab santai bahwa gambar belum dilampirkan. Sekarang muncul peringatan saat
model yang dipilih tidak termasuk yang sudah diuji dengan gambar sungguhan, dan
menyebut yang sudah terbukti bisa.

> [!note] Verifikasi
> `scripts/ui-audit.sh`: **43 pemeriksaan, 0 gagal**, naik dari 38 karena tes panel
> kanan diganti dua tes baru: tab sidebar, dan pelipatan sidebar satu-satunya.
> 187 unit test, `typecheck` dan `lint` bersih, em dash 0 di 123 berkas `src`.



Ditelusuri di browser sungguhan dengan akun uji yang baru dibuat, jadi yang dinilai
adalah DOM halaman, bukan kode sumber.

| Keluhan | Yang sebenarnya terjadi |
| --- | --- |
| Masuk ke Kelola Akun lalu tidak bisa kembali | Halaman admin **tidak punya jalan kembali** sama sekali |
| Klik sesi di sidebar tidak melakukan apa pun | `setActiveSession` hanya mengubah state; halamannya tidak berpindah |
| Terjebak di layar ganti password | Halaman itu **tidak punya satu pun** tautan keluar |

#### Halaman ganti password adalah yang paling parah

Gerbang password mengarahkan **setiap** halaman ke `/change-password` selama akun
masih memegang password sementara. Halaman itu hanya punya satu tombol, "Simpan
password", dan tidak punya tautan keluar, tidak punya `router`, dan tidak punya
tombol sign out. Jadi user yang lupa atau tidak pernah menerima password
sementaranya berada di layar yang tidak bisa diselesaikan dan tidak bisa
ditinggalkan. Password yang salah hanya mencetak ulang galat, dan alamat apa pun
mengembalikannya ke formulir yang sama.

Sudah diuji langsung di browser: password sementara yang salah menghasilkan
`The current password is not correct.`, dan halaman tetap di `/change-password`.
Sekarang ada satu tautan di bawah formulir:

> Tidak ingat password sementara? **Keluar dan minta password baru**

Klik itu menghapus cookie lalu mendaratkan user di `/login`. Diuji sampai selesai:
dari `/change-password` menjadi `/login`.

#### Sidebar tidak bisa membedakan pindah sesi dari pindah halaman

Tombol sesi di sidebar memanggil `setActiveSession`, yang hanya mengubah state
toko. Di `/app` itu cukup, karena halaman merender sesi yang aktif. Di halaman
bersarang seperti `/app/admin/users` tidak: sesinya berubah diam-diam sementara
layarnya tetap, jadi tombolnya tampak mati. Sidebar dipakai bersama oleh semua
halaman di bawah `/app`, jadi ia tidak bisa tahu sendiri mana yang dimaksud.

Sekarang klik sesi juga memastikan sesinya benar-benar terlihat: kalau path bukan
`/app`, ia berpindah ke `/app`. Diuji di browser dari `/app/admin/users`: klik
"Session 1" berpindah ke `/app`.

#### Verifikasi

- 187 unit test (17 berkas), termasuk 3 tes lokasi direktori data
- Diuji di browser: login user sementara, sengaja salah password, keluar, login
  admin, buka halaman admin, klik kembali, klik sesi
- Ditemukan sambil menguji: klik "Attach files" untuk pertama kali tidak membuka
  apa pun sampai ditunggu, dan daftar sesi sempat tampil kosong padahal
  penyimpanannya sudah berisi. Keduanya belum diperbaiki.

> [!danger] Data hilang setiap kali build
> Direktori data default adalah `./data` relatif ke direktori kerja, dan build
> standalone menjalankannya dari `.next/standalone`. `next build` **menghapus**
> direktori itu sebelum menulisnya lagi, jadi setiap build menghapus semua akun dan
> kunci API yang ada di dalamnya. Terjadi sungguhan saat pengujian ini: build di
> antara dua permintaan menghapus daftar akun, dan gejalanya hanya login yang
> tiba-tiba gagal.
>
> Docker tidak terkena karena `docker-compose.yml` menyetel
> `VMA_DATA_DIR=/app/data` pada volume bernama. Yang terkena adalah menjalankan
> standalone langsung dari direktori proyek. Sekarang lokasinya diperiksa saat
> modul dimuat dan memperingatkan di log, tetapi **itu hanya peringatan**: untuk
> pengembangan, setel `VMA_DATA_DIR` ke luar `.next`.

### 👁️ Model mana yang benar-benar bisa membaca gambar

Layar pengaturan OCR membiarkan super admin memilih model apa pun dari daftar
provider. Tetapi daftar itu berisi **84 model**, dan sebagian besarnya tidak bisa
membaca gambar. Salah pilih tidak memunculkan galat yang jelas: modelnya menjawab
santai "gambar belum dilampirkan", seolah berkasnya yang gagal diunggah.

Karena itu keenam model diuji langsung dengan gambar berisi nomor invoice, total, dan
kode unik. Tolok ukurnya bukan "model menjawab", melainkan apakah ketiga nilainya
benar. Nilai itu tidak mungkin ditebak tanpa melihat gambarnya.

| Model | Hasil baca gambar | Catatan |
| --- | --- | --- |
| `deepseek/deepseek-v4-flash-vision-exp` | **3/3 benar**, 3,6 detik | Paling cepat dan paling murah dari yang lolos |
| `deepseek/deepseek-v4.1-flash` | **3/3 benar**, 2,6 detik | Nama tidak menyebut vision, tetapi bisa |
| `z-ai/glm-5.3-flashx` | **3/3 benar**, 3,1 detik | Varian flash dari GLM yang bisa gambar |
| `moonshotai/Kimi-K3` | **3/3 benar**, 5,0 detik | |
| `moonshotai/Kimi-K2.7-Code` | **3/3 benar**, 3,6 detik | |
| `zai-org/GLM-5.3` | HTTP 400 | `model features vision not support` |
| `zai-org/GLM-5.2` | 0/3 | Tidak error, tetapi gambar diabaikan diam-diam |
| `zai-org/GLM-5.1` | HTTP 405 | `does not accept image input` |
| `zai-org/GLM-5` | HTTP 400 | Menolak blok gambar |
| `deepseek/deepseek-v4-pro` | 0/3 | Mengaku tidak bisa membaca gambar |

Ada juga kontrol: tanpa gambar, dua model yang lolos menjawab **0/3** dan meminta
gambarnya diunggah. Itu membuktikan nilainya dibaca dari gambar, bukan kebetulan.

#### Tiga galat OCR sekarang bisa dibaca manusia

Route OCR menumpahkan badan galat provider apa adanya, dipotong 300 karakter. Untuk
gateway ini hasilnya JSON bertingkat yang tidak terbaca, padahal satu kalimat di
dalamnya sudah menjelaskan masalahnya. Sekarang `extractProviderError` yang dipakai,
seperti di `/api/chat`:

| Yang dikirim provider | Sebelumnya terlihat | Sekarang terlihat |
| --- | --- | --- |
| `{"error":{"message":"{\"code\":400, \"reason\":\"INVALID_REQUEST_BODY\", \"message\":\"model features vision not support\"...` | Potongan JSON bertingkat | `model features vision not support` |
| `{"error":{"message":"{\"error\":{\"message\":\"Model zai-org/GLM-5.1 does not accept image input\"...` | Potongan JSON bertingkat | `Model zai-org/GLM-5.1 does not accept image input` |

> [!warning] Diketahui belum selesai
> `scripts/e2e-authorization.sh` dan `scripts/e2e-accounts.sh` masih merah karena
> akun ujinya masih memegang password sementara, sehingga gerbang password
> mengembalikan 403 (dan id kosong membuat DELETE kena redirect 308). Itu masalah
> skrip uji, bukan aplikasi, dan belum diperbaiki.

### ↔️ Sidebar kanan bisa disembunyikan

Panel Room Agents / Mode memakai lebar tetap 288px. Di layar sempit itu diambil dari
area chat, jadi sekarang punya tombol sembunyikan sendiri di sisi kanan tab, dan
tab kecil di tepi layar untuk memunculkannya kembali.

| Pada lebar 899px | Panel | Area chat |
| --- | --- | --- |
| Terbuka | 288px | 371px |
| Disembunyikan | 1px (tinggal garis tepi) | **658px** |

Diukur di browser sungguhan, bukan dari label tombol: tesnya membaca lebar elemen
sebelum dan sesudah, karena tombol yang berubah ikon tetapi tidak mengubah tata
letak akan terlihat benar padahal tidak membebaskan ruang apa pun.

Keduanya juga diuji lewat keyboard, bukan dengan memeriksa markup: `Enter` pada
tombol sembunyikan menutup panel (288px → 1px), dan `Space` pada tombol tampilkan
membukanya kembali (1px → 288px).

> [!warning] Ponsel masih belum beres
> Pada lebar 390px, dengan **kedua** sidebar terbuka, area chat menjadi **0px** dan
> terjadi overflow horizontal. Menyembunyikan panel kanan menaikkannya ke 149px,
> tetapi belum cukup: sidebar kiri masih 240px tetap dan belum punya mode ponsel.
> Perbaikan yang benar adalah drawer dengan backdrop, dan itu belum dikerjakan.

> [!bug] Commit: `feat(layout): let the room panel be hidden`

---

## 2026-09-29

### 🧪 Uji pakai sungguhan dengan DeepSeek, dan tiga temuan

Aplikasi dijalankan seperti dipakai orang: provider DeepSeek dipasang, tiga agen
diarahkan ke modelnya lewat layar **AI Models**, lalu percakapan, Deep Search, dan
unggah gambar benar-benar dijalankan.

#### Yang terbukti bekerja

| Yang diuji | Hasil |
| --- | --- |
| Percakapan | Ketiga agen menjawab lewat `deepseek-flash`, jawaban wajar dan berbahasa Indonesia |
| Deep Search | Berjalan per agen, hasil nyata dari Wikipedia, 1,5 detik |
| Baca gambar | Gambar nota dibaca persis: `Rp 87.500.000`, `ALPHA-9931`, nomor `ND-77/IX/2026` |
| Gambar sampai ke agen | Agen menjawab angka dari gambar dan mengutip nomor dokumennya |
| Tombol "ambil daftar model" | Mengembalikan `deepseek-flash`, `deepseek-v4-pro` |
| `/api/improve` | Menghormati provider yang dipasang, bukan model hardcoded |

Isi dokumen yang tersimpan juga diperiksa langsung di IndexedDB: 97 karakter
**teks hasil OCR**, bukan biner. Itu bug lama yang sudah diperbaiki, dan sekarang
terbukti sembuh dengan berkas sungguhan.

#### Tiga temuan

**1. Pertanyaan berbahasa Indonesia hanya sampai ke satu agen.**

Pemilihan agen otomatis memakai daftar kata kunci **berbahasa Inggris** yang harus
cocok di **dua sisi**: pertanyaan dan profil agen. Profil agen ditulis dalam bahasa
Inggris (`VP of Sales`, `Finance Advisor`), jadi pertanyaan Indonesia tidak pernah
berbagi kata dengan profil mana pun. Akibatnya pertanyaan seperti *"berapa
anggarannya?"* tidak cocok ke siapa pun dan ruangan menjawab dengan satu agen
seadanya, padahal produknya sendiri berbahasa Indonesia. Ini kasus umum, bukan
kasus pinggir.

Diperbaiki: kata kunci dikelompokkan per domain, dan satu domain cocok bila satu
katanya ada di profil dan satu kata lain ada di pertanyaan. Jadi kedua sisi boleh
berbeda bahasa. Diverifikasi di browser: pertanyaan anggaran yang sama sekarang
dijawab **2 agen** (Sales dan Finance) dengan jawaban panjang, sebelumnya 1 agen.

**2. `/api/chat` tidak punya batas waktu sama sekali.**

Panggilan ke provider di rute ini tidak memakai timeout, padahal semua panggilan
keluar lain punya (OCR 120 detik, pencarian web 15 sampai 20 detik). Provider yang
menerima koneksi lalu diam akan membuat agen berputar tanpa henti, tanpa penjelasan
di layar, dan jalan keluarnya hanya tombol Stop.

Diperbaiki dengan batas **2 menit tanpa data masuk**, bukan 2 menit total: model
reasoning bisa berpikir lama sebelum token pertama, jadi tenggat tetap akan memotong
jawaban yang sedang berjalan baik. Timer direset setiap potongan data. Bila benar
benar macet, jawaban ditutup dengan catatan bahwa koneksi terputus, karena jawaban
terpotong yang terlihat utuh lebih buruk daripada yang mengaku terpotong.

**3. Beberapa tab saling menimpa sesi.**

Seluruh keadaan sesi disimpan di `localStorage` tanpa sinkronisasi antar-tab: tidak
ada listener `storage`, dan setiap tab menulis **seluruh daftar** sesi dari salinan
di memorinya sendiri. Tab yang salinannya sudah usang akan menimpa tulisan tab lain.

Terbukti saat pengujian: setelah satu tab membuat dan memakai sebuah sesi,
`vma-active-session` ternyata menunjuk ke sesi milik tab lain, sehingga memuat ulang
halaman akan memindahkan pengguna ke sesi berbeda. Dua sesi juga sempat dibuat dengan
nama sama dari dua tab.

> [!warning] Belum diperbaiki
> Yang ini belum saya perbaiki karena pilihan desainnya perlu keputusan pemilik
> produk: sinkronisasi lewat `storage` event dan tulis per sesi, atau pindah ke
> penyimpanan sisi server. Perbaikan setengah jalan berisiko menambah kehilangan
> data, bukan mengurangi.

#### Perbaikan lain dari uji ini

- **DeepSeek jadi provider bawaan.** Sebelumnya harus ditambah manual, padahal
  modelnya bukan nama yang dipakai di situsnya: API menolak `DeepSeek-V4-Flash`
  dengan 400 dan hanya menerima `deepseek-flash`, `deepseek-v4-pro`. Daftar bawaan
  kini memuat id yang benar, dengan catatan bahwa `deepseek-flash` bisa membaca gambar.

#### Catatan komponen mati

`SubAgentSpawner`, `TaskScheduler`, dan `KnowledgePanel` tidak dirender di mana pun,
memanggil `PYTHON_BACKEND` yang belum ada, dan menyimpan model hardcoded (`gpt-4o`).
Bukan bug aktif, tapi sisa rencana backend Python.

#### Verifikasi

- 177 unit test (15 berkas), termasuk 12 tes baru untuk pemilihan agen
- Dijalankan di browser sungguhan terhadap DeepSeek dengan kunci nyata

> [!bug] Commit: `fix(chat): route Indonesian questions properly and stop a stalled provider hanging`

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

## 2026-09-28 (lanjutan): Akun, peran, dan kunci API

> [!note] Kenapa ini diubah
> Sebelumnya seluruh aplikasi hanya punya **satu** kredensial, diambil dari
> variabel lingkungan. Tidak ada cara menambah orang lain, dan karena kunci API
> ikut dikirim ke browser, siapa pun yang bisa membuka aplikasi juga bisa membaca
> kuncinya lewat DevTools.

### Akun dan peran

Dua peran: **admin** dan **user**.

- Admin membuat akun, mengganti password, menghapus akun. Halaman `/app/admin/users`.
- Saat akun dibuat, server membuat password acak dan **menampilkannya sekali saja**.
  Yang tersimpan hanya hash-nya, jadi password itu tidak bisa dilihat lagi.
- Akun baru **wajib** mengganti password saat login pertama. Selama belum diganti,
  proxy mengalihkan semua halaman ke `/change-password` dan semua API menjawab 403.
- Password tidak boleh dihapus sendiri; admin terakhir juga tidak boleh dihapus,
  supaya pemilik deployment tidak bisa terkunci keluar.
- Login lama tetap berlaku: kredensial dari `VMA_AUTH_EMAIL` dan
  `VMA_AUTH_PASSWORD_HASH` diserap menjadi akun admin pertama saat pertama kali
  dijalankan. Tidak ada yang perlu dilakukan saat upgrade.

### Kunci API tidak lagi dikirim ke browser

Ini perubahan yang paling penting, dan sekaligus menutup celah SSRF.

> [!warning] Sebelumnya
> Browser mengirim `providers[]` lengkap dengan `apiKey` dan `baseUrl` ke
> `/api/chat`, `/api/improve`, dan `/api/providers/models`. Server memakai nilai
> itu apa adanya, sehingga URL yang diambil server bisa diatur dari request.

> [!success] Sekarang
> Browser hanya mengirim **id provider**. Server membaca kunci dan base URL dari
> penyimpanannya sendiri.

Konsekuensinya:

- `apiKey` selalu kosong di sisi klien. UI membaca `hasKey` untuk tahu provider
  mana yang sudah diisi, dan itu bukan rahasia.
- Akun non-admin **tetap bisa berdebat** memakai kunci milik admin, tanpa pernah
  menerimanya. Ini diuji langsung di `scripts/e2e-accounts.sh`.
- Base URL tidak lagi berasal dari request, jadi tidak bisa diatur penyerang.
  Pengecekan SSRF tetap dijalankan sebelum setiap panggilan.

### Celah SSRF lewat nama service Docker (ditutup)

`checkOutboundUrl` hanya memeriksa string URL, sehingga `http://portainer:9000`
lolos: sebagai string itu hostname biasa, tetapi di dalam jaringan container ia
mengarah ke alamat privat.

`checkOutboundUrlDeep` sekarang melakukan **resolusi DNS lebih dulu**, lalu menilai
alamat hasilnya. Setiap alamat diperiksa, bukan hanya yang pertama, dan nama yang
tidak bisa diresolusi ditolak (fail closed).

### Workspace terpisah per akun

- Provider (berisi kunci) disimpan sekali untuk deployment, di `shared.json`.
- Agen, sesi, dan pesan disimpan per akun, di `workspace-<id>.json`.

Karena file-nya terpisah, akun baru mulai dari kosong dan tidak pernah melihat
percakapan akun lain bahkan di browser yang sama. Server juga mengirim koleksi
kosong secara eksplisit (`sessions: []`), sebab nilai yang tidak dikirim berarti
"biarkan yang ada" di sisi klien.

Seluruh file dienkripsi AES-256-GCM dengan `VMA_CONFIG_KEY`, ditulis secara
atomik, dan bermode 600.

### Tutorial login pertama

Panduan singkat muncul otomatis saat akun pertama kali membuka aplikasi, dan bisa
dibuka lagi lewat menu **Panduan**. Status "sudah dilihat" disimpan di server,
sehingga panduan muncul juga di perangkat yang belum pernah dipakai akun itu.

### Role Lock dihapus

Tombol Role Lock dihapus dari pengaturan sesi, dari tipe `SessionSettings`, dan
dari `useChat`. Fitur ini tidak punya perilaku yang jelas dan membingungkan.

### Verifikasi

- 124 tes unit (`npm test`).
- 38 pemeriksaan end-to-end terhadap server sungguhan (`scripts/e2e-accounts.sh`),
  termasuk bukti bahwa akun non-admin bisa memanggil provider dengan kunci admin
  tanpa pernah menerimanya, dan bahwa kunci di dalam body request diabaikan.
  Skrip ini juga dijalankan otomatis di CI.

> [!bug] Commit: `feat(auth): accounts, roles, and server-held API keys`

## 2026-09-28 (lanjutan 2): Baca PDF dan gambar (OCR)

> [!note] Kenapa dipisah dari model debat
> Membaca gambar butuh model yang menerima gambar (vision). Model teks biasa
> seperti `deepseek-chat` tidak bisa, dan kalau dipaksa akan gagal dengan pesan
> yang membingungkan. Jadi model pembaca gambar diatur terpisah.

### Siapa yang mengatur

Super admin memilih provider dan model vision di **Pengaturan OCR**. Akun lain
ikut memakai setelan itu dan **tidak bisa mengubahnya** (route menolak dengan 403),
tapi tetap bisa mengunggah berkas. Ini sama polanya dengan kunci API: yang punya
kunci adalah admin, yang memakai boleh siapa saja.

Sebelum diatur, layar unggah menampilkan "belum diatur" dan bukan error. Sebuah
gambar yang diunggah akan dijawab 409 dengan penjelasan, bukan 500.

### Dua jalur untuk PDF

| Jenis PDF | Cara dibaca | Biaya |
|---|---|---|
| Punya lapisan teks (hasil ekspor Word, dsb.) | Teksnya diekstrak langsung | Gratis, tanpa panggilan model |
| Hasil scan (hanya gambar) | Halamannya di-render jadi PNG lalu dibaca model vision | Sekali per halaman |

Keputusan ini diambil **per halaman**: dokumen campuran akan mengekstrak halaman
teks dan mengirim hanya halaman scan ke model. Mengirim semua halaman ke model
akan lebih mahal dan justru kurang akurat untuk teks yang sudah ada.

Kalau sebuah halaman scan tidak bisa dibaca, halaman itu **disebut nomornya**
(`unreadablePages`) beserta alasannya, bukan dihilangkan diam-diam.

### Batas yang dipasang

- Unggahan maksimum 12 MB
- Halaman PDF yang diproses maksimum 20 (dapat diatur, sampai 200)
- Waktu tunggu provider 2 menit per gambar
- Pembatas permintaan yang sama dengan `/api/chat`

### Bug otorisasi yang ditemukan dan diperbaiki

> [!danger] Lapis kedua tidak berfungsi
> Setiap route admin memeriksa `if (!check.user)`, tetapi `requireAdmin()`
> mengembalikan objek `user` juga untuk akun non-admin. Akibatnya pemeriksaan
> peran **tidak pernah aktif**.
>
> Proxy menutup `/api/admin/*` sehingga celah ini tidak terlihat. Tetapi
> `/api/providers/models` **tidak** berada di bawah prefix itu, dan route itulah
> yang menerima `baseUrl` dari request. Artinya akun biasa bisa menyuruh server
> mengambil URL pilihannya sendiri, termasuk `http://127.0.0.1:81` (NPM) dan
> `169.254.169.254` (metadata cloud). Persis celah SSRF yang sebelumnya dinyatakan
> sudah tertutup.

Perbaikannya: semua route memeriksa `check.error`, dan `AdminCheck.error`
didokumentasikan sebagai satu-satunya field yang boleh diperiksa. Diverifikasi
dengan `scripts/e2e-authorization.sh`, yang menjalankan akun non-admin sungguhan
dan memastikan ia menerima 403 pada keenam permukaan admin, termasuk percobaan
promosi diri jadi admin.

### Bug build yang juga ditemukan

`pdf.worker.mjs` tidak ikut ke output standalone, sehingga **setiap pembacaan PDF
gagal di produksi** dengan `Setting up fake worker failed` padahal lolos di unit
test. Ini hanya muncul saat dijalankan sungguhan.

Perbaikannya dua lapis: worker ditunjuk eksplisit lewat `GlobalWorkerOptions`, dan
`package.json`, worker, serta font standar didaftarkan di
`outputFileTracingIncludes`. Ditambah fallback path kalau `require.resolve` gagal.

Font standar juga perlu diberikan: PDF yang memakai font bawaan tanpa
menyematkannya akan menghasilkan teks yang salah kalau font penggantinya tidak
ditemukan, dan teks yang salah lebih buruk daripada gagal.

### Bug deteksi tipe gambar

Pemeriksaan `buffer.length > 12` menolak GIF valid, karena header GIF hanya 6
byte. Sekarang tiap format diperiksa sesuai panjang tanda tangannya sendiri.
Ditemukan oleh unit test, bukan oleh tinjauan manual.

### Verifikasi

- 136 unit test, termasuk ekstraksi PDF, render halaman, dan deteksi tipe gambar
- `scripts/e2e-ocr.sh`: 30 pemeriksaan terhadap server sungguhan dengan
  **provider vision tiruan** (`scripts/mock-vision-provider.mjs`) yang melaporkan
  apa yang diterimanya. Inilah yang membuktikan halaman scan benar-benar
  di-render dan dikirim sebagai gambar, bukan diam-diam dilewati.
- `scripts/e2e-authorization.sh`: 12 pemeriksaan batas peran

> [!warning] Belum diverifikasi
> Build Docker Alpine belum dijalankan; daemon Docker tidak aktif di mesin
> pengembangan. Binary musl sudah ada di `package-lock.json` sehingga `npm ci` di
> Alpine akan mengambilnya, tetapi ini perlu dipastikan saat deploy pertama.

> [!bug] Commit: `feat(ocr): read PDFs and images with a super-admin-chosen vision model`

---

## 2026-09-28 (lanjutan 3): Deep Search

> [!note] Kenapa bukan satu pencarian untuk semua
> Cara lama: satu pencarian per pertanyaan, hasilnya dibagi ke semua agen. Semua
> agen jadi melihat bahan yang sama, sehingga "debat" hanya berbeda gaya bicara.
> Sekarang **tiap agen menyusun querynya sendiri** sesuai perannya, jadi Finance
> Advisor mencari angka dan Legal Counsel mencari aturan.

### Toggle yang bisa dinyalakan dan dimatikan kapan saja

Ini syarat yang diminta, dan caranya menentukan: **toggle dibaca saat agen
berjalan, bukan saat pengiriman dimulai.**

| Kalau dibaca saat pengiriman | Kalau dibaca saat agen jalan (dipakai) |
|---|---|
| Satu kiriman punya satu keputusan | Tiap giliran punya keputusan sendiri |
| Dimatikan di tengah tidak berpengaruh sampai kiriman berikutnya | Langsung berpengaruh pada giliran berikutnya |
| Risiko state setengah jalan | Tidak ada state yang dipegang |

Yang sudah terkumpul tetap ada di percakapan sebagai pesan biasa, jadi mematikan
Deep Search **tidak menghilangkan riset yang sudah didapat**. Menyalakannya lagi
akan melengkapi sisanya.

### Alur satu giliran

1. Agen menyusun querynya sendiri (satu panggilan kecil ke model yang sama,
   `temperature` 0.2, maksimum 2 query).
2. Query dijalankan bersamaan.
3. Hasilnya ditulis ke percakapan sebagai pesan `search`, jadi terlihat apa yang
   dicari dan dari mana asalnya.
4. Hasil yang sama masuk ke konteks agen itu, dinomori `[1]`, `[2]`, dst.

Agen diminta **menyebut nomor sumbernya**, dan kalau hasilnya tidak menjawab
pertanyaan, ia diminta mengatakan itu, bukan menambal sendiri.

### Sumber pencarian

| Sumber | Butuh kunci | Untuk apa |
|---|---|---|
| Wikipedia | tidak | Latar belakang dan definisi |
| Tavily (`VMA_TAVILY_API_KEY`) | ya | Pertanyaan bisnis dan teknis |
| SearXNG (`VMA_SEARXNG_URL`) | tidak, instance sendiri | Sama, tanpa biaya per query |

> [!warning] Batas yang harus jujur disampaikan
> Wikipedia bukan mesin pencari. Percobaan nyata dengan query
> `"unit economics of SaaS startups"` mengembalikan artikel tentang **Jon McNeill**
> dan **CrowdStrike**, bukan benchmark SaaS. Itu hasil yang benar untuk pencarian
> ensiklopedia, dan hasil yang buruk untuk kebutuhan bisnis.
>
> Artinya: **tanpa Tavily atau SearXNG, Deep Search baru berguna untuk pertanyaan
> pengetahuan umum.** Untuk topik bisnis, teknis, dan berita, salah satu dari dua
> itu perlu diisi. Ini bukan kekurangan yang bisa ditutupi dengan prompt yang lebih
> baik, karena masalahnya di sumbernya.

### Pemetaan ulang dari cara lama

Kolom `webSearch` per agen masih dipertahankan untuk kompatibilitas, tetapi tidak
lagi menjadi pengendali utama:

| webSearch agen | Deep Search sesi | Yang terjadi |
|---|---|---|
| apa pun | mati | Tidak ada pencarian |
| false | hidup | Agen meneliti sendiri (fitur baru) |
| true | hidup | Ikut hasil/riset yang ada |

### Batas biaya

Satu giliran dengan Deep Search hidup menambah: 1 panggilan untuk menyusun query
(2 kalau cadangan), plus 1-3 permintaan pencarian. Karena itu:

- Default **mati**.
- Maksimum 2 query per agen per giliran (`deepSearchMaxQueries`).
- Maksimum 8 hasil digabungkan, masing-masing dipotong 320 karakter.
- Hasil per agen disimpan dalam satu pengiriman saja, dibersihkan tiap kiriman.

### Verifikasi

- 151 unit test, termasuk 15 tes khusus Deep Search
- `scripts/e2e-deep-search.sh`: 13 pemeriksaan terhadap server sungguhan,
  termasuk **tujuh kali nyalakan/matikan berturut-turut** dan memastikan state
  akhirnya sesuai yang terakhir dipilih
- Pencarian nyata ke Wikipedia dijalankan di CI, jadi route terbukti bekerja dan
  bukan sekadar terpasang

> [!bug] Commit: `feat(deep-search): per-agent research with a live toggle`

---

## Rencana Berikutnya

> [!todo] Belum dikerjakan
>
> - [ ] Ganti password Portainer dan open-webui
> - [ ] Audit kontras `ink-faint` di seluruh aplikasi
> - [ ] Backend Python untuk code interpreter, browser, knowledge panel, presentasi
> - [ ] Backup off-site (saat ini backup hanya di server yang sama)
> - [ ] Perbaiki `scripts/e2e-authorization.sh` dan `scripts/e2e-accounts.sh`: akun
>       ujinya masih memegang password sementara sehingga gerbang password menjawab
>       403, dan id akun yang kosong membuat DELETE/PATCH kena redirect 308. Merah
>       karena skripnya, bukan karena aplikasinya
> - [ ] Layar **Reading Documents** belum punya tes unit sendiri; yang ada baru
>       pemeriksaan buka/tutup di `scripts/ui-audit.sh` dan uji rantai manual
> - [ ] Mode ponsel: pada lebar 390px area chat menjadi 0px karena sidebar kiri
>       masih 240px tetap. Butuh drawer dengan backdrop, bukan sekadar
>       memperkecil sidebar
> - [ ] Keadaan sembunyi/tampil sidebar belum tersimpan: memuat ulang halaman
>       mengembalikannya ke posisi terbuka. Perlu disimpan di `localStorage`
>       seperti setelan lain, dan sebaiknya untuk kedua sidebar sekaligus
> - [ ] Kehilangan data antar-tab: `localStorage` ditulis utuh oleh setiap tab tanpa
>       sinkronisasi, sehingga tab dengan salinan usang bisa menimpa sesi dan
>       memindahkan sesi aktif. Butuh keputusan desain lebih dulu
> - [ ] Rapikan komponen mati (`SubAgentSpawner`, `TaskScheduler`, `KnowledgePanel`):
>       tidak dirender, memanggil `PYTHON_BACKEND` yang belum ada, model hardcoded

---

Terkait: [[01 Arsitektur]] · [[04 Fitur]] · [[06 Deployment]] · [[07 Keamanan]]
