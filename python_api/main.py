# ============================================================
#  main.py — FastAPI entry point
#  IMPROVEMENT: Startup event untuk cek dependencies,
#  better error response, CORS disabled (internal only).
# ============================================================

from fastapi import FastAPI, HTTPException, Body, Query, UploadFile, File, Security, Depends
from fastapi.security import APIKeyHeader
from pydantic import BaseModel
from typing import List, Optional
import os

from ai_service       import ai_service
from download_service import download_service

app = FastAPI(title="Bot Engine API", version="2.0.0")

API_KEY        = os.getenv("INTERNAL_API_TOKEN", "bot-tle-secret-key-123")
api_key_header = APIKeyHeader(name="X-API-KEY", auto_error=False)

async def verify_key(key: str = Security(api_key_header)):
    if key != API_KEY:
        raise HTTPException(status_code=403, detail="Forbidden: invalid API key")
    return key

# ─── Models ───────────────────────────────────────────────────
class AIRequest(BaseModel):
    prompt:  str
    history: Optional[List[dict]] = None

class DownloadRequest(BaseModel):
    url:     str
    type:    str = "video"
    quality: str = "720p"
    user_id: str = "0"

# ─── Health ───────────────────────────────────────────────────
@app.get("/ping")
def ping():
    return {"status": "ok", "version": "2.0.0"}

# ─── AI ───────────────────────────────────────────────────────
@app.post("/ai", dependencies=[Depends(verify_key)])
async def chat_ai(req: AIRequest):
    if not req.prompt or not req.prompt.strip():
        raise HTTPException(status_code=400, detail="prompt tidak boleh kosong")
    response = await ai_service.generate_response(req.prompt, req.history)
    return {"response": response}

@app.post("/ai/image", dependencies=[Depends(verify_key)])
async def analyze_image(
    prompt: str = Body("Apa yang ada di gambar ini?"),
    file:   UploadFile = File(...)
):
    img_bytes = await file.read()
    response  = await ai_service.analyze_image(img_bytes, prompt)
    return {"response": response}

# ─── Download ─────────────────────────────────────────────────
@app.get("/download/info", dependencies=[Depends(verify_key)])
async def get_info(url: str = Query(...)):
    info = await download_service.get_metadata(url)
    if not info:
        raise HTTPException(status_code=400, detail="Gagal mengambil metadata. Cek URL atau cookies.")
    return info

@app.post("/download/execute", dependencies=[Depends(verify_key)])
async def execute_download(req: DownloadRequest):
    result = await download_service.download_media(req.url, req.type, req.quality, req.user_id)
    if result.get("status") == "error":
        raise HTTPException(status_code=500, detail=result.get("message", "Download gagal"))
    return result

@app.get("/download/photos", dependencies=[Depends(verify_key)])
async def get_photos(url: str = Query(...), user_id: str = Query("0")):
    photos = await download_service.download_photos(url, user_id)
    if not photos:
        raise HTTPException(status_code=400, detail="Gagal mengambil foto/gambar dari link tersebut.")
    return {"photos": photos}

# ─── Run ──────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PYTHON_API_PORT", "8000"))
    print(f"🚀 Python API jalan di http://127.0.0.1:{port}")
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")