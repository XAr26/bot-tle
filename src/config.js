// ============================================================
//  config.js — Centralized configuration & ENV validation
// ============================================================
"use strict";

require("dotenv").config();

// ─── Required ENV ─────────────────────────────────────────────
const REQUIRED = ["BOT_TOKEN"];
for (const key of REQUIRED) {
  if (!process.env[key]) {
    console.error(`❌  Missing ENV: ${key}`);
    process.exit(1);
  }
}

// ─── Config Object ────────────────────────────────────────────
const config = {
  // Telegram
  bot: {
    token:    process.env.BOT_TOKEN,
    adminIds: (process.env.ADMIN_IDS || "")
      .split(",")
      .map(id => parseInt(id.trim()))
      .filter(Boolean),
    // Hanya private chat yang dilayani
    privateOnly: true,
  },

  // Gemini AI (Prioritas Utama)
  gemini: {
    apiKey:      process.env.GEMINI_API_KEY || null,
    model:       process.env.GEMINI_MODEL   || "gemini-1.5-flash",
  },

  // Ollama AI (Cadangan)
  ollama: {
    url:         process.env.OLLAMA_URL     || "http://localhost:11434",
    model:       process.env.OLLAMA_MODEL   || "phi3",
    timeout:     45_000,
    maxTokens:   1024,
    temperature: 0.7,
    topP:        0.9,
  },

  // Download engine
  download: {
    maxFileMB:    49,          // batas upload Telegram
    execTimeout:  3 * 60_000, // 3 menit per download
    maxRetries:   2,
    cookiesPath:  process.env.COOKIES_PATH || null,
    cookiesBrowser: process.env.COOKIES_BROWSER || null,
    igUsername:   process.env.IG_USERNAME  || null,
    // Platform yang butuh cookies
    cookiesPlatforms: ["youtube", "instagram", "facebook", "twitter", "tiktok"],
  },

  // Memory AI per user
  memory: {
    maxHistory: 12,
  },

  // URL store (callback_data workaround)
  urlStore: {
    ttlMs: 30 * 60 * 1000, // 30 menit
  },
};

module.exports = config;
