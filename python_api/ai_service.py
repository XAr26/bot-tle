import os
import requests
import google.generativeai as genai
from typing import List, Optional
from dotenv import load_dotenv

load_dotenv()

class AIService:
    def __init__(self):
        self.gemini_api_key = os.getenv("GEMINI_API_KEY")
        self.gemini_model_name = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")
        self.ollama_url = os.getenv("OLLAMA_URL", "http://localhost:11434")
        self.ollama_model = os.getenv("OLLAMA_MODEL", "phi3")

        if self.gemini_api_key:
            genai.configure(api_key=self.gemini_api_key)

    async def generate_response(self, prompt: str, history: List[dict] = None) -> str:
        # Try Gemini first
        if self.gemini_api_key:
            try:
                model = genai.GenerativeModel(self.gemini_model_name)
                # Simple prompt for now, could be expanded to use history properly
                response = model.generate_content(prompt)
                if response and response.text:
                    return response.text.strip()
            except Exception as e:
                print(f"Gemini error: {e}")

        # Fallback to Ollama
        try:
            payload = {
                "model": self.ollama_model,
                "prompt": prompt,
                "stream": False
            }
            response = requests.post(f"{self.ollama_url}/api/generate", json=payload, timeout=60)
            if response.status_code == 200:
                return response.json().get("response", "").strip()
        except Exception as e:
            print(f"Ollama error: {e}")

        return "Maaf, AI sedang tidak tersedia."

    async def analyze_image(self, image_data: bytes, prompt: str = "Apa yang ada di gambar ini?") -> str:
        if not self.gemini_api_key:
            return "Analisa gambar hanya tersedia melalui Gemini. Masukkan API Key di .env"

        try:
            model = genai.GenerativeModel(self.gemini_model_name)
            # image_data is bytes
            contents = [
                prompt,
                {
                    "mime_type": "image/jpeg", # Assuming jpeg for now, can be dynamic
                    "data": image_data
                }
            ]
            response = model.generate_content(contents)
            if response and response.text:
                return response.text.strip()
        except Exception as e:
            print(f"Image analysis error: {e}")
            return f"Gagal menganalisa gambar: {str(e)}"
        
        return "Gagal mendapatkan respon dari AI."

ai_service = AIService()
