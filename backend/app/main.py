import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import api_router
from app.api.butler_ws import router as butler_ws_router
from app.api.logs_ws import router as logs_ws_router
from app.api.ws import router as ws_router
from app.config import settings
from app.log_buffer import log_handler

# ── Logging setup ────────────────────────────────────────────────────────────
# Attach the ring-buffer handler to the root logger so every module's log
# records are captured and available through the /logs UI.

_fmt = logging.Formatter("%(levelname)s %(name)s: %(message)s")
log_handler.setFormatter(_fmt)
logging.root.addHandler(log_handler)
logging.root.setLevel(logging.INFO)
# Quiet down noisy third-party loggers
for _name in ("httpcore", "httpx", "watchfiles", "multipart"):
    logging.getLogger(_name).setLevel(logging.WARNING)

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
app.include_router(ws_router)  # WebSocket: /ws/session/{session_id}
app.include_router(butler_ws_router)  # WebSocket: /ws/butler
app.include_router(logs_ws_router)  # WebSocket: /ws/logs


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
