from fastapi import FastAPI, HTTPException, Body, Query, UploadFile, File, Security, Depends
from fastapi.security import APIKeyHeader
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List, Optional
import os

from .ai_service import ai_service
from .download_service import download_service

app = FastAPI(title="Hybrid Bot Engine API")

API_KEY = os.getenv("INTERNAL_API_TOKEN", "bot-tle-secret-key-123")
api_key_header = APIKeyHeader(name="X-API-KEY", auto_error=False)

async def get_api_key(api_key_header: str = Security(api_key_header)):
    if api_key_header != API_KEY:
        raise HTTPException(status_code=403, detail="Forbidden")
    return api_key_header

class AIRequest(BaseModel):
    prompt: str
    history: Optional[List[dict]] = None

@app.post("/ai", dependencies=[Depends(get_api_key)])
async def chat_ai(req: AIRequest):
    response = await ai_service.generate_response(req.prompt, req.history)
    return {"response": response}

@app.post("/ai/image", dependencies=[Depends(get_api_key)])
async def analyze_image(prompt: str = Body("Apa ini?"), file: UploadFile = File(...)):
    img_bytes = await file.read()
    response = await ai_service.analyze_image(img_bytes, prompt)
    return {"response": response}

@app.get("/download/info", dependencies=[Depends(get_api_key)])
async def get_download_info(url: str = Query(...)):
    info = await download_service.get_metadata(url)
    if not info:
        raise HTTPException(status_code=400, detail="Gagal mengambil metadata")
    return info

@app.post("/download/execute", dependencies=[Depends(get_api_key)])
async def execute_download(
    url: str = Body(...),
    type: str = Body("video"),
    quality: str = Body("720p"),
    user_id: str = Body("0")
):
    result = await download_service.download_media(url, type, quality, user_id)
    if result["status"] == "error":
        raise HTTPException(status_code=500, detail=result["message"])
    return result

@app.get("/download/instagram", dependencies=[Depends(get_api_key)])
async def get_ig_photos(url: str = Query(...), user_id: str = Query("0")):
    photos = await download_service.download_instagram_photos(url, user_id)
    if not photos:
        raise HTTPException(status_code=400, detail="Gagal download foto Instagram")
    return {"photos": photos}

@app.get("/ping")
async def ping():
    return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    # Bind to 127.0.0.1 for internal use, though 0.0.0.0 is ok now with API key auth.
    uvicorn.run(app, host="127.0.0.1", port=8000)
