// ============================================================
//  downloader.js  — Engine download + queue + metadata
// ============================================================
const { exec }   = require("child_process");
const fs         = require("fs");
const path       = require("path");
const { EventEmitter } = require("events");

// ─── Direktori ───────────────────────────────────────────────
const DOWNLOAD_DIR = path.join(__dirname, "downloads");
const THUMB_DIR    = path.join(__dirname, "thumbs");

for (const dir of [DOWNLOAD_DIR, THUMB_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ─── Konstanta ───────────────────────────────────────────────
const MAX_FILE_MB      = 49;           // batas upload Telegram
const EXEC_TIMEOUT     = 3 * 60_000;   // 3 menit max per download
const MAX_RETRIES      = 2;            // retry otomatis jika gagal

// Browser untuk ambil cookies — ganti sesuai browser yang kamu pakai
// Pilihan: chrome, chromium, firefox, vivaldi, brave, edge, opera
const COOKIES_BROWSER  = process.env.COOKIES_BROWSER || "vivaldi";

// Platform yang butuh cookies login agar bisa diakses
const NEEDS_COOKIES    = ["instagram", "facebook", "twitter"];

// Tambah flag cookies kalau platform membutuhkannya
function cookiesFlag(platformKey) {
  if (NEEDS_COOKIES.includes(platformKey)) {
    return `--cookies-from-browser ${COOKIES_BROWSER}`;
  }
  return "";
}

// ─── Platform Detection ──────────────────────────────────────
const PLATFORMS = {
  youtube:   { regex: /youtube\.com|youtu\.be/,              label: "YouTube",   icon: "🎬" },
  instagram: { regex: /instagram\.com/,                       label: "Instagram", icon: "📸" },
  tiktok:    { regex: /tiktok\.com|vm\.tiktok/,              label: "TikTok",    icon: "🎵" },
  twitter:   { regex: /twitter\.com|x\.com/,                 label: "Twitter/X", icon: "🐦" },
  facebook:  { regex: /facebook\.com|fb\.watch|fb\.com/,     label: "Facebook",  icon: "👤" },
  soundcloud:{ regex: /soundcloud\.com/,                     label: "SoundCloud",icon: "🎧" },
  spotify:   { regex: /open\.spotify\.com/,                  label: "Spotify",   icon: "🎵" },
  reddit:    { regex: /reddit\.com|redd\.it/,                label: "Reddit",    icon: "🤖" },
  twitch:    { regex: /twitch\.tv/,                          label: "Twitch",    icon: "🎮" },
  generic:   { regex: /.*/,                                  label: "Generic",   icon: "🌐" },
};

function detectPlatform(url) {
  for (const [key, p] of Object.entries(PLATFORMS)) {
    if (p.regex.test(url)) return { key, ...p };
  }
  return { key: "generic", ...PLATFORMS.generic };
}

// ─── Format Builder ──────────────────────────────────────────
function buildCommand({ url, type, quality, outputPath, platformKey = "generic" }) {
  // Selalu quote URL untuk cegah injection
  const safeUrl  = `"${url.replace(/"/g, '')}"`;
  const out      = `"${outputPath}"`;
  const noList   = "--no-playlist";
  const noWarn   = "--no-warnings";
  const cookies  = cookiesFlag(platformKey);  // "" kalau tidak butuh cookies

  if (type === "mp3" || type === "audio") {
    return `yt-dlp ${noList} ${noWarn} ${cookies} -x --audio-format mp3 --audio-quality 0 -o ${out} ${safeUrl}`;
  }

  if (type === "thumbnail") {
    return `yt-dlp ${noList} ${noWarn} ${cookies} --skip-download --write-thumbnail --convert-thumbnails jpg -o ${out} ${safeUrl}`;
  }

  // 🖼️ Foto — download semua gambar dari post (Instagram, Twitter, dll)
  if (type === "photo") {
    return `yt-dlp ${noList} ${noWarn} ${cookies} --skip-download --write-thumbnail --convert-thumbnails jpg -o ${out} ${safeUrl}`;
  }

  // Video — pilih resolusi
  const qualityMap = {
    "360p":  "bestvideo[height<=360]+bestaudio/best[height<=360]",
    "480p":  "bestvideo[height<=480]+bestaudio/best[height<=480]",
    "720p":  "bestvideo[height<=720]+bestaudio/best[height<=720]",
    "1080p": "bestvideo[height<=1080]+bestaudio/best[height<=1080]",
    "best":  "bestvideo+bestaudio/best",
  };

  const fmt = qualityMap[quality] || qualityMap["720p"];
  return `yt-dlp ${noList} ${noWarn} ${cookies} -f "${fmt}" --merge-output-format mp4 -o ${out} ${safeUrl}`;
}

// ─── Metadata Fetcher ─────────────────────────────────────────
async function fetchMetadata(url) {
  const safeUrl    = `"${url.replace(/"/g, '')}"`;
  const platform   = detectPlatform(url);
  const cookies    = cookiesFlag(platform.key);

  return new Promise((resolve) => {
    exec(
      `yt-dlp --no-warnings --dump-json --no-playlist ${cookies} ${safeUrl}`,
      { timeout: 20_000 },
      (err, stdout) => {
        if (err || !stdout) return resolve(null);
        try {
          const d = JSON.parse(stdout.trim().split("\n")[0]);
          resolve({
            title:     d.title     || "Unknown",
            uploader:  d.uploader  || d.channel || "Unknown",
            duration:  d.duration  || 0,
            thumbnail: d.thumbnail || null,
            viewCount: d.view_count|| 0,
            likeCount: d.like_count|| 0,
            formats:   (d.formats || [])
                         .filter(f => f.height)
                         .map(f => f.height + "p")
                         .filter((v, i, a) => a.indexOf(v) === i)
                         .sort((a, b) => parseInt(a) - parseInt(b)),
          });
        } catch {
          resolve(null);
        }
      }
    );
  });
}

// ─── File Size Helper ─────────────────────────────────────────
function fileSizeMB(fp) {
  try { return fs.statSync(fp).size / (1024 * 1024); } catch { return 0; }
}

function cleanUp(fp) {
  if (fp && fs.existsSync(fp)) fs.unlink(fp, () => {});
}

// ─── Core Downloader ─────────────────────────────────────────
function execAsync(cmd, attempt = 1) {
  return new Promise((resolve, reject) => {
    const proc = exec(cmd, { timeout: EXEC_TIMEOUT }, (err, stdout, stderr) => {
      if (err) {
        const msg = stderr || err.message || "unknown error";

        // Cek error umum & terjemahkan
        if (/Private|private video/.test(msg))        return reject(new DownloadError("PRIVATE",   "Video bersifat privat."));
        if (/not available|unavailable/.test(msg))    return reject(new DownloadError("UNAVAIL",   "Video tidak tersedia."));
        if (/age.restricted|age.limit/.test(msg))     return reject(new DownloadError("AGE",       "Video dibatasi usia."));
        if (/copyright|removed/.test(msg))            return reject(new DownloadError("COPYRIGHT", "Video dihapus/copyright."));
        if (/HTTP Error 404/.test(msg))               return reject(new DownloadError("NOT_FOUND", "Link tidak ditemukan."));
        if (/Unable to extract/.test(msg))            return reject(new DownloadError("EXTRACT",   "Gagal ekstrak link."));

        return reject(new DownloadError("GENERAL", msg.slice(0, 200)));
      }
      resolve(stdout);
    });
  });
}

class DownloadError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

// ─── Download Task ────────────────────────────────────────────
async function downloadMedia({ url, type = "video", quality = "720p", userId }) {
  const platform   = detectPlatform(url);
  const timestamp  = Date.now();
  const ext        = (type === "mp3" || type === "audio") ? "mp3" : "mp4";
  const outputPath = path.join(DOWNLOAD_DIR, `${userId}_${timestamp}.${ext}`);

  let lastErr = null;

  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    try {
      // Sertakan platformKey agar buildCommand tahu apakah perlu cookies
      const cmd = buildCommand({ url, type, quality, outputPath, platformKey: platform.key });
      await execAsync(cmd, attempt);

      // Validasi file ada & tidak terlalu besar
      if (!fs.existsSync(outputPath)) {
        throw new DownloadError("NO_FILE", "File tidak ditemukan setelah download.");
      }

      const sizeMB = fileSizeMB(outputPath);
      if (sizeMB > MAX_FILE_MB) {
        cleanUp(outputPath);
        throw new DownloadError("TOO_BIG", `File terlalu besar (${sizeMB.toFixed(1)} MB). Coba kualitas lebih rendah.`);
      }

      return { filePath: outputPath, platform, sizeMB: sizeMB.toFixed(1) };

    } catch (err) {
      lastErr = err;
      // Jangan retry untuk error yang pasti
      const noRetry = ["PRIVATE", "AGE", "COPYRIGHT", "NOT_FOUND", "TOO_BIG"];
      if (noRetry.includes(err.code)) break;

      if (attempt <= MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 2000 * attempt)); // backoff
      }
    }
  }

  cleanUp(outputPath);
  throw lastErr || new DownloadError("GENERAL", "Download gagal.");
}

// ─── Ekstrak shortcode dari URL Instagram ─────────────────────
function extractInstagramShortcode(url) {
  // Cocokkan /p/CODE, /reel/CODE, /tv/CODE
  const match = url.match(/\/(p|reel|tv)\/([A-Za-z0-9_-]+)/);
  return match ? match[2] : null;
}

// ─── Download Foto Instagram via instaloader ──────────────────
async function downloadPhotosInstagram({ url, userId }) {
  const shortcode = extractInstagramShortcode(url);
  if (!shortcode) throw new DownloadError("EXTRACT", "Shortcode Instagram tidak ditemukan.");

  const timestamp  = Date.now();
  const outDir     = path.join(DOWNLOAD_DIR, `ig_${userId}_${timestamp}`);
  const igUser     = process.env.IG_USERNAME || "";

  if (!igUser) throw new DownloadError("NO_CRED", "IG_USERNAME belum diset di .env");

  // Pakai session yang sudah ada (hasil login manual sebelumnya)
  const cmd = `instaloader --login ${igUser} --no-videos --no-metadata-json `
            + `--dirname-pattern "${outDir}" -- -${shortcode}`;

  await new Promise((resolve, reject) => {
    exec(cmd, { timeout: 60_000 }, (err, stdout, stderr) => {
      // instaloader kadang exit code non-0 tapi file tetap terdownload
      // jadi kita cek file-nya langsung, bukan error code
      resolve();
    });
  });

  // Ambil semua .jpg hasil download
  if (!fs.existsSync(outDir)) throw new DownloadError("EXTRACT", "Folder output tidak ditemukan.");

  const files = fs.readdirSync(outDir)
    .filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f))
    .map(f => path.join(outDir, f));

  if (!files.length) throw new DownloadError("EXTRACT", "Tidak ada foto yang berhasil didownload.");

  const photos = [];
  for (const filePath of files) {
    const sizeMB = fileSizeMB(filePath);
    if (sizeMB > MAX_FILE_MB) { cleanUp(filePath); continue; }
    photos.push({ filePath, sizeMB: sizeMB.toFixed(1), tmpDir: outDir });
  }

  if (!photos.length) throw new DownloadError("TOO_BIG", "Semua foto terlalu besar (>49MB).");

  return photos;
}

// ─── Download Foto Twitter/Facebook/Reddit via yt-dlp ─────────
async function downloadPhotosYtdlp({ url, userId }) {
  const safeUrl   = `"${url.replace(/"/g, '')}"`;
  const timestamp = Date.now();
  const platform  = detectPlatform(url);
  const cookies   = cookiesFlag(platform.key);

  const metaRaw = await new Promise((resolve, reject) => {
    exec(
      `yt-dlp --no-warnings --dump-json --no-playlist ${cookies} ${safeUrl}`,
      { timeout: 20_000 },
      (err, stdout, stderr) => {
        if (err || !stdout) {
          const msg = stderr || "";
          if (/login|checkpoint|not logged in/i.test(msg))
            return reject(new DownloadError("LOGIN", "Perlu login browser dulu."));
          return reject(new DownloadError("EXTRACT", "Gagal ambil data foto."));
        }
        resolve(stdout.trim());
      }
    );
  });

  const entries = metaRaw
    .split("\n").filter(Boolean)
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);

  if (!entries.length) throw new DownloadError("EXTRACT", "Tidak ada data foto.");

  const axios  = require("axios");
  const photos = [];

  for (const entry of entries) {
    let imageUrl = null;

    if (Array.isArray(entry.thumbnails) && entry.thumbnails.length) {
      const sorted = [...entry.thumbnails]
        .filter(t => t.url)
        .sort((a, b) => (b.width || 0) - (a.width || 0));
      imageUrl = sorted[0]?.url;
    }
    if (!imageUrl) imageUrl = entry.thumbnail;
    if (!imageUrl) continue;

    const outPath = path.join(DOWNLOAD_DIR, `${userId}_photo_${timestamp}_${photos.length}.jpg`);
    try {
      const res = await axios.get(imageUrl, {
        responseType: "arraybuffer", timeout: 30_000,
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      fs.writeFileSync(outPath, res.data);
      const sizeMB = fileSizeMB(outPath);
      if (sizeMB > MAX_FILE_MB) { cleanUp(outPath); continue; }
      photos.push({ filePath: outPath, sizeMB: sizeMB.toFixed(1) });
    } catch {
      if (fs.existsSync(outPath)) cleanUp(outPath);
    }
  }

  if (!photos.length) throw new DownloadError("EXTRACT", "Tidak ada foto yang berhasil didownload.");
  return photos;
}

// ─── Router: pilih engine sesuai platform ─────────────────────
async function downloadPhotos({ url, userId }) {
  const platform = detectPlatform(url);

  if (platform.key === "instagram") {
    return downloadPhotosInstagram({ url, userId });
  }

  // Twitter, Facebook, Reddit → pakai yt-dlp
  return downloadPhotosYtdlp({ url, userId });
}


class DownloadQueue extends EventEmitter {
  constructor() {
    super();
    this._queues = {};   // { userId: [ taskFn, ... ] }
    this._active = {};   // { userId: boolean }
    this._stats  = { total: 0, success: 0, failed: 0 };
  }

  enqueue(userId, taskFn) {
    if (!this._queues[userId]) this._queues[userId] = [];
    this._queues[userId].push(taskFn);
    this._stats.total++;
    this._process(userId);

    return {
      position: this._queues[userId].length,
      queuedAt: new Date(),
    };
  }

  async _process(userId) {
    if (this._active[userId]) return;
    if (!this._queues[userId]?.length) return;

    this._active[userId] = true;
    const task = this._queues[userId].shift();

    try {
      const result = await task();
      this._stats.success++;
      this.emit("done", { userId, result });
    } catch (err) {
      this._stats.failed++;
      this.emit("error", { userId, err });
    } finally {
      this._active[userId] = false;
      this._process(userId); // proses antrian berikutnya
    }
  }

  queueLength(userId) {
    return (this._queues[userId] || []).length;
  }

  isActive(userId) {
    return !!this._active[userId];
  }

  getStats() {
    return { ...this._stats };
  }
}

const queue = new DownloadQueue();

module.exports = {
  downloadMedia,
  downloadPhotos,
  fetchMetadata,
  detectPlatform,
  cleanUp,
  queue,
  PLATFORMS,
};