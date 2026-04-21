// ============================================================
//  index.js  — Telegram Bot: entry point
//  Hanya berisi: inisialisasi bot, command registration,
//  dan routing pesan. Logic ada di handlers/.
// ============================================================
"use strict";

const TelegramBot = require("node-telegram-bot-api");

const config  = require("./config");
const store   = require("./store");
const { isURL, isAdmin, uptime } = require("./utils");
const { handleAI }               = require("./handlers/ai");
const {
  handleLinkDetected,
  executeDownload,
  executePhotoDownload,
} = require("./handlers/download");
const { handleTestEnv } = require("./handlers/admin");
const { detectPlatform, queue, PLATFORMS } = require("./downloader");

// ─── Bot Init ─────────────────────────────────────────────────
const bot = new TelegramBot(config.bot.token, {
  polling: { interval: 300, autoStart: true, params: { timeout: 10 } },
});

console.log("🤖 Bot jalan...");
console.log(`👑 Admin IDs: ${config.bot.adminIds.join(", ") || "tidak ada"}`);

// ─── URL Support Check ────────────────────────────────────────
function isSupportedURL(str) {
  if (!isURL(str)) return false;
  
  // Jika platform spesifik ditemukan, log it
  const entry = Object.entries(PLATFORMS)
    .filter(([k]) => k !== "generic")
    .find(([, p]) => p.regex.test(str));
    
  if (entry) {
    console.log(`[link] Terdeteksi platform: ${entry[0]}`);
  } else {
    console.log(`[link] Menggunakan fallback generic untuk: ${str}`);
  }
  
  return true; // Selalu true jika asalkan isURL valid
}

// ─── Keyboards ────────────────────────────────────────────────
function mainKeyboard() {
  return {
    keyboard: [
      ["🤖 Tanya AI", "📥 Download Link"],
      ["📊 Stats Saya", "❓ Bantuan"],
    ],
    resize_keyboard: true,
  };
}

// ─── Commands ─────────────────────────────────────────────────
bot.onText(/\/start/, (msg) => {
  const name = msg.chat.first_name || "kamu";
  store.trackUser(msg.from.id, msg.from.username);
  bot.sendMessage(msg.chat.id,
    `👋 Halo *${name}*!\n\n` +
    `🤖 Ketik pertanyaan → AI menjawab\n` +
    `📥 Kirim link → download otomatis\n\n` +
    `Platform: YouTube · Instagram · TikTok · Twitter/X · Facebook · Reddit · Twitch\n\n` +
    `/help untuk panduan lengkap`,
    { parse_mode: "Markdown", reply_markup: mainKeyboard() }
  );
});

bot.onText(/\/help/, (msg) => {
  bot.sendMessage(msg.chat.id,
    `📖 *Panduan*\n\n` +
    `• Kirim link → lihat info & pilih kualitas\n` +
    `• Ketik teks biasa → dijawab AI\n` +
    `/reset — hapus riwayat AI\n` +
    `/mystats — statistik kamu\n` +
    `/queue — cek antrian download\n` +
    (config.bot.adminIds.length ? "/admin — panel admin\n" : ""),
    { parse_mode: "Markdown" }
  );
});

bot.onText(/\/reset/, (msg) => {
  store.clearMemory(msg.from.id);
  bot.sendMessage(msg.chat.id, "🗑 Riwayat AI dihapus!", { reply_markup: mainKeyboard() });
});

bot.onText(/\/mystats/, (msg) => {
  const s = store.getUserStats(msg.from.id);
  if (!s) return bot.sendMessage(msg.chat.id, "Belum ada data.");
  bot.sendMessage(msg.chat.id,
    `📊 *Stats Kamu*\n\n` +
    `📥 Download: *${s.downloads}*\n` +
    `💬 Chat AI: *${s.messages}*\n` +
    `📅 Join: ${s.joined.toLocaleDateString("id-ID")}\n` +
    `💾 Memory: ${store.memorySize(msg.from.id)} pesan`,
    { parse_mode: "Markdown" }
  );
});

bot.onText(/\/queue/, (msg) => {
  const uid = msg.from.id;
  const act = queue.isActive(uid);
  const len = queue.queueLength(uid);
  if (!act && !len)
    return bot.sendMessage(msg.chat.id, "✅ Antrian kosong.");
  bot.sendMessage(msg.chat.id,
    `📋 *Antrian Download*\n${act ? "🔄 Proses: 1\n" : ""}⏳ Menunggu: ${len}`,
    { parse_mode: "Markdown" }
  );
});
bot.onText(/\/admin/, (msg) => {
  if (!isAdmin(msg.from.id))
    return bot.sendMessage(msg.chat.id, "⛔ Akses ditolak.");

  const qs   = queue.getStats();
  const mem  = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);
  const bots = store.getBotStats();

  bot.sendMessage(msg.chat.id,
    `👑 *Panel Admin*\n\n` +
    `⏱ Uptime: ${uptime(bots.startTime)}\n` +
    `💾 RAM: ${mem} MB\n` +
    `👥 Users: ${store.totalUsers()}\n` +
    `📨 Pesan: ${bots.totalMessages}\n` +
    `📥 Download: ${bots.totalDownloads}\n` +
    `🤖 AI: ${bots.totalAI}\n\n` +
    `Queue — Total:${qs.total} ✅${qs.success} ❌${qs.failed}`,
    { parse_mode: "Markdown" }
  );
});

bot.onText(/\/testenv/, (msg) => {
  if (!isAdmin(msg.from.id)) return;
  handleTestEnv(bot, msg.chat.id);
});

// ─── Callback (Inline Buttons) ────────────────────────────────
bot.on("callback_query", async (query) => {
  const { data, message, from } = query;
  const chatId = message.chat.id;
  await bot.answerCallbackQuery(query.id);

  // Hapus tombol setelah diklik agar tidak bisa diklik dua kali
  await bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
    chat_id: chatId, message_id: message.message_id,
  }).catch(() => {});

  const parts  = data.split("|");
  const action = parts[0];
  const urlId  = parts[2] || parts[1];

  if (action === "cancel") {
    store.deleteUrl(urlId);
    return bot.sendMessage(chatId, "❌ Dibatalkan.");
  }

  if (action === "dl") {
    const type = parts[1];
    const url  = store.getUrl(urlId);

    if (!url) {
      return bot.sendMessage(chatId,
        "⚠️ Link sudah kadaluarsa (>30 menit). Kirim ulang link-nya ya!"
      );
    }

    // Hapus dari store setelah dipakai
    store.deleteUrl(urlId);

    if (type === "photo") {
      await executePhotoDownload(bot, chatId, from.id, url);
    } else {
      await executeDownload(bot, chatId, from.id, url, type);
    }
  }
});

// ─── Main Message Handler ─────────────────────────────────────
bot.on("message", async (msg) => {
  if (!msg.text || msg.text.startsWith("/")) return;
  if (msg.from?.is_bot)                        return;
  if (config.bot.privateOnly && msg.chat.type !== "private") return;

  const text   = msg.text.trim();
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  store.trackUser(userId, msg.from.username);
  store.incBotStat("totalMessages");

  console.log(`[msg] From: ${userId} | Text: ${text.slice(0, 50)}${text.length > 50 ? "..." : ""}`);

  // Keyboard shortcuts
  if (text === "📊 Stats Saya")    return bot.emit("text", Object.assign(msg, { text: "/mystats" }));
  if (text === "❓ Bantuan")       return bot.emit("text", Object.assign(msg, { text: "/help" }));
  if (text === "🤖 Tanya AI")      return bot.sendMessage(chatId, "💬 Ketik pertanyaanmu!");
  if (text === "📥 Download Link") return bot.sendMessage(chatId, "🔗 Kirim link-nya:");

  // URL → download flow
  if (isURL(text)) {
    let finalUrl = text;
    if (!text.startsWith("http")) {
      finalUrl = "https://" + text;
    }

    if (!isSupportedURL(finalUrl)) {
      return bot.sendMessage(chatId, "⚠️ Link tidak valid.");
    }
    
    return handleLinkDetected(bot, chatId, userId, finalUrl);
  }

  // Teks biasa → AI
  await handleAI(bot, chatId, userId, text);
});

// ─── Global Error Handlers ────────────────────────────────────
bot.on("polling_error", err => console.error("🔴 Polling:", err.message));
process.on("unhandledRejection", r => console.error("🔴 Unhandled:", r));
process.on("SIGINT", () => { bot.stopPolling(); process.exit(0); });
process.on("SIGTERM", () => { bot.stopPolling(); process.exit(0); });