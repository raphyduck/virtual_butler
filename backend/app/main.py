from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import api_router
from app.api.butler_ws import router as butler_ws_router
from app.api.ws import router as ws_router
from app.config import settings

app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)
app.include_router(ws_router)        # WebSocket: /ws/session/{session_id}
app.include_router(butler_ws_router)  # WebSocket: /ws/butler


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
