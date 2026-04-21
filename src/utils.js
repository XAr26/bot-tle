// ============================================================
//  utils.js — Helper functions
// ============================================================
"use strict";

const config = require("./config");

/**
 * Cek apakah string adalah URL valid.
 */
function isURL(str) {
  try { new URL(str); return true; } catch { return false; }
}

/**
 * Format detik → "1j 23m" atau "5m 30d"
 */
function secondsToHMS(s) {
  if (!s) return "N/A";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}j ${m}m` : `${m}m ${sec}d`;
}

/**
 * Format angka besar → "1.2M", "34.5K"
 */
function formatNumber(n) {
  if (!n) return "0";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

/**
 * Hitung uptime bot dari startTime.
 */
function uptime(startTime) {
  const ms = Date.now() - startTime;
  return `${Math.floor(ms / 3_600_000)}j ${Math.floor((ms % 3_600_000) / 60_000)}m`;
}

/**
 * Cek apakah userId termasuk admin.
 */
function isAdmin(userId) {
  return config.bot.adminIds.includes(userId);
}

/**
 * Mulai animasi loading dots pada pesan Telegram.
 * Kembalikan interval ID agar bisa di-stop.
 */
function startDots(bot, chatId, msgId, text = "⏳") {
  let d = 1;
  return setInterval(() => {
    d = (d % 3) + 1;
    bot.editMessageText(text + ".".repeat(d), {
      chat_id: chatId, message_id: msgId,
    }).catch(() => {});
  }, 800);
}

/**
 * Escape karakter Markdown agar tidak merusak format Telegram.
 */
function escapeMarkdown(text) {
  return String(text).replace(/[_*[\]()~`>#+\-=|{}.!]/g, "\\$&");
}

module.exports = {
  isURL,
  secondsToHMS,
  formatNumber,
  uptime,
  isAdmin,
  startDots,
  escapeMarkdown,
};
