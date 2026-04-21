# 🤖 Bot Downloader + AI

Telegram bot yang bisa download video/audio dari berbagai platform **dan** chat dengan AI lokal via Ollama.

---

## ✨ Fitur

| Fitur | Detail |
|---|---|
| 📥 Download Video | YouTube, Instagram, TikTok, Twitter/X, Facebook, Reddit, Twitch |
| 🎵 Download Audio | Ekstrak MP3 dari semua platform di atas |
| 🤖 AI Chat | Chat natural dengan AI lokal (Ollama) + memory percakapan |
| 📊 Info Video | Thumbnail, judul, durasi, views, likes sebelum download |
| 🎚️ Pilih Kualitas | MP3 / 360p / 480p / 720p / 1080p via tombol inline |
| 📋 Queue System | Antrian download per user, tidak bisa tabrakan |
| 👑 Panel Admin | Statistik bot: uptime, RAM, total user, download, dll |

---

## 🛠️ Instalasi

### 1. Clone repo

```bash
git clone https://github.com/USERNAME/REPO-NAME.git
cd REPO-NAME
```

### 2. Install Node dependencies

```bash
npm install
```

### 3. Install yt-dlp

```bash
# Linux / Mac
pip install yt-dlp

# atau via curl (Linux)
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
  -o /usr/local/bin/yt-dlp && sudo chmod +x /usr/local/bin/yt-dlp

# Windows
winget install yt-dlp
```

### 4. Install & jalankan Ollama

```bash
# Install: https://ollama.com/download
ollama serve          # jalankan server (terminal terpisah)
ollama pull llama3    # download model (sekali saja, ~4GB)
```

Model lain yang bisa dipakai: `mistral`, `gemma2`, `phi3`, `qwen2`

### 5. Buat file `.env`

```bash
cp .env.example .env
```

Edit file `.env` dan isi nilainya:

```env
BOT_TOKEN=123456789:AAFxxx...   # dari @BotFather
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3
ADMIN_IDS=                       # Telegram ID kamu (opsional)
```

> **Cara dapat `BOT_TOKEN`:** Chat [@BotFather](https://t.me/BotFather) → `/newbot` → ikuti instruksi
>
> **Cara dapat Telegram ID:** Chat [@userinfobot](https://t.me/userinfobot)

### 6. Jalankan bot

```bash
# Production
npm start

# Development (auto-restart saat file berubah)
npm run dev
```

---

## 📁 Struktur Proyek

```
bot-tle/
├── src/
│   ├── index.js            # Entry point: inisialisasi bot, routing pesan & commands
│   ├── config.js           # Konfigurasi terpusat dari ENV
│   ├── store.js            # State management (memory, stats, url store)
│   ├── utils.js            # Helper functions (format, validasi, dll)
│   ├── downloader.js       # Engine: download, queue, metadata, platform detection
│   └── handlers/
│       ├── ai.js           # Handler AI chat (Ollama streaming)
│       └── download.js     # Handler download flow & keyboard
├── downloads/              # Folder sementara file download (di-ignore git)
├── cookies.txt             # Cookie browser untuk auth (di-ignore git, JANGAN push!)
├── .env                    # Environment variables (di-ignore git, JANGAN push!)
├── .env.example            # Template ENV
├── .gitignore
├── nixpacks.toml           # Konfigurasi build Railway
├── railway.json            # Konfigurasi deploy Railway
├── package.json
└── README.md
```

---

## 💬 Cara Pakai

| Aksi | Cara |
|---|---|
| Download video | Kirim link langsung |
| Download MP3 | Kirim link → pilih tombol 🎵 MP3 |
| Chat AI | Ketik pertanyaan apa saja |
| Hapus memory AI | `/reset` |
| Lihat statistik | `/mystats` |
| Cek antrian | `/queue` |
| Panel admin | `/admin` (khusus ADMIN_IDS) |

---

## ⚙️ Environment Variables

| Variable | Wajib | Keterangan |
|---|---|---|
| `BOT_TOKEN` | ✅ | Token bot dari @BotFather |
| `OLLAMA_URL` | ✅ | URL server Ollama (default: `http://localhost:11434`) |
| `OLLAMA_MODEL` | ✅ | Nama model Ollama yang dipakai |
| `ADMIN_IDS` | ❌ | ID Telegram admin, pisah koma |
| `COOKIES_PATH` | ❌ | Path ke cookies.txt (default: `cookies.txt` di root) |
| `IG_USERNAME` | ❌ | Username Instagram untuk instaloader |

---

## 🗺️ Roadmap Pengembangan

Fondasi sudah dipisah per modul sehingga setiap item di bawah bisa dikerjakan tanpa menyentuh file lain.

### Persistensi Data
- [ ] Ganti `store.js` in-memory → SQLite (`better-sqlite3`) atau Redis
- [ ] Simpan riwayat AI per user agar tidak hilang saat restart
- [ ] Simpan statistik download ke database

### Fitur Bot
- [ ] Support grup (saat ini hanya private chat)
- [ ] Command `/lang` untuk ganti bahasa respons AI
- [ ] Notifikasi selesai download via inline button "Download lagi"
- [ ] Rate limiting per user (cegah spam download)
- [ ] Whitelist/blacklist user via command admin

### AI
- [ ] Ganti Ollama → OpenAI / Groq / Gemini (cukup edit `handlers/ai.js`)
- [ ] System prompt yang bisa dikonfigurasi via ENV
- [ ] Mode AI khusus: ringkas artikel dari URL, terjemahan, dll

### Download Engine
- [ ] Progress bar persentase download (via yt-dlp `--progress`)
- [ ] Tambah platform baru: cukup tambah entry di `PLATFORMS` di `downloader.js`
- [ ] Cache metadata agar tidak fetch ulang untuk URL yang sama
- [ ] Support playlist YouTube (download semua video)

### Infrastruktur
- [ ] Health check endpoint (HTTP server kecil) untuk monitoring Railway
- [ ] Logging terstruktur (JSON) dengan level INFO/WARN/ERROR
- [ ] Graceful shutdown yang menunggu download aktif selesai

---

## 🚀 Deploy ke VPS / Server

```bash
# Install PM2 untuk keep-alive
npm install -g pm2

# Jalankan dengan PM2
pm2 start src/index.js --name bot-dl

# Auto-start saat server reboot
pm2 startup
pm2 save
```

---

## 📦 Dependencies

- [node-telegram-bot-api](https://github.com/yagop/node-telegram-bot-api) — Telegram Bot API
- [axios](https://axios-http.com) — HTTP client untuk Ollama
- [dotenv](https://github.com/motdotla/dotenv) — Load environment variables
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) — Download engine (external binary)

---

## ⚠️ Catatan

- File download dihapus otomatis setelah dikirim ke user
- Link tombol kadaluarsa setelah **30 menit** — kirim ulang link jika sudah expire
- Telegram membatasi upload file max **50 MB**
- Bot hanya bekerja di **private chat** (tidak di grup)

---

## 📄 License

MIT