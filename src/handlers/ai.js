// ============================================================
//  handlers/ai.js — AI chat handler (Gemini + Ollama Fallback)
// ============================================================
"use strict";

const axios  = require("axios");
const config = require("../config");
const store  = require("../store");
const { startDots } = require("../utils");

// FIX: Safe require — jangan crash kalau package belum diinstall
let GoogleGenerativeAI = null;
try {
  GoogleGenerativeAI = require("@google/generative-ai").GoogleGenerativeAI;
} catch {
  console.warn("⚠️  @google/generative-ai belum diinstall. Gemini tidak aktif, pakai Ollama.");
}

/**
 * Handle AI chat using Gemini (Primary) or Ollama (Fallback).
 */
async function handleAI(bot, chatId, userId, text) {
  store.pushMemory(userId, "user", text);
  store.incBotStat("totalAI");
  store.incStat(userId, "messages");

  const wait     = await bot.sendMessage(chatId, "🤔 mikir.");
  const interval = startDots(bot, chatId, wait.message_id, "🤔 mikir");

  const systemInstruction =
    "Kamu adalah asisten AI di dalam bot Telegram. " +
    "Jawab dalam bahasa Indonesia santai, singkat (maks 4 kalimat), boleh pakai emoji. " +
    "Tolak pertanyaan berbahaya dengan sopan.";

  const history     = store.getFormattedHistory(userId);
  const fullPrompt  = `${systemInstruction}\n\nRiwayat Percakapan:\n${history}\n\nUser: ${text}\nAI:`;

  // ── OPSI 1: Google Gemini ──────────────────────────────────
  if (config.gemini.apiKey && GoogleGenerativeAI) {
    try {
      const genAI = new GoogleGenerativeAI(config.gemini.apiKey);
      const model = genAI.getGenerativeModel({ model: config.gemini.model });

      // FIX: Gunakan format prompt yang lebih standar untuk SDK v0.x
      const result = await model.generateContentStream({
        contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
      });

      clearInterval(interval);

      let fullResponse = "", lastLen = 0;

      for await (const chunk of result.stream) {
        try {
          // FIX: Ambil teks dengan lebih aman dari candidates jika text() gagal
          let chunkText = "";
          if (chunk.candidates && chunk.candidates[0]?.content?.parts?.[0]?.text) {
            chunkText = chunk.candidates[0].content.parts[0].text;
          } else if (typeof chunk.text === "function") {
            chunkText = chunk.text();
          }
          
          fullResponse += chunkText;

          if (fullResponse.length - lastLen > 40 && fullResponse.trim()) {
            lastLen = fullResponse.length;
            await bot.editMessageText(fullResponse, {
              chat_id: chatId, message_id: wait.message_id,
            }).catch(() => {});
          }
        } catch (streamErr) {
          console.warn("⚠️ Stream chunk error (safety filter?):", streamErr.message);
        }
      }

      const final = fullResponse.trim() || "❓ Maaf, saya tidak bisa mejawab itu (mungkin terkena filter keamanan).";
      await bot.editMessageText(final, {
        chat_id: chatId, message_id: wait.message_id,
      }).catch(() => {});

      store.pushMemory(userId, "assistant", final);
      return;

    } catch (err) {
      clearInterval(interval);
      console.error("🔴 Gemini Error:", err.message);

      // Terjemahkan error Gemini yang umum
      if (/API_KEY_INVALID|API key not valid/i.test(err.message)) {
        await bot.editMessageText("❌ Gemini API Key tidak valid. Cek GEMINI_API_KEY di .env", {
          chat_id: chatId, message_id: wait.message_id,
        }).catch(() => {});
        return;
      }

      if (/quota|RESOURCE_EXHAUSTED/i.test(err.message)) {
        await bot.editMessageText("⚠️ Gemini quota habis, beralih ke AI cadangan...", {
          chat_id: chatId, message_id: wait.message_id,
        }).catch(() => {});
        // Lanjut ke Ollama
      } else {
        // Error lain → coba Ollama
        console.warn("Gemini gagal, fallback ke Ollama:", err.message);
      }
    }
  }

  // ── OPSI 2: Ollama (Fallback) ──────────────────────────────
  try {
    const res = await axios.post(
      `${config.ollama.url}/api/generate`,
      {
        model:   config.ollama.model,
        prompt:  fullPrompt,
        stream:  false,
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
    if (err.code === "ECONNREFUSED")
      msg = "❌ Ollama tidak berjalan & Gemini belum diset.\n\nJalankan: `ollama serve`";
    else if (err.code === "ETIMEDOUT")
      msg = "⏰ AI timeout, coba lagi.";

    await bot.editMessageText(msg, {
      chat_id: chatId, message_id: wait.message_id,
    }).catch(() => {});
  }
}

module.exports = { handleAI };