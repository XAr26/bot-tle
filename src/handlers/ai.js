// ============================================================
//  handlers/ai.js — AI chat handler (Gemini + Ollama Fallback)
// ============================================================
"use strict";

const axios  = require("axios");
const config = require("../config");
const store  = require("../store");
const { startDots } = require("../utils");

/**
 * Handle AI chat using Hybrid Python API.
 */
async function handleAI(bot, chatId, userId, text) {
  store.pushMemory(userId, "user", text);
  store.incBotStat("totalAI");
  store.incStat(userId, "messages");

  const wait     = await bot.sendMessage(chatId, "🤔 mikir.");
  const interval = startDots(bot, chatId, wait.message_id, "🤔 mikir");

  try {
    const history = store.getHistory(userId);
    // Persiapkan prompt untuk dikirim ke Python API
    const response = await axios.post(`${config.pythonApi.url}/ai`, {
      prompt: text,
      history: history.map(h => ({ role: h.role, content: h.content }))
    }, {
      headers: { "X-API-KEY": config.pythonApi.token }
    });

    clearInterval(interval);
    const final = response.data.response || "❓ Maaf, AI sedang tidak merespon.";

    await bot.editMessageText(final, {
      chat_id: chatId, message_id: wait.message_id,
    }).catch(() => {});

    store.pushMemory(userId, "assistant", final);

  } catch (err) {
    clearInterval(interval);
    console.error("🔴 Python API (AI) Error:", err.message);
    
    let msg = "❌ AI sedang tidak bisa diakses.";
    if (err.code === "ECONNREFUSED")
      msg = "❌ Server Python (API) tidak berjalan. Pastikan sudah menjalankan `python python_api/main.py`";
    
    await bot.editMessageText(msg, {
      chat_id: chatId, message_id: wait.message_id,
    }).catch(() => {});
  }
}

module.exports = { handleAI };