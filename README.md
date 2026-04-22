# 🤖 Bot Downloader + AI (Hybrid Architecture)

Telegram bot yang bisa download video/audio dari berbagai platform **dan** chat dengan AI (Gemini / Ollama) via arsitektur hybrid Node.js + Python FastAPI.

---

## ✨ Fitur

| Fitur | Detail |
|---|---|
| 📥 Download Video | YouTube, Instagram, TikTok, Twitter/X, Facebook, Reddit, Twitch |
| 🎵 Download Audio | Ekstrak MP3 dari semua platform di atas |
| 🤖 AI Chat | Chat natural dengan AI hybrid (Gemini & Ollama) + memory percakapan |
| 🛡 Security Auth | Komunikasi inter-service dijamin dengan `INTERNAL_API_TOKEN` aman |
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

### 4. Install Env Python & Dependencies API

Karena fitur *download* dan proses *AI* kini dipisah ke dalam *services backend* FastAPI, lakukan ini:

```bash
cd python_api
python -m venv venv

# Aktivasi virtual environment
source venv/bin/activate    # Linux / Mac
.\venv\Scripts\activate     # Windows

# Install dependency Python API
pip install -r requirements.txt
cd ..
```

### 5. Install & jalankan Ollama (Opsional, fallback dari Gemini)

```bash
# Install: https://ollama.com/download
ollama serve          # jalankan server (terminal terpisah)
ollama pull phi3      # download model ringan Phi3
```
Model lain yang bisa dipakai: `mistral`, `gemma2`, `phi3`, `qwen2`

### 5. Buat file `.env`

```bash
cp .env.example .env
```

Edit file `.env` dan isi nilainya:

```env
BOT_TOKEN=123456789:AAFxxx...   # dari @BotFather
GEMINI_API_KEY=AIzaSy...        # Wajib jika pakai Gemini
INTERNAL_API_TOKEN=rahasia-123  # Wajib (sama antar node & python)
PYTHON_API_URL=http://localhost:8000
OLLAMA_URL=http://localhost:11434
ADMIN_IDS=                       # Telegram ID kamu (opsional)
```

> **Cara dapat `BOT_TOKEN`:** Chat [@BotFather](https://t.me/BotFather) → `/newbot` → ikuti instruksi
>
> **Cara dapat Telegram ID:** Chat [@userinfobot](https://t.me/userinfobot)

### 7. Jalankan Python API & Bot Node.js

Disarankan gunakan dua terminal terpisah:

**Terminal 1 (Backend Python):**
```bash
cd python_api
uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

**Terminal 2 (Telegram Bot):**
```bash
# Production bot Node.js
npm start

# Development
npm run dev
```

---

## 📁 Struktur Proyek

```
bot-tle/
├── python_api/             # Backend Python (Download + AI processing)
│   ├── main.py             # FastAPI entry point
│   ├── ai_service.py       # Wrapper Gemini & Ollama fallback
│   └── download_service.py # yt-dlp & instaloader logic
├── src/
│   ├── index.js            # Entry point bot Node.js
│   ├── config.js           # Konfigurasi terpusat & Auth internal
│   ├── store.js            # State management
│   ├── utils.js            # Helper functions
│   └── handlers/
│       ├── ai.js           # Kirim req chat ke API Python
│       └── download.js     # Kirim req link ke API Python
├── downloads/              # Folder sementara untuk file unduhan
├── .env                    # Environment variables
├── package.json            # Node.js dependencies
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
| `INTERNAL_API_TOKEN` | ✅ | Token random rahasia inter-koneksi |
| `GEMINI_API_KEY` | ✅ | API Key Gemini dari Google AI studio |
| `PYTHON_API_URL` | ❌ | Default: `http://localhost:8000` |
| `OLLAMA_URL` | ❌ | Fallback lokal: `http://localhost:11434` |
| `ADMIN_IDS` | ❌ | ID Telegram admin, pisah koma |
| `COOKIES_PATH` | ❌ | Path ke cookies.txt untuk yt-dlp |
| `IG_USERNAME` | ❌ | Username instaloader di python |

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