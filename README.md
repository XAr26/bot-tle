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
bot-downloader-ai/
├── src/
│   ├── index.js        # Entry point: bot logic, commands, AI handler
│   └── downloader.js   # Engine: download, queue, metadata, platform detection
├── downloads/          # Folder sementara file download (di-ignore git)
├── .env.example        # Template environment variables
├── .gitignore
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