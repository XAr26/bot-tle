// ============================================================
//  downloader.js — Shared Utilities & Concurrency Queue
// ============================================================
"use strict";

const fs   = require("fs");
const path = require("path");
const { EventEmitter } = require("events");

// ─── Direktori ───────────────────────────────────────────────
const DOWNLOAD_DIR = path.join(__dirname, "downloads");
const THUMB_DIR    = path.join(__dirname, "thumbs");

for (const dir of [DOWNLOAD_DIR, THUMB_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ─── Platform Detection ──────────────────────────────────────
const PLATFORMS = {
  youtube:    { regex: /(?:youtube\.com|youtu\.be)\/(?:watch\?v=|shorts\/|live\/|embed\/|v\/|.*[?&]v=)?([^"&?\/\s]{11})/, label: "YouTube", icon: "🎬" },
  instagram:  { regex: /(?:www\.)?instagram\.com\/(?:p|reel|tv|stories)\/([A-Za-z0-9_-]+)/, label: "Instagram", icon: "📸" },
  tiktok:     { regex: /(?:www\.|vm\.|vt\.)?tiktok\.com\/.*(?:video|v|t|@.*\/video)\/([0-9]+)|(?:vm\.|vt\.)tiktok\.com\/([A-Za-z0-9]+)/, label: "TikTok", icon: "🎵" },
  twitter:    { regex: /(?:twitter\.com|x\.com)\/[A-Za-z0-9_]+\/status\/([0-9]+)/, label: "Twitter/X", icon: "🐦" },
  facebook:   { regex: /(?:www\.|m\.)?facebook\.com\/(?:watch|reel|videos|story\.php|.*\/videos)\/?(?:.*v=|.*id=)?([0-9]+)/, label: "Facebook", icon: "👤" },
  soundcloud: { regex: /(?:www\.)?soundcloud\.com\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+/, label: "SoundCloud", icon: "🎧" },
  spotify:    { regex: /open\.spotify\.com\/(track|album|playlist|episode)\/([A-Za-z0-9]+)/, label: "Spotify", icon: "🎵" },
  reddit:     { regex: /(?:www\.|v\.)?reddit\.com\/r\/[A-Za-z0-9_]+\/comments\/([A-Za-z0-9]+)|redd\.it\/([A-Za-z0-9]+)/, label: "Reddit", icon: "🤖" },
  twitch:     { regex: /(?:www\.)?twitch\.tv\/(?:videos\/[0-9]+|[A-Za-z0-9_]+)/, label: "Twitch", icon: "🎮" },
  generic:    { regex: /https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&//=]*)/, label: "Generic", icon: "🌐" },
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

// ─── Download Queue (Concurrency control on Node side) ───
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
};