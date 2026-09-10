# VMA — Virtual Multi-Agent Debate
## Product Requirements Document (PRD)

> **Versi**: 1.0 — Terakhir diperbarui: Agustus 2026
> **Tujuan dokumen**: Panduan lengkap untuk membangun ulang aplikasi ini di AI/studio lain jika source code rusak atau hilang. Fokus pada **logika, tampilan, dan menu** — bukan kode.

---

## 1. Ringkasan Produk

**VMA** adalah aplikasi web di mana pengguna melempar satu pertanyaan/topik, lalu **beberapa AI agent** dengan persona dan keahlian berbeda **berdebat secara real-time** (streaming). Seorang **AI Moderator** (opsional) mengatur jalannya diskusi: memilih siapa yang bicara, menantang jawaban dangkal, mendeteksi perbedaan pendapat, dan menutup sesi dengan ringkasan terstruktur.

### Nilai Utama (USP)
| # | Nilai | Penjelasan |
|---|-------|-----------|
| 1 | **Debat multi-perspektif** | Satu pertanyaan → jawaban dari 3+ sudut pandang ahli yang beda-beda, bukan satu jawaban AI |
| 2 | **Moderator otonom** | AI yang bertugas memandu diskusi seperti moderator rapat sungguhan — bukan sekadar menjumlahkan jawaban |
| 3 | **BYOK (Bring Your Own Key)** | Pengguna pakai API key sendiri. Support OpenAI, Anthropic, OpenRouter, Ollama, dan endpoint custom |
| 4 | **Agent punya memori** | Agent ingat diskusi sebelumnya (cross-session learning) |
| 5 | **Knowledge Base per agent** | Upload dokumen → agent pakai sebagai referensi saat menjawab |
| 6 | **Anti vendor lock-in** | Semua data di browser (localStorage + IndexedDB). Tidak butuh backend/database server |

### Target Pengguna
- Product manager yang mau stress-test keputusan dari banyak sudut pandang
- Founder yang mau validasi ide bisnis ke "dewan ahli virtual"
- Tim yang butuh debat terstruktur sebelum keputusan besar
- Individu yang mau jawaban AI yang lebih dalam dari satu perspektif

### Prinsip Desain — "Anti AI Slop"
- Warna hangat tanah (earth-tone), bukan biru-ungu gradasi AI khas
- Typography bersih, spasi lega, density sedang
- Tidak ada efek glow/glassmorphism berlebihan
- Terlihat seperti tools premium (Linear/Notion vibe), bukan demo AI

---

## 2. Arsitektur Umum (Logika, Bukan Kode)

### 2.1 Cara Kerja Satu Siklus Chat
1. Pengguna mengetik pertanyaan → pesan tersimpan sebagai `user`
2. Sistem cek: **moderator aktif?**
   - **Ya** → alur Moderator (lihat 2.2)
   - **Tidak** → alur Normal (lihat 2.3)
3. Setiap agent dipanggil **paralel dengan jeda bertahap** (staggered), jawaban **streaming** token per token
4. Status sesi: `running` selama proses, `idle` setelah selesai
5. Semua pesan tersimpan otomatis (survive refresh browser)

### 2.2 Alur Moderator (3 Fase)

```
FASE 1 — Moderator MEMBUKA diskusi
  Moderator terima: pertanyaan user + daftar peserta
  Moderator panggil agent PERTAMA yang paling relevan dengan pertanyaan
  → Contoh: topik keuangan → "Aldo, sebagai finance advisor, bagaimana menurutmu...?"

FASE 2 — LOOP AGENTIK (moderator memutuskan sendiri)
  Ulangi sampai moderator memutuskan SUMMARY:
  1. Sistem bangun "transkrip kaya" (dengan metadata: kualitas jawaban, siapa belum bicara, deteksi konflik)
  2. Panggil moderator secara DIAM-DIAM (tidak tampil di chat) → minta keputusan JSON
  3. Parsing keputusan → dapat: action type + agent target + pertanyaan
  4. Moderator tampil di chat menanyakan pertanyaan itu (visible)
  5. Agent yang ditarget menjawab (streaming)
  6. Balik ke langkah 1

  BATAS LOOP (adaptif):
  - 2 agent   → maks 6 giliran
  - 3-4 agent → maks 9 giliran
  - 5+ agent  → maks 12 giliran

FASE 3 — RINGKASAN AKHIR
  Moderator terima FULL TRANSCRIPT → buat ringkasan terstruktur:
  1. Posisi masing-masing agent (pakai nama asli, 1 baris per agent)
  2. Konsensus vs perbedaan pendapat
  3. REKOMENDASI + alasan
  4. 2-3 ACTION ITEMS + pemilik (owner)
  → System message: "Discussion complete."
```

### 2.3 Alur Normal (Tanpa Moderator)
1. Sistem tentukan agent target:
   - **`@Maya`** → cuma Maya
   - **`@all`** → semua agent di room
   - **Tidak ada mention** → scoring keyword. Cari kata kunci (finance, legal, sales, dll) di pertanyaan vs keahlian agent. Yang skornya tertinggi dipanggil (maks 2)
2. Agent pertama mulai streaming langsung, agent lain mulai setelah jeda 1,5 detik (interval 500ms)
3. Setelah semua jawab → **debate round 2**: semua agent lihat jawaban temannya, lalu berdebat
4. Setelah tiap round → cek **konsensus**: tanya agent pertama "CONSENSUS or CONTINUE?" → jawaban satu kata menentukan berhenti atau lanjut

### 2.4 Streaming (Cara Kerja)
- Jawaban agent muncul **token per token** di UI (bukan nunggu selesai)
- Ada 3 level status:
  - **Belum mulai** → "thinking" (3 titik animasi)
  - **Sedang mikir** → "formulating response" / "analyzing discussion"
  - **Sedang nulis** → teks muncul live
- Jika koneksi terputus di tengah jalan → server tidak crash, stream ditutup diam-diam

---

## 3. Struktur Tampilan (Layout)

```
┌─────────────────────────────────────────────────────────────┐
│  [Left Sidebar]  │         [Main Area]          │ [Right]  │
│  w-60 (240px)    │         (flex-1)             │ w-72     │
│                  │  ┌────────────────────────┐   │ (288px)  │
│  VMA Logo        │  │  TOPBAR (h-12)        │   │          │
│  [+ New Session] │  │  • Judul sesi          │   │ TAB:     │
│  ─────────────   │  │  • [Share] [Export]    │   │ Agents / │
│  Session 1 ◄     │  ├────────────────────────┤   │ Mode     │
│  Session 2       │  │  LOOP CONTROLS (h-9)   │   │          │
│  Session 3       │  │  • Status: running/idle│   │ (konten  │
│  ...             │  ├────────────────────────┤   │  tab)    │
│                  │  │                        │   │          │
│  ─────────────   │  │       CHAT AREA        │   │          │
│  [API Keys]      │  │   (max-w 720px,        │   │          │
│  [Agents]        │  │    scroll)             │   │          │
│  [Models]        │  │                        │   │          │
│  [Roles]         │  │                        │   │          │
│  [Documents]     │  ├────────────────────────┤   │          │
│  [Token Meter]   │  │  INPUT BAR             │   │          │
└──────────────────┴──┴────────────────────────┴───┴──────────┘
```

### 3.1 Left Sidebar (w-60, bisa collapse)
| Elemen | Fungsi |
|--------|--------|
| **VMA logo** | Branding, klik = collapse sidebar |
| **+ New Session** | Buat sesi baru (nama otomatis "Session N") |
| **Daftar Session** | Tiap item: nama, agent di room, relative time. Klik = switch. Double-click = rename inline. Icon "..." = menu (duplicate, delete) |
| **API Keys** | Buka modal manajemen provider + API key |
| **Agents** | Buka modal CRUD agent |
| **Models** | Buka modal assign model per agent |
| **Roles** | Buka modal edit system prompt |
| **Documents** | Buka modal Knowledge Base |
| **Token Meter** | Estimasi token & biaya sesi aktif |

### 3.2 Main Area
| Elemen | Fungsi |
|--------|--------|
| **Topbar** | Judul sesi + tombol Share (stub) & Export (download transkrip .md) |
| **Loop Controls** | Dot status (hijau=jalan, oranye=paused, abu=idle), label "Loop running", round counter |
| **Chat Area** | Daftar pesan, max-width 720px, tengah, scroll otomatis |
| **Input Bar** | Textarea auto-resize, tombol @mention, attach file, tombol send/stop |

### 3.3 Right Sidebar (w-72) — 2 Tab
**Tab 1: Agents**
- Daftar agent yang ADA di room (dengan avatar, nama, role, model)
- Tombol kick (keluarkan dari room) / invite (undang balik)
- Tombol "+ Add Agent" → buka AgentsModal
- Link "Manage All" → buka modal kelola semua agent
- Footer: [Share Room] [Export]

**Tab 2: Mode**
- 5 kartu preset mode: Boardroom, Supportive, Learning, War Room, Custom
- Klik kartu → mode aktif + auto-adjust pengaturan (lihat tabel mode)
- Dropdown **Speed**: Slow / Normal / Fast
- Dropdown **Max Rounds**: 3 / 5 / 10 / 20 / Unlimited

---

## 4. Menu-Menu & Modal

### 4.1 Modal API Keys (manajemen provider)
- Daftar provider: **OpenAI, Anthropic, OpenRouter, Ollama, Custom**
- Tiap provider bisa expand → isi **API Key** (password field)
- **Test Connection** per provider → tombol cek, hasil "OK"/"Fail"
- **Model list** per provider: tambah/hapus model (id + nama tampilan)
- **+ Add Provider** (untuk custom): form nama, base URL, API key, model id, model name
- Provider dianggap siap jika punya apiKey

### 4.2 Modal Agents (CRUD agent)
- Daftar agent: avatar, nama, role, tombol Edit / Del
- Form **New/Edit Agent**:
  - Nama (wajib)
  - Role title (misal "VP of Sales")
  - Tone: debate / supportive / expert
  - Warna avatar (dari palette 8 warna)
  - System prompt (default template "You are X... Always answer the user's latest question directly first... Always respond in same language as user")
- Saat save: otomatis assign provider + model pertama yang tersedia

### 4.3 Modal Models (assign model per agent)
- List semua agent: avatar, nama, role
- Tiap agent: dropdown **Provider** + dropdown **Model** (dari model provider itu)
- Tampilkan warning jika provider belum ada API key

### 4.4 Modal Roles (edit system prompt)
- List semua agent: nama + role
- Textarea per agent (3 baris, live edit ke store)
- Tombol Cancel / Save

### 4.5 Modal Documents (Knowledge Base)
- Tab: **General** + tab per agent (per-agent docs)
- **Drag & drop** area upload + klik untuk browse
- List dokumen: ikon tipe file (PDF/MD/JSON/CSV/TXT), nama, size, tombol delete
- Dokumen tersimpan di IndexedDB (tahan refresh, bukan per sesi)

---

## 5. Tipe Pesan di Chat (Apa yang Bisa Muncul)

| Tipe | Tampilan |
|------|----------|
| **User** | Bubble kanan, warna netral |
| **Agent** | Avatar bulat warna agent (inisial), nama berwarna, role, timestamp. Isi = markdown. Animasi fade-up |
| **Moderator** | Avatar bulat gelap + **ikon palu sidang**, label "Moderator / Facilitator", konten dengan garis kiri (border-l) |
| **System** | Teks kecil tengah, muted. Contoh: "Moderator is facilitating this discussion.", "Discussion complete." |
| **Streaming agent** | Bubble agent yang teksnya ter-update live |
| **Typing indicator** | Avatar + nama + status italic ("thinking") + 3 titik animasi bounce |

### Format Markdown yang Didukung
- **Bold**, *italic*, `inline code`
- `#`, `##`, `###` headers
- List bullet (`-`) dan numbered (`1.`)
- Line break (newline = `<br>`)
- **TIDAK support**: table, image, link (cukup yang sederhana)


---

## 6. Mode Preset (5 Mode)

| Mode | Gaya yang Disuntikkan | Speed | Max Rounds | Deskripsi |
|------|----------------------|-------|------------|-----------|
| **Boardroom** | "Structured boardroom debate. Direct, challenge assumptions, pressure-test ideas. Short and sharp." | Normal | 2 | Default |
| **Supportive** | "Supportive collaboration. Build on others' ideas, encouraging, find common ground. Warm but honest." | Slow | 3 | Kolaboratif |
| **Learning** | "Educational discussion. Explain concepts clearly, ask clarifying questions, use examples. Patient and thorough." | Slow | 3 | Belajar |
| **War Room** | "Fast war room. Ultra-concise. Maximum 2 sentences. Speed over detail." | Fast | 1 | Cepat |
| **Custom** | (tidak ada prefix) | Normal | Unlimited | Bebas |

Saat pilih mode → sistem juga auto-set speed & max rounds (sesuai tabel), lalu tampil system message: `⚙️ Mode changed to X — deskripsi`.

---

## 7. Logika Agent (Persona & Konteks)

### 7.1 Agent Default
| Nama | Role | Warna Avatar | Kepribadian |
|------|------|-------------|-------------|
| **Maya** | VP of Sales | Hijau sage (#4a7c59) | Langsung, berani, obsesi revenue. Menantang posisi lemah. Gaya "war metaphor". |
| **Aldo** | Finance Advisor | Amber (#b45309) | Teliti, angka-dulu, konservatif. "Tunjukkan datanya." |
| **Sinta** | Legal Counsel | Slate (#475569) | Cermat, sadar risiko, fokus compliance. "Apa yang bisa salah?" |

### 7.2 Bidang Persona (bisa diedit via modal)
- **personality**: deskripsi singkat
- **communicationStyle**: gaya komunikasi
- **values**: array nilai
- **biases**: bias yang disadari
- **agreeableness** (0-1): seberapa mudah setuju
- **confidence** (0-1): kepercayaan diri
- **depth** (0-1): kedalaman jawaban
- **steelmansOthers** (bool): akui poin bagus lawan dulu sebelum membalas
- **admitsUncertainty** (bool): berani bilang "tidak tahu"
- **usesRealExamples** (bool): pakai contoh nyata
- **challengesAssumptions** (bool): pertanyakan premis

### 7.3 Cara Konteks Disuntikkan ke Prompt Agent (urutan)
1. **Mode prefix** (gaya sesuai preset)
2. **Persona block**: "YOUR PERSONALITY & STYLE" — personality, komunikasi, values, biases, flag-flag perilaku, aturan depth (simple=2-3 kalimat, kompleks=5 kalimat), aturan confidence
3. **Skills block**: daftar skill + knowledge agent (jika ada)
4. **Memory block**: 3 memori terakhir + contoh cara pakai natural ("From what I have seen with similar situations...")
5. **RAG documents**: dokumen knowledge base yang relevan (agent-specific + global), potong 3000 karakter per dokumen
6. **Instruksi**: jawab pertanyaan moderator/user, singkat, jangan sebut nama sendiri, jangan ulang poin yang sudah ada
7. **Riwayat terakhir**: 4 pesan terakhir (dipotong 250 karakter per pesan) + pesan agent lain yang sedang streaming

### 7.4 Aturan Bahasa (PENTING)
Selalu tambahkan aturan ini di semua prompt:
> "Always respond in the same language the user writes in. Indonesian stays Indonesian, English stays English."

---

## 8. Logika Moderator (Detil)

### 8.1 Dua Prompt Moderator
1. **MODERATOR_SYSTEM** — untuk tampil di chat (visible). Isinya: kapabilitas (panggil agent, route by expertise, challenge, bridge, redirect), peta keahlian agent, aturan (2-3 kalimat, jangan kasih opini sendiri, sorot ketidaksepakatan, sama bahasa dengan user)
2. **MODERATOR_DECISION** — untuk pengambilan keputusan diam-diam (invisible). Minta output JSON: `{"action":"TYPE","agents":["Nama"],"question":"...","topic":"FINANCIAL|LEGAL|SALES|CROSS"}`

### 8.2 9 Action Type Moderator
| Action | Fungsi | Siapa yang Dipanggil |
|--------|--------|---------------------|
| **FOLLOWUP** | Lanjut probing topik | 1 agent |
| **MULTI** | Pertanyaan lintas domain | 2+ agent |
| **CLARIFY** | Jawaban agent dangkal → minta detail | 1 agent |
| **CHALLENGE** | Beri counterpoint / minta bukti | 1 agent |
| **BRIDGE** | Hubungkan 2 pendapat yang bentrok | 2 agent |
| **ELABORATE** | Minta agent memperluas satu poin | 1 agent |
| **REDIRECT** | Kembalikan ke topik inti | 1 agent |
| **POLL** | Minta stance cepat semua agent (1-2 kalimat) | Semua agent |
| **SUMMARY** | Akhiri diskusi, buat ringkasan | — |

### 8.3 Routing Topik
- **FINANCIAL** (budget, ROI, cashflow, cost) → Finance Advisor
- **LEGAL** (contract, compliance, risk) → Legal Counsel
- **SALES** (customer, pipeline, market) → VP of Sales
- **CROSS-DOMAIN** → panggil beberapa agent

### 8.4 Quality Check Otomatis
- Jawaban **< 80 kata** = `[SHALLOW]` → moderator pakai **CLARIFY**
- Jawaban **> 200 kata** = `[RICH]`
- **Tidak ada bukti** → **CHALLENGE**
- **Ada kontradiksi antar agent** → **BRIDGE** atau **MULTI**
- **Off-topic** → **REDIRECT**
- **Jawaban kuat** → akui, lanjut

### 8.5 Deteksi Ketidaksepakatan (keyword pairs)
Scan semua pasangan jawaban agent untuk kata berlawanan:
```
setuju/tidak setuju, harus/tidak harus, bisa/tidak bisa,
risiko/aman, cepat/pelan, mahal/murah, lanjutkan/hentikan,
positif/negatif, setuju/tolak
```
Jika ditemukan pasangan berlawanan → tandai sebagai disagreement, kasih tahu moderator.

### 8.6 Ringkasan Akhir (Format Wajib)
1. Posisi masing-masing agent (1 baris, nama asli dari transkrip)
2. Konsensus vs ketidaksepakatan
3. REKOMENDASI + alasan
4. 2-3 ACTION ITEMS dengan pemilik
- Bahasa ringkasan = bahasa diskusi

### 8.7 Moderator Pakai Provider Apa?
- Pakai **provider pertama yang punya API key**
- Model = model pertama dari provider itu
- Moderator BUKAN salah satu room agent (entitas virtual sendiri)
- Typing indicator moderator: "analyzing discussion" / "formulating response"


---

## 9. Memori Agent (Cross-Session Learning)

### Konsep
Setelah diskusi selesai, tiap agent menyimpan **memori ringkas**:
```
Topik: "PHK vs otomasi"
Posisi: "Kombinasi, pilot AI dulu"
Terlibat dengan: "Aldo, Sinta"
```

### Saat Diskusi Berikutnya
- 3 memori terakhir disuntikkan ke prompt agent
- Agent diinstruksikan pakai secara natural:
  - Benar: "Dari pengalaman saya dengan kasus serupa..."
  - Salah: "Di diskusi sebelumnya saya bilang..." (dilarang)

### Persistensi
- Memori tersimpan di localStorage bersama data agent
- Survive refresh & restart server
- Per-agent (Maya punya memori sendiri, terpisah dari Aldo)

---

## 10. Persistensi Data (Yang Harus Survive)

| Data | Lokasi Simpan | Survive Refresh? | Catatan |
|------|--------------|------------------|---------|
| Sesi (nama, agent di room, setting) | localStorage | ✅ | Key: `vma-sessions` |
| Sesi aktif | localStorage | ✅ | Key: `vma-active-session` |
| Pesan semua sesi | localStorage | ✅ | Key: `vma-messages` |
| Agent + memori | localStorage | ✅ | Key: `vma-agents` |
| Provider + API key | localStorage | ✅ | Key: `vma-providers` |
| Dokumen Knowledge Base | IndexedDB | ✅ | DB `vma-documents` |

### Perilaku yang Harus Ada
- Buka app pertama kali → auto-create "Welcome Session" (jika belum ada sesi)
- Ganti sesi → chat yang sesuai langsung tampil
- Duplicate sesi → salin setting + agent, chat baru kosong
- Hapus sesi → hapus pesannya juga
- Rename → double-click judul di sidebar

---

## 11. Alur Pengguna (User Journey)

### First Time User
1. Buka app → muncul "Welcome Session" kosong + empty state "Start a discussion — type a question below and 3 agents will discuss it. Use @ to direct to specific agent"
2. Buka **API Keys** → isi key provider → Test Connection
3. Buka **Models** → assign model per agent
4. Ketik pertanyaan → diskusi jalan → selesai

### Sesi Debat Moderator (flow ideal)
1. User ketik: "Harusnya kita PHK 20% karyawan atau otomasi dulu?"
2. Moderator buka: "Maya, dari sisi revenue impact...?"
3. Maya menjawab (streaming)
4. Moderator diam-diam memutuskan langkah berikutnya (CLARIFY/CHALLENGE/BRIDGE/...)
5. Moderator tampil: "Aldo, Maya bilang X, tapi kamu bilang Y. Bagaimana menurutmu?"
6. Aldo menjawab... dst sampai moderator memutuskan SUMMARY
7. Moderator kasih ringkasan 4 bagian + "Discussion complete."

### User Mention
- `@Maya` → hanya Maya menjawab
- `@Aldo` → hanya Aldo
- `@all` → semua agent di room
- Tanpa mention → sistem scoring otomatis (keyword match)

### Export Transkrip
Klik Export → download file `.md` berisi seluruh percakapan sesi itu, format:
```
# [Judul Sesi]

**You:** pertanyaan

**Maya:** jawaban

> [system message]

**Moderator:** arahan
```


---

## 12. Mode Normal vs Moderator (Ringkasan Perbedaan)

| Aspek | Mode Normal | Mode Moderator |
|-------|-------------|----------------|
| Pemicu | Moderator disabled | Moderator enabled (default di sesi baru: ON) |
| Siapa atur giliran | Sistem (scoring keyword) | Moderator LLM (agentik, dinamis) |
| Jumlah agent bicara | Maks 2 (scoring) atau sesuai mention | Sesuai keputusan moderator |
| Giliran | 2-3 round tetap | Loop adaptif sampai SUMMARY |
| Ringkasan | Tidak ada (langsung selesai) | Ada ringkasan 4 bagian |
| Status message | "Consensus reached after round N" | "Moderator is facilitating..." → "Discussion complete." |

---

## 13. Error & Edge Cases yang Harus Ditangani

| Kasus | Perilaku yang Benar |
|-------|---------------------|
| Tidak ada API key | System message: "No API key configured for moderator." / "[Agent] skipped - no API key" |
| Agent tidak punya provider valid | Skip dengan pesan system |
| Provider gagal (rate limit, auth) | Pesan system: "[Agent] error: [message]" |
| User klik Stop di tengah jalan | Abort semua request aktif, status → idle |
| Client disconnect di tengah streaming | Server tutup stream diam-diam (tidak crash) |
| Sesi kosong saat buka app | Auto-create "Welcome Session" |
| Dokumen > 3000 karakter | Potong + tambah "..." |
| Pesan sangat panjang di konteks | Potong 250 karakter per pesan riwayat |
| Hydration error (SSR vs client) | Komponen pakai mounted-guard: render null sampai mounted |
| Bahasa campuran | Agent wajib ikut bahasa user (rule di semua prompt) |
| Agent menyebut agent lain tanpa @ | Moderator deteksi nama & bisa route (findAgentsInMessage) |

---

---

## 14. Peta Menu Ringkas (Cheat Sheet)

```
APPS
├─ App utama (3 kolom)
│  ├─ Left Sidebar
│  │  ├─ + New Session
│  │  ├─ Session list (klik=switch, dblclick=rename, ⋯=duplicate/delete)
│  │  ├─ API Keys → modal provider
│  │  ├─ Agents → modal CRUD agent
│  │  ├─ Models → modal assign model
│  │  ├─ Roles → modal system prompt
│  │  ├─ Documents → modal KB (IndexedDB)
│  │  └─ Token Meter
│  ├─ Main Area
│  │  ├─ Topbar (judul + Share/Export)
│  │  ├─ LoopControls (status dot + round)
│  │  ├─ ChatArea (bubble per role + streaming + typing)
│  │  └─ InputBar (@mention, attach, send/stop)
│  └─ Right Sidebar
│     ├─ Tab Agents (list room, kick/invite, add)
│     └─ Tab Mode (preset mode, speed, rounds)
```

---

## 15. Checklist "Sudah Benar" untuk Verifikasi Build Ulang

Setelah build ulang di AI lain, centang ini:

- [ ] 3 kolom layout dengan design earth-tone (bukan AI slop)
- [ ] Buat sesi, rename (dblclick), delete, duplicate, switch
- [ ] 3 agent default dengan persona lengkap
- [ ] API key + test connection berfungsi (OpenAI/Anthropic/OpenRouter/Ollama/custom)
- [ ] Agent CRUD + assign model per agent
- [ ] Upload dokumen ke KB (global + per agent)
- [ ] Chat streaming token per token
- [ ] Moderator mode: buka → loop agentik → summary 4 bagian
- [ ] Mode normal: @mention routing + debate round + konsensus check
- [ ] 5 preset mode mengubah perilaku agent + setting
- [ ] Pesan & sesi survive refresh
- [ ] Agent ingat diskusi sebelumnya (memori cross-session)
- [ ] Bahasa mengikuti user (Indonesia tetap Indonesia)
- [ ] Export transkrip .md
- [ ] Pause/stop jalan, round counter tampil
- [ ] Tidak ada hydration error di console

---

## 16. PROMPT LENGKAP (Copy-Paste Siap Pakai)

> ⚠️ **PENTING**: Ini bagian paling menentukan kualitas. Prompt di bawah harus dipakai persis — jangan diringkas.

### 16.1 MODERATOR_SYSTEM (untuk tampil di chat)
```
You are an expert meeting moderator and facilitator. You are NOT one of the participants.

CAPABILITIES: Call specific agents by name with targeted questions. Route questions to the RIGHT agent based on expertise. Challenge vague answers. Bridge conflicting points. Redirect off-topic discussions.

AGENT EXPERTISE MAP:
- Financial questions (budget, ROI, cashflow, cost): Finance Advisor
- Legal/compliance (contracts, regulations, liability): Legal Counsel
- Sales/market/customers (revenue, pipeline, growth): VP of Sales
- Complex topics spanning multiple domains: call multiple agents

RULES:
- Always address agents by name, reference their expertise
- Be concise: 2-3 sentences max
- Never give opinions — only facilitate
- Highlight disagreements explicitly
- Push for depth when answers are shallow
- Use the same language as the discussion
- When calling an agent, use their expertise: "As our finance expert..."
+ [LANG_RULE — lihat 16.4]
```

### 16.2 MODERATOR_DECISION (untuk keputusan diam-diam, output JSON)
```
You are the intelligent meeting orchestrator. You see the full transcript AND discussion state.

PHASES: OPENING (call first expert) -> EXPLORATION (route by domain) -> DEEPENING (challenge/clarify) -> RESOLUTION (decisions)

TOPIC ROUTING:
- FINANCIAL (budget, ROI, cashflow, cost): Finance Advisor
- LEGAL (contracts, compliance, risk): Legal Counsel
- SALES (customers, pipeline, market): VP of Sales
- CROSS-DOMAIN: call multiple agents

QUALITY CHECK:
- SHALLOW (< 80 words): use CLARIFY
- NO EVIDENCE: use CHALLENGE
- CONTRADICTION: use BRIDGE or MULTI
- OFF-TOPIC: use REDIRECT
- STRONG: acknowledge, move on

DISAGREEMENTS: If agent A says X and B says not-X, prioritize it with BRIDGE or CHALLENGE. After 2 rounds unresolved, present both and move on.

FOLLOW-UP MEMORY: Do NOT repeat questions. Track what is covered vs not.

TIME: > 6 rounds simple topic = SUMMARY. > 10 rounds complex = RESOLUTION. Responses getting shorter = SUMMARY.

ACTIONS: FOLLOWUP/CLARIFY/CHALLENGE/BRIDGE/ELABORATE/REDIRECT/MULTI/POLL/SUMMARY

OUTPUT: {"action":"TYPE","agents":["Name"],"question":"q","topic":"FINANCIAL|LEGAL|SALES|CROSS"}
SUMMARY: {"action":"SUMMARY"}
```

### 16.3 System Prompt Agent Default (template)
```
You are [NAMA], [ROLE] with [TANGGAL] experience. [KEPRIBADIAN SINGKAT]. Always answer the user's latest question directly and concisely first, then add [DOMAIN] perspective only if relevant. Always respond in the same language the user writes in (Indonesian stays Indonesian).
```

Contoh persis tiap agent:
- **Maya**: "You are Maya, VP of Sales with 15 years of enterprise SaaS experience. Direct and confident. You challenge weak positions and push for bold action. Frame everything in terms of revenue impact."
- **Aldo**: "You are Aldo, a meticulous Finance Advisor. Numbers-first approach. Always ask for unit economics, burn rate, and runway impact before endorsing any spend. Conservative but pragmatic."
- **Sinta**: "You are Sinta, Legal Counsel. Risk-aware and compliance-focused. Flag contractual obligations and regulatory exposure before decisions are finalized. Precise and thorough."

### 16.4 LANG_RULE (selalu ditambahkan di semua prompt)
```
IMPORTANT: Always respond in the same language the user writes in. If the user writes in Indonesian, respond in Indonesian. If in English, respond in English. Match the user language exactly.
```

### 16.5 MODE_PREFIXES (gaya per mode)
```
boardroom: "STYLE: Structured boardroom debate. Be direct, challenge assumptions, pressure-test ideas. Short and sharp."
supportive: "STYLE: Supportive collaboration. Build on others ideas, be encouraging, find common ground. Warm but honest."
learning:   "STYLE: Educational discussion. Explain concepts clearly, ask clarifying questions, use examples. Patient and thorough."
war:        "STYLE: Fast war room. Ultra-concise answers. Maximum 2 sentences. Speed over detail."
custom:     ""
```

### 16.6 Format Context yang Dikirim ke Agent (persis)
```
You are [NAMA], a participant in a multi-agent discussion room.
[MODE_PREFIX]

YOUR PERSONALITY & STYLE:
[personality]
Communication: [communicationStyle]
Values: [values joined by comma]
Known biases: [biases]
[kalau steelmansOthers → "Before countering, acknowledge good points from others."]
[kalau admitsUncertainty → "Say I do not know or data is limited when appropriate."]
[kalau usesRealExamples → "Use real company examples, case studies, concrete numbers."]
[kalau challengesAssumptions → "Question flawed premises. Ask is that really true?"]
Depth: [>0.7 → "Give thorough detailed responses with examples." | >0.4 → "Give balanced responses." | else → "Keep responses brief and focused."]
Confidence: [>0.7 → "Be assertive. State position clearly." | else → "Express uncertainty where appropriate."]
Adapt length to topic complexity. Simple = 2-3 sentences. Complex = up to 5 sentences.

YOUR SKILLS:
- [skillName]: [knowledge max 300 chars]

YOUR PAST EXPERIENCE (use naturally, do not say "in previous discussions I said..."):
- Topic: [topic max 80 chars]
  Your position: [position max 150 chars]
  You engaged with: [names]
Example: weave experience naturally. E.g. "From what I have seen with similar situations..."

REFERENCE DOCUMENTS:
--- [docName] ---
[content max 3000 chars per doc]

INSTRUCTIONS:
1. Respond to [MODERATOR ASKS / USER ASKS] below.
2. Be concise.
3. Do NOT include your name or title in response.
4. Do not repeat earlier points. Reference what others said above.
[LANG_RULE]

[MODERATOR ASKS / USER ASKS]: "[question]"
Context:
[last 4 messages, max 250 chars each]
[pesan agent lain yang sedang streaming, max 300 chars]

Respond.
```

---


---

## 17. DATA MODEL LENGKAP (Field per Field)

### 17.1 Agent
```
id          : string  — 'agent-maya' (format 'agent-xxx')
name        : string  — 'Maya'
roleTitle   : string  — 'VP of Sales'
tone        : 'debate' | 'supportive' | 'expert'
avatarColor : string  — hex, dari palette 8 warna
model       : { provider: string, modelName: string, temperature?: number }
systemPrompt: string  — prompt utama agent
persona     : AgentPersona
skills      : AgentSkill[]   — bisa kosong []
webSearch   : boolean  — default false
memory      : AgentMemory[]  — bisa kosong []
createdAt   : number  — Date.now()
updatedAt   : number
```

### 17.2 AgentPersona (default & bisa diedit)
```
personality          : string  — 'Direct, bold, revenue-obsessed...'
communicationStyle   : string  — 'Short punchy sentences...'
values               : string[] — ['revenue growth', 'speed of execution']
biases               : string  — 'Tends to overestimate market speed...'
agreeableness        : number  — 0.3 (0-1)
confidence           : number  — 0.9 (0-1)
depth                : number  — 0.6 (0-1)
steelmansOthers      : boolean — true
admitsUncertainty    : boolean — false
usesRealExamples     : boolean — true
challengesAssumptions: boolean — true
```

### 17.3 AgentSkill & AgentMemory
```
AgentSkill:
  id          : string
  name        : string
  description : string
  keywords    : string[]
  knowledge   : string   — max 300 chars (disuntikkan ke konteks)
  addedAt     : number

AgentMemory:
  id          : string
  sessionId   : string   — asal sesi
  topic       : string
  position    : string   — posisi agent
  keyPoints   : string[]
  learnedFrom : string[] — nama agent yang terlibat
  timestamp   : number
```

### 17.4 Session
```
id          : string  — 'session-xxx'
name        : string  — 'Session 1'
agentIds    : string[] — id agent di room
presetMode  : 'boardroom' | 'supportive' | 'learning' | 'war' | 'custom'
settings    : SessionSettings
status      : 'idle' | 'running' | 'paused'
currentRound: number
responseMode: 'all' | 'auto' | 'tag'
createdAt   : number
updatedAt   : number
lastMessageAt?: number

SessionSettings:
  loopSpeed        : 'slow' | 'normal' | 'fast'
  maxRounds        : number | 'unlimited'
  moderatorEnabled : boolean
  roleLock         : boolean
```

### 17.5 Message
```
id        : string  — 'msg-xxx'
sessionId : string
role      : 'user' | 'agent' | 'system' | 'moderator' | 'code' | 'browser' | 'ppt' | 'search' | 'ocr'
agentId?  : string  — wajib jika role='agent'
content   : string
metadata? : {
  model?, tokens?, cost?, duration?, round?,
  code?, language?, output?, outputImages?,
  url?, screenshot?, html?,
  pptFilename?, pptSlides?,
  searchResults?, searchQuery?, searchSource?,
  ocrText?, ocrLanguage?
}
createdAt : number
```

### 17.6 ProviderConfig & AIModel
```
ProviderConfig:
  id      : string   — 'openai', 'anthropic', 'openrouter', 'ollama', 'provider-xxx' (custom)
  name    : string   — nama tampilan
  baseUrl : string
  apiKey  : string   — kosong '' jika belum diisi
  models  : AIModel[]
  enabled : boolean

AIModel:
  id          : string  — model id asli (misal 'gpt-4o')
  name        : string  — nama tampilan
  temperature?: number
```

### 17.7 PRESET_PROVIDERS (base URL + model bawaan)
```
OpenAI:     baseUrl https://api.openai.com/v1
            models: gpt-4o, gpt-4o-mini, gpt-4-turbo, o1, o1-mini

Anthropic:  baseUrl https://api.anthropic.com
            models: claude-sonnet-4-20250514, claude-3-5-haiku-20241022, claude-3-opus-20240229

OpenRouter: baseUrl https://openrouter.ai/api/v1
            models: meta-llama/llama-3.1-405b, google/gemini-pro-1.5, mistralai/mixtral-8x22b

Ollama:     baseUrl http://localhost:11434/v1
            models: llama3, mistral
```

### 17.8 Warna Avatar (palette 8)
```
#4a7c59, #b45309, #475569, #7c3aed,
#be123c, #0e7490, #c2410c, #6d28d9
```


---

## 18. API CONTRACT & STREAMING FORMAT

### 18.1 Endpoint
`POST /api/chat` — Next.js API Route, **Node.js runtime** (bukan Edge).

### 18.2 Request Body
```json
{
  "messages": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ],
  "agent": {
    "id": "agent-maya",
    "name": "Maya",
    "systemPrompt": "You are Maya...",
    "provider": "openai",
    "modelName": "gpt-4o"
  },
  "providers": [
    { "id": "openai", "apiKey": "sk-...", "baseUrl": "https://api.openai.com/v1", "models": [] }
  ]
}
```

### 18.3 Response — Streaming Format
Content-Type: `text/plain; charset=utf-8` dengan format prefix `0:` (format Vercel AI SDK):
```
0:"Hello"
0:" world"
0:"!"
```
- Setiap chunk adalah `0:` + JSON string + newline
- Client membaca stream baris per baris, parse `0:` prefix, lalu `JSON.parse`

### 18.4 Provider Handling di Server
| Provider | Endpoint | Format |
|----------|----------|--------|
| **Anthropic** | `${baseUrl}/v1/messages` | Header: `x-api-key`, `anthropic-version: 2023-06-01`. Body: `system` terpisah, `messages` tanpa system. Stream event: `data.type === 'content_block_delta'` → `data.delta.text` |
| **OpenAI / OpenRouter / Ollama / Custom** | `${baseUrl}/chat/completions` | Header: `Authorization: Bearer`. Body: system sebagai pesan pertama. Stream: `data: [DONE]` untuk selesai, `data.choices[0].delta.content` untuk teks |

### 18.5 Error Codes
| Status | Arti |
|--------|------|
| 400 | Tidak ada API key untuk provider |
| 4xx | Error dari provider (forward status code + message) |
| 502 | Gagal konek ke provider |

### 18.6 Disconnect-Safety
- Jika client disconnect di tengah stream → server **harus tutup stream diam-diam**, JANGAN crash
- Bungkus semua loop stream dalam try/catch/finally, `finally { c.close() }`

---

## 19. DETAIL LOGIKA ROUTING & PARSING

### 19.1 getTargetAgents (routing normal mode, tanpa mention)
Urutan prioritas:
1. **`@all`** di pesan → semua room agent
2. **Mention `@Nama`** → hanya agent yang disebut
3. **Scoring keyword** (jika tidak ada mention):
   - Gabungkan `roleTitle + name + systemPrompt` agent → lowercase
   - Hitung skor: untuk tiap keyword di bawah, jika ada di teks agent DAN di pertanyaan user → skor +1
   - Keywords: `finance, sales, legal, money, law, revenue, contract, invest, cost, risk, tax, hiring, marketing, budget, debt, profit, cashflow, litigation, compliance, pricing` (20 keyword)
   - Pilih: yang skor > 0 → semua (max 2). Jika tidak ada skor → agent pertama

### 19.2 findAgentsInMessage (route dari teks moderator)
- Terima teks moderator + daftar room agent
- Scan tiap nama agent (case-insensitive) di teks → jika ketemu, tambahkan ke target
- Juga detect `@Nama`
- **Gunakan untuk**: mencari agent target dari teks moderator setelah callMod (karena moderator bisa menambahkan nama agent lain di teks follow-up-nya)

### 19.3 extractAgentTags (agent-to-agent @mention)
- Regex `@(\w+)` di teks jawaban agent
- Cocokkan nama dengan room agent (case-insensitive)
- Kembalikan nama unik yang ketemu
- **Gunakan untuk**: jika agent men-tag agent lain (misal "setuju dengan @Aldo"), moderator bisa route ke agent yang di-tag

### 19.4 parseDecision (parse output moderator)
**Format JSON (utama):**
```json
{"action":"FOLLOWUP","agents":["Maya"],"question":"...","topic":"FINANCIAL"}
```
- Regex ambil `{...}` pertama → JSON.parse
- action lowercase → mapping ke tipe
- Jika `action === 'summary'` → selesai
- `agents` bisa array atau object `{agent: "Nama"}` (dukung keduanya)

**Format legacy (fallback jika JSON gagal):**
```
ACTION: FOLLOWUP
AGENT: Maya
QUESTION: ...
```
- Parse regex: `ACTION:\s*(SUMMARY|FOLLOWUP)`, `AGENT:\s*(.+)`, `QUESTION:\s*(.+)`
- Jika tidak cocok format → default `summary`

### 19.5 buildTranscript (transkrip kaya untuk moderator)
Yang harus dihitung & disertakan:
1. **Phase**: EXPLORATION / DEEPENING / RESOLUTION (berdasarkan followUpCount)
2. **Belum bicara**: daftar agent yang belum merespons (dari pesan setelah user terakhir)
3. **Kualitas**: tiap jawaban diberi tag `[SHALLOW]` (< 80 kata), `[RICH]` (> 200 kata), atau kosong. Potong isi 500 karakter
4. **Disagreement pairs**: scan keyword berlawanan di pasangan jawaban (lihat 8.5)
5. **Agent relationships**: siapa menyebut siapa (scan nama agent di teks jawaban)
6. **Topic complexity**: perkiraan dari panjang pertanyaan + jumlah topik domain
7. **Elapsed time**: menit sejak user terakhir kirim
8. **followUpCount**: berapa kali moderator sudah follow-up

Semua ini dikirim ke MODERATOR_DECISION supaya keputusannya kontekstual.

---

## 20. KONFIGURASI BUILD

### 20.1 Scripts (package.json)
```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  }
}
```

### 20.2 next.config.ts
```typescript
const nextConfig: NextConfig = {
  allowedDevOrigins: ['192.168.101.94', 'localhost'],
}
```

### 20.3 Hydration Safety (WAJIB di semua komponen client yang baca store)
Semua store: load dari localStorage HANYA di client (`typeof window === 'undefined'` → return default).

Semua komponen yang render data dari store: pakai mounted-guard:
```
const [mounted, setMounted] = useState(false)
useEffect(() => { setMounted(true) }, [])
if (!mounted) return null   // render null dulu, lalu render isi
```

### 20.4 Auto-Create Session
Di halaman utama: jika `sessions.length === 0` → otomatis create "Welcome Session" (guard dengan ref supaya hanya sekali).

---

*End of PRD. Selamat membangun ulang! 🚀*
