from fastapi import APIRouter

from app.api.abilities import router as abilities_router
from app.api.auth import router as auth_router

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth_router)
api_router.include_router(abilities_router)
