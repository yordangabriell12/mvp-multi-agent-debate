# VMA — UI/UX Specification
## Design Token & Komponen Presisi

> **Tujuan**: Spesifikasi visual lengkap supaya rebuild di AI lain menghasilkan tampilan yang SAMA persis. Setiap angka (px, warna hex, font size, weight) di sini adalah nilai aktual dari aplikasi yang berjalan.
> **Versi**: 1.0 — Agustus 2026

---

## 1. Design Tokens

### 1.1 Warna (CSS Variables — harus persis)

```css
/* SAND — netral utama (warm stone) */
sand-50:   #fafaf9
sand-100:  #f5f5f4
sand-200:  #e7e5e4
sand-300:  #d6d3d1
sand-400:  #a8a29e
sand-500:  #78716c
sand-600:  #57534e
sand-700:  #44403c
sand-800:  #292524
sand-900:  #1c1917

/* CLAY — aksen hangat */
clay-50:   #fdf8f6    clay-100:  #f2e8e5
clay-200:  #eaddd7    clay-300:  #e0cec7
clay-400:  #d2bab0    clay-500:  #bfa094
clay-600:  #a18072    clay-700:  #886358
clay-800:  #6f4e42    clay-900:  #5a3e35

/* INK — text */
ink:        #1a1816   (teks utama)
ink-light:  #3d3833   (teks medium kuat)
ink-muted:  #6b6560   (teks sekunder)
ink-faint:  #9c9590   (teks samar / label)

/* SURFACE — background */
surface:        #ffffff   (kartu / chat bg)
surface-raised: #fafaf9   (sidebar bg)
surface-inset:  #f5f5f4   (input bg / chip)
surface-hover:  #f0efed   (hover row)

/* BORDER */
border:        #e7e5e4
border-strong: #d6d3d1

/* SEMANTIC */
sage:       #4a7c59   (hijau — sukses / running / avatar Maya)
sage-light: #e8f0eb
rust:       #b45309   (oranye — paused / avatar Aldo)
rust-light: #fef3c7
slate-blue:       #475569  (avatar Sinta)
slate-blue-light: #f1f5f9

/* ACCENT (primary button) */
accent:        #1a1816  (sama dengan ink)
accent-hover:  #3d3833  (sama dengan ink-light)
```

### 1.2 Tipografi
| Elemen | Font | Size | Weight |
|--------|------|------|--------|
| Body default | Inter | 14px (text-sm) | 400, line-height 1.5 |
| Judul sesi (Topbar) | Inter | 14px (text-sm) | 600 |
| Nama agent (bubble) | Inter | 14px (text-sm) | 500 |
| Role agent (bubble) | Inter | 11px (text-[11px]) | 400 |
| Timestamp | Inter | 10px (text-[10px]) | 400 |
| Label section sidebar | Inter | 10px (text-[10px]) | 600 + uppercase + tracking-wider |
| Tombol footer sidebar | Inter | 12px (text-xs) | 400 |
| Nama sesi (sidebar) | Inter | 12px (text-xs) | 500 |
| Sub info sesi | Inter | 11px (text-[11px]) | 400 |
| Isi pesan | Inter | 14px (text-sm) | 400, leading-relaxed |
| Mono (kode, id, base url) | JetBrains Mono | 10-14px | 400-500 |

### 1.3 Radius
| Elemen | Radius |
|--------|--------|
| Bubble user | `rounded-2xl rounded-br-md` |
| Modal | `rounded-xl` |
| Input, tombol, row | `rounded-md` (6px) / `rounded-lg` (8px) |
| Chip, badge | `rounded-full` |
| Avatar | `rounded-full` |
| Kartu mode | `rounded-lg` |

### 1.4 Shadow
- Dropdown/menu/modal: `shadow-md`
- Collapse button sidebar: `shadow-sm`
- Toggle switch knob: `shadow-sm`

### 1.5 Animasi (keyframes harus persis)
```css
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}                                    /* .animate-fade-up: 0.25s ease-out */
@keyframes fadeIn {
  from { opacity: 0; } to { opacity: 1; }
}                                    /* .animate-fade-in */
@keyframes slideIn {
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: translateY(0); }
}                                    /* .animate-slide-in */
@keyframes pulse-dot {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.4; }
}
```

### 1.6 Scrollbar
```css
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: sand-300; border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: sand-400; }
```

### 1.7 Selection
```css
::selection { background: clay-200; color: ink; }
```

---

## 2. Global Layout

### 2.1 Struktur 3 Kolom
```
┌────────────────────────────────────────────────────────────────────┐
│ [SidebarLeft w-60] │ [Main flex-1]                    │ [Right w-72]│
│ bg-surface-raised  │                                 │ bg-surface  │
│ border-r border    │                                 │ -raised     │
│ h-screen           │                                 │ border-l    │
│                    │  ┌────────────────────────────┐  │             │
│                    │  │ Topbar h-12 (48px)         │  │             │
│                    │  ├────────────────────────────┤  │             │
│                    │  │ LoopControls h-9 (36px)*   │  │             │
│                    │  ├────────────────────────────┤  │             │
│                    │  │ TokenMeter h-8 (32px)*     │  │             │
│                    │  ├────────────────────────────┤  │             │
│                    │  │ ChatArea flex-1 overflow-y │  │             │
│                    │  │  auto, max-w-720px tengah  │  │             │
│                    │  ├────────────────────────────┤  │             │
│                    │  │ InputBar border-t px-4     │  │             │
│                    │  │  py-3                     │  │             │
│                    │  └────────────────────────────┘  │             │
└────────────────────────────────────────────────────────────────────┘
*LoopControls & TokenMeter muncul kondisional (lihat spesifikasi masing-masing)
```

### 2.2 Urutan Vertikal Main Area
1. **Topbar** (selalu tampil)
2. **LoopControls** (hanya jika `session.currentRound > 0 || loading`)
3. **TokenMeter** (selalu tampil di bawah LoopControls)
4. **ChatArea** (flex-1, scroll)
5. **InputBar** (fixed di bawah)

---

## 3. Topbar (h-48px)

```
┌────────────────────────────────────────────────┐
│  Judul Sesi        │         [Share] [Export]  │
│  text-sm semibold  │         text-xs muted     │
└────────────────────────────────────────────────┘
```

| Properti | Nilai |
|----------|-------|
| Container | `h-12 min-h-[48px] px-5 flex items-center justify-between border-b border-border` |
| Judul | `text-sm font-semibold text-ink truncate` |
| Meta (opsional) | `text-xs text-ink-faint` (gap-3 dari judul) |
| Tombol Share/Export | `px-2.5 py-1 text-xs text-ink-muted hover:text-ink hover:bg-surface-hover rounded-md transition-colors` |

### Perilaku Export
- Generate markdown seluruh pesan sesi, download sebagai `[judul].md` (karakter non-alfanumerik diganti `_`)
- Format per tipe: `**You:** teks`, `**[Nama]:** teks`, `> teks` (system), `**Moderator:** teks`

---

## 4. LoopControls (h-36px, kondisional)

Muncul hanya jika `session.currentRound > 0 || loading`.

```
┌──────────────────────────────────────────────────────────┐
│ ●  Loop running        round 3       [Pause]  [Stop]    │
│ (dot 8px)  (text 11px)  (font-mono)   (text-xs)         │
└──────────────────────────────────────────────────────────┘
```

| Elemen | Properti |
|--------|----------|
| Container | `h-9 min-h-[36px] px-5 flex items-center gap-3 text-[11px] border-b border-border` |
| Dot running | `w-2 h-2 rounded-full bg-sage` + span ping animasi (`animate-ping absolute bg-sage opacity-75`) |
| Dot paused | `w-2 h-2 rounded-full bg-rust` |
| Dot idle | `w-2 h-2 rounded-full bg-sand-400` |
| Label status | `text-ink-muted` — "Loop running" / "Paused" / "Idle" |
| Round counter | `font-mono text-ink-faint` — `round {n}` |
| Tombol Pause/Resume | `px-2 py-0.5 rounded text-ink-muted hover:text-ink hover:bg-surface-hover` — jika paused: `text-sage`, label "Resume" |
| Tombol Stop | `px-2 py-0.5 rounded text-ink-muted hover:text-red-600 hover:bg-red-50` |

---

## 5. TokenMeter (h-32px)

```
┌──────────────────────────────────────────────────────────┐
│ ✛ 12.4k tokens │ ~$0.024                24 messages      │
│ (icon 12px)    │ (11px ink-faint)     (10px, opacity 60) │
└──────────────────────────────────────────────────────────┘
```

| Elemen | Properti |
|--------|----------|
| Container | `h-8 min-h-[32px] px-5 flex items-center gap-4 text-[11px] text-ink-faint border-b border-border` |
| Icon crosshair | `w-3 h-3` stroke currentColor |
| Pemisah | `w-px h-3 bg-border` |
| Estimasi biaya | `~$X.XXX` (3 desimal) |
| Jumlah pesan | `ml-auto text-[10px] opacity-60` — `{n} messages` |

Format token: `>1000` → `(n/1000).toFixed(1)k` contoh `12.4k`, selain itu angka biasa.


---

## 6. Chat Area & Bubbles

### 6.1 Container Chat
- `flex-1 overflow-y-auto`
- Inner: `max-w-[720px] mx-auto px-6 py-8`
- List pesan: `space-y-6`
- Auto-scroll ke bawah saat pesan baru

### 6.2 Empty State
```
┌───────────────────────────────────┐
│      ┌───────┐                    │
│      │   ✛   │  (w-12 h-12,      │
│      └───────┘   rounded-xl,      │
│                   border-border-  │
│                   strong, icon    │
│                   text-ink-muted) │
│                                   │
│  Start a discussion               │
│  (text-base font-medium text-ink) │
│                                   │
│  Type a question below and N      │
│  agents will discuss it. Use @    │
│  to direct your question to a     │
│  specific agent.                  │
│  (text-sm text-ink-muted,         │
│   max-w-xs)                       │
│                                   │
│  py-20 tengah                     │
└───────────────────────────────────┘
```

### 6.3 Bubble Agent (ChatBubble)
```
┌──────────────────────────────────────┐
│ (A)  Maya      VP of Sales   10:30   │
│  │   (14px 500   (11px faint) (10px) │
│  │    sage)                           │
│  │                                    │
│  │  [isi pesan — markdown]            │
│  │  (text-sm text-ink leading-relaxed)│
└──────────────────────────────────────┘
```

| Properti | Nilai |
|----------|-------|
| Layout | `flex gap-3 animate-fade-up` |
| Avatar | `w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0 mt-0.5` — background = `agent.avatarColor`, isi = inisial pertama nama |
| Baris nama | `flex items-baseline gap-2 mb-1` |
| Nama | `text-sm font-medium` — warna = `agent.avatarColor` |
| Role | `text-[11px] text-ink-faint` |
| Timestamp | `text-[10px] text-ink-faint` (format: h:mm AM/PM) |
| Isi | `text-sm text-ink leading-relaxed` + `dangerouslySetInnerHTML` markdown |

### 6.4 Bubble Moderator (ModeratorBubble)
```
┌──────────────────────────────────────┐
│ (🔨) Moderator  FACILITATOR  10:30   │
│  │   (14px 500 ink) (11px uppercase  │
│  │    tracking-wide faint)           │
│  │                                    │
│  │▌ [isi — markdown]                  │
│  │▌ (border-l-2 border-ink-faint/40  │
│  │▌  pl-3)                            │
└──────────────────────────────────────┘
```

| Properti | Nilai |
|----------|-------|
| Avatar | `w-8 h-8 rounded-full bg-ink` + **ikon palu sidang** SVG (13px, stroke currentColor, strokeWidth 1.6) |
| Nama | `text-sm font-medium text-ink` = "Moderator" |
| Label | `text-[11px] uppercase tracking-wide text-ink-faint` = "Facilitator" |
| Isi | `text-sm text-ink leading-relaxed border-l-2 border-ink-faint/40 pl-3` |

### 6.5 Bubble User (UserBubble)
```
┌───────────────────────────────┐
│   ┌────────────────────────┐  │
│   │  teks (right-aligned)   │  │
│   │  max-w-[75%]            │  │
│   │  bg-sand-800 text-white │  │
│   │  px-4 py-2.5 rounded-   │  │
│   │  2xl rounded-br-md      │  │
│   └────────────────────────┘  │
└───────────────────────────────┘
```
Container: `flex justify-end`. Bubble: `max-w-[75%] bg-sand-800 text-white px-4 py-2.5 rounded-2xl rounded-br-md text-sm leading-relaxed`. Tidak ada avatar, tidak ada timestamp.

### 6.6 System Message
```
         ┌──────────────────┐
         │  Moderator is    │
         │  facilitating... │
         └──────────────────┘
```
Container: `text-center py-2`. Chip: `text-xs text-ink-faint bg-surface-inset px-3 py-1 rounded-full`.

### 6.7 Typing Indicator
```
┌──────────────────────────────────────┐
│ (A)  Maya    formulating response    │
│  │   (14px 500 avatarColor) (10px    │
│  │    italic faint)                  │
│  │   ●  ●  ●  (3 dots, w-1.5 h-1.5, │
│  │          bg-ink-faint, bounce     │
│  │          delay 0/150/300ms)       │
└──────────────────────────────────────┘
```
- Avatar: sama seperti bubble agent (atau gavel untuk moderator, `icon='moderator'`)
- Status: `text-[10px] text-ink-faint italic`
- Dots: `flex items-center gap-1.5 py-1`, tiap dot `w-1.5 h-1.5 rounded-full bg-ink-faint animate-bounce` dengan `animationDelay: 0ms / 150ms / 300ms`

### 6.8 Streaming Agent (saat jawaban sedang jalan)
- Bubble agent normal tapi `content` di-update live token per token
- Key: `streaming-{agentId}`, timestamp `Date.now()` (berubah terus)

### 6.9 Markdown Renderer (persis)
```javascript
// urutan transform:
1. Escape HTML dulu (& → &amp;, < → &lt;, > → &gt;)
2. **bold** → <strong>$1</strong>
3. *italic* → <em>$1</em>
4. `code` → <code class="bg-surface-inset px-1 py-0.5 rounded text-[13px] font-mono">$1</code>
5. ### h3 → <h3 class="text-sm font-semibold text-ink mt-3 mb-1">
6. ## h2 → <h2 class="text-base font-semibold text-ink mt-4 mb-1">
7. `1. teks` → <div class="ml-4 mb-1"><span class="text-ink-muted">1.</span> teks</div>
8. `- teks` → <div class="ml-4 mb-1 before:content-['·'] before:mr-2 before:text-ink-faint">teks</div>
9. \n → <br />
```


---

## 7. InputBar

```
┌────────────────────────────────────────────────────────────┐
│ [💬Chat][🐍Code][🌐Browse]     [⬆ upload] [➤ send]     │
│  (10px pill)              (16px icon)  (w-8 h-8 rounded-lg)│
│ ┌───────────────────────────────────────────────────────┐  │
│ │ textarea auto-resize (max 120px), border-borders       │  │
│ └───────────────────────────────────────────────────────┘  │
│ @Name tag an agent · @all all respond · no tag = auto      │
└────────────────────────────────────────────────────────────┘
```

### 7.1 Container
- `border-t border-border bg-surface px-4 py-3`
- Form: `max-w-[720px] mx-auto relative`

### 7.2 Area Input
- `border border-border-strong rounded-xl bg-surface focus-within:border-ink-faint transition-colors`
- Textarea auto-resize: tinggi dinamis `min(scrollHeight, 120)px`

### 7.3 Mode Toggle Bar (di atas textarea)
- `flex items-center gap-1 px-3 pt-2`
- Tiap tombol: `px-2 py-0.5 text-[10px] rounded-full transition-colors`
- **Aktif**: `bg-ink text-white`
- **Non-aktif**: `text-ink-faint hover:bg-surface-hover`
- Label: `💬 Chat`, `🐍 Code`, `🌐 Browse`

### 7.4 Tombol Aksi (kanan)
- **Upload**: icon panah ke atas (16px), `text-ink-faint hover:text-ink-muted`
- **Send** (saat tidak loading): `w-8 h-8 rounded-lg bg-sand-800 text-white hover:bg-ink` — icon kertas pesawat (14px)
- **Stop** (saat loading): `w-8 h-8 rounded-lg bg-red-500 text-white hover:bg-red-600` — icon persegi (10px)

### 7.5 @Mention Popup
- Posisi: `absolute bottom-full left-0 mb-1 w-56 bg-surface border border-border rounded-lg shadow-md py-1 z-50 animate-slide-in`
- Trigger: saat user mengetik `@` (atau `@filter`) — popup menampilkan room agent + `@all`
- Tiap item: `w-full flex items-center gap-2.5 px-3 py-2 text-left` — avatar 20px (text-[8px]), nama (text-xs medium), role (text-[10px] faint)
- **Hover/selected**: `bg-surface-hover` (navigasi ↑↓ + Enter untuk insert)
- Insert: ganti `@...` dengan `@Nama ` (dengan spasi)
- Tutup saat klik di luar (mousedown listener)

### 7.6 Upload Area (kondisional, saat klik upload)
- `mx-3 mb-3 border-2 border-dashed border-border-strong rounded-lg p-4 text-center cursor-pointer hover:border-ink-faint`
- Icon folder 18px `text-ink-faint`
- Teks: "Drop files here or click to browse" (text-xs ink-muted)
- Sub: "PDF, MD, TXT, JSON, CSV" (text-[10px] ink-faint)
- File terpilih: chips `text-[10px] bg-surface-inset px-2 py-0.5 rounded-full text-ink-muted`
- Accept: `.pdf,.md,.txt,.json,.csv,.doc,.docx,.xlsx`

### 7.7 Hint Bar (bawah input)
```
@Name tag an agent · @all all respond · no tag = auto
```
- `flex items-center gap-2 mt-2 px-1`
- `text-[11px] text-ink-faint`
- Code chips `@Name`/`@all`: `px-1 py-0.5 bg-surface-inset rounded text-ink-muted font-mono text-[10px]`

---

## 8. Sidebar Left (w-60, collapsible)

### 8.1 Container
- `h-screen bg-surface-raised border-r border-border flex flex-col transition-all duration-300 ease-out`
- Collapsed: `w-0 min-w-0 opacity-0 pointer-events-none`

### 8.2 Header
```
┌────────────────────┐
│ [V]  VMA      ◀    │
└────────────────────┘
```
- `px-4 pt-4 pb-3 flex items-center justify-between`
- Logo: `w-6 h-6 rounded-md bg-sand-800 flex items-center justify-center` — huruf "V" `text-white text-[10px] font-bold tracking-tight`
- Nama: `text-xs font-semibold text-ink tracking-tight` = "VMA"
- Tombol collapse: `w-6 h-6 rounded text-ink-faint hover:text-ink-muted hover:bg-surface-hover` — icon chevron kiri (14px)

### 8.3 New Session Button
- `px-3 pb-2`
- `w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-ink bg-surface hover:bg-surface-hover border border-border rounded-lg transition-colors`
- Icon plus (12px, stroke 1.5), teks "New session"

### 8.4 Section Label
- `px-2 text-[10px] font-semibold uppercase tracking-wider text-ink-faint` = "Recent"

### 8.5 Session List
- Container: `flex-1 overflow-y-auto px-2`
- Empty: `px-2 py-6 text-xs text-ink-faint text-center` = "No sessions yet"

### 8.6 Footer Buttons (API Keys, Manage Agents, dll)
```
┌──────────────────────────────┐
│ 🔑  API Keys                 │
│ 👥  Manage Agents            │
│ 🧊  AI Models                │
│ ✎   Agent Roles              │
│ ──────────────────           │
│ 📄  Knowledge Base           │
└──────────────────────────────┘
```
- Container: `px-2 pb-3 border-t border-border pt-2 flex flex-col gap-0.5`
- Tiap tombol (SidebarFooterButton): `w-full flex items-center gap-2.5 px-2.5 py-1.5 text-xs text-ink-muted hover:text-ink hover:bg-surface-hover rounded-md transition-colors`
- Icon: `w-4 h-4 flex items-center justify-center opacity-50`
- Pemisah: `border-t border-border my-1`

### 8.7 Collapse Button (saat collapsed)
- `fixed left-2 top-1/2 -translate-y-1/2 z-50 w-7 h-12 bg-surface-raised border border-border rounded-lg flex items-center justify-center text-ink-faint hover:text-ink-muted hover:bg-surface-hover shadow-sm`
- Icon chevron kanan (14px)


---

## 9. SessionItem (item daftar sesi)

### 9.1 Tampilan Normal
```
┌────────────────────────────┐
│ ●  Session 1         ⋯    │   (⋯ muncul saat hover)
│    Maya, Aldo, Sinta · 2m │
└────────────────────────────┘
```
- Container: `relative group` + jika aktif `bg-surface-hover rounded-lg`
- Row utama: `w-full text-left px-2.5 py-2 rounded-lg transition-colors cursor-pointer`
- **Status dot**: `w-2 h-2 rounded-full shrink-0`
  - running → `bg-sage`
  - paused → `bg-rust`
  - idle → `bg-sand-400`
- Nama: `text-xs font-medium text-ink truncate flex-1`
- Tombol ⋯: `opacity-0 group-hover:opacity-100 w-5 h-5 rounded text-ink-faint hover:text-ink-muted hover:bg-surface-inset transition-all` — icon 3 titik (12px)
- Sub-info: `text-[11px] text-ink-faint mt-0.5 pl-4 truncate` = `{agentNames} · {relativeTime}`

### 9.2 Mode Rename (double-click)
- Input: `flex-1 text-xs font-medium text-ink bg-surface border border-border-strong rounded px-1.5 py-0.5 focus:outline-none`
- Enter = save, Escape = batal, blur = save

### 9.3 Context Menu (klik ⋯)
- `absolute right-1 top-full z-50 w-36 bg-surface border border-border rounded-lg shadow-md py-1 animate-slide-in`
- Item: Rename, Duplicate, `border-t border-border my-1` (divider), Delete (teks `text-red-600`)
- Tiap item: `w-full text-left px-3 py-1.5 text-xs text-ink hover:bg-surface-hover transition-colors`
- Tutup saat klik di luar (mousedown)

---

## 10. Sidebar Right (w-72)

### 10.1 Container
- `w-72 min-w-72 h-screen bg-surface-raised border-l border-border flex flex-col`

### 10.2 Tab Bar
- `flex border-b border-border`
- 2 tab: **agents**, **mode**
- Tiap tab: `flex-1 py-2.5 text-xs font-medium capitalize transition-colors border-b-2 -mb-px`
  - **Aktif**: `text-ink border-ink`
  - **Non-aktif**: `text-ink-muted border-transparent hover:text-ink-light`

### 10.3 AgentsTab
```
┌──────────────────────────────┐
│ ROOM AGENTS           + Add  │
│ (A) Maya  VP of Sales  gpt-4o│  (× saat hover)
│ (A) Aldo  Finance ... sonnet │
│ ───────────────────────────  │
│ NOT IN ROOM                  │
│ (A) Sinta           + invite │   (opacity-50)
│ ───────────────────────────  │
│ CONTROLS                     │
│ Moderator             [ ═ ] │   (toggle)
│ Role Lock             [ ═ ] │
└──────────────────────────────┘
```

**Room Agents list:**
- Section: `p-3 space-y-2`
- Header: `flex items-center justify-between mb-1` — label `text-[10px] font-semibold uppercase tracking-wider text-ink-faint` = "Room Agents", tombol `text-[11px] text-ink-muted hover:text-ink` = "+ Add"
- Item: `flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-surface-hover group transition-colors`
  - Avatar: `w-7 h-7 rounded-full text-[10px] font-semibold text-white` (bg avatarColor)
  - Nama: `text-xs font-medium text-ink truncate`
  - Role: `text-[11px] text-ink-faint truncate`
  - Model: `text-[10px] text-ink-faint shrink-0`
  - Kick (×): `opacity-0 group-hover:opacity-100 w-5 h-5 rounded text-ink-faint hover:text-red-600 hover:bg-red-50 transition-all shrink-0`
- Empty room: `text-xs text-ink-faint text-center py-4` = "No agents in this room"

**Not in room section:**
- `mt-4 pt-3 border-t border-border`
- Label: `text-[10px] font-semibold uppercase tracking-wider text-ink-faint block mb-2` = "Not in room"
- Item: `flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg opacity-50 hover:opacity-80 transition-opacity`
  - Avatar 20px `text-[8px]`
  - Nama `text-[11px] text-ink-muted`
  - Tombol invite: `text-[10px] text-sage hover:text-ink px-1.5 py-0.5 rounded border border-sage/30 hover:border-ink-faint transition-colors`


---

## 11. ModeTab (Right Sidebar — tab Mode)

```
┌────────────────────────────────┐
│ PRESET MODE                    │
│ ┌────────────────────────────┐ │
│ │ ◻  Boardroom          ✓   │ │  (aktif: border-sand-700 bg-surface)
│ │    Structured debate...   │ │
│ └────────────────────────────┘ │
│ ┌────────────────────────────┐ │
│ │ ○  Supportive              │ │  (non-aktif: border-border)
│ │    Collaborative...        │ │
│ └────────────────────────────┘ │
│ ┌────────────────────────────┐ │
│ │ △  Learning                │ │
│ │    Educational...          │ │
│ └────────────────────────────┘ │
│ ┌────────────────────────────┐ │
│ │ ◇  War Room                │ │
│ │    Fast-paced...           │ │
│ └────────────────────────────┘ │
│ ┌────────────────────────────┐ │
│ │ ·  Custom                  │ │
│ │    Your own config...      │ │
│ └────────────────────────────┘ │
│ ────────────────────────────  │
│ LOOP SETTINGS                 │
│ Speed           normal   ▼   │
│ Max Rounds      3        ▼   │
└────────────────────────────────┘
```

### Kartu Mode
- `w-full text-left px-3 py-2.5 rounded-lg border transition-colors`
- **Aktif**: `border-sand-700 bg-surface`
- **Non-aktif**: `border-border hover:border-border-strong hover:bg-surface-hover`
- Icon mode: `text-sm` (◻ ○ △ ◇ ·)
- Nama: `text-xs font-medium` — aktif `text-ink`, non-aktif `text-ink-light`
- Deskripsi: `text-[11px] text-ink-faint leading-relaxed pl-6`
- Ikon preset per mode: Boardroom `◻`, Supportive `○`, Learning `△`, War Room `◇`, Custom `·`

### Dropdown (Speed & Max Rounds)
- Trigger: `w-full flex items-center justify-between py-2 px-2 rounded-md hover:bg-surface-hover`
  - Label: `text-xs text-ink-muted`
  - Value: `text-xs text-ink-light capitalize` + chevron 10px `text-ink-faint`
- Panel: `absolute left-0 right-0 top-full z-10 bg-surface border border-border rounded-lg shadow-md py-1 animate-slide-in`
- Item: `w-full text-left px-3 py-1.5 text-xs transition-colors`
  - **Selected**: `text-ink bg-surface-hover font-medium`
  - **Lain**: `text-ink-muted hover:text-ink hover:bg-surface-hover`
- Opsi Speed: Slow / Normal / Fast
- Opsi Max Rounds: 3 / 5 / 10 / 20 / Unlimited
---

## 12. Modal (Wrapper Umum)

### 12.1 Overlay
- `fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in`
- `backgroundColor: rgba(0,0,0,0.3)`, `backdropFilter: blur(2px)`
- Klik overlay (bukan isi modal) → tutup

### 12.2 Panel Modal
- `w-full bg-surface rounded-xl border border-border shadow-lg animate-slide-in`
- Max-width: `max-w-lg` (default) / `max-w-xl` (untuk semua modal aplikasi)
- Header: `px-6 pt-6 pb-0`
  - Title: `text-base font-semibold text-ink`
  - Deskripsi: `text-sm text-ink-muted mt-1`
- Konten: `px-6 py-4`
- Tombol Close (×) di pojok kanan atas

### 12.3 Perilaku
- Escape = tutup
- Z-index 100 (di atas semua)
- `ModalHost` merender semua modal; tiap modal cek `activeModal === id` → render/null

---

## 13. ApiKeysModal — "API Providers"

```
┌────────────────────────────────────────────┐
│ API Providers                              │
│ Configure your API endpoints, keys...      │
│ ┌────────────────────────────────────────┐ │
│ │ [OPA] OpenAI      openai.com/v1  5 mo ▼ │ │
│ │ [ANT] Anthropic  api.anthropic.com ... │ │
│ │ [OPE] OpenRouter  openrouter.ai ...    │ │
│ │ [OLL] Ollama      localhost:11434 ...  │ │
│ └────────────────────────────────────────┘ │
│ (konten expand: form + models + test)      │
└────────────────────────────────────────────┘
```

### Item Provider (collapsible)
- Container: `border border-border rounded-lg overflow-hidden`
- Header (klik → expand): `w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-hover transition-colors text-left`
  - Logo badge: `w-8 h-8 rounded-md text-[10px] font-semibold` — 3 huruf pertama provider. **Ada key** → `bg-sage-light text-sage`, **tanpa key** → `bg-surface-inset text-ink-muted`
  - Nama: `text-sm font-medium text-ink`
  - Base URL: `text-[11px] text-ink-faint truncate`
  - Badge jumlah model: `text-[10px] px-1.5 py-0.5 rounded` — `{n} models` (sama warna kondisional)
  - Chevron: 12px, `rotate-180` saat expand

### Konten Expand
- Form fields (Name / Base URL / API Key): `w-full px-3 py-1.5 text-sm bg-surface-inset border border-border rounded-md focus:outline-none focus:border-ink-faint` — URL & key pakai `font-mono`, key `type="password"`
- Label: `text-[11px] text-ink-faint block mb-1`
- **Models list**: tiap item `flex items-center gap-2 px-2.5 py-1.5 bg-surface-inset rounded-md group` — nama model `text-xs text-ink flex-1`, id `text-[10px] text-ink-faint font-mono`, tombol hapus (×) `opacity-0 group-hover:opacity-100`
- **+ add model**: 2 input inline (model-id + Display name) + tombol Add `px-2 py-1 text-[11px] text-white bg-sand-800 rounded hover:bg-ink`
- **Test Connection**: tombol → status `OK` (sage) / `Fail` (red)
- **Remove provider**: `text-[11px] text-red-500 hover:text-red-700`

### Tombol Footer
- **+ Add Provider** (buka form custom provider)

---

## 14. AgentsModal — "Manage Agents"

```
┌────────────────────────────────────────────┐
│ Manage Agents                              │
│ Create and configure your AI agents.       │
│ ┌────────────────────────────────────────┐ │
│ │ (M) Maya  VP of Sales     [Edit][Del]  │ │
│ │ (A) Aldo  Finance Advisor [Edit][Del]  │ │
│ └────────────────────────────────────────┘ │
│ ──────────────────────────────────────     │
│ NEW AGENT                                  │
│ Name: [________]  Role: [________]         │
│ Tone: [debate][supportive][expert]         │
│ Color: (o)(o)(o)(o)(o)(o)(o)(o)            │
│ System Prompt: [textarea 3 rows]           │
│                      [Cancel] [Create]     │
└────────────────────────────────────────────┘
```

### List Agent
- `space-y-3 max-h-40 overflow-y-auto`
- Item: `flex items-center gap-2.5 px-3 py-2 rounded-lg` + `hover:bg-surface-hover` (atau `bg-surface-hover` jika sedang di-edit)
  - Avatar 28px, nama `text-xs font-medium text-ink`, role `text-[11px] text-ink-faint`
  - Tombol Edit: `text-[11px] text-ink-faint hover:text-ink px-2 py-1 rounded`
  - Tombol Del: `text-[11px] text-ink-faint hover:text-red-600 px-2 py-1 rounded`

### Form (grid 2 kolom)
- Name & Role: `w-full px-3 py-2 text-sm bg-surface-inset border border-border rounded-md focus:outline-none focus:border-ink-faint`
- **Tone**: 3 tombol segmen `px-3 py-1.5 text-xs rounded-md border capitalize` — aktif `border-sand-700 bg-surface-hover text-ink`, non-aktif `border-border text-ink-muted`
- **Color**: 8 lingkaran `w-6 h-6 rounded-full` — dipilih `ring-2 ring-offset-2 ring-sand-700`
- **System Prompt**: textarea 3 baris `resize-none`
- Footer: Cancel (`px-4 py-2 text-sm text-ink-muted hover:text-ink border border-border rounded-lg`) + Create/Update (`px-4 py-2 text-sm text-white bg-sand-800 hover:bg-ink rounded-lg`)


---

## 15. ModelsModal — "AI Models"

```
┌────────────────────────────────────────────┐
│ AI Models                                  │
│ Configure which provider and model each    │
│ agent uses.                                │
│ ┌────────────────────────────────────────┐ │
│ │ (M) Maya  VP of Sales                  │ │
│ │   Provider: [openai        ▼]          │ │
│ │   Model:    [gpt-4o         ▼]         │ │
│ └────────────────────────────────────────┘ │
│ ┌────────────────────────────────────────┐ │
│ │ (A) Aldo  Finance Advisor              │ │
│ │   Provider: [anthropic      ▼]         │ │
│ │   Model:    [claude-sonnet ▼]          │ │
│ └────────────────────────────────────────┘ │
└────────────────────────────────────────────┘
```

### Item Agent
- `border border-border rounded-lg p-3`
- Header: avatar 24px `text-[9px]`, nama `text-xs font-medium text-ink`, role `text-[10px] text-ink-faint truncate`
- Grid 2 kolom: Provider + Model dropdown
- **Provider change** → otomatis pilih model pertama provider itu
- Label: `text-[10px] text-ink-faint block mb-1`
- Dropdown styling sama seperti ModeTab dropdown

---

## 16. RolesModal — "Agent Roles & Prompts"

```
┌────────────────────────────────────────────┐
│ Agent Roles & Prompts                      │
│ Edit the system prompt for each agent.     │
│                                             │
│ ● Maya — VP of Sales                        │
│ ┌────────────────────────────────────────┐ │
│ │ You are Maya, VP of Sales with 15...   │ │
│ │ (textarea 3 rows, resize-none)         │ │
│ └────────────────────────────────────────┘ │
│ ● Aldo — Finance Advisor                   │
│ ┌────────────────────────────────────────┐ │
│ │ ...                                     │ │
│ └────────────────────────────────────────┘ │
│                          [Cancel] [Save]  │
└────────────────────────────────────────────┘
```

- `space-y-4 max-h-[60vh] overflow-y-auto`
- Label: `text-xs font-medium block mb-1.5` — dot `w-2 h-2 rounded-full mr-1.5` (bg avatarColor) + `{nama} — {role}`
- Textarea: `w-full px-3 py-2 text-sm bg-surface-inset border border-border rounded-md focus:outline-none focus:border-ink-faint resize-none` rows=3
- **Live edit** (perubahan langsung tersimpan ke store, tanpa tombol save per-agent)
- Footer: Cancel + Save (`bg-sand-800 hover:bg-ink`)
---

## 17. DocumentsModal — "Knowledge Base"

```
┌────────────────────────────────────────────┐
│ Knowledge Base                             │
│ Upload documents for agents to reference.  │
│ [General] [Maya] [Aldo] [Sinta]            │
│ ┌────────────────────────────────────────┐ │
│ │  ⬆                                (atau │ │
│ │  Drop files here or click to browse    │ │
│ │  PDF, MD, TXT, JSON, CSV               │ │
│ └────────────────────────────────────────┘ │
│ ┌────────────────────────────────────────┐ │
│ │ [PDF]  resume-jordan.pdf   1.2 MB  [×] │ │
│ │ [MD]   company-profile.md  245 KB  [×] │ │
│ └────────────────────────────────────────┘ │
└────────────────────────────────────────────┘
```

### Tab Bar
- Tab "General" + tab per agent (nama agent)
- Tab aktif: `bg-surface-hover text-ink` / non-aktif `text-ink-muted`

### Drop Zone
- `border-2 border-dashed border-border-strong rounded-lg p-4 text-center cursor-pointer hover:border-ink-faint transition-colors`
- Icon folder 18px `text-ink-faint`, teks "Drop files here or click to browse" (`text-xs text-ink-muted`), sub "PDF, MD, TXT, JSON, CSV" (`text-[10px] text-ink-faint`)
- Support drag & drop + klik browse

### List Dokumen
- Per item: ikon tipe (PDF=red, MD=blue, JSON=yellow, CSV=green, TXT=sand) + nama + size + tombol delete
- Ikon: badge `text-[10px] px-1.5 py-0.5 rounded` dengan warna per tipe:
  - PDF: `bg-red-100 text-red-700`
  - MD: `bg-blue-100 text-blue-700`
  - JSON: `bg-yellow-100 text-yellow-700`
  - CSV: `bg-green-100 text-green-700`
  - lain: `bg-sand-200 text-sand-700`

### Perilaku Upload
- Dokumen di-upload ke tab yang aktif (General → global, tab agent → per-agent)
- Tersimpan di IndexedDB, tampil setelah reload

---

## 18. Ikon-ikon (SVG)

### Ikon Gavel (Moderator + Typing moderator)
```svg
<svg width="13" height="13" viewBox="0 0 24 24" fill="none">
  <path d="M3 20h18M6 20v-9l-2 1v-2l2-1V5c0-1 .5-2 2-2h4c1.5 0 2 1 2 2v4l2 1v2l-2-1v9M10 4v.01M14 10.5v9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
</svg>
```

### Ikon Footer Sidebar (semua 14px, stroke 1.2, fill none)
- **Key** (API Keys): lingkaran kecil + garis diagonal
- **People** (Manage Agents): 2 figur
- **Cube** (AI Models): kubus 3D
- **Edit/Pencil** (Agent Roles): pensil
- **Doc** (Knowledge Base): dokumen dengan lipatan

### Ikon Lainnya
| Ikon | Ukuran | Kegunaan |
|------|--------|----------|
| Plus | 12px stroke 1.5 | New Session |
| Chevron kiri | 14px stroke 1.5 | Collapse sidebar |
| Chevron kanan | 14px stroke 1.5 | Expand sidebar |
| Chevron bawah | 12px stroke 1.3 | Dropdown |
| 3 titik | 12px | Menu sesi |
| Kertas pesawat | 14px stroke 1.3 | Tombol send |
| Persegi | 10px | Tombol stop |
| Panah atas | 16px stroke 1.3 | Upload |
| Folder | 18px stroke 1.2 | Drop zone |
| Crosshair | 12px stroke 1.2 | TokenMeter |
| X kecil | 8-10px stroke 1.2-1.3 | Hapus (kick/delete model) |

---

*End of UI Spec. Tampilan harus identik dengan aplikasi VMA asli.*

