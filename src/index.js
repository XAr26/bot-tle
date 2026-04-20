// ============================================================
//  index.js  — Telegram Bot: AI Chat + Download Engine
// ============================================================
require("dotenv").config();

const TelegramBot = require("node-telegram-bot-api");
const axios       = require("axios");
const fs          = require("fs");

const {
  downloadMedia,
  downloadPhotos,
  fetchMetadata,
  detectPlatform,
  cleanUp,
  queue,
  PLATFORMS,
} = require("./downloader");

// ─── ENV Validation ──────────────────────────────────────────
const REQUIRED = ["BOT_TOKEN", "OLLAMA_URL", "OLLAMA_MODEL"];
for (const key of REQUIRED) {
  if (!process.env[key]) {
    console.error(`❌  Missing ENV: ${key}`);
    process.exit(1);
  }
}

const ADMIN_IDS = (process.env.ADMIN_IDS || "")
  .split(",")
  .map(id => parseInt(id.trim()))
  .filter(Boolean);

// ─── Bot Init ─────────────────────────────────────────────────
const bot = new TelegramBot(process.env.BOT_TOKEN, {
  polling: { interval: 300, autoStart: true, params: { timeout: 10 } },
});

console.log("🤖 Bot jalan...");
console.log(`👑 Admin IDs: ${ADMIN_IDS.join(", ") || "tidak ada"}`);

// ─── State Storage ────────────────────────────────────────────
const userMemory = {};   // { userId: [{ role, content }] }
const userState  = {};   // { userId: { mode, pendingUrl } }
const userStats  = {};   // { userId: { downloads, messages, joined } }
const botStats   = {
  startTime: Date.now(),
  totalMessages: 0,
  totalDownloads: 0,
  totalAI: 0,
};

// ─── URL Store ────────────────────────────────────────────────
// Telegram callback_data limit = 64 byte.
// Solusi: simpan URL di sini, kirim ID pendek (maks 8 karakter) ke Telegram.
const urlStore = {};   // { shortId: { url, userId, createdAt } }

function storeUrl(url, userId) {
  // Buat ID 8 karakter unik
  const id = Math.random().toString(36).slice(2, 10);
  urlStore[id] = { url, userId, createdAt: Date.now() };
  // Auto-hapus setelah 30 menit agar tidak menumpuk di memory
  setTimeout(() => delete urlStore[id], 30 * 60 * 1000);
  return id;
}

function getUrl(id) {
  return urlStore[id]?.url || null;
}

// ─── Memory Manager ───────────────────────────────────────────
const MAX_HISTORY = 12;

function pushMemory(userId, role, content) {
  if (!userMemory[userId]) userMemory[userId] = [];
  userMemory[userId].push({ role, content });
  if (userMemory[userId].length > MAX_HISTORY)
    userMemory[userId] = userMemory[userId].slice(-MAX_HISTORY);
}

function getFormattedHistory(userId) {
  return (userMemory[userId] || [])
    .map(m => `${m.role === "user" ? "User" : "AI"}: ${m.content}`)
    .join("\n");
}

function clearMemory(userId) {
  userMemory[userId] = [];
}

// ─── User State & Stats ───────────────────────────────────────
function trackUser(userId, username) {
  if (!userStats[userId])
    userStats[userId] = { downloads: 0, messages: 0, joined: new Date(), username };
  if (username) userStats[userId].username = username;
}

function incStat(userId, key) {
  if (userStats[userId]) userStats[userId][key]++;
}

// ─── Helpers ─────────────────────────────────────────────────
function isURL(str) {
  try { new URL(str); return true; } catch { return false; }
}

function isSupportedURL(str) {
  if (!isURL(str)) return false;
  return Object.entries(PLATFORMS)
    .filter(([k]) => k !== "generic")
    .some(([, p]) => p.regex.test(str));
}

function secondsToHMS(s) {
  if (!s) return "N/A";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}j ${m}m` : `${m}m ${s % 60}d`;
}

function formatNumber(n) {
  if (!n) return "0";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

function uptime() {
  const ms = Date.now() - botStats.startTime;
  return `${Math.floor(ms / 3_600_000)}j ${Math.floor((ms % 3_600_000) / 60_000)}m`;
}

function isAdmin(userId) { return ADMIN_IDS.includes(userId); }

// ─── Loading Dots ─────────────────────────────────────────────
function startDots(chatId, msgId, text = "⏳") {
  let d = 1;
  return setInterval(() => {
    d = (d % 3) + 1;
    bot.editMessageText(text + ".".repeat(d), {
      chat_id: chatId, message_id: msgId,
    }).catch(() => {});
  }, 800);
}

// ─── Keyboards ────────────────────────────────────────────────
function qualityKeyboard(urlId, hasPhoto = false) {
  // callback_data format: "dl|<type>|<urlId>"
  // Contoh: "dl|mp3|a3f9x2k1" → max ~20 byte, jauh di bawah limit 64 byte Telegram
  const rows = [
    [
      { text: "🎵 MP3",   callback_data: `dl|mp3|${urlId}`   },
      { text: "📹 360p",  callback_data: `dl|360p|${urlId}`  },
    ],
    [
      { text: "📹 480p",  callback_data: `dl|480p|${urlId}`  },
      { text: "📹 720p",  callback_data: `dl|720p|${urlId}`  },
    ],
    [
      { text: "📹 1080p", callback_data: `dl|1080p|${urlId}` },
      { text: "❌ Batal",  callback_data: `cancel|${urlId}`   },
    ],
  ];

  // Sisipkan tombol foto di baris kedua kalau platform mendukung
  if (hasPhoto) {
    rows.splice(1, 0, [
      { text: "🖼️ Foto / Gambar", callback_data: `dl|photo|${urlId}` },
    ]);
  }

  return { inline_keyboard: rows };
}

function mainKeyboard() {
  return {
    keyboard: [
      ["🤖 Tanya AI", "📥 Download Link"],
      ["📊 Stats Saya", "❓ Bantuan"],
    ],
    resize_keyboard: true,
  };
}

// Platform yang mendukung download foto
const PHOTO_PLATFORMS = ["instagram", "twitter", "facebook", "reddit"];

function platformSupportsPhoto(platformKey) {
  return PHOTO_PLATFORMS.includes(platformKey);
}


async function sendMetadataCard(chatId, url, meta, platform, userId) {
  // Simpan URL → dapatkan ID pendek untuk callback_data
  const urlId    = storeUrl(url, userId);
  const hasPhoto = platformSupportsPhoto(platform.key);

  if (!meta) {
    return bot.sendMessage(chatId,
      `${platform.icon} *${platform.label}*\n\nPilih format download:`,
      { parse_mode: "Markdown", reply_markup: qualityKeyboard(urlId, hasPhoto) }
    );
  }

  const caption =
    `${platform.icon} *${meta.title}*\n\n` +
    `👤 ${meta.uploader}\n` +
    `⏱ Durasi: ${secondsToHMS(meta.duration)}\n` +
    `👁 Views: ${formatNumber(meta.viewCount)}\n` +
    `❤️ Likes: ${formatNumber(meta.likeCount)}\n\n` +
    `📐 Format: ${meta.formats.length ? meta.formats.join(", ") : "auto"}\n\n` +
    `Pilih format:`;

  try {
    if (meta.thumbnail) {
      return await bot.sendPhoto(chatId, meta.thumbnail, {
        caption, parse_mode: "Markdown",
        reply_markup: qualityKeyboard(urlId, hasPhoto),
      });
    }
  } catch {}

  return bot.sendMessage(chatId, caption, {
    parse_mode: "Markdown", reply_markup: qualityKeyboard(urlId, hasPhoto),
  });
}

// ─── AI Handler ───────────────────────────────────────────────
async function handleAI(chatId, userId, text) {
  pushMemory(userId, "user", text);
  botStats.totalAI++;
  incStat(userId, "messages");

  const wait     = await bot.sendMessage(chatId, "🤔 mikir.");
  const interval = startDots(chatId, wait.message_id, "🤔 mikir");

  const prompt =
    `Kamu adalah asisten AI di dalam bot Telegram. Jawab dalam bahasa Indonesia santai, singkat (maks 4 kalimat), boleh pakai emoji. Tolak pertanyaan berbahaya dengan sopan.\n\n` +
    `Riwayat:\n${getFormattedHistory(userId)}\n\nAI:`;

  try {
    const res = await axios.post(
      `${process.env.OLLAMA_URL}/api/generate`,
      {
        model: process.env.OLLAMA_MODEL,
        prompt,
        stream: true,
        options: { num_predict: 150, temperature: 0.7, top_p: 0.9 },
      },
      { responseType: "stream", timeout: 45_000 }
    );

    clearInterval(interval);

    let result = "", lastLen = 0;

    await new Promise((resolve, reject) => {
      res.data.on("data", (chunk) => {
        for (const line of chunk.toString().split("\n").filter(Boolean)) {
          try {
            const j = JSON.parse(line);
            if (j.response) result += j.response;
            if (result.length >= 600) return;
          } catch {}
        }
        if (result.length - lastLen > 20 && result.trim()) {
          lastLen = result.length;
          bot.editMessageText(result, {
            chat_id: chatId, message_id: wait.message_id,
          }).catch(() => {});
        }
      });
      res.data.on("end", resolve);
      res.data.on("error", reject);
    });

    const final = result.trim() || "❓ Tidak ada jawaban.";
    await bot.editMessageText(final, {
      chat_id: chatId, message_id: wait.message_id,
    }).catch(() => {});
    pushMemory(userId, "assistant", final);

  } catch (err) {
    clearInterval(interval);
    let msg = "❌ AI tidak bisa dihubungi.";
    if (err.code === "ECONNREFUSED") msg = "❌ Ollama tidak berjalan!\nJalankan: `ollama serve`";
    else if (err.code === "ETIMEDOUT") msg = "⏰ AI timeout, coba lagi.";
    await bot.editMessageText(msg, {
      chat_id: chatId, message_id: wait.message_id,
    }).catch(() => {});
  }
}

// ─── Link Detected ────────────────────────────────────────────
async function handleLinkDetected(chatId, userId, url) {
  const platform = detectPlatform(url);
  const wait     = await bot.sendMessage(chatId, `${platform.icon} Mengambil info...`);
  const interval = startDots(chatId, wait.message_id, `${platform.icon} Mengambil info`);

  const meta = await fetchMetadata(url);
  clearInterval(interval);
  await bot.deleteMessage(chatId, wait.message_id).catch(() => {});
  await sendMetadataCard(chatId, url, meta, platform, userId);
}

// ─── Execute Download ─────────────────────────────────────────
async function executeDownload(chatId, userId, url, type) {
  if (queue.isActive(userId) || queue.queueLength(userId) > 0) {
    return bot.sendMessage(chatId, "⏳ Download sebelumnya belum selesai, tunggu ya!");
  }

  const statusMsg = await bot.sendMessage(chatId, "⏳ Menyiapkan download...");
  let interval;

  queue.enqueue(userId, async () => {
    interval = startDots(chatId, statusMsg.message_id, "📥 Downloading");

    const result = await downloadMedia({
      url,
      type: type === "mp3" ? "mp3" : "video",
      quality: type !== "mp3" ? type : "720p",
      userId,
    });

    clearInterval(interval);
    botStats.totalDownloads++;
    incStat(userId, "downloads");

    await bot.editMessageText("📤 Mengirim file...", {
      chat_id: chatId, message_id: statusMsg.message_id,
    }).catch(() => {});

    const caption = `✅ Selesai! (${result.sizeMB} MB)`;

    if (result.filePath.endsWith(".mp3")) {
      await bot.sendAudio(chatId, result.filePath, { caption });
    } else {
      await bot.sendVideo(chatId, result.filePath, { caption, supports_streaming: true });
    }

    cleanUp(result.filePath);
    await bot.deleteMessage(chatId, statusMsg.message_id).catch(() => {});
    return result;
  });

  queue.once("error", async ({ userId: uid, err }) => {
    if (uid !== userId) return;
    clearInterval(interval);
    const MAP = {
      PRIVATE:   "🔒 Video privat.",
      AGE:       "🔞 Video dibatasi usia.",
      COPYRIGHT: "⚖️ Video kena copyright.",
      NOT_FOUND: "🔍 Link tidak ditemukan.",
      TOO_BIG:   `📦 ${err.message}`,
      UNAVAIL:   "❌ Video tidak tersedia.",
      EXTRACT:   "⚠️ Gagal ekstrak link.",
      GENERAL:   "❌ Download gagal.",
    };
    await bot.editMessageText(MAP[err.code] || MAP.GENERAL, {
      chat_id: chatId, message_id: statusMsg.message_id,
    }).catch(() => {});
  });
}

// ─── Execute Photo Download ───────────────────────────────────
async function executePhotoDownload(chatId, userId, url) {
  if (queue.isActive(userId) || queue.queueLength(userId) > 0) {
    return bot.sendMessage(chatId, "⏳ Download sebelumnya belum selesai, tunggu ya!");
  }

  const statusMsg = await bot.sendMessage(chatId, "🖼️ Mengambil foto...");
  let interval;

  queue.enqueue(userId, async () => {
    interval = startDots(chatId, statusMsg.message_id, "🖼️ Mengambil foto");

    const photos = await downloadPhotos({ url, userId });

    clearInterval(interval);
    botStats.totalDownloads++;
    incStat(userId, "downloads");

    await bot.editMessageText(`📤 Mengirim ${photos.length} foto...`, {
      chat_id: chatId, message_id: statusMsg.message_id,
    }).catch(() => {});

    if (photos.length === 1) {
      // Satu foto → kirim langsung
      await bot.sendPhoto(chatId, photos[0].filePath, {
        caption: `✅ Foto berhasil! (${photos[0].sizeMB} MB)`,
      });
      cleanUp(photos[0].filePath);
      // Hapus folder temp instaloader kalau ada
      if (photos[0].tmpDir) fs.rmSync(photos[0].tmpDir, { recursive: true, force: true });
    } else {
      // Banyak foto → kirim sebagai album (media group)
      // Telegram batasi 10 foto per album
      const chunks = [];
      for (let i = 0; i < photos.length; i += 10)
        chunks.push(photos.slice(i, i + 10));

      for (const [i, chunk] of chunks.entries()) {
        const media = chunk.map((p, idx) => ({
          type: "photo",
          media: p.filePath,
          // Caption hanya di foto pertama
          ...(i === 0 && idx === 0 ? { caption: `✅ ${photos.length} foto berhasil didownload!` } : {}),
        }));

        await bot.sendMediaGroup(chatId, media);
        chunk.forEach(p => cleanUp(p.filePath));
      }
      // Hapus folder temp instaloader
      if (photos[0]?.tmpDir) fs.rmSync(photos[0].tmpDir, { recursive: true, force: true });
    }

    await bot.deleteMessage(chatId, statusMsg.message_id).catch(() => {});
    return photos;
  });

  queue.once("error", async ({ userId: uid, err }) => {
    if (uid !== userId) return;
    clearInterval(interval);
    const MAP = {
      NO_CRED:   "⚙️ `IG_USERNAME` belum diset di file `.env`",
      LOGIN:     "🔐 Sesi login Instagram expired.\nJalankan ulang: `instaloader --login USERNAME`",
      PRIVATE:   "🔒 Konten privat, tidak bisa didownload.",
      NOT_FOUND: "🔍 Link tidak ditemukan.",
      EXTRACT:   `⚠️ ${err.message}`,
      GENERAL:   "❌ Gagal download foto.",
    };
    await bot.editMessageText(MAP[err.code] || MAP.GENERAL, {
      chat_id: chatId, message_id: statusMsg.message_id,
    }).catch(() => {});
  });
}


bot.onText(/\/start/, (msg) => {
  const name = msg.chat.first_name || "kamu";
  trackUser(msg.from.id, msg.from.username);
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
    (ADMIN_IDS.length ? "/admin — panel admin\n" : ""),
    { parse_mode: "Markdown" }
  );
});

bot.onText(/\/reset/, (msg) => {
  clearMemory(msg.from.id);
  bot.sendMessage(msg.chat.id, "🗑 Riwayat AI dihapus!", { reply_markup: mainKeyboard() });
});

bot.onText(/\/mystats/, (msg) => {
  const s = userStats[msg.from.id];
  if (!s) return bot.sendMessage(msg.chat.id, "Belum ada data.");
  bot.sendMessage(msg.chat.id,
    `📊 *Stats Kamu*\n\n` +
    `📥 Download: *${s.downloads}*\n` +
    `💬 Chat AI: *${s.messages}*\n` +
    `📅 Join: ${s.joined.toLocaleDateString("id-ID")}\n` +
    `💾 Memory: ${(userMemory[msg.from.id] || []).length} pesan`,
    { parse_mode: "Markdown" }
  );
});

bot.onText(/\/queue/, (msg) => {
  const uid = msg.from.id;
  const act = queue.isActive(uid), len = queue.queueLength(uid);
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
  const qs  = queue.getStats();
  const mem = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);
  bot.sendMessage(msg.chat.id,
    `👑 *Panel Admin*\n\n` +
    `⏱ Uptime: ${uptime()}\n` +
    `💾 RAM: ${mem} MB\n` +
    `👥 Users: ${Object.keys(userStats).length}\n` +
    `📨 Pesan: ${botStats.totalMessages}\n` +
    `📥 Download: ${botStats.totalDownloads}\n` +
    `🤖 AI: ${botStats.totalAI}\n\n` +
    `Queue — Total:${qs.total} ✅${qs.success} ❌${qs.failed}`,
    { parse_mode: "Markdown" }
  );
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
  const urlId  = parts[2] || parts[1]; // "dl|type|urlId" atau "cancel|urlId"

  if (action === "cancel") {
    // Hapus URL dari store agar tidak makan memory
    if (urlId) delete urlStore[urlId];
    return bot.sendMessage(chatId, "❌ Dibatalkan.");
  }

  if (action === "dl") {
    const type = parts[1];
    const url  = getUrl(urlId);

    if (!url) {
      return bot.sendMessage(chatId,
        "⚠️ Link sudah kadaluarsa (>30 menit). Kirim ulang link-nya ya!"
      );
    }

    // Hapus dari store setelah dipakai
    delete urlStore[urlId];

    if (type === "photo") {
      await executePhotoDownload(chatId, from.id, url);
    } else {
      await executeDownload(chatId, from.id, url, type);
    }
  }
});

// ─── Main Message Handler ─────────────────────────────────────
bot.on("message", async (msg) => {
  if (!msg.text || msg.text.startsWith("/")) return;
  if (msg.from?.is_bot)            return;
  if (msg.chat.type !== "private") return;

  const text   = msg.text.trim();
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  trackUser(userId, msg.from.username);
  botStats.totalMessages++;

  // Keyboard shortcuts
  if (text === "📊 Stats Saya")  return bot.emit("text", Object.assign(msg, { text: "/mystats" }));
  if (text === "❓ Bantuan")     return bot.emit("text", Object.assign(msg, { text: "/help" }));
  if (text === "🤖 Tanya AI")    return bot.sendMessage(chatId, "💬 Ketik pertanyaanmu!");
  if (text === "📥 Download Link") return bot.sendMessage(chatId, "🔗 Kirim link-nya:");

  // URL → download flow
  if (isURL(text)) {
    if (!isSupportedURL(text))
      return bot.sendMessage(chatId,
        "⚠️ Platform tidak didukung.\n\nYang didukung: YouTube, Instagram, TikTok, Twitter/X, Facebook, Reddit, Twitch."
      );
    return handleLinkDetected(chatId, userId, text);
  }

  // Teks biasa → AI
  await handleAI(chatId, userId, text);
});

// ─── Global Errors ────────────────────────────────────────────
bot.on("polling_error", err => console.error("🔴 Polling:", err.message));
process.on("unhandledRejection", r => console.error("🔴 Unhandled:", r));
process.on("SIGINT", () => { bot.stopPolling(); process.exit(0); });