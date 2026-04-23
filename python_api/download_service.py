# ============================================================
#  download_service.py — yt-dlp + instaloader engine
#  IMPROVEMENT: Lebih robust, log lebih baik, timeout,
#  sanitasi user_id, handle file ekstensi dinamis yt-dlp.
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

    async def download_media(self, url: str, media_type: str = "video",
                             quality: str = "720p", user_id: str = "0") -> Dict:
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