from fastapi import FastAPI, HTTPException, Body, Query, Depends
from fastapi.security import APIKeyHeader
import os

app = FastAPI()

API_KEY = os.getenv("INTERNAL_API_TOKEN", "bot-tle-secret-key-123")
api_key_header = APIKeyHeader(name="X-API-KEY", auto_error=False)

async def get_api_key(api_key: str = Depends(api_key_header)):
    if api_key != API_KEY:
        raise HTTPException(status_code=403, detail="Forbidden")

@app.get("/ping")
def ping():
    return {"status": "ok"}

@app.post("/ai", dependencies=[Depends(get_api_key)])
async def ai(prompt: str = Body(...)):
    return {"response": f"AI jawab: {prompt}"}

@app.get("/download/info", dependencies=[Depends(get_api_key)])
async def info(url: str = Query(...)):
    return {
        "title": "Dummy Video",
        "uploader": "Bot",
        "duration": 120,
        "thumbnail": None,
        "viewCount": 1000,
        "likeCount": 100,
        "formats": ["360p", "720p"]
    }

@app.post("/download/execute", dependencies=[Depends(get_api_key)])
async def download(url: str = Body(...)):
    return {
        "status": "success",
        "file_path": "test.mp4",
        "size_mb": 1.2
    }