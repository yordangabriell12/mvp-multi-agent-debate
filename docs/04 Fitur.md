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

### 2.7 Role Lock
Kalau **Role Lock** dinyalakan, setiap agent diminta tetap berada di dalam perannya dan menyerahkan pertanyaan di luar keahliannya kepada rekan yang tepat.

---

## 3. Pengetahuan

### 3.1 Knowledge base per agent
Upload dokumen (PDF, MD, TXT, JSON, CSV, DOC, XLSX) ke tab **General** atau ke tab agent tertentu. Dokumen tersimpan di IndexedDB, jadi tetap ada setelah refresh.

### 3.2 Pencarian Wikipedia
Endpoint `/api/search` mengambil hasil dari API Wikipedia, menampilkan judul, kutipan, dan tautan. Tidak butuh API key.

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
| **Export** | Tombol Export di topbar, hasilnya file Markdown |
| **Token meter** | Perkiraan token dan biaya per sesi |
| **Sign out** | Tombol di kaki sidebar kiri |

> [!note] Cara menghitung perkiraan token
> Kalau metadata token tersedia, dipakai. Kalau tidak, dihitung kasar sekitar 4 karakter per token, lalu biaya diperkirakan dari angka rata-rata per 1.000 token. Ini **perkiraan**, bukan tagihan resmi provider.

---

## 6. Yang Belum Ada

> [!warning] Jujur soal batasan
> - Tombol **Share Room** di sidebar kanan dan **Share** di topbar belum punya aksi. Perlu diimplementasikan atau dihapus.
> - Fitur yang bergantung pada backend Python (`CodeInterpreter`, `BrowserView`, `KnowledgePanel`, `PPTViewer`, `SubAgentSpawner`) belum berfungsi di deployment saat ini karena backend-nya belum ada.
> - `PPTViewer` sekarang menampilkan slide yang dikirim bersama pesan (`metadata.pptSlides`), tetapi belum ada komponen yang memproduksi data itu.
> - Empat komponen (`ConsensusCard`, `SubAgentSpawner`, `KnowledgePanel`, `TaskScheduler`) ada di kode namun belum dipanggil dari `ChatArea`.

> [!note] Yang sudah dihapus karena menyesatkan
> Toggle **Chat / Code / Browse** dan tombol **Attach web page** serta **Attach knowledge** di kotak input sudah dihilangkan. Ketiganya hanya mengubah placeholder atau menampung data yang kemudian dibuang, sehingga terlihat berfungsi padahal tidak. Upload berkas tetap ada karena benar-benar tersimpan.

### Batas konsumsi
> [!important] Pengaman biaya di `/api/chat`
> Endpoint ini membakar biaya setiap panggilan, jadi sekarang dibatasi:
> - Maksimal **150 permintaan per 5 menit** per alamat IP (bisa diubah lewat `VMA_CHAT_MAX_REQUESTS` dan `VMA_CHAT_WINDOW_SECONDS`)
> - Ukuran body maksimal **1 MB** (bisa diubah lewat `VMA_MAX_BODY_BYTES`)
>
> Angka bawaannya sengaja longgar: satu giliran debat memanggil endpoint ini berkali-kali, jadi batas yang ketat akan mengganggu pemakaian normal. Tujuannya menahan klien yang lepas kendali, bukan membatasi pemakaian wajar.

---

Terkait: [[02 Alur Debat]] · [[05 Design System]] · [[08 Troubleshooting]]
