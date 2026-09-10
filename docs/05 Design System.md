---
title: Design System
aliases:
  - Desain
  - Token
  - UI Spec
tags:
  - vma/desain
created: 2026-09-10
updated: 2026-09-10
---

# 🎨 Design System

> [!abstract] Prinsip
> Warna hangat tanah (earth-tone), bukan biru-ungu gradasi khas AI. Spasi lega, kepadatan sedang, tanpa glow atau glassmorphism berlebihan. Target rasa: **alat kerja premium**, bukan demo AI.

[[VMA|← Kembali ke Home]]

> [!info] Arah desain dan dial
> Arah berasal dari `PRD-UI.md`. Dial yang ditetapkan: **ENERGY 1 / RHYTHM 1 / MOTION 1**. Artinya tampilan tenang, satu focal point per layar, gerak sebatas hover dan satu fade saat mount.

---

## 1. Palet Warna

### SAND: netral utama (warm stone)
| Token | Hex | | Token | Hex |
| --- | --- | --- | --- | --- |
| `sand-50` | `#fafaf9` | | `sand-500` | `#78716c` |
| `sand-100` | `#f5f5f4` | | `sand-600` | `#57534e` |
| `sand-200` | `#e7e5e4` | | `sand-700` | `#44403c` |
| `sand-300` | `#d6d3d1` | | `sand-800` | `#292524` |
| `sand-400` | `#a8a29e` | | `sand-900` | `#1c1917` |

### CLAY: aksen hangat
| Token | Hex | | Token | Hex |
| --- | --- | --- | --- | --- |
| `clay-50` | `#fdf8f6` | | `clay-500` | `#bfa094` |
| `clay-100` | `#f2e8e5` | | `clay-600` | `#a18072` |
| `clay-200` | `#eaddd7` | | `clay-700` | `#886358` |
| `clay-300` | `#e0cec7` | | `clay-800` | `#6f4e42` |
| `clay-400` | `#d2bab0` | | `clay-900` | `#5a3e35` |

### INK: teks
| Token | Hex | Kontras di putih | Pakai untuk |
| --- | --- | --- | --- |
| `ink` | `#1a1816` | ~19:1 | Teks utama |
| `ink-light` | `#3d3833` | ~11:1 | Teks medium kuat |
| `ink-muted` | `#6b6560` | ~5.7:1 | Teks sekunder |
| `ink-faint` | `#9c9590` | ~2.9:1 | ⚠️ label, gagal WCAG AA |

> [!warning] Tentang `ink-faint`
> Kontrasnya sekitar 2.9:1, di bawah ambang WCAG AA (4.5:1) untuk teks normal. Aman hanya untuk elemen dekoratif. Untuk label yang perlu dibaca, pakai `ink-muted`. Lihat [[08 Troubleshooting]].

### SURFACE dan BORDER
| Token | Hex | Pakai untuk |
| --- | --- | --- |
| `surface` | `#ffffff` | Latar kartu dan chat |
| `surface-raised` | `#fafaf9` | Latar sidebar |
| `surface-inset` | `#f5f5f4` | Latar input dan chip |
| `surface-hover` | `#f0efed` | Baris saat hover |
| `border` | `#e7e5e4` | Garis pemisah |
| `border-strong` | `#d6d3d1` | Garis lebih tegas |

### SEMANTIC
| Token | Hex | Arti |
| --- | --- | --- |
| `sage` | `#4a7c59` | Sukses, sedang berjalan |
| `rust` | `#b45309` | Pause, peringatan |
| `slate-blue` | `#475569` | Netral ketiga |

### ACCENT
| Token | Hex | Catatan |
| --- | --- | --- |
| `accent` | `#1a1816` | Sama dengan `ink` |
| `accent-hover` | `#3d3833` | Sama dengan `ink-light` |

> [!tip] Cara membaca palet ini
> Netral (`sand`) mendominasi, `clay` muncul sebagai aksen hangat, `ink` untuk teks, dan warna semantic hanya untuk status. Tombol utama memakai `sand-800`, bukan warna cerah, supaya tetap terasa tenang.

---

## 2. Tipografi

| Elemen | Font | Ukuran | Berat |
| --- | --- | --- | --- |
| Body default | Inter | 14px | 400, line-height 1.5 |
| Judul sesi | Inter | 14px | 600 |
| Nama agent | Inter | 14px | 500 |
| Role agent | Inter | 11px | 400 |
| Timestamp | Inter | 10px | 400 |
| Label section | Inter | 10px | 600 + uppercase + tracking |
| Kode, ID, base URL | JetBrains Mono | 10-14px | 400-500 |

> [!note] Kenapa Inter dan JetBrains Mono
> Inter dipilih karena netral dan sangat terbaca di ukuran kecil, cocok untuk antarmuka padat data. JetBrains Mono dipakai khusus untuk kode, ID, dan URL agar karakter yang mirip (`l`, `1`, `I`) tetap terbedakan.

---

## 3. Radius

| Elemen | Kelas | Nilai |
| --- | --- | --- |
| Bubble pengguna | `rounded-2xl rounded-br-md` | 16px, sudut ekor 6px |
| Modal | `rounded-xl` | 12px |
| Input, tombol, baris | `rounded-md` / `rounded-lg` | 6px / 8px |
| Chip, badge | `rounded-full` | penuh |
| Avatar | `rounded-full` | penuh |

> [!info] Radius sebagai penanda hierarki
> Radius tidak seragam secara sengaja. Wadah besar (modal) paling membulat, kontrol sedang di tengah, dan elemen kecil seperti chip berbentuk penuh. Ini memberi kedalaman tanpa perlu bayangan.

---

## 4. Bayangan

| Elemen | Kelas |
| --- | --- |
| Dropdown, menu, modal | `shadow-md` |
| Tombol lipat sidebar | `shadow-sm` |
| Kenop toggle | `shadow-sm` |

> [!note] Bayangan seperlunya
> Hanya elemen yang memang melayang di atas konten yang diberi bayangan. Kartu dan panel biasa memakai garis batas, bukan bayangan.

---

## 5. Animasi

```css
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

| Kelas | Durasi | Dipakai untuk |
| --- | --- | --- |
| `.animate-fade-up` | 0.25s ease-out | Bubble pesan baru, kartu |
| `.animate-fade-in` | 0.2s ease-out | Latar modal |
| `.animate-slide-in` | 0.2s ease-out | Dropdown, menu, kartu modal |
| `.animate-pulse-dot` | 1.8s infinite | Indikator status |

> [!tip] Gerak yang punya alasan
> Setiap animasi menandai sesuatu yang baru muncul. Tidak ada animasi dekoratif yang berjalan terus-menerus, sesuai dial MOTION 1.

---

## 6. Ikon

Semua ikon adalah SVG sebaris dengan `stroke: currentColor`, lebar goresan 1.1 sampai 1.6 px, ukuran 8 sampai 18 px. Tidak ada pustaka ikon pihak ketiga.

> [!info] Ikon yang bermakna
> - **Gavel** untuk moderator
> - **Kunci** untuk API Keys
> - **Dua figur** untuk Manage Agents
> - **Kubus** untuk AI Models
> - **Pensil** untuk Agent Roles
> - **Dokumen** untuk Knowledge Base
> - **Pintu keluar** untuk Sign out

---

## 7. Aturan yang Dipegang

> [!quote] Ringkasan aturan
> - Tanpa gradien dan tanpa glow sebagai gaya bawaan
> - Tanpa glassmorphism kecuali satu dua tempat
> - Tanpa badge kapsul tanpa fungsi nyata
> - Satu focal point per layar
> - Warna dari token, tidak ada hex lepas di komponen
> - Kontras teks minimal 4.5:1

---

Terkait: `PRD-UI.md` · [[04 Fitur]] · [[07 Keamanan]]
