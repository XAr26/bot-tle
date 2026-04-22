"use strict";

require("dotenv").config();

// ─── Validasi ENV wajib ───────────────────────────────────────
if (!process.env.BOT_TOKEN) {
  console.error("❌ BOT_TOKEN belum diset di .env");
  process.exit(1);
}

module.exports = {
  // ── Telegram ─────────────────────────────────────────────
  bot: {
    token: process.env.BOT_TOKEN,
    adminIds: (process.env.ADMIN_IDS || "")
      .split(",")
      .map(id => parseInt(id.trim()))
      .filter(Boolean),
    privateOnly: true,
  },

  // ── Python FastAPI (Download + AI engine) ────────────────
  pythonApi: {
    url:   process.env.PYTHON_API_URL    || "http://localhost:8000",
    token: process.env.INTERNAL_API_TOKEN || "bot-tle-secret-key-123",
  },

  // ── Memory AI per user ───────────────────────────────────
  // BUG FIX: store.js pakai config.memory.maxHistory tapi key ini tidak ada
  memory: {
    maxHistory: parseInt(process.env.MAX_HISTORY || "12"),
  },

  // ── URL Store (solusi callback_data 64 byte) ─────────────
  // BUG FIX: store.js pakai config.urlStore.ttlMs tapi key ini tidak ada
  urlStore: {
    ttlMs: 30 * 60 * 1000, // 30 menit
  },
};