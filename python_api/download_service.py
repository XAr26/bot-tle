import os
import asyncio
import yt_dlp
import instaloader
from pathlib import Path
from typing import Dict, Optional, List
from dotenv import load_dotenv

load_dotenv()

DOWNLOAD_DIR = Path(__file__).parent.parent / "downloads"
THUMB_DIR = Path(__file__).parent.parent / "thumbs"
COOKIES_FILE = Path(__file__).parent.parent / "cookies.txt"

os.makedirs(DOWNLOAD_DIR, exist_ok=True)
os.makedirs(THUMB_DIR, exist_ok=True)

class DownloadService:
    def __init__(self):
        self.ig = instaloader.Instaloader()
        self.ig_user = os.getenv("IG_USERNAME")
        if self.ig_user:
            try:
                # Attempt to load session if exists
                session_file = Path.home() / f".config/instaloader/session-{self.ig_user}"
                if session_file.exists():
                    self.ig.load_session_from_file(self.ig_user, str(session_file))
            except Exception as e:
                print(f"IG Session load error: {e}")

    async def get_metadata(self, url: str) -> Optional[Dict]:
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'user_agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        }
        if COOKIES_FILE.exists():
            ydl_opts['cookiefile'] = str(COOKIES_FILE)

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)
                return {
                    "title": info.get("title", "Unknown"),
                    "uploader": info.get("uploader", info.get("channel", "Unknown")),
                    "duration": info.get("duration", 0),
                    "thumbnail": info.get("thumbnail"),
                    "viewCount": info.get("view_count", 0),
                    "likeCount": info.get("like_count", 0),
                    "formats": list(set([f"{f.get('height')}p" for f in info.get("formats", []) if f.get("height")])),
                    "platform": info.get("extractor_key", "generic").lower()
                }
        except Exception as e:
            print(f"Metadata error: {e}")
            return None

    async def download_media(self, url: str, media_type: str = "video", quality: str = "720p", user_id: str = "0") -> Dict:
        user_id = "".join(c for c in user_id if c.isalnum()) or "0"
        timestamp = int(asyncio.get_event_loop().time() * 1000)
        ext = "mp3" if media_type == "mp3" else "mp4"
        output_tmpl = str(DOWNLOAD_DIR / f"{user_id}_{timestamp}.%(ext)s")
        
        ydl_opts = {
            'outtmpl': output_tmpl,
            'user_agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        }
        
        if COOKIES_FILE.exists():
            ydl_opts['cookiefile'] = str(COOKIES_FILE)

        if media_type == "mp3":
            ydl_opts.update({
                'format': 'bestaudio/best',
                'postprocessors': [{
                    'key': 'FFmpegExtractAudio',
                    'preferredcodec': 'mp3',
                    'preferredquality': '192',
                }],
            })
        else:
            # Video quality fallback
            fmt = f"bestvideo[height<={quality[:-1]}]+bestaudio/best[height<={quality[:-1]}]/best"
            ydl_opts.update({
                'format': fmt,
                'merge_output_format': 'mp4',
            })

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=True)
                # Find the actual file (yt-dlp might change extension)
                downloaded_file = ydl.prepare_filename(info)
                if not os.path.exists(downloaded_file):
                    # Check for .mp3 or .mp4 specifically if prepare_filename is slightly off
                    base = os.path.splitext(downloaded_file)[0]
                    for e in ['.mp3', '.mp4', '.mkv', '.webm']:
                        if os.path.exists(base + e):
                            downloaded_file = base + e
                            break
                
                return {
                    "status": "success",
                    "file_path": str(downloaded_file),
                    "filename": os.path.basename(downloaded_file),
                    "size_mb": round(os.path.getsize(downloaded_file) / (1024 * 1024), 2)
                }
        except Exception as e:
            return {"status": "error", "message": str(e)}

    async def download_instagram_photos(self, url: str, user_id: str) -> List[Dict]:
        user_id = "".join(c for c in user_id if c.isalnum()) or "0"
        # Simple extraction using instaloader
        try:
            import re
            shortcode_match = re.search(r"/(?:p|reel|tv|stories)/([A-Za-z0-9_-]+)", url)
            if not shortcode_match:
                return []
            
            shortcode = shortcode_match.group(1)
            post = instaloader.Post.from_shortcode(self.ig.context, shortcode)
            
            out_dir = DOWNLOAD_DIR / f"ig_{user_id}_{shortcode}"
            os.makedirs(out_dir, exist_ok=True)
            
            self.ig.download_post(post, target=str(out_dir))
            
            photos = []
            for file in out_dir.glob("*"):
                if file.suffix.lower() in [".jpg", ".jpeg", ".png"]:
                    photos.append({
                        "file_path": str(file),
                        "size_mb": round(os.path.getsize(file) / (1024 * 1024), 2)
                    })
            return photos
        except Exception as e:
            print(f"IG Photo error: {e}")
            return []

download_service = DownloadService()
