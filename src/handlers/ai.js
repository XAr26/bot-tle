// ============================================================
//  handlers/ai.js — AI chat handler (Gemini + Ollama Fallback)
// ============================================================
"use strict";

const axios = require("axios");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const config = require("../config");
const store  = require("../store");
const { startDots } = require("../utils");

/**
 * Handle AI chat using Gemini (Primary) or Ollama (Fallback).
 */
async function handleAI(bot, chatId, userId, text) {
  store.pushMemory(userId, "user", text);
  store.incBotStat("totalAI");
  store.incStat(userId, "messages");

  const wait     = await bot.sendMessage(chatId, "🤔 mikir.");
  const interval = startDots(bot, chatId, wait.message_id, "🤔 mikir");

  // Prompt System
  const systemInstruction = 
    "Kamu adalah asisten AI di dalam bot Telegram. " +
    "Jawab dalam bahasa Indonesia santai, singkat (maks 4 kalimat), boleh pakai emoji. " +
    "Tolak pertanyaan berbahaya dengan sopan.";

  const history = store.getFormattedHistory(userId);
  const fullPrompt = `${systemInstruction}\n\nRiwayat Percakapan:\n${history}\n\nUser: ${text}\nAI:`;

  // --- OPSI 1: Google Gemini (Jika API Key ada) ---
  if (config.gemini.apiKey) {
    try {
      const genAI = new GoogleGenerativeAI(config.gemini.apiKey);
      const model = genAI.getGenerativeModel({ model: config.gemini.model });

      const result = await model.generateContentStream(fullPrompt);
      clearInterval(interval);

      let fullResponse = "", lastSent = "";

      for await (const chunk of result.stream) {
        const chunkText = chunk.text();
        fullResponse += chunkText;

        // Edit pesan per 30 karakter agar tidak spam API Telegram
        if (fullResponse.length - lastSent.length > 30) {
          lastSent = fullResponse;
          await bot.editMessageText(fullResponse, {
            chat_id: chatId, message_id: wait.message_id
          }).catch(() => {});
        }
      }

      const final = fullResponse.trim() || "❓ Maaf, saya tidak bisa menjawab itu.";
      await bot.editMessageText(final, {
        chat_id: chatId, message_id: wait.message_id
      }).catch(() => {});

      store.pushMemory(userId, "assistant", final);
      return;

    } catch (err) {
      console.error("🔴 Gemini Error:", err.message);
      // Jika Gemini gagal, lanjut ke Ollama di bawah
    }
  }

  // --- OPSI 2: Ollama (Fallback) ---
  try {
    const res = await axios.post(
      `${config.ollama.url}/api/generate`,
      {
        model:   config.ollama.model,
        prompt:  fullPrompt,
        stream:  false, // Non-stream untuk fallback agar lebih stabil
        options: {
          num_predict: config.ollama.maxTokens,
          temperature: config.ollama.temperature,
        },
      },
      { timeout: config.ollama.timeout }
    );

    clearInterval(interval);
    const final = res.data.response?.trim() || "❓ Tidak ada jawaban.";
    
    await bot.editMessageText(final, {
      chat_id: chatId, message_id: wait.message_id,
    }).catch(() => {});

    store.pushMemory(userId, "assistant", final);

  } catch (err) {
    clearInterval(interval);
    let msg = "❌ AI sedang tidak bisa diakses.";
    if (err.code === "ECONNREFUSED") msg = "❌ AI Server (Ollama) mati & Gemini API Key belum diset.";
    
    await bot.editMessageText(msg, {
      chat_id: chatId, message_id: wait.message_id,
    }).catch(() => {});
  }
}

module.exports = { handleAI };
