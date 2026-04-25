// ============================================================
//  handlers/download.js — Download flow via Python API
//  BUG FIX: Sebelumnya import downloadMedia, downloadPhotos,
//  fetchMetadata dari ../downloader tapi ketiganya tidak ada
//  di sana → ReferenceError saat bot start.
//  Versi ini semua download dilakukan via Python API.
// ============================================================
"use strict";

const fs    = require("fs");
const axios = require("axios");
const { detectPlatform, cleanUp, queue } = require("../downloader");
const store  = require("../store");
const config = require("../config");
const { startDots, secondsToHMS, formatNumber, getErrorMessage } = require("../utils");

// Platform yang mendukung download foto
const PHOTO_PLATFORMS = ["instagram", "twitter", "facebook", "reddit"];
function platformSupportsPhoto(key) { return PHOTO_PLATFORMS.includes(key); }

// ─── Keyboard ─────────────────────────────────────────────────
function qualityKeyboard(urlId, hasPhoto = false, isMusicOnly = false, isSpotify = false) {
  if (isSpotify) {
    // Untuk Spotify: hanya rekomendasi musik
    return {
      inline_keyboard: [
        [
          { text: "🎵 Cari Rekomendasi Musik", callback_data: `recommend|${urlId}` },
          { text: "❌ Batal",                   callback_data: `cancel|${urlId}`   },
        ],
      ],
    };
  }

  if (isMusicOnly) {
    // Untuk platform musik lainnya (YouTube Music, SoundCloud)
    return {
      inline_keyboard: [
        [
          { text: "🎵 MP3 (128kbps)", callback_data: `dl|mp3|${urlId}` },
          { text: "❌ Batal",         callback_data: `cancel|${urlId}` },
        ],
      ],
    };
  }

  // Untuk video platforms
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

// ─── handleLinkDetected ───────────────────────────────────────
async function handleLinkDetected(bot, chatId, userId, url) {
  const wait     = await bot.sendMessage(chatId, "🔍 Mengambil info...");
  const interval = startDots(bot, chatId, wait.message_id, "🔍 Mengambil info");

  try {
    const res = await axios.get(`${config.pythonApi.url}/download/info`, {
      params:  { url },
      headers: { "X-API-KEY": config.pythonApi.token },
      timeout: 25_000,
    });

    const meta     = res.data;
    const platform = detectPlatform(url);
    const hasPhoto = platformSupportsPhoto(platform.key);
    const isMusicOnly = platform.isMusic === true;
    const isSpotify = platform.key === "spotify";
    const urlId    = store.storeUrl(url, userId);

    clearInterval(interval);
    await bot.deleteMessage(chatId, wait.message_id).catch(() => {});

    let caption = "";
    if (isSpotify) {
      caption = `${platform.icon} *${meta.title || "Unknown"}*\n\n` +
        `👤 ${meta.uploader || "Unknown"}\n` +
        (meta.duration ? `⏱ Durasi: ${secondsToHMS(meta.duration || 0)}\n` : "") +
        `\n🎵 Fitur Spotify: Cari rekomendasi musik serupa!`;
    } else {
      caption = `${platform.icon} *${meta.title || "Unknown"}*\n\n` +
        `👤 ${meta.uploader || "Unknown"}\n` +
        (meta.duration ? `⏱ Durasi: ${secondsToHMS(meta.duration || 0)}\n` : "") +
        (meta.viewCount ? `👁 Views: ${formatNumber(meta.viewCount || 0)}\n` : "") +
        (meta.likeCount ? `❤️ Likes: ${formatNumber(meta.likeCount || 0)}\n` : "") +
        `\n${isMusicOnly ? "Pilih kualitas audio:" : "Pilih format download:"}`;
    }

    const sendOpts = {
      parse_mode:   "Markdown",
      reply_markup: qualityKeyboard(urlId, hasPhoto, isMusicOnly, isSpotify),
    };

    if (meta.thumbnail) {
      await bot.sendPhoto(chatId, meta.thumbnail, { ...sendOpts, caption }).catch(() =>
        bot.sendMessage(chatId, caption, sendOpts)
      );
    } else {
      await bot.sendMessage(chatId, caption, sendOpts);
    }

  } catch (err) {
    clearInterval(interval);
    console.error("🔴 Info Error:", err.response?.data || err.message || JSON.stringify(err));
    await bot.editMessageText("❌ Gagal mengambil info link. Coba lagi.", {
      chat_id: chatId, message_id: wait.message_id,
    }).catch(() => {});
  }
}

// ─── executeDownload ──────────────────────────────────────────
async function executeDownload(bot, chatId, userId, url, type) {
  if (queue.isActive(userId) || queue.queueLength(userId) > 0)
    return bot.sendMessage(chatId, "⏳ Download sebelumnya belum selesai, tunggu ya!");

  const statusMsg = await bot.sendMessage(chatId, "⏳ Menyiapkan download...");
  let interval;

  queue.enqueue(userId, async () => {
    interval = startDots(bot, chatId, statusMsg.message_id, "📥 Downloading");

    const res = await axios.post(
      `${config.pythonApi.url}/download/execute`,
      {
        url,
        type:    type === "mp3" ? "mp3" : "video",
        quality: type !== "mp3" ? type : "720p",
        user_id: String(userId),
      },
      {
        headers: { "X-API-KEY": config.pythonApi.token },
        timeout: 5 * 60_000,  // 5 menit
      }
    );

    const result = res.data;
    clearInterval(interval);

    if (result.status === "error")
      throw { code: "GENERAL", message: result.message };

    await bot.editMessageText("📤 Mengirim file...", {
      chat_id: chatId, message_id: statusMsg.message_id,
    }).catch(() => {});

    const caption = `✅ Selesai! (${result.size_mb} MB)`;

    if (result.file_path.endsWith(".mp3")) {
      await bot.sendAudio(chatId, result.file_path, { caption });
    } else {
      await bot.sendVideo(chatId, result.file_path, { caption, supports_streaming: true });
    }

    cleanUp(result.file_path);
    await bot.deleteMessage(chatId, statusMsg.message_id).catch(() => {});
    store.incBotStat("totalDownloads");
    store.incStat(userId, "downloads");
    return result;
  });

  queue.once("error", async ({ userId: uid, err }) => {
    if (uid !== userId) return;
    clearInterval(interval);
    const msg = err?.message
      ? `❌ ${err.message}`
      : getErrorMessage(err);
    await bot.editMessageText(msg, {
      chat_id: chatId, message_id: statusMsg.message_id,
    }).catch(() => {});
  });
}

// ─── executePhotoDownload ─────────────────────────────────────
async function executePhotoDownload(bot, chatId, userId, url) {
  if (queue.isActive(userId) || queue.queueLength(userId) > 0)
    return bot.sendMessage(chatId, "⏳ Download sebelumnya belum selesai, tunggu ya!");

  const statusMsg = await bot.sendMessage(chatId, "🖼️ Mengambil foto...");
  let interval;

  queue.enqueue(userId, async () => {
    interval = startDots(bot, chatId, statusMsg.message_id, "🖼️ Mengambil foto");

    const res = await axios.get(
      `${config.pythonApi.url}/download/photos`,
      {
        params:  { url, user_id: String(userId) },
        headers: { "X-API-KEY": config.pythonApi.token },
        timeout: 3 * 60_000,
      }
    );

    const photos = res.data?.photos || [];
    if (!photos.length) throw { code: "EXTRACT", message: "Tidak ada foto ditemukan." };

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
      // Kirim max 10 per album
      for (let i = 0; i < photos.length; i += 10) {
        const chunk = photos.slice(i, i + 10);
        const media = chunk.map((p, idx) => ({
          type:  "photo",
          media: p.file_path,
          ...(i === 0 && idx === 0 ? { caption: `✅ ${photos.length} foto berhasil!` } : {}),
        }));
        await bot.sendMediaGroup(chatId, media);
        chunk.forEach(p => cleanUp(p.file_path));
      }
    }

    await bot.deleteMessage(chatId, statusMsg.message_id).catch(() => {});
    store.incBotStat("totalDownloads");
    store.incStat(userId, "downloads");
    return photos;
  });

  queue.once("error", async ({ userId: uid, err }) => {
    if (uid !== userId) return;
    clearInterval(interval);
    await bot.editMessageText(
      err?.message ? `❌ ${err.message}` : "❌ Gagal download foto.",
      { chat_id: chatId, message_id: statusMsg.message_id }
    ).catch(() => {});
  });
}

// ─── handleMusicRecommendation ─────────────────────────────────
async function handleMusicRecommendation(bot, chatId, userId, url) {
  const wait = await bot.sendMessage(chatId, "🎵 Menganalisis musik dan mencari rekomendasi...");
  const interval = startDots(bot, chatId, wait.message_id, "🎵 Menganalisis musik");

  try {
    const res = await axios.post(
      `${config.pythonApi.url}/download/execute`,
      {
        url,
        type:    "metadata_only",  // Special type untuk Spotify metadata
        quality: "720p",
        user_id: String(userId),
      },
      {
        headers: { "X-API-KEY": config.pythonApi.token },
        timeout: 30_000,
      }
    );

    const result = res.data;
    clearInterval(interval);

    if (result.status === "error") {
      throw { message: result.message };
    }

    if (result.status === "metadata_only") {
      // Format rekomendasi musik
      let response = `🎵 *${result.title}*\n` +
        `👤 Artis: ${result.artist}\n` +
        `💿 Album: ${result.album}\n` +
        `⏱ Durasi: ${secondsToHMS(result.duration || 0)}\n` +
        `📈 Popularitas: ${result.popularity || 0}%\n`;

      if (result.genres && result.genres.length > 0) {
        response += `🎼 Genre: ${result.genres.join(", ")}\n`;
      }

      if (result.release_date) {
        response += `📅 Rilis: ${result.release_date}\n`;
      }

      response += `\n🎯 *Rekomendasi Musik Serupa:*\n\n`;

      if (result.recommendations && result.recommendations.length > 0) {
        result.recommendations.forEach((rec, idx) => {
          response += `${idx + 1}. *${rec.title}*\n`;
          response += `   👤 ${rec.artist}\n`;
          response += `   💡 ${rec.reason}\n`;
          if (rec.spotify_url) {
            response += `   🔗 [Dengarkan](${rec.spotify_url})\n`;
          }
          response += `\n`;
        });
      } else {
        response += `❌ Tidak ada rekomendasi tersedia saat ini.\n`;
      }

      await bot.editMessageText(response, {
        chat_id: chatId,
        message_id: wait.message_id,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      }).catch(() => {});

      store.incBotStat("totalAI"); // Count sebagai AI interaction
      store.incStat(userId, "messages");
      return result;
    }

  } catch (err) {
    clearInterval(interval);
    console.error("🔴 Recommendation Error:", err.response?.data || err.message || JSON.stringify(err));

    let msg = "❌ Gagal mendapatkan rekomendasi musik.";
    if (err.code === "ECONNREFUSED") {
      msg += "\n💡 Pastikan Python API berjalan.";
    }

    await bot.editMessageText(msg, {
      chat_id: chatId,
      message_id: wait.message_id,
    }).catch(() => {});
  }
}

module.exports = { handleLinkDetected, executeDownload, executePhotoDownload, handleMusicRecommendation };