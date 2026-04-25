// ============================================================
//  handlers/admin.js — Diagnosa server untuk admin
//  BUG FIX: Versi sebelumnya pakai config.gemini.apiKey
//  tapi config.js tidak punya key gemini → ReferenceError.
//  Versi ini pakai config.pythonApi untuk cek Python server.
// ============================================================
"use strict";

const { exec } = require("child_process");
const fs       = require("fs");
const path     = require("path");
const axios    = require("axios");
const config   = require("../config");
const { YT_DLP_BIN, DOWNLOAD_DIR } = require("../downloader");

function execP(cmd) {
  return new Promise((resolve) => {
    exec(cmd, { timeout: 10_000 }, (err, stdout, stderr) => {
      resolve({ ok: !err, out: (stdout || stderr || "").trim().slice(0, 200) });
    });
  });
}

async function handleTestEnv(bot, chatId) {
  const wait = await bot.sendMessage(chatId, "🔍 Memeriksa server...");
  const results = [];

  // 1. Node.js
  results.push(`💻 *Node:* ${process.version} (${process.platform})`);

  // 2. Python server
  try {
    await axios.get(`${config.pythonApi.url}/ping`, { timeout: 5_000 });
    results.push(`✅ *Python API:* Berjalan di ${config.pythonApi.url}`);
  } catch {
    results.push(`❌ *Python API:* Tidak bisa dihubungi (${config.pythonApi.url})\n  → Jalankan: \`python main.py\``);
  }

  // 3. yt-dlp (diperlukan Python)
  const ytdlp = await execP(`${YT_DLP_BIN} --version`);
  results.push(`${ytdlp.ok ? "✅" : "❌"} *yt-dlp:* ${ytdlp.out || "Tidak ditemukan"}`);

  // 4. ffmpeg
  const ffmpeg = await execP("ffmpeg -version");
  results.push(`${ffmpeg.ok ? "✅" : "⚠️"} *ffmpeg:* ${ffmpeg.ok ? "Terpasang" : "Tidak ditemukan (merge video mungkin gagal)"}`);

  // 5. Python3
  const py = await execP("python3 --version");
  results.push(`${py.ok ? "✅" : "❌"} *Python3:* ${py.out || "Tidak ditemukan"}`);

  // 6. instaloader
  const il = await execP("instaloader --version");
  results.push(`${il.ok ? "✅" : "⚠️"} *instaloader:* ${il.ok ? il.out : "Belum install (foto IG tidak bisa)"}`);

  // 7. Write access
  try {
    const testFile = path.join(DOWNLOAD_DIR, "test_write.tmp");
    fs.writeFileSync(testFile, "test");
    fs.unlinkSync(testFile);
    results.push("✅ *Write Access:* OK (downloads/)");
  } catch (e) {
    results.push(`❌ *Write Access:* FAIL — ${e.message}`);
  }

  // 8. ENV vars
  const envCheck = [
    ["BOT_TOKEN",            !!process.env.BOT_TOKEN],
    ["GEMINI_API_KEY",       !!process.env.GEMINI_API_KEY],
    ["OLLAMA_URL",           !!process.env.OLLAMA_URL],
    ["IG_USERNAME",          !!process.env.IG_USERNAME],
    ["SPOTIFY_CLIENT_ID",    !!process.env.SPOTIFY_CLIENT_ID],
    ["SPOTIFY_CLIENT_SECRET", !!process.env.SPOTIFY_CLIENT_SECRET],
    ["PYTHON_API_URL",       !!process.env.PYTHON_API_URL],
    ["INTERNAL_API_TOKEN",   !!process.env.INTERNAL_API_TOKEN],
  ];
  const envLines = envCheck.map(([k, v]) => `${v ? "✅" : "⚠️"} ${k}`).join("\n");
  results.push(`\n📋 *ENV:*\n${envLines}`);

  await bot.editMessageText(
    `🛠 *Diagnosa Server*\n\n${results.join("\n")}`,
    { chat_id: chatId, message_id: wait.message_id, parse_mode: "Markdown" }
  ).catch(() => bot.sendMessage(chatId, "Gagal kirim hasil diagnosa."));
}

module.exports = { handleTestEnv };