// ============================================================
//  downloader.js  — Engine download + queue + metadata
// ============================================================
"use strict";

const { exec }         = require("child_process");
const fs               = require("fs");
const path             = require("path");
const { EventEmitter } = require("events");
const config           = require("./config");

const YT_DLP_BIN = process.env.YT_DLP_PATH || "yt-dlp";

// ─── Direktori ───────────────────────────────────────────────
const DOWNLOAD_DIR = path.join(__dirname, "downloads");
const THUMB_DIR    = path.join(__dirname, "thumbs");

for (const dir of [DOWNLOAD_DIR, THUMB_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ─── Cek dependencies tersedia saat startup ──────────────────
exec(`which ${YT_DLP_BIN} || command -v ${YT_DLP_BIN}`, (err, stdout) => {
  if (err || !stdout.trim()) {
    console.error(`⚠️  ${YT_DLP_BIN} tidak ditemukan! Download mungkin gagal.`);
  } else {
    console.log(`✅ ${YT_DLP_BIN} ditemukan:`, stdout.trim());
  }
});

exec("ffmpeg -version", (err) => {
  if (err) {
    console.error("⚠️  ffmpeg tidak ditemukan! Video merging akan gagal.");
  } else {
    console.log("✅ ffmpeg terdeteksi dan siap digunakan.");
  }
});

// ─── Konstanta ───────────────────────────────────────────────
const { maxFileMB: MAX_FILE_MB, execTimeout: EXEC_TIMEOUT, maxRetries: MAX_RETRIES } = config.download;

// ─── Cookies Helper ──────────────────────────────────────────
/**
 * Kembalikan flag --cookies jika platform membutuhkannya
 * dan file cookies.txt tersedia.
 *
 * Path cookies bisa dikonfigurasi via COOKIES_PATH di .env,
 * fallback ke cookies.txt di root project.
 */
function cookiesFlag(platformKey) {
  if (!config.download.cookiesPlatforms.includes(platformKey)) return "";

  // 1. Prioritas: File cookies.txt (Paling stabil untuk server)
  const candidates = [
    config.download.cookiesPath,
    path.join(__dirname, "..", "cookies.txt"),
  ].filter(Boolean);

  for (const p of candidates) {
    if (fs.existsSync(p)) return `--cookies "${p}"`;
  }

  // 2. Fallback: Browser cookies (Untuk lokal, misal --cookies-from-browser vivaldi)
  if (config.download.cookiesBrowser) {
    return `--cookies-from-browser ${config.download.cookiesBrowser}`;
  }

  return "";
}

// ─── Platform Detection ──────────────────────────────────────
const PLATFORMS = {
  youtube:    { regex: /youtube\.com|youtu\.be/,           label: "YouTube",    icon: "🎬" },
  instagram:  { regex: /instagram\.com/,                    label: "Instagram",  icon: "📸" },
  tiktok:     { regex: /tiktok\.com|vm\.tiktok/,           label: "TikTok",     icon: "🎵" },
  twitter:    { regex: /twitter\.com|x\.com/,              label: "Twitter/X",  icon: "🐦" },
  facebook:   { regex: /facebook\.com|fb\.watch|fb\.com/,  label: "Facebook",   icon: "👤" },
  soundcloud: { regex: /soundcloud\.com/,                  label: "SoundCloud", icon: "🎧" },
  spotify:    { regex: /open\.spotify\.com/,               label: "Spotify",    icon: "🎵" },
  reddit:     { regex: /reddit\.com|redd\.it/,             label: "Reddit",     icon: "🤖" },
  twitch:     { regex: /twitch\.tv/,                       label: "Twitch",     icon: "🎮" },
  generic:    { regex: /.*/,                               label: "Generic",    icon: "🌐" },
};

function detectPlatform(url) {
  for (const [key, p] of Object.entries(PLATFORMS)) {
    if (p.regex.test(url)) return { key, ...p };
  }
  return { key: "generic", ...PLATFORMS.generic };
}

// ─── Format Builder ──────────────────────────────────────────
function buildCommand({ url, type, quality, outputPath, platformKey = "generic" }) {
  // Sanitasi URL — hapus double-quote untuk cegah injection
  const safeUrl = `"${url.replace(/"/g, "")}"`;
  const out     = `"${outputPath}"`;
  const noList  = "--no-playlist";
  const noWarn  = "--no-warnings";
  const cookies = cookiesFlag(platformKey);

  if (type === "mp3" || type === "audio") {
    return `${YT_DLP_BIN} ${noList} ${noWarn} ${cookies} -x --audio-format mp3 --audio-quality 0 -o ${out} ${safeUrl}`;
  }

  if (type === "thumbnail") {
    return `${YT_DLP_BIN} ${noList} ${noWarn} ${cookies} --skip-download --write-thumbnail --convert-thumbnails jpg -o ${out} ${safeUrl}`;
  }

  // FIX: type "photo" seharusnya download semua gambar dari post,
  // bukan --skip-download. Gunakan format terbaik yang tersedia.
  if (type === "photo") {
    return `${YT_DLP_BIN} ${noList} ${noWarn} ${cookies} -o ${out} ${safeUrl}`;
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
  return `${YT_DLP_BIN} ${noList} ${noWarn} ${cookies} -f "${fmt}" --merge-output-format mp4 -o ${out} ${safeUrl}`;
}

// ─── Metadata Fetcher ─────────────────────────────────────────
async function fetchMetadata(url) {
  const safeUrl  = `"${url.replace(/"/g, "")}"`;
  const platform = detectPlatform(url);
  const cookies  = cookiesFlag(platform.key);

  return new Promise((resolve) => {
    exec(
      `${YT_DLP_BIN} --no-warnings --dump-json --no-playlist ${cookies} ${safeUrl}`,
      { timeout: 20_000 },
      (err, stdout) => {
        if (err || !stdout) return resolve(null);
        try {
          const d = JSON.parse(stdout.trim().split("\n")[0]);
          resolve({
            title:     d.title      || "Unknown",
            uploader:  d.uploader   || d.channel || "Unknown",
            duration:  d.duration   || 0,
            thumbnail: d.thumbnail  || null,
            viewCount: d.view_count || 0,
            likeCount: d.like_count || 0,
            formats: (d.formats || [])
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

// ─── Custom Error ─────────────────────────────────────────────
class DownloadError extends Error {
  constructor(code, message) {
    super(message);
    this.name  = "DownloadError";
    this.code  = code;
  }
}

// ─── Exec Wrapper ─────────────────────────────────────────────
function execAsync(cmd) {
  return new Promise((resolve, reject) => {
    // Log command ke console agar terlihat di Railway logs
    console.log(`[exec] ${cmd}`);

    exec(cmd, { timeout: EXEC_TIMEOUT }, (err, stdout, stderr) => {
      if (err) {
        const msg = stderr || err.message || "unknown error";

        // Log raw error ke Railway logs untuk debugging
        console.error(`[exec error] code=${err.code} msg=${msg.slice(0, 300)}`);

        // yt-dlp tidak ditemukan di PATH
        if (err.code === 127 || /not found|No such file/i.test(msg))
          return reject(new DownloadError("NOT_INSTALLED", "yt-dlp tidak terinstall di server."));

        if (/Private|private video/i.test(msg))       return reject(new DownloadError("PRIVATE",   "Video bersifat privat."));
        if (/not available|unavailable/i.test(msg))   return reject(new DownloadError("UNAVAIL",   "Video tidak tersedia."));
        if (/age.restricted|age.limit/i.test(msg))    return reject(new DownloadError("AGE",       "Video dibatasi usia."));
        if (/copyright|removed/i.test(msg))           return reject(new DownloadError("COPYRIGHT", "Video dihapus/copyright."));
        if (/HTTP Error 404/i.test(msg))              return reject(new DownloadError("NOT_FOUND", "Link tidak ditemukan."));
        if (/Unable to extract/i.test(msg))           return reject(new DownloadError("EXTRACT",   "Gagal ekstrak link."));

        return reject(new DownloadError("GENERAL", `Download gagal: ${msg.slice(0, 150)}`));
      }
      resolve(stdout);
    });
  });
}

// ─── Download Task ────────────────────────────────────────────
async function downloadMedia({ url, type = "video", quality = "720p", userId }) {
  const platform   = detectPlatform(url);
  const timestamp  = Date.now();
  const isAudio    = (type === "mp3" || type === "audio");
  const ext        = isAudio ? "mp3" : "mp4";
  const outputPath = path.join(DOWNLOAD_DIR, `${userId}_${timestamp}.${ext}`);

  // FIX: yt-dlp kadang output ekstensi berbeda (.webm, .mkv)
  // Cari file dengan nama prefix yang sama setelah download
  function findActualOutput() {
    const prefix = `${userId}_${timestamp}`;
    const files  = fs.readdirSync(DOWNLOAD_DIR)
      .filter(f => f.startsWith(prefix))
      .map(f => path.join(DOWNLOAD_DIR, f));
    return files.length ? files[0] : null;
  }

  let lastErr = null;

  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    try {
      const cmd = buildCommand({ url, type, quality, outputPath, platformKey: platform.key });
      await execAsync(cmd);

      // FIX: cari file output yang sebenarnya (bisa beda ekstensi)
      const actualPath = fs.existsSync(outputPath) ? outputPath : findActualOutput();

      if (!actualPath) {
        throw new DownloadError("NO_FILE", "File tidak ditemukan setelah download.");
      }

      const sizeMB = fileSizeMB(actualPath);
      if (sizeMB > MAX_FILE_MB) {
        cleanUp(actualPath);
        throw new DownloadError("TOO_BIG", `File terlalu besar (${sizeMB.toFixed(1)} MB). Coba kualitas lebih rendah.`);
      }

      return { filePath: actualPath, platform, sizeMB: sizeMB.toFixed(1) };

    } catch (err) {
      lastErr = err;
      const noRetry = ["PRIVATE", "AGE", "COPYRIGHT", "NOT_FOUND", "TOO_BIG", "NOT_INSTALLED"];
      if (noRetry.includes(err.code)) break;

      if (attempt <= MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 2000 * attempt));
      }
    }
  }

  cleanUp(outputPath);
  throw lastErr || new DownloadError("GENERAL", "Download gagal.");
}

// ─── Ekstrak shortcode Instagram ─────────────────────────────
function extractInstagramShortcode(url) {
  const match = url.match(/\/(p|reel|tv)\/([A-Za-z0-9_-]+)/);
  return match ? match[2] : null;
}

// ─── Download Foto Instagram via instaloader ──────────────────
async function downloadPhotosInstagram({ url, userId }) {
  const shortcode = extractInstagramShortcode(url);
  if (!shortcode) throw new DownloadError("EXTRACT", "Shortcode Instagram tidak ditemukan.");

  const igUser = config.download.igUsername;
  if (!igUser) throw new DownloadError("NO_CRED", "IG_USERNAME belum diset di .env");

  const timestamp = Date.now();
  const outDir    = path.join(DOWNLOAD_DIR, `ig_${userId}_${timestamp}`);

  const cmd = `instaloader --login ${igUser} --no-videos --no-metadata-json `
            + `--dirname-pattern "${outDir}" -- -${shortcode}`;

  await new Promise((resolve) => {
    exec(cmd, { timeout: 60_000 }, () => resolve());
  });

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
  const axios    = require("axios");
  const safeUrl  = `"${url.replace(/"/g, "")}"`;
  const timestamp = Date.now();
  const platform  = detectPlatform(url);
  const cookies   = cookiesFlag(platform.key);

  const metaRaw = await new Promise((resolve, reject) => {
    exec(
      `${YT_DLP_BIN} --no-warnings --dump-json --no-playlist ${cookies} ${safeUrl}`,
      { timeout: 20_000 },
      (err, stdout, stderr) => {
        if (err || !stdout) {
          const msg = stderr || err.message || "";
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
        responseType: "arraybuffer",
        timeout: 30_000,
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

// ─── Router foto ──────────────────────────────────────────────
async function downloadPhotos({ url, userId }) {
  const platform = detectPlatform(url);
  if (platform.key === "instagram") {
    return downloadPhotosInstagram({ url, userId });
  }
  return downloadPhotosYtdlp({ url, userId });
}

// ─── Download Queue ───────────────────────────────────────────
class DownloadQueue extends EventEmitter {
  constructor() {
    super();
    this._queues = {};
    this._active = {};
    this._stats  = { total: 0, success: 0, failed: 0 };
  }

  enqueue(userId, taskFn) {
    if (!this._queues[userId]) this._queues[userId] = [];
    this._queues[userId].push(taskFn);
    this._stats.total++;
    this._process(userId);
    return { position: this._queues[userId].length, queuedAt: new Date() };
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
      this._process(userId);
    }
  }

  queueLength(userId) { return (this._queues[userId] || []).length; }
  isActive(userId)    { return !!this._active[userId]; }
  getStats()          { return { ...this._stats }; }
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
  DownloadError,
  YT_DLP_BIN,
  DOWNLOAD_DIR,
};