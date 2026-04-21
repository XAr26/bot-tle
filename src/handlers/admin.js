// ============================================================
//  handlers/admin.js — Admin-only diagnostic tools
// ============================================================
"use strict";

const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const { YT_DLP_BIN, DOWNLOAD_DIR } = require("../downloader");

/**
 * Run shell command and return promise with output
 */
function execP(cmd) {
  return new Promise((resolve) => {
    exec(cmd, { timeout: 10000 }, (err, stdout, stderr) => {
      resolve({
        ok: !err,
        out: (stdout || stderr || "").trim().slice(0, 500)
      });
    });
  });
}

/**
 * Check environment health
 */
async function handleTestEnv(bot, chatId) {
  const wait = await bot.sendMessage(chatId, "🔍 Sedang memeriksa lingkungan server...");

  const results = [];

  // 1. Check Node & OS
  results.push(`💻 *Node:* ${process.version} (${process.platform})`);

  // 2. Check Gemini
  if (config.gemini.apiKey) {
    results.push("✅ *Gemini:* API Key terpasang");
  } else {
    results.push("⚠️ *Gemini:* API Key belum diset (Pakai Ollama)");
  }

  // 3. Check yt-dlp
  const ytdlp = await execP(`${YT_DLP_BIN} --version`);
  results.push(`${ytdlp.ok ? "✅" : "❌"} *yt-dlp:* ${ytdlp.out || "Error"}`);

  // 4. Check ffmpeg
  const ffmpeg = await execP("ffmpeg -version");
  results.push(`${ffmpeg.ok ? "✅" : "❌"} *ffmpeg:* ${ffmpeg.ok ? "Terpasang" : "Tidak ditemukan"}`);

  // 5. Check Python
  const py = await execP("python3 --version");
  results.push(`${py.ok ? "✅" : "❌"} *Python:* ${py.out || "Error"}`);

  // 5. Check Disk Write
  try {
    const testFile = path.join(DOWNLOAD_DIR, "test_write.txt");
    fs.writeFileSync(testFile, "test");
    fs.unlinkSync(testFile);
    results.push("✅ *Write Access:* OK (downloads/)");
  } catch (e) {
    results.push(`❌ *Write Access:* FAIL (${e.message})`);
  }

  // 6. PATH check
  results.push(`\n📍 *PATH:* \`${process.env.PATH.split(":")[0]}...\``);

  await bot.editMessageText(
    `🛠 *Hasil Diagnosa Server*\n\n${results.join("\n")}`,
    { chat_id: chatId, message_id: wait.message_id, parse_mode: "Markdown" }
  ).catch(err => {
    console.error("Failed to edit diagnostic message:", err);
    bot.sendMessage(chatId, "Gagal mengirim hasil diagnosa.");
  });
}

module.exports = {
  handleTestEnv,
};
