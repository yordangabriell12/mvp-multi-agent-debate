---
title: Fitur
aliases:
  - Features
  - Kemampuan
tags:
  - vma/produk
  - vma/fitur
created: 2026-09-10
updated: 2026-09-10
---

# ✨ Fitur

> [!abstract] Inti
> Fitur dikelompokkan jadi empat: **inti** (debat dan moderator), **konfigurasi** (agent, provider, model), **pengetahuan** (dokumen, pencarian), dan **tambahan** (kode, browser, presentasi).

[[VMA|← Kembali ke Home]]

---

## 1. Fitur Inti

### 1.1 Debat multi-agent
Satu pertanyaan, banyak sudut pandang. Agent dijalankan berjenjang dan jawabannya muncul streaming token per token.

- `@Nama` untuk mengarahkan ke satu agent
- `@all` untuk semua agent
- Tanpa tag: sistem memilih sendiri berdasarkan relevansi

Detail mekanisme: [[02 Alur Debat]]

### 1.2 Moderator otonom
AI yang memandu diskusi, bukan salah satu peserta.

- Memilih siapa bicara berikutnya
- Menantang jawaban dangkal
- Mendeteksi dan menjembatani perbedaan pendapat
- Menutup sesi dengan ringkasan terstruktur
- Bisa dimatikan per sesi lewat toggle di sidebar kanan

### 1.3 Memori dan skill agent
Tiap agent punya `memory` (catatan lintas sesi) dan `skills` (kemampuan dengan kata kunci dan basis pengetahuan), sehingga konteks bisa menumpuk antar diskusi.

---

## 2. Konfigurasi

### 2.1 Lima modal pengaturan

| Modal | Fungsi | Isi |
| --- | --- | --- |
| **API Keys** | Provider, key, model | Tambah/hapus provider, uji koneksi, atur provider moderator |
| **Manage Agents** | CRUD agent | Nama, peran, tone, warna, system prompt |
| **AI Models** | Pemetaan model | Pilih provider dan model per agent |
| **Agent Roles** | Sunting prompt | Ubah system prompt, tersimpan langsung |
| **Knowledge Base** | Dokumen | Upload per-agent atau general |

### 2.2 Uji koneksi provider
Tombol **Test connection** mengirim permintaan kecil (`"Say OK"`) ke endpoint yang dikonfigurasi, lalu menampilkan **Connection OK** atau **Connection failed**. Tombol dinonaktifkan kalau API key atau model belum diisi, dengan alasannya ditulis di sebelah tombol.

> [!tip] Auto-heal
> Kalau sebuah provider dihapus, agent yang menunjuk ke provider itu otomatis dialihkan ke provider lain yang punya API key. Tidak ada agent yang tertinggal dalam keadaan rusak.

### 2.3 Temperature per agent
Di modal **Manage Agents**, field **Temperature** (0 sampai 2, langkah 0.1) mengatur kreativitas tiap agent secara terpisah.

> [!note] Dua hal yang perlu diketahui
> - Dikosongkan berarti memakai nilai bawaan provider.
> - **Diabaikan oleh reasoning model** (seri `o1`, `o3`). Model seperti itu menolak parameter temperature, jadi sistem tidak mengirimkannya.

### 2.4 Mode dan kecepatan loop
Lima preset mode plus pengaturan manual untuk kecepatan dan batas giliran. Mengganti mode otomatis menyesuaikan kecepatan dan batas giliran, lalu mencatat perubahan sebagai pesan sistem di chat.

> [!important] Max Rounds sekarang benar-benar berfungsi
> **Max Rounds** adalah jumlah giliran **total**, termasuk giliran pembuka. Jadi:
> - `1` berarti hanya giliran pembuka, tanpa putaran tambahan
> - `3` berarti tiga giliran penuh
> - `Unlimited` tetap dibatasi 10 giliran supaya sesi yang terlupakan tidak menagih biaya terus-menerus
>
> Sebelumnya nilai ini dibatasi paksa ke 2, sehingga memilih 20 pun hanya menjalankan satu putaran tambahan.

### 2.5 Pause dan Stop
Tombol **Pause** benar-benar menghentikan langkah debat berikutnya, dan **Resume** melanjutkannya.

> [!warning] Batas otomatis
> Kalau sesi dibiarkan dalam keadaan pause, loop akan melanjutkan sendiri setelah 15 menit. Ini mencegah satu permintaan menggantung tanpa batas di server.

### 2.6 Pencarian web
Agent bisa diberi kemampuan mencari. Aktifkan lewat flag pencarian pada agent, lalu satu pencarian dijalankan per pertanyaan dan hasilnya dibagikan ke semua agent yang mengaktifkannya.

> [!note] Hemat permintaan
> Pencarian dijalankan **sekali per pertanyaan**, bukan sekali per agent. Kalau tidak ada agent yang mengaktifkan pencarian, tidak ada permintaan tambahan sama sekali. Hasilnya diambil dari API Wikipedia dan tidak butuh API key.

### 2.7 Akun, peran, dan kunci API bersama

Satu login bisa punya banyak akun, dengan dua peran:

- **Super admin** mengelola akun dan memiliki kunci API.
- **Pengguna** berdebat memakai kunci milik admin, tanpa pernah melihatnya.

Kunci API disimpan di server dan hanya dikirim ke admin. Klien non-admin menerima
flag `hasKey` saja, sehingga pemilih model tetap bisa menunjukkan provider mana
yang siap dipakai. Saat berdebat, server sendiri yang menyisipkan kunci ke
permintaan ke provider.

Kalau sebuah provider belum diisi kunci, daftar modelnya **kosong** dan bukan
error, supaya tampilannya jujur tanpa perlu dijelaskan.

Panduan singkat muncul otomatis pada login pertama, dan bisa dibuka lagi lewat
menu **Panduan**.

### 2.8 Perbaiki teks (Improve)
Tombol **Improve** menulis ulang teks dengan model yang kamu konfigurasi. Ada di dua tempat:

| Lokasi | Mode | Yang dilakukan |
| --- | --- | --- |
| Kotak chat utama | `chat` | Memperjelas pesanmu, menambah konteks yang pembaca butuhkan, tanpa menambah fakta baru |
| System prompt agent (modal Manage Agents dan Agent Roles) | `persona` | Mempertajam prompt: peran, nada, apa yang boleh dan tidak boleh dilakukan |

> [!important] Aturan yang diwarisi
> Penulis ulang memakai aturan bukti dan aturan penulisan yang sama seperti agent, jadi hasilnya tidak bisa menyelipkan angka yang tidak ada atau diisi kata terlarang.
>
> - Bahasa aslimu dipertahankan: Indonesia tetap Indonesia
> - Hanya teks hasil tulis ulang yang dikembalikan, jadi langsung menggantikan isi kolom
> - Model yang dipakai: model moderator kalau diatur, kalau tidak provider pertama yang punya API key
> - Kalau belum ada provider yang bisa dipakai, tombolnya menjelaskan alasannya, bukan gagal diam-diam

### 2.9 Angka giliran (Max Rounds) yang dapat diprediksi

> [!warning] Kenapa ini penting untuk biaya
> Loop debat memanggil **semua** agent di room pada setiap giliran. Jadi 3 agent dengan 5 giliran berarti 15 panggilan API, bukan 5.
>
> Bawaannya sekarang **1**: hanya giliran pembuka, tanpa putaran tambahan. Ini yang diharapkan dari mode Normal: tanya, dapat jawaban, selesai.
>
> Pilihan yang tersedia: `1`, `2`, `3`, `5`, `10` dengan keterangan artinya. Setiap giliran tambahan muncul sebagai pesan sistem di chat, misal "Round 2 of 3: agents respond to each other", supaya panggilan tambahan terbaca sebagai kemajuan, bukan aplikasi yang menggantung.

### 2.10 Disiplin bukti (anti halu)

Setiap prompt agent menyertakan dua blok aturan yang sama:

| Blok | Isi |
| --- | --- |
| **EVIDENCE DISCIPLINE** | Pisahkan yang diketahui dari yang disimpulkan. Dilarang mengarang angka, tanggal, nama, kutipan, atau sumber. Sebutkan apa yang perlu diukur kalau data tidak ada |
| **WRITING RULES** | Tanpa pembuka basa-basi, tanpa em dash, daftar kata terlarang, utamakan yang konkret |

> [!note] Kenapa di prompt, bukan di system prompt saja
> Model lebih sering mengabaikan aturan yang hanya ada di system prompt. Blok ini ditempel langsung ke permintaan, di kedua cabang prompt (debat dan normal), dan dipakai juga oleh penulis ulang teks.

---

## 3. Pengetahuan

### 3.1 Knowledge base per agent
Upload dokumen (PDF, MD, TXT, JSON, CSV, DOC, XLSX) ke tab **General** atau ke tab agent tertentu. Dokumen tersimpan di IndexedDB, jadi tetap ada setelah refresh.

### 3.2 Deep Search: tiap agen mencari sendiri

Toggle **Deep Search** di baris kontrol loop. Saat hidup, **setiap agen menyusun
querynya sendiri** sesuai perannya sebelum menjawab: Finance Advisor mencari
angka, Legal Counsel mencari aturan. Bukan satu pencarian yang dibagi rata.

Bisa dinyalakan dan dimatikan kapan saja, bahkan saat agen sedang bekerja.
Toggle dibaca pada saat agen berjalan, jadi:

- Menyalakan atau mematikan hanya memengaruhi giliran berikutnya.
- Riset yang sudah terkumpul **tetap ada** di percakapan; mematikannya tidak
  menghapus apa pun.
- Menyalakannya lagi akan melengkapi sisanya.

Sumber yang dipakai, dan apa yang perlu diisi:

| Sumber | Butuh kunci | Cocok untuk |
| --- | --- | --- |
| Wikipedia | tidak | Latar belakang, definisi, pengetahuan umum |
| Tavily | `VMA_TAVILY_API_KEY` | Pertanyaan bisnis, teknis |
| SearXNG | `VMA_SEARXNG_URL` | Sama, tanpa biaya per query |

> [!warning] Batas jujur
> Wikipedia bukan mesin pencari. Query seperti `"unit economics of SaaS startups"`
> mengembalikan artikel tentang perusahaan, bukan benchmark. Untuk topik bisnis
> dan berita, isi salah satu dari Tavily atau SearXNG.

Batasan biaya: maksimum 2 query per agen per giliran, maksimum 8 hasil digabung,
dan hasilnya tidak disimpan antar kiriman.

### 3.3 Baca PDF dan gambar (OCR)

Unggah PDF atau gambar, dan teks di dalamnya dibaca untuk dipakai agen. Ada dua
jalur untuk PDF, dan yang dipakai ditentukan per halaman:

| Jenis halaman | Cara dibaca | Biaya |
| --- | --- | --- |
| Punya lapisan teks | Diekstrak langsung | Gratis, tanpa panggilan model |
| Hasil scan (hanya gambar) | Di-render jadi PNG lalu dibaca model vision | Sekali per halaman |

Model pembaca gambar **dipilih super admin** di **Sidebar → Reading Documents**,
dan dipakai semua akun. Akun biasa bisa mengunggah berkas tapi tidak bisa mengubah
setelan itu, dan tidak melihat layarnya sama sekali.

Layar itu memuat empat hal:

| Setelan | Arti |
| --- | --- |
| **Provider** | Provider yang punya API key. Yang belum punya key tetap terlihat tapi tidak bisa dipilih |
| **Vision model** | Model yang membaca. Model teks biasa tidak bisa membaca gambar |
| **Pages read per PDF, at most** | Batas halaman, karena setiap halaman yang dikirim ke model berbiaya |
| **Read PDFs and images** | Sakelar utama. Selama mati, unggahan ditolak dengan penjelasan |

#### Batas ukuran gambar

Ukuran berkas saja tidak cukup untuk membatasi biaya membaca gambar. PNG, WebP, dan
GIF memampatkan data, jadi PNG 20000 × 20000 berwarna rata hanya **379 KB di disk**
tetapi **400 megapiksel** saat dibuka. Karena itu dimensi dibaca langsung dari
header (PNG, JPEG, GIF, WebP) sebelum berkas diserahkan ke apa pun yang mendekodenya.

- Batas berkas: **12 MB**
- Batas luas: **40 megapiksel**
- Gambar yang ukurannya **tidak bisa dibaca ditolak**, bukan dilewatkan, karena
  gambar yang tidak terukur justru bentuk khas bom dekompresi

> [!note] Sebelum diatur
> Layar unggah menampilkan "belum diatur" dan bukan error. PDF bertekstur teks
> tetap bisa dibaca karena tidak butuh model sama sekali.

Halaman yang gagal dibaca disebutkan nomornya, bukan dihilangkan diam-diam, supaya
kamu tahu isi mana yang belum terbaca.

---

## 4. Fitur Tambahan

> [!info] Butuh backend Python opsional
> Fitur di tabel ini memanggil backend Python di `NEXT_PUBLIC_PYTHON_BACKEND` (default `http://localhost:8000`). Kalau backend itu tidak ada, fitur ini tidak berfungsi, tetapi **debat inti tetap jalan normal**.

| Komponen | Fungsi |
| --- | --- |
| `CodeInterpreter` | Editor Python, jalankan kode, tampilkan stdout/stderr dan gambar hasil |
| `CodeBlock` | Blok kode dengan tombol salin, lipat, dan jalankan |
| `BrowserView` | Navigasi headless, tangkapan layar, ekstraksi konten |
| `HTMLPreview` | Render HTML di iframe, mode preview dan kode, layar penuh |
| `PPTViewer` | Tampilan slide dengan navigasi dan unduhan |
| `KnowledgePanel` | Panel RAG: daftar dokumen, tambah teks/URL, pencarian |
| `SubAgentSpawner` | Membuat sub-agent saat dibutuhkan |
| `ConsensusCard` | Kartu pelacak pergeseran posisi menuju konsensus |

---

## 5. Operasional Sesi

| Fitur | Cara pakai |
| --- | --- |
| **Buat sesi** | Tombol "New session" di sidebar kiri |
| **Ganti nama** | Klik dua kali nama sesi, atau menu titik tiga |
| **Duplikat / hapus** | Menu titik tiga pada item sesi |
| **Keluarkan agent** | Tombol silang saat hover di kartu agent |
| **Undang kembali** | Tombol "+ invite" di bagian "Not in room" |
| **Pause / Resume / Stop** | Baris kontrol loop di atas area chat |
| **Export** | Tombol Export di topbar, hasilnya file Markdown. Hanya ada satu, di topbar |
| **Token meter** | Perkiraan token dan biaya per sesi |
| **Sign out** | Tombol di kaki sidebar kiri |

### 5.1 Sidebar kanan bisa disembunyikan

Panel kanan (tab **Agents** dan **Mode**) memakai lebar tetap 288px. Di layar sempit
lebar itu diambil dari area chat, jadi panelnya bisa disembunyikan:

- Tombol sembunyikan ada di ujung kanan baris tab
- Saat tersembunyi, tab kecil muncul di tepi kanan layar untuk memunculkannya lagi
- Bisa dijangkau keyboard (`Tab` lalu `Enter` atau `Space`), dan punya nama untuk
  pembaca layar

> [!note] Belum tersimpan
> Keadaan sembunyi/tampil belum disimpan. Memuat ulang halaman mengembalikan panel
> ke posisi terbuka. Ini sama dengan sidebar kiri.

> [!note] Cara menghitung perkiraan token
> Kalau metadata token tersedia, dipakai. Kalau tidak, dihitung kasar sekitar 4 karakter per token, lalu biaya diperkirakan dari angka rata-rata per 1.000 token. Ini **perkiraan**, bukan tagihan resmi provider.

---

## 6. Yang Belum Ada

> [!warning] Jujur soal batasan
> - Fitur yang bergantung pada backend Python (`CodeInterpreter`, `BrowserView`, `KnowledgePanel`, `PPTViewer`, `SubAgentSpawner`) belum berfungsi di deployment saat ini karena backend-nya belum ada.
> - `PPTViewer` sekarang menampilkan slide yang dikirim bersama pesan (`metadata.pptSlides`), tetapi belum ada komponen yang memproduksi data itu.
> - Empat komponen (`ConsensusCard`, `SubAgentSpawner`, `KnowledgePanel`, `TaskScheduler`) ada di kode namun belum dipanggil dari `ChatArea`.
> - **Deep Search tanpa Tavily atau SearXNG baru berguna untuk pengetahuan umum.** Wikipedia mengembalikan artikel ensiklopedia, bukan data bisnis. Lihat 3.2.
> - **OCR belum aktif sampai super admin memilih model vision.** Model teks biasa tidak bisa membaca gambar.
> - **Headless browser belum ada.** Deep Search melakukan pencarian dan membaca kutipan dari hasilnya, tetapi belum membuka halaman untuk membaca isinya secara penuh.

> [!note] Yang sudah dihapus karena menyesatkan
> - Toggle **Chat / Code / Browse** dan tombol **Attach web page** serta **Attach knowledge** di kotak input sudah dihilangkan. Ketiganya hanya mengubah placeholder atau menampung data yang kemudian dibuang, sehingga terlihat berfungsi padahal tidak. Upload berkas tetap ada karena benar-benar tersimpan.
> - Tombol **Share** di topbar, **Share Room** di sidebar kanan, dan **Export** kedua di sidebar kanan sudah dihapus. Ketiganya tidak punya aksi sama sekali. Export transkrip tetap ada, sekarang hanya di satu tempat: topbar.

### Batas konsumsi
> [!important] Pengaman biaya di `/api/chat`
> Endpoint ini membakar biaya setiap panggilan, jadi sekarang dibatasi:
> - Maksimal **150 permintaan per 5 menit** per alamat IP (bisa diubah lewat `VMA_CHAT_MAX_REQUESTS` dan `VMA_CHAT_WINDOW_SECONDS`)
> - Ukuran body maksimal **1 MB** (bisa diubah lewat `VMA_MAX_BODY_BYTES`)
>
> Angka bawaannya sengaja longgar: satu giliran debat memanggil endpoint ini berkali-kali, jadi batas yang ketat akan mengganggu pemakaian normal. Tujuannya menahan klien yang lepas kendali, bukan membatasi pemakaian wajar.

---

Terkait: [[02 Alur Debat]] · [[05 Design System]] · [[08 Troubleshooting]]
