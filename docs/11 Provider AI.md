---
title: Provider AI
aliases:
  - Provider
  - 9Router
  - Base URL
  - API Key
tags:
  - vma/ops
  - vma/provider
created: 2026-09-10
updated: 2026-09-10
---

# 🔌 Provider AI

> [!abstract] Singkat
> Provider adalah endpoint tempat agent meminta jawaban. Isinya base URL, API key, dan daftar model. Semuanya diatur di modal **API Keys**.

[[VMA|← Kembali ke Home]] · [[06 Deployment]]

---

## 1. Cara Mengisi Provider

1. Buka **API Keys** di kaki sidebar kiri
2. Klik provider yang mau diisi (atau **+ Add custom provider**)
3. Isi **Base URL** dan **API key**
4. Klik **Fetch models** supaya daftar model terisi otomatis dari provider
5. Klik **Test connection** untuk memastikan benar-benar bisa dipakai

> [!tip] Kenapa pakai Fetch models
> Mengetik id model secara manual rawan salah. **Fetch models** memanggil `GET /models` di provider dan menambahkan semua model yang dilaporkan. Model yang sudah ada tidak dihapus, jadi aman ditekan berulang.
>
> Kalau provider tidak menyediakan `/models`, tambahkan manual lewat **+ add model** dengan mengisi `model-id` dan nama tampilan.

---

## 2. Provider Bawaan

| Provider | Base URL | Catatan |
| --- | --- | --- |
| OpenAI | `https://api.openai.com/v1` | |
| Anthropic | `https://api.anthropic.com` | memakai header `x-api-key` |
| OpenRouter | `https://openrouter.ai/api/v1` | | 
| Ollama | `http://localhost:11434/v1` | perlu `VMA_ALLOW_PRIVATE_BASEURL=true` |

> [!note] Provider custom dan gateway
> Gateway seperti 9Router, LiteLLM, atau vLLM memakai format OpenAI-compatible, jadi cukup ditambahkan sebagai **custom provider** dengan base URL yang berakhiran `/v1`.

---

## 3. Test Connection

Tombol ini mengirim satu pesan pendek (`"Say OK"`) lewat model **pertama** di daftar.

| Hasil | Artinya |
| --- | --- |
| **Connection OK** | Provider, key, dan model pertama berfungsi |
| **Failed** diikuti alasan | Ada yang salah, dan alasannya ditampilkan |

> [!important] Baca alasannya, bukan hanya lulus atau gagalnya
> Pesan dari provider sering bersarang di dalam JSON, sehingga aslinya sulit dibaca. Sistem membuka sarangnya dan menampilkan kalimat yang paling dalam. Contoh nyata dari 9Router saat kredit OpenAI habis:
>
> **Sebelum** (tidak berguna):
> ```
> {"error":{"message":"[openai/gpt-4o] [429]: {\"error\":{\"message\":\"You have
> no credits remaining...\",\"code\":\"credit_balance_exhausted\"}} (reset after 2s)"}}
> ```
>
> **Sesudah**:
> ```
> Failed. You have no credits remaining. Add credits to continue using the
> API at https://platform.openai.com/settings/organization/billing/.
> ```

---

## 4. Kalau Connection Gagal

Alasan yang paling sering muncul, dan artinya:

| Pesan | Artinya | Tindakan |
| --- | --- | --- |
| `You have no credits remaining` | Saldo akun provider habis | Isi ulang di dashboard provider, atau pakai model lain |
| `No API key configured` | Key belum diisi untuk provider itu | Isi API key |
| `Base URL is not a valid URL` | Base URL salah ketik | Awali dengan `https://` |
| `Base URL points at a private or loopback address` | Alamat privat ditolak | Lihat [[07 Keamanan]] |
| `Provider returned 401` | Key salah atau kedaluwarsa | Buat key baru |
| `Provider returned 404` | Base URL atau nama model salah | Pastikan berakhiran `/v1` |
| `Provider did not respond within 20 seconds` | Provider lambat atau tidak bisa dijangkau | Coba lagi, cek status provider |
| `could not list models` | Provider tidak punya endpoint `/models` | Tambah model manual |

> [!warning] Satu provider, banyak model dengan nasib berbeda
> Kalau memakai gateway, kegagalan biasanya terjadi di **model tertentu**, bukan di provider. Pada 9Router, saat kredit OpenAI habis:
>
> | Model | Hasil |
> | --- | --- |
> | `gpt-4o` | `429`, kredit OpenAI habis |
> | `olagon/claude-opus-4-8` | `402`, butuh pembayaran |
> | `Cline-Combo` | ✅ berfungsi |
> | `for-hermes` | ✅ berfungsi |
> | `opencode-model` | ✅ berfungsi |
>
> Jadi kalau Test connection gagal, **coba model lain dulu** sebelum menyalahkan key atau base URL.

---

## 4b. Kesalahan Paling Sering: Nama Model Salah

> [!danger] Ini penyebab nomor satu "Connection failed"
> Key benar, base URL benar, tapi nama modelnya tidak dikenal provider. Hasilnya `400`, dan kalau pesannya tidak dibaca, tampak seperti masalah koneksi.

Contoh nyata yang pernah terjadi:

| Field | Nilai | Status |
| --- | --- | --- |
| Base URL | `https://api.deepseek.com` | ✅ benar |
| API key | 35 karakter `sk-...` | ✅ valid |
| Model | `Deep-seek` | ❌ **tidak dikenal** |

Provider mengatakannya sendiri:

```
The supported API model names are deepseek-flash, deepseek-v4-pro,
but you passed Deep-seek
```

### Cara menghindarinya

> [!tip] Selalu klik **Fetch models** sebelum mengetik manual
> Tombol itu membaca daftar resmi dari provider, jadi id model yang salah ketik tidak mungkin terjadi.

### Model yang sudah dikonfirmasi berfungsi

| Provider | Model |
| --- | --- |
| DeepSeek | `deepseek-chat`, `deepseek-reasoner`, `deepseek-flash`, `deepseek-v4-pro` |

> [!note] Nama model itu id teknis, bukan nama tampilan
> Yang dipakai untuk memanggil API adalah **id**, bukan nama yang ditulis di kolom "Display name". `Deep-seek` terlihat benar sebagai nama, tapi bukan id yang provider kenali. Nama boleh apa saja; **id** yang menentukan.

---

## 4c. Base URL: Kapan Perlu `/v1`

| Provider | Base URL | Catatan |
| --- | --- | --- |
| DeepSeek | `https://api.deepseek.com/v1` | Bentuk tanpa `/v1` juga jalan |
| OpenAI | `https://api.openai.com/v1` | Wajib |
| 9Router | `https://9router.yordangabriell.my.id/v1` | Wajib |
| Anthropic | `https://api.anthropic.com` | **Tanpa** `/v1`; aplikasi menambahkan sendiri |

> [!important] Aplikasi menambahkan `/chat/completions` ke base URL
> Jadi base URL harus berhenti di `/v1` atau di domain, bukan di `/v1/chat/completions`. Kalau keliru, hasilnya `404`.

---

## 5. Uji dari Luar Aplikasi

Untuk memisahkan masalah aplikasi dari masalah provider, uji langsung dengan curl:

```bash
KEY='sk-...'
BASE='https://9router.yordangabriell.my.id/v1'

# 1. Apakah key diterima dan endpoint hidup?
curl -s -H "Authorization: Bearer $KEY" "$BASE/models" | head -c 300

# 2. Apakah model tertentu bisa menjawab?
curl -s -X POST "$BASE/chat/completions" \
  -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
  -d '{"model":"gpt-4o","messages":[{"role":"user","content":"Say OK"}],"max_tokens":10}'
```

> [!tip] Cara membaca hasilnya
> - `/models` balas `401` = key ditolak
> - `/models` balas `200` = key **dan** base URL benar, jadi masalahnya ada di model
> - `/chat/completions` balas `200` = model itu siap dipakai

---

## 6. Model dan Temperature

Setelah provider terisi, pilih model per agent di modal **AI Models**.

> [!note] Temperature
> Nilai temperature diabaikan untuk reasoning model (seri `o1`, `o3`) karena model seperti itu menolak parameter tersebut.

---

Terkait: [[06 Deployment]] · [[07 Keamanan]] · [[08 Troubleshooting]]
