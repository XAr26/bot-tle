// ============================================================
//  handlers/ai.js — Kirim teks ke Python /ai endpoint
//  BUG FIX: Sebelumnya kirim `text` string mentah sebagai body,
//  tapi Python endpoint expect JSON object { "prompt": "..." }.
//  axios.post(..., text) → Content-Type: application/json tapi
//  body-nya bukan object → FastAPI tidak bisa parse → 422 error.
// ============================================================
"use strict";

const axios  = require("axios");
const config = require("../config");
const store  = require("../store");
const { startDots } = require("../utils");

async function handleAI(bot, chatId, userId, text) {
  // Simpan ke memory untuk konteks percakapan
  store.pushMemory(userId, "user", text);
  store.incBotStat("totalAI");
  store.incStat(userId, "messages");

  const wait     = await bot.sendMessage(chatId, "🤔 mikir.");
  const interval = startDots(bot, chatId, wait.message_id, "🤔 mikir");

  try {
    // BUG FIX 1: Kirim sebagai object { prompt, history } bukan string mentah
    // Sebelumnya: axios.post(url, text) → Python terima string, bukan AIRequest model
    const history = store.getHistory(userId)
      .slice(-10) // kirim 10 pesan terakhir sebagai konteks
      .map(m => ({ role: m.role, content: m.content }));

    const res = await axios.post(
      `${config.pythonApi.url}/ai`,
      { prompt: text, history },   // ← FIX: object bukan string
      {
        headers: {
          "Content-Type": "application/json",
          "X-API-KEY": config.pythonApi.token,
        },
        timeout: 60_000,
      }
    );

    clearInterval(interval);

    const reply = res.data?.response?.trim() || "❓ Tidak ada jawaban.";

    await bot.editMessageText(reply, {
      chat_id: chatId,
      message_id: wait.message_id,
    }).catch(() => {});

    // Simpan jawaban AI ke memory
    store.pushMemory(userId, "assistant", reply);

  } catch (err) {
    clearInterval(interval);
    console.error("🔴 AI Error:", err.response?.data || err.message || JSON.stringify(err));

    let msg = "❌ AI error, coba lagi.";
    if (err.code === "ECONNREFUSED")
      msg = "❌ Python server belum jalan!\nJalankan: `python main.py`";
    else if (err.response?.status === 422)
      msg = "❌ Format request AI salah (422). Hubungi admin.";
    else if (err.response?.status === 403)
      msg = "❌ API token salah. Cek INTERNAL_API_TOKEN di .env";
    else if (err.code === "ETIMEDOUT")
      msg = "⏰ AI timeout, coba lagi.";

    await bot.editMessageText(msg, {
      chat_id: chatId,
      message_id: wait.message_id,
    }).catch(() => {});
  }
}

module.exports = { handleAI };