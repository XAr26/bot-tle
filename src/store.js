// ============================================================
//  store.js — In-memory state management
//
//  Semua state bot ada di sini, bukan tersebar di index.js.
//  Jika nanti ingin pakai Redis/SQLite, cukup ganti implementasi
//  di file ini tanpa ubah kode lain.
// ============================================================
"use strict";

const config = require("./config");

// ─── URL Store ────────────────────────────────────────────────
// Solusi callback_data limit 64 byte Telegram.
// Simpan URL → ID pendek 8 karakter.
const _urlStore = new Map(); // Map<id, { url, userId, timer }>

function storeUrl(url, userId) {
  const id = Math.random().toString(36).slice(2, 10);
  const timer = setTimeout(() => _urlStore.delete(id), config.urlStore.ttlMs);
  _urlStore.set(id, { url, userId, createdAt: Date.now(), timer });
  return id;
}

function getUrl(id) {
  return _urlStore.get(id)?.url || null;
}

function deleteUrl(id) {
  const entry = _urlStore.get(id);
  if (entry) {
    clearTimeout(entry.timer); // batalkan auto-expire agar tidak leak
    _urlStore.delete(id);
  }
}

// ─── User Memory (AI conversation history) ───────────────────
const _memory = new Map(); // Map<userId, [{ role, content }]>

function pushMemory(userId, role, content) {
  if (!_memory.has(userId)) _memory.set(userId, []);
  const hist = _memory.get(userId);
  hist.push({ role, content });
  if (hist.length > config.memory.maxHistory) {
    hist.splice(0, hist.length - config.memory.maxHistory);
  }
}

function getHistory(userId) {
  return _memory.get(userId) || [];
}

function getFormattedHistory(userId) {
  return getHistory(userId)
    .map(m => `${m.role === "user" ? "User" : "AI"}: ${m.content}`)
    .join("\n");
}

function clearMemory(userId) {
  _memory.set(userId, []);
}

function memorySize(userId) {
  return (_memory.get(userId) || []).length;
}

// ─── User Stats ───────────────────────────────────────────────
const _userStats = new Map(); // Map<userId, { downloads, messages, joined, username }>

function trackUser(userId, username) {
  if (!_userStats.has(userId)) {
    _userStats.set(userId, {
      downloads: 0,
      messages:  0,
      joined:    new Date(),
      username:  username || null,
    });
  } else if (username) {
    _userStats.get(userId).username = username;
  }
}

function incStat(userId, key) {
  const s = _userStats.get(userId);
  if (s && key in s) s[key]++;
}

function getUserStats(userId) {
  return _userStats.get(userId) || null;
}

function totalUsers() {
  return _userStats.size;
}

// ─── Bot Stats ────────────────────────────────────────────────
const _botStats = {
  startTime:      Date.now(),
  totalMessages:  0,
  totalDownloads: 0,
  totalAI:        0,
};

function incBotStat(key) {
  if (key in _botStats) _botStats[key]++;
}

function getBotStats() {
  return { ..._botStats };
}

// ─── Exports ──────────────────────────────────────────────────
module.exports = {
  // URL store
  storeUrl,
  getUrl,
  deleteUrl,

  // Memory
  pushMemory,
  getHistory,
  getFormattedHistory,
  clearMemory,
  memorySize,

  // User stats
  trackUser,
  incStat,
  getUserStats,
  totalUsers,

  // Bot stats
  incBotStat,
  getBotStats,
};
