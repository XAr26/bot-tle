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
  const wait     = await bot.sendMessage(chatId, "🔍 Mengambil info...");
  const interval = startDots(bot, chatId, wait.message_id, "🔍 Mengambil info");

  try {
    const response = await axios.get(`${config.pythonApi.url}/download/info`, {
      params: { url }
    });
    const meta = response.data;
    
    clearInterval(interval);
    await bot.deleteMessage(chatId, wait.message_id).catch(() => {});
    
    const urlId    = store.storeUrl(url, userId);
    const platform = detectPlatform(url); // Tetap pakai util lokal untuk icon
    const hasPhoto = platformSupportsPhoto(platform.key);

    const caption =
      `${platform.icon} *${meta.title}*\n\n` +
      `👤 ${meta.uploader}\n` +
      `⏱ Durasi: ${secondsToHMS(meta.duration || 0)}\n` +
      `👁 Views: ${formatNumber(meta.viewCount || 0)}\n` +
      `❤️ Likes: ${formatNumber(meta.likeCount || 0)}\n\n` +
      `Pilih format download:`;

    if (meta.thumbnail) {
      await bot.sendPhoto(chatId, meta.thumbnail, {
        caption, parse_mode: "Markdown",
        reply_markup: qualityKeyboard(urlId, hasPhoto),
      });
    } else {
      await bot.sendMessage(chatId, caption, {
        parse_mode: "Markdown", reply_markup: qualityKeyboard(urlId, hasPhoto),
      });
    }

  } catch (err) {
    clearInterval(interval);
    console.error("🔴 Python API (Info) Error:", err.message);
    await bot.editMessageText("❌ Gagal mengambil informasi link tersebut.", {
      chat_id: chatId, message_id: wait.message_id,
    }).catch(() => {});
  }
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

    try {
      const response = await axios.post(`${config.pythonApi.url}/download/execute`, {
        url,
        type:    type === "mp3" ? "mp3" : "video",
        quality: type !== "mp3" ? type : "720p",
        user_id: String(userId)
      });

      const result = response.data;
      clearInterval(interval);

      await bot.editMessageText("📤 Mengirim file...", {
        chat_id: chatId, message_id: statusMsg.message_id,
      }).catch(() => {});

      const caption = `✅ Selesai! (${result.size_mb} MB)`;

      // result.file_path adalah path di server local
      if (result.file_path.endsWith(".mp3")) {
        await bot.sendAudio(chatId, result.file_path, { caption });
      } else {
        await bot.sendVideo(chatId, result.file_path, { caption, supports_streaming: true });
      }

      // Cleanup dilakukan di Python atau Node? Kita lakukan di Node agar aman.
      cleanUp(result.file_path);
      await bot.deleteMessage(chatId, statusMsg.message_id).catch(() => {});
      return result;

    } catch (err) {
      clearInterval(interval);
      console.error("🔴 Python API (Execute) Error:", err.message);
      throw { code: "GENERAL", message: err.response?.data?.detail || err.message };
    }
  });

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

    try {
      const response = await axios.get(`${config.pythonApi.url}/download/instagram`, {
        params: { url, user_id: String(userId) }
      });

      const photos = response.data.photos;
      clearInterval(interval);

      await bot.editMessageText(`📤 Mengirim ${photos.length} foto...`, {
        chat_id: chatId, message_id: statusMsg.message_id,
      }).catch(() => {});

      if (photos.length === 1) {
        await bot.sendPhoto(chatId, photos[0].file_path, {
          caption: `✅ Foto berhasil! (${photos[0].size_mb} MB)`,
        });
        cleanUp(photos[0].file_path);
      } else {
        const media = photos.map((p, idx) => ({
          type:  "photo",
          media: p.file_path,
          ...(idx === 0 ? { caption: `✅ ${photos.length} foto berhasil didownload!` } : {}),
        }));
        await bot.sendMediaGroup(chatId, media);
        photos.forEach(p => cleanUp(p.file_path));
      }

      await bot.deleteMessage(chatId, statusMsg.message_id).catch(() => {});
      return photos;

    } catch (err) {
      clearInterval(interval);
      console.error("🔴 Python API (IG) Error:", err.message);
      throw { code: "GENERAL", message: err.response?.data?.detail || err.message };
    }
  });

  queue.once("error", async ({ userId: uid, err }) => {
    if (uid !== userId) return;
    clearInterval(interval);
    await bot.editMessageText(getErrorMessage(err), {
      chat_id: chatId, message_id: statusMsg.message_id,
    }).catch(() => {});
  });
}

module.exports = {
  handleLinkDetected,
  executeDownload,
  executePhotoDownload,
};