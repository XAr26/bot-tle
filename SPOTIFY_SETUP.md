# 🎵 Spotify & YouTube Music Support Setup

## ✨ Fitur Baru

Bot sekarang bisa:
- **Spotify** - Metadata lengkap + rekomendasi musik serupa
- **YouTube Music** - Musik dari YouTube Music (download MP3)
- **SoundCloud** - Sudah support (ditingkatkan)

---

## 🎵 Spotify: Metadata + Rekomendasi

### Fitur Utama
- ✅ **Metadata Lengkap**: Judul, artis, album, genre, popularitas, tanggal rilis
- ✅ **Rekomendasi Musik**: AI-powered suggestions berdasarkan genre & artis
- ✅ **Tidak Download**: Fokus pada discovery musik, bukan file download
- ✅ **Spotify Links**: Track, album, playlist support

### Cara Penggunaan
1. User kirim: `https://open.spotify.com/track/...`
2. Bot show: Info lengkap lagu + thumbnail
3. User klik: `🎵 Cari Rekomendasi Musik`
4. Bot return: 3-5 rekomendasi musik serupa dengan link Spotify

### Contoh Output
```
🎵 Shape of You
👤 Ed Sheeran
💿 ÷ (Divide)
⏱ Durasi: 3m 53d
📈 Popularitas: 85%
🎼 Genre: pop, singer-songwriter

🎯 Rekomendasi Musik Serupa:

1. Perfect
   👤 Ed Sheeran
   💡 More from this artist
   🔗 [Dengarkan](https://open.spotify.com/artist/...)

2. Someone You Loved
   👤 Lewis Capaldi
   💡 Based on genre and style
   🔗 [Dengarkan](https://open.spotify.com/search/...)

3. Watermelon Sugar
   👤 Harry Styles
   💡 AI-powered recommendation
   🔗 [Dengarkan](https://open.spotify.com/search/...)
```

---

## 🎬 YouTube Music Setup

YouTube Music sudah support via `yt-dlp`. Tidak perlu setup tambahan!

**URL Format yang support:**
- `https://music.youtube.com/watch?v=...`
- `https://music.youtube.com/playlist?list=...`

---

## 🔧 Setup Spotify

### 1. Install `spotdl`
```bash
pip install spotdl
```

### 2. Daftar Spotify Developer
1. Buka: https://developer.spotify.com/dashboard
2. Login/daftar Spotify account
3. Create New App
4. Terima terms and create app
5. Dapatkan:
   - **Client ID**
   - **Client Secret**

### 3. Set Environment Variables
```bash
export SPOTIFY_CLIENT_ID="your_client_id_here"
export SPOTIFY_CLIENT_SECRET="your_client_secret_here"
```

**Atau di `.env`:**
```env
SPOTIFY_CLIENT_ID=your_client_id_here
SPOTIFY_CLIENT_SECRET=your_client_secret_here
```

### 4. Setup Authentication (Optional)
```bash
# Login ke Spotify (untuk private playlists)
spotdl auth
```

---

## 📥 Download Links

### Spotify (Metadata Only)
```
https://open.spotify.com/track/TRACK_ID
https://open.spotify.com/album/ALBUM_ID
https://open.spotify.com/playlist/PLAYLIST_ID
```

### YouTube Music (Download MP3)
```
https://music.youtube.com/watch?v=VIDEO_ID
https://music.youtube.com/playlist?list=PLAYLIST_ID
```

---

## 🎯 User Experience

### Spotify Flow
1. User kirim: `https://open.spotify.com/track/...`
2. Bot show: `[thumbnail] 🎵 Song Title - Artist`
3. User klik: `🎵 Cari Rekomendasi Musik`
4. Bot show: Detailed metadata + 3-5 recommendations

### YouTube Music Flow
1. User kirim: `https://music.youtube.com/watch?v=...`
2. Bot show: `[thumbnail] 🎵 Music Title - Channel`
3. User klik: `🎵 MP3 (128kbps)`
4. Bot kirim: MP3 file

---

## 📦 Dependencies

```
spotdl          # Spotify metadata & recommendations
yt-dlp          # YouTube Music + video platforms
ffmpeg          # Audio processing
```

Install: `pip install -r python_api/requirements.txt`

---

## 📊 Platform Status

| Platform | Status | Keyboard | Notes |
|----------|--------|----------|-------|
| **Spotify** ✨ | ✅ NEW | Rekomendasi only | Metadata + AI recs |
| **YouTube Music** ✨ | ✅ NEW | MP3 only | yt-dlp powered |
| YouTube | ✅ | Video + MP3 | Full support |
| TikTok | ✅ | Video + MP3 | Cookies recommended |
| Instagram | ✅ | Video + MP3 + Photo | Optional |
| SoundCloud | ✅ | MP3 only | High quality |
| Twitter/X | ✅ | Video + MP3 + Photo | Auto |
| Twitch | ✅ | Video + MP3 | VODs only |
| Reddit | ✅ | Video + MP3 + Photo | Auto |

---

## 🚀 Next Steps

1. Setup Spotify credentials di `.env`
2. Test dengan `/test_env` di Telegram
3. Try Spotify link: `https://open.spotify.com/track/11dFghVXANMlKmJXsNCQvI`
4. Enjoy music discovery! 🎵

---

## 🔍 Technical Details

### Spotify Metadata Fields
```json
{
  "title": "Song Name",
  "artist": "Artist Name",
  "album": "Album Name",
  "duration": 233000,
  "genres": ["pop", "dance"],
  "popularity": 85,
  "release_date": "2017-01-06",
  "spotify_id": "4uLU6hMCjMI75M1A2tKUQC",
  "thumbnail": "https://...",
  "preview_url": "https://...",
  "external_urls": {"spotify": "https://..."},
  "recommendations": [
    {
      "title": "Similar Song",
      "artist": "Similar Artist",
      "reason": "Based on genre",
      "spotify_url": "https://..."
    }
  ]
}
```

### Recommendation Algorithm
1. **Genre-based**: Musik dengan genre serupa
2. **Artist-based**: Lagu lain dari artis yang sama
3. **AI-powered**: Menggunakan AI untuk suggest berdasarkan style
4. **Trending**: Musik populer di genre tersebut

---

## ⚠️ Notes

- **Spotify API**: Memerlukan registered developer account (gratis)
- **No Downloads**: Spotify fokus pada discovery, bukan piracy
- **AI Recommendations**: Menggunakan Gemini untuk suggestions canggih
- **Rate Limiting**: Spotify API rate limits (60 req/min per user)

---

## 🎉 Enjoy Music Discovery!

Bot sekarang jadi **music discovery assistant** yang powerful! 🎵🤖

---

## 🔧 Setup Spotify

### 1. Install `spotdl`
```bash
pip install spotdl
```

### 2. Daftar Spotify Developer
1. Buka: https://developer.spotify.com/dashboard
2. Login/daftar Spotify account
3. Create New App
4. Terima terms and create app
5. Dapatkan:
   - **Client ID**
   - **Client Secret**

### 3. Set Environment Variables
```bash
export SPOTIFY_CLIENT_ID="your_client_id_here"
export SPOTIFY_CLIENT_SECRET="your_client_secret_here"
```

**Atau di `.env`:**
```env
SPOTIFY_CLIENT_ID=your_client_id_here
SPOTIFY_CLIENT_SECRET=your_client_secret_here
```

### 4. Setup Authentication (Optional: untuk private/liked songs)
```bash
# Login ke Spotify
spotdl auth

# Atau setup cache
mkdir -p ~/.cache/spotdl
```

---

## 🎬 YouTube Music Setup

YouTube Music sudah support via `yt-dlp`. Tidak perlu setup tambahan!

**URL Format yang support:**
- `https://music.youtube.com/watch?v=...`
- `https://music.youtube.com/playlist?list=...`

---

## 📥 Download Links

### Spotify
```
https://open.spotify.com/track/TRACK_ID
https://open.spotify.com/album/ALBUM_ID
https://open.spotify.com/playlist/PLAYLIST_ID
```

### YouTube Music
```
https://music.youtube.com/watch?v=VIDEO_ID
https://music.youtube.com/playlist?list=PLAYLIST_ID
```

---

## 🎯 User Experience

### Spotify Download
1. User kirim: `https://open.spotify.com/track/...`
2. Bot show: Judul lagu + artist
3. User pilih: `🎵 MP3 (128kbps)` 
4. Bot kirim file MP3

### YouTube Music Download
1. User kirim: `https://music.youtube.com/watch?v=...`
2. Bot show: Judul musik + channel
3. User pilih: `🎵 MP3` atau `📹 360p/720p/1080p` (jika ada video)
4. Bot kirim file

---

## 🔐 Security Notes

- **Spotify Credentials**: Jangan share di public repo!
- **Cookies**: Jika ada akun Instagram private, masukkan ke `cookies.txt`
- **Rate Limiting**: Spotify rate-limit ~60 requests/min per user

---

## 🛠️ Troubleshooting

### Error: "Spotify downloader tidak tersedia"
```bash
# Install spotdl
pip install spotdl

# Verify
spotdl --version
```

### Error: "Invalid credentials"
- Verify Client ID dan Secret di `.env`
- Cek: https://developer.spotify.com/dashboard

### Error: "Rate limited"
- Wait 1 minute, retry
- Cek connection ke Spotify API

---

## 📦 Dependencies

```
spotdl          # Spotify downloader
yt-dlp          # YouTube Music + video platforms
ffmpeg          # Audio/video processing
```

Install: `pip install -r python_api/requirements.txt`

---

## 📊 Platform Status

| Platform | Status | Setup | Notes |
|----------|--------|-------|-------|
| Spotify | ✅ Baru | Perlu credentials | Lagu & playlist |
| YouTube Music | ✅ Baru | Auto (yt-dlp) | No extra setup |
| YouTube | ✅ Existing | Auto | Video + audio |
| TikTok | ✅ Existing | Auto | Cookies recommended |
| Instagram | ✅ Existing | Optional cookies | Private acc needs login |
| Twitter/X | ✅ Existing | Optional cookies | Rate limit bypass |
| Facebook | ✅ Existing | Auto | Basic support |
| Reddit | ✅ Existing | Auto | Video + audio |
| Twitch | ✅ Existing | Auto | VODs only |
| SoundCloud | ✅ Existing | Auto | High quality MP3 |

---

## 🚀 Next Steps

1. Setup Spotify credentials di `.env`
2. Test dengan `/test_env` di Telegram
3. Try Spotify link: `https://open.spotify.com/track/...`
4. Enjoy! 🎵
