// ============================================================
//  handlers/download.js — Download flow handlers
// ============================================================
"use strict";

const fs = require("fs");
const {
  downloadMedia,
  downloadPhotos,
  fetchMetadata,
  detectPlatform,
  cleanUp,
  queue,
} = require("../downloader");
const store = require("../store");
const { startDots, secondsToHMS, formatNumber } = require("../utils");

// Platform yang mendukung download foto
const PHOTO_PLATFORMS = ["instagram", "twitter", "facebook", "reddit"];

function platformSupportsPhoto(platformKey) {
  return PHOTO_PLATFORMS.includes(platformKey);
}

// ─── Keyboard ─────────────────────────────────────────────────
function qualityKeyboard(urlId, hasPhoto = false) {
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

  if (hasPhoto) {
    rows.splice(1, 0, [
      { text: "🖼️ Foto / Gambar", callback_data: `dl|photo|${urlId}` },
    ]);
  }

  return { inline_keyboard: rows };
}

// ─── Metadata Card ────────────────────────────────────────────
async function sendMetadataCard(bot, chatId, url, meta, platform, userId) {
  const urlId    = store.storeUrl(url, userId);
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

// ─── Link Detected ────────────────────────────────────────────
async function handleLinkDetected(bot, chatId, userId, url) {
  const platform = detectPlatform(url);
  const wait     = await bot.sendMessage(chatId, `${platform.icon} Mengambil info...`);
  const interval = startDots(bot, chatId, wait.message_id, `${platform.icon} Mengambil info`);

  const meta = await fetchMetadata(url);
  clearInterval(interval);
  await bot.deleteMessage(chatId, wait.message_id).catch(() => {});
  await sendMetadataCard(bot, chatId, url, meta, platform, userId);
}

// ─── Error Map ────────────────────────────────────────────────
const DOWNLOAD_ERROR_MAP = {
  PRIVATE:       "🔒 Video privat.",
  AGE:           "🔞 Video dibatasi usia.",
  COPYRIGHT:     "⚖️ Video kena copyright.",
  NOT_FOUND:     "🔍 Link tidak ditemukan.",
  UNAVAIL:       "❌ Video tidak tersedia.",
  EXTRACT:       "⚠️ Gagal ekstrak link.",
  NOT_INSTALLED: "⚙️ yt-dlp belum terinstall di server. Hubungi admin.",
  GENERAL:       "❌ Download gagal.",
};

function getErrorMessage(err) {
  if (err.code === "TOO_BIG") return `📦 ${err.message}`;
  if (err.code === "GENERAL") return `❌ ${err.message}`;
  return DOWNLOAD_ERROR_MAP[err.code] || DOWNLOAD_ERROR_MAP.GENERAL;
}

// ─── Execute Download ─────────────────────────────────────────
async function executeDownload(bot, chatId, userId, url, type) {
  if (queue.isActive(userId) || queue.queueLength(userId) > 0) {
    return bot.sendMessage(chatId, "⏳ Download sebelumnya belum selesai, tunggu ya!");
  }

  const statusMsg = await bot.sendMessage(chatId, "⏳ Menyiapkan download...");
  let interval;

  queue.enqueue(userId, async () => {
    interval = startDots(bot, chatId, statusMsg.message_id, "📥 Downloading");

    const result = await downloadMedia({
      url,
      type:    type === "mp3" ? "mp3" : "video",
      quality: type !== "mp3" ? type : "720p",
      userId,
    });

    clearInterval(interval);
    store.incBotStat("totalDownloads");
    store.incStat(userId, "downloads");

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

  // FIX: gunakan once per enqueue, bukan global listener yang bisa bocor
  queue.once("error", async ({ userId: uid, err }) => {
    if (uid !== userId) return;
    clearInterval(interval);
    await bot.editMessageText(getErrorMessage(err), {
      chat_id: chatId, message_id: statusMsg.message_id,
    }).catch(() => {});
  });
}

// ─── Execute Photo Download ───────────────────────────────────
async function executePhotoDownload(bot, chatId, userId, url) {
  if (queue.isActive(userId) || queue.queueLength(userId) > 0) {
    return bot.sendMessage(chatId, "⏳ Download sebelumnya belum selesai, tunggu ya!");
  }

  const statusMsg = await bot.sendMessage(chatId, "🖼️ Mengambil foto...");
  let interval;

  queue.enqueue(userId, async () => {
    interval = startDots(bot, chatId, statusMsg.message_id, "🖼️ Mengambil foto");

    const photos = await downloadPhotos({ url, userId });

    clearInterval(interval);
    store.incBotStat("totalDownloads");
    store.incStat(userId, "downloads");

    await bot.editMessageText(`📤 Mengirim ${photos.length} foto...`, {
      chat_id: chatId, message_id: statusMsg.message_id,
    }).catch(() => {});

    if (photos.length === 1) {
      await bot.sendPhoto(chatId, photos[0].filePath, {
        caption: `✅ Foto berhasil! (${photos[0].sizeMB} MB)`,
      });
      cleanUp(photos[0].filePath);
      if (photos[0].tmpDir) fs.rmSync(photos[0].tmpDir, { recursive: true, force: true });
    } else {
      // Kirim sebagai album, max 10 per batch
      const chunks = [];
      for (let i = 0; i < photos.length; i += 10)
        chunks.push(photos.slice(i, i + 10));

      for (const [i, chunk] of chunks.entries()) {
        const media = chunk.map((p, idx) => ({
          type:  "photo",
          media: p.filePath,
          ...(i === 0 && idx === 0 ? { caption: `✅ ${photos.length} foto berhasil didownload!` } : {}),
        }));
        await bot.sendMediaGroup(chatId, media);
        chunk.forEach(p => cleanUp(p.filePath));
      }
      if (photos[0]?.tmpDir) fs.rmSync(photos[0].tmpDir, { recursive: true, force: true });
    }

    await bot.deleteMessage(chatId, statusMsg.message_id).catch(() => {});
    return photos;
  });

  const PHOTO_ERROR_MAP = {
    NO_CRED:   "⚙️ `IG_USERNAME` belum diset di file `.env`",
    LOGIN:     "🔐 Sesi login Instagram expired.\nJalankan ulang: `instaloader --login USERNAME`",
    PRIVATE:   "🔒 Konten privat, tidak bisa didownload.",
    NOT_FOUND: "🔍 Link tidak ditemukan.",
    GENERAL:   "❌ Gagal download foto.",
  };

  queue.once("error", async ({ userId: uid, err }) => {
    if (uid !== userId) return;
    clearInterval(interval);
    const msg = err.code === "EXTRACT"
      ? `⚠️ ${err.message}`
      : (PHOTO_ERROR_MAP[err.code] || PHOTO_ERROR_MAP.GENERAL);
    await bot.editMessageText(msg, {
      chat_id: chatId, message_id: statusMsg.message_id,
    }).catch(() => {});
  });
}

module.exports = {
  handleLinkDetected,
  executeDownload,
  executePhotoDownload,
};
