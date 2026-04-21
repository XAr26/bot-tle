// ============================================================
//  handlers/ai.js — AI chat handler
// ============================================================
"use strict";

const axios  = require("axios");
const config = require("../config");
const store  = require("../store");
const { startDots } = require("../utils");

/**
 * Kirim pesan ke Ollama dan stream hasilnya ke Telegram.
 */
async function handleAI(bot, chatId, userId, text) {
  store.pushMemory(userId, "user", text);
  store.incBotStat("totalAI");
  store.incStat(userId, "messages");

  const wait     = await bot.sendMessage(chatId, "🤔 mikir.");
  const interval = startDots(bot, chatId, wait.message_id, "🤔 mikir");

  const prompt =
    `Kamu adalah asisten AI di dalam bot Telegram. ` +
    `Jawab dalam bahasa Indonesia santai, singkat (maks 4 kalimat), boleh pakai emoji. ` +
    `Tolak pertanyaan berbahaya dengan sopan.\n\n` +
    `Riwayat:\n${store.getFormattedHistory(userId)}\n\nAI:`;

  try {
    const res = await axios.post(
      `${config.ollama.url}/api/generate`,
      {
        model:   config.ollama.model,
        prompt,
        stream:  true,
        options: {
          num_predict: config.ollama.maxTokens,
          temperature: config.ollama.temperature,
          top_p:       config.ollama.topP,
        },
      },
      { responseType: "stream", timeout: config.ollama.timeout }
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
    store.pushMemory(userId, "assistant", final);

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

module.exports = { handleAI };
