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
Tombol uji mengirim permintaan kecil (`"Say OK"`) ke endpoint yang dikonfigurasi, lalu menandai hasilnya berhasil atau gagal.

> [!tip] Auto-heal
> Kalau sebuah provider dihapus, agent yang menunjuk ke provider itu otomatis dialihkan ke provider lain yang punya API key. Tidak ada agent yang tertinggal dalam keadaan rusak.

### 2.3 Mode dan kecepatan loop
Lima preset mode plus pengaturan manual untuk kecepatan dan batas giliran. Mengganti mode otomatis menyesuaikan kecepatan dan batas giliran, lalu mencatat perubahan sebagai pesan sistem di chat.

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
> - Fitur bertanda butuh backend Python (`CodeInterpreter`, `BrowserView`, `KnowledgePanel`, `PPTViewer`, `SubAgentSpawner`) belum ada backend-nya di deployment saat ini.
> - Beberapa komponen (`ConsensusCard`, `SubAgentSpawner`, `KnowledgePanel`, `TaskScheduler`) ada di kode tetapi belum dipanggil dari `ChatArea`.

---

Terkait: [[02 Alur Debat]] · [[05 Design System]] · [[08 Troubleshooting]]
