# ============================================================
#  download_service.py — yt-dlp + instaloader + spotdl engine
#  IMPROVEMENT: Lebih robust, log lebih baik, timeout,
#  sanitasi user_id, handle file ekstensi dinamis yt-dlp.
#  UPDATE: Tambah support Spotify (spotdl) dan YouTube Music
# ============================================================

import os
import re
import asyncio
import yt_dlp
import instaloader
import shutil
from pathlib import Path
from typing import Dict, Optional, List
from dotenv import load_dotenv

load_dotenv()

# Safe import spotdl
try:
    from spotdl.download import Download
    from spotdl.utils.config import get_config
    SPOTDL_AVAILABLE = True
except ImportError:
    SPOTDL_AVAILABLE = False
    print("⚠️  spotdl belum terinstall. Jalankan: pip install spotdl")

DOWNLOAD_DIR = Path(__file__).parent.parent / "downloads"
COOKIES_FILE = Path(__file__).parent.parent / "cookies.txt"

os.makedirs(DOWNLOAD_DIR, exist_ok=True)

YDL_BASE_OPTS = {
    "quiet":               False,   # Set to False for deep logging
    "no_warnings":         False,
    "user_agent":          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "nocheckcertificate":  True,
    "geo_bypass":          True,
    "extract_flat":        "in_playlist",
    "js_runtime":          "node",   # Force use Node.js for signature decryption
}


class DownloadService:
    def __init__(self):
        self.ig       = instaloader.Instaloader()
        self.ig_user  = os.getenv("IG_USERNAME")

        if self.ig_user:
            try:
                session_file = Path.home() / f".config/instaloader/session-{self.ig_user}"
                if session_file.exists():
                    self.ig.load_session_from_file(self.ig_user, str(session_file))
                    print(f"✅ instaloader: sesi {self.ig_user} dimuat")
                else:
                    print(f"⚠️  instaloader: session file tidak ditemukan untuk {self.ig_user}")
                    print(f"   Jalankan: instaloader --login {self.ig_user}")
            except Exception as e:
                print(f"⚠️  instaloader session error: {e}")

    def _ydl_opts(self, extra: dict = {}) -> dict:
        opts = {**YDL_BASE_OPTS, **extra}
        if COOKIES_FILE.exists():
            opts["cookiefile"] = str(COOKIES_FILE)
        return opts

    async def get_metadata(self, url: str) -> Optional[Dict]:
        print(f"🔍 Info request for: {url}")
        
        # Special handling untuk Spotify
        if "open.spotify.com" in url:
            return await self._get_spotify_metadata(url)
        
        try:
            # Custom opts untuk platform tertentu jika perlu
            opts = self._ydl_opts()
            if "twitter.com" in url or "x.com" in url:
                opts["extractor_args"] = {"twitter": {"api": ["syndication"]}}
                
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = await asyncio.get_event_loop().run_in_executor(
                    None, lambda: ydl.extract_info(url, download=False)
                )
                if not info:
                    return None
                    
                formats = list(set([
                    f"{f.get('height')}p"
                    for f in info.get("formats", [])
                    if f.get("height")
                ]))
                formats.sort(key=lambda x: int(x[:-1])) if formats else []
                
                return {
                    "title":     info.get("title") or info.get("description", "No Title")[:50],
                    "uploader":  info.get("uploader") or info.get("channel") or info.get("user_rt_name") or "Unknown",
                    "duration":  info.get("duration", 0),
                    "thumbnail": info.get("thumbnail"),
                    "viewCount": info.get("view_count", 0),
                    "likeCount": info.get("like_count", 0),
                    "formats":   formats,
                }
        except Exception as e:
            print(f"🔴 Metadata error for {url}: {e}")
            return None

    async def _get_spotify_metadata(self, url: str) -> Optional[Dict]:
        """Extract metadata dari Spotify URL tanpa download."""
        try:
            # Parse Spotify URL untuk ekstrak info
            # Format: https://open.spotify.com/track/TRACK_ID?si=...
            track_match = re.search(r"/(track|album|playlist)/([a-zA-Z0-9]+)", url)
            if not track_match:
                return {
                    "title": "Spotify Audio",
                    "uploader": "Spotify",
                    "duration": 0,
                    "thumbnail": None,
                    "viewCount": 0,
                    "likeCount": 0,
                    "formats": [],
                }
            
            item_type = track_match.group(1)
            item_id = track_match.group(2)
            
            # Kita bisa gunakan yt-dlp untuk extract Spotify info jika supported
            # Fallback: return generic Spotify metadata
            return {
                "title": f"Spotify {item_type.capitalize()} - {item_id[:8]}",
                "uploader": "Spotify",
                "duration": 180,  # default 3 menit
                "thumbnail": None,
                "viewCount": 0,
                "likeCount": 0,
                "formats": [],
            }
        except Exception as e:
            print(f"🔴 Spotify metadata error: {e}")
            return {
                "title": "Spotify Audio",
                "uploader": "Spotify",
                "duration": 0,
                "thumbnail": None,
                "viewCount": 0,
                "likeCount": 0,
                "formats": [],
            }

    async def download_media(self, url: str, media_type: str = "video",
                             quality: str = "720p", user_id: str = "0") -> Dict:
        # Deteksi Spotify
        if "open.spotify.com" in url:
            return await self.download_spotify(url, user_id)
        
        # Sanitasi user_id agar aman sebagai nama file
        user_id   = re.sub(r"[^a-zA-Z0-9]", "", user_id) or "0"
        timestamp = int(asyncio.get_event_loop().time() * 1000)
        out_tmpl  = str(DOWNLOAD_DIR / f"{user_id}_{timestamp}.%(ext)s")

        if media_type == "mp3":
            extra = {
                "outtmpl": out_tmpl,
                "format":  "bestaudio/best",
                "postprocessors": [{
                    "key":              "FFmpegExtractAudio",
                    "preferredcodec":   "mp3",
                    "preferredquality": "192",
                }],
            }
        else:
            h = quality.replace("p", "")
            # Format selection yang lebih fleksibel:
            # Cari video+audio dengan syarat tinggi, ATAU ambil yang terbaik saja (fallback)
            fmt = f"bestvideo[height<={h}]+bestaudio/best[height<={h}]/best[height<={h}]/best"
            extra = {
                "outtmpl":              out_tmpl,
                "format":               fmt,
                "merge_output_format":  "mp4",
            }
            
            if "twitter.com" in url or "x.com" in url:
                extra["extractor_args"] = {"twitter": {"api": ["syndication"]}}

        try:
            with yt_dlp.YoutubeDL(self._ydl_opts(extra)) as ydl:
                info = await asyncio.get_event_loop().run_in_executor(
                    None, lambda: ydl.extract_info(url, download=True)
                )

                # Cari file output yang sebenarnya (ekstensi bisa beda)
                base_name = f"{user_id}_{timestamp}"
                actual    = None
                for ext in [".mp3", ".mp4", ".mkv", ".webm", ".m4a"]:
                    candidate = DOWNLOAD_DIR / (base_name + ext)
                    if candidate.exists():
                        actual = candidate
                        break

                if not actual:
                    # Fallback: cari file terbaru dengan prefix
                    files = sorted(
                        DOWNLOAD_DIR.glob(f"{base_name}*"),
                        key=lambda f: f.stat().st_mtime,
                        reverse=True
                    )
                    actual = files[0] if files else None

                if not actual:
                    return {"status": "error", "message": "File tidak ditemukan setelah download."}

                return {
                    "status":   "success",
                    "file_path": str(actual),
                    "filename":  actual.name,
                    "size_mb":   round(actual.stat().st_size / (1024 * 1024), 2),
                }
        except Exception as e:
            print(f"🔴 Download error: {e}")
            return {"status": "error", "message": str(e)}

    async def download_spotify(self, url: str, user_id: str = "0") -> Dict:
        """Extract metadata lengkap dari Spotify untuk rekomendasi musik."""
        if not SPOTDL_AVAILABLE:
            return {
                "status": "error",
                "message": "Spotify metadata tidak tersedia. Hubungi admin untuk setup."
            }

        try:
            print(f"🎵 Spotify metadata extraction: {url}")

            # Import spotdl untuk metadata extraction
            from spotdl.utils.metadata import get_metadata

            # Extract metadata menggunakan spotdl
            metadata = await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: get_metadata(url)
            )

            if not metadata:
                return {
                    "status": "error",
                    "message": "Gagal mengambil metadata Spotify."
                }

            # Return metadata lengkap untuk rekomendasi
            return {
                "status": "metadata_only",
                "title": metadata.get("name", "Unknown"),
                "artist": metadata.get("artists", ["Unknown"])[0],
                "album": metadata.get("album_name", "Unknown"),
                "duration": metadata.get("duration", 0),
                "genres": metadata.get("genres", []),
                "popularity": metadata.get("popularity", 0),
                "release_date": metadata.get("release_date", ""),
                "spotify_id": metadata.get("spotify_id", ""),
                "thumbnail": metadata.get("cover_url", ""),
                "preview_url": metadata.get("preview_url", ""),
                "external_urls": metadata.get("external_urls", {}),
                "recommendations": await self._get_music_recommendations(metadata),
            }

        except Exception as e:
            print(f"🔴 Spotify metadata error: {e}")
            return {
                "status": "error",
                "message": f"Spotify metadata error: {str(e)[:100]}"
            }

    async def _get_music_recommendations(self, metadata: Dict) -> List[Dict]:
        """Generate music recommendations berdasarkan metadata Spotify."""
        try:
            # Simple recommendation logic berdasarkan genre dan artis
            recommendations = []

            # Jika ada genre, cari musik serupa
            genres = metadata.get("genres", [])
            artist = metadata.get("artists", ["Unknown"])[0]

            # Mock recommendations (dalam implementasi nyata bisa pakai Spotify API)
            # atau AI untuk generate recommendations
            base_recs = [
                {
                    "title": f"Similar to {metadata.get('name', 'this song')}",
                    "artist": f"Artist like {artist}",
                    "reason": "Based on genre and style",
                    "spotify_url": f"https://open.spotify.com/search/{artist.replace(' ', '%20')}"
                },
                {
                    "title": f"Popular in {genres[0] if genres else 'your taste'}",
                    "artist": "Various Artists",
                    "reason": "Trending in your preferred genre",
                    "spotify_url": f"https://open.spotify.com/genre/{genres[0] if genres else 'pop'}"
                },
                {
                    "title": f"Discover new {artist} tracks",
                    "artist": artist,
                    "reason": "More from this artist",
                    "spotify_url": f"https://open.spotify.com/artist/{metadata.get('artists_ids', [''])[0]}"
                }
            ]

            recommendations.extend(base_recs)

            # Jika ada AI service, bisa pakai untuk rekomendasi lebih canggih
            if hasattr(self, 'ai_service') and self.ai_service:
                try:
                    prompt = f"Berikan 2 rekomendasi musik serupa dengan '{metadata.get('name', '')}' oleh {artist} dalam genre {', '.join(genres) if genres else 'pop'}. Format: Judul - Artis"
                    ai_response = await self.ai_service.generate_response(prompt, [])
                    # Parse AI response untuk recommendations tambahan
                    if ai_response and " - " in ai_response:
                        lines = ai_response.split("\n")[:2]
                        for line in lines:
                            if " - " in line:
                                title, rec_artist = line.split(" - ", 1)
                                recommendations.append({
                                    "title": title.strip(),
                                    "artist": rec_artist.strip(),
                                    "reason": "AI-powered recommendation",
                                    "spotify_url": f"https://open.spotify.com/search/{title.strip().replace(' ', '%20')}%20{rec_artist.strip().replace(' ', '%20')}"
                                })
                except Exception as e:
                    print(f"⚠️ AI recommendation failed: {e}")

            return recommendations[:5]  # Max 5 recommendations

        except Exception as e:
            print(f"🔴 Recommendation error: {e}")
            return []

    async def download_photos(self, url: str, user_id: str = "0") -> List[Dict]:
        """Routing download foto berdasarkan platform."""
        if "instagram.com" in url:
            return await self.download_instagram_photos(url, user_id)
        else:
            return await self.download_generic_photos(url, user_id)

    async def download_generic_photos(self, url: str, user_id: str = "0") -> List[Dict]:
        """Download foto dari Twitter/X, Facebook, dll menggunakan yt-dlp."""
        user_id_clean = re.sub(r"[^a-zA-Z0-9]", "", user_id) or "0"
        timestamp     = int(asyncio.get_event_loop().time() * 1000)
        out_dir       = DOWNLOAD_DIR / f"photo_{user_id_clean}_{timestamp}"
        os.makedirs(out_dir, exist_ok=True)

        opts = self._ydl_opts({
            "outtmpl":            str(out_dir / "%(index)s_%(title)s.%(ext)s"),
            "format":             "bestimage/best",
            "writethumbnail":     True,
            "skip_download":      False,
            "allow_playlist_files": True,
        })

        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                await asyncio.get_event_loop().run_in_executor(
                    None, lambda: ydl.download([url])
                )
        except Exception as e:
            print(f"🔴 Generic photo download error: {e}")
            return []

        photos = []
        for f in out_dir.glob("*"):
            if f.suffix.lower() in [".jpg", ".jpeg", ".png", ".webp", ".jfif"]:
                photos.append({
                    "file_path": str(f),
                    "size_mb":   round(f.stat().st_size / (1024 * 1024), 2),
                })
        
        # Jika tidak ada file tapi folder ada, bersihkan jika kosong
        if not photos and out_dir.exists():
            shutil.rmtree(out_dir, ignore_errors=True)
            
        return photos

    async def download_instagram_photos(self, url: str, user_id: str = "0") -> List[Dict]:
        match = re.search(r"/(?:p|reel|tv|stories)/([A-Za-z0-9_-]+)", url)
        if not match:
            print(f"🔴 IG: shortcode tidak ditemukan dari URL: {url}")
            return []

        shortcode = match.group(1)
        out_dir   = DOWNLOAD_DIR / f"ig_{re.sub(r'[^a-zA-Z0-9]', '', user_id)}_{shortcode}"
        os.makedirs(out_dir, exist_ok=True)

        try:
            post = instaloader.Post.from_shortcode(self.ig.context, shortcode)
            await asyncio.get_event_loop().run_in_executor(
                None, lambda: self.ig.download_post(post, target=str(out_dir))
            )
        except instaloader.exceptions.LoginRequiredException:
            print(f"🔴 IG: login required untuk {shortcode}")
            return []
        except Exception as e:
            print(f"🔴 IG download error: {e}")
            return []

        photos = []
        for f in out_dir.glob("*"):
            if f.suffix.lower() in [".jpg", ".jpeg", ".png", ".webp"]:
                photos.append({
                    "file_path": str(f),
                    "size_mb":   round(f.stat().st_size / (1024 * 1024), 2),
                })
        return photos


download_service = DownloadService()