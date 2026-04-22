# ============================================================
#  ai_service.py — Gemini + Ollama fallback
#  BUG FIX: Versi sebelumnya import google.generativeai
#  tapi requirements.txt tulis "google-generative-ai" (salah)
#  sehingga package tidak terinstall → ImportError crash.
#  Fix: nama package yang benar adalah "google-generativeai".
#
#  IMPROVEMENT: Tambah conversation history, system prompt
#  dalam bahasa Indonesia, dan error handling lebih baik.
# ============================================================

import os
import requests
import json
from typing import List, Optional, Dict
from dotenv import load_dotenv

load_dotenv()

# Safe import Gemini
try:
    import google.generativeai as genai
    GEMINI_AVAILABLE = True
except ImportError:
    genai = None
    GEMINI_AVAILABLE = False
    print("⚠️  google-generativeai belum terinstall. Jalankan: pip install google-generativeai")


SYSTEM_PROMPT = (
    "Kamu adalah asisten AI di dalam bot Telegram. "
    "Jawab dalam bahasa Indonesia yang santai dan natural. "
    "Singkat dan padat (maksimal 4 kalimat), boleh pakai emoji yang relevan. "
    "Tolak pertanyaan berbahaya atau tidak etis dengan sopan."
)


class AIService:
    def __init__(self):
        self.gemini_api_key  = os.getenv("GEMINI_API_KEY")
        self.gemini_model    = os.getenv("GEMINI_MODEL", "gemini-1.5-flash-latest")

        self.ollama_url      = os.getenv("OLLAMA_URL", "http://localhost:11434")
        self.ollama_model    = os.getenv("OLLAMA_MODEL", "phi3")

        if self.gemini_api_key and GEMINI_AVAILABLE:
            genai.configure(api_key=self.gemini_api_key)
            print(f"✅ Gemini siap: model={self.gemini_model}")
        else:
            print("⚠️  Gemini tidak aktif. Pakai Ollama sebagai fallback.")

    def _build_prompt(self, prompt: str, history: List[Dict] = None) -> str:
        """Gabungkan system prompt + history + user message."""
        parts = [SYSTEM_PROMPT, ""]
        if history:
            for msg in history[-10:]:  # maks 10 pesan terakhir
                role = "User" if msg.get("role") == "user" else "AI"
                parts.append(f"{role}: {msg.get('content', '')}")
            parts.append("")
        parts.append(f"User: {prompt}")
        parts.append("AI:")
        return "\n".join(parts)

    async def generate_response(self, prompt: str, history: List[Dict] = None) -> str:
        full_prompt = self._build_prompt(prompt, history)

        # ── Coba Gemini dulu ──────────────────────────────────
        if self.gemini_api_key and GEMINI_AVAILABLE:
            try:
                model    = genai.GenerativeModel(self.gemini_model)
                response = model.generate_content(full_prompt)
                if response and response.text:
                    return response.text.strip()
            except Exception as e:
                print(f"🔴 Gemini error: {e}")
                # Fallback ke Ollama

        # ── Fallback Ollama ───────────────────────────────────
        try:
            resp = requests.post(
                f"{self.ollama_url}/api/generate",
                json={
                    "model":  self.ollama_model,
                    "prompt": full_prompt,
                    "stream": False,
                    "options": { "num_predict": 200, "temperature": 0.7 },
                },
                timeout=60,
            )
            if resp.status_code == 200:
                return resp.json().get("response", "").strip()
        except Exception as e:
            print(f"🔴 Ollama error: {e}")

        return "❌ Maaf, AI sedang tidak tersedia. Coba lagi nanti."

    async def analyze_image(self, image_data: bytes, prompt: str = "Apa yang ada di gambar ini?") -> str:
        if not self.gemini_api_key or not GEMINI_AVAILABLE:
            return "❌ Analisa gambar hanya tersedia jika GEMINI_API_KEY diset."
        try:
            import PIL.Image
            import io
            model  = genai.GenerativeModel(self.gemini_model)
            image  = PIL.Image.open(io.BytesIO(image_data))
            result = model.generate_content([prompt, image])
            return result.text.strip() if result and result.text else "❓ Tidak ada jawaban."
        except Exception as e:
            print(f"🔴 Image analysis error: {e}")
            return f"❌ Gagal menganalisa gambar: {str(e)}"


ai_service = AIService()