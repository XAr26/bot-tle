// ============================================================
//  downloader.js — Platform detection, queue, shared utils
//  BUG FIX: Versi sebelumnya tidak export YT_DLP_BIN
//  sehingga admin.js crash saat require.
//  Versi ini juga tidak lagi menyimpan download logic
//  karena semua download dilakukan via Python API.
// ============================================================
"use strict";

const fs   = require("fs");
const path = require("path");
const { EventEmitter } = require("events");

// ─── Direktori (tetap ada untuk kompatibilitas admin.js) ─────
const DOWNLOAD_DIR = path.join(__dirname, "..", "downloads");
const THUMB_DIR    = path.join(__dirname, "..", "thumbs");

for (const dir of [DOWNLOAD_DIR, THUMB_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// BUG FIX: YT_DLP_BIN tidak di-export sebelumnya → admin.js crash
const YT_DLP_BIN = process.env.YT_DLP_PATH || "yt-dlp";

// ─── Platform Detection ──────────────────────────────────────
const PLATFORMS = {
  youtube:    { regex: /youtube\.com|youtu\.be/,           label: "YouTube",    icon: "🎬" },
  instagram:  { regex: /instagram\.com/,                   label: "Instagram",  icon: "📸" },
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

function cleanUp(fp) {
  if (fp && fs.existsSync(fp)) fs.unlink(fp, () => {});
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
  detectPlatform,
  cleanUp,
  queue,
  PLATFORMS,
  DOWNLOAD_DIR,
  YT_DLP_BIN,   // BUG FIX: export ini agar admin.js tidak crash
};