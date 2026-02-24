from fastapi import APIRouter

from app.api.abilities import router as abilities_router
from app.api.auth import router as auth_router
from app.api.self_modify import router as self_modify_router

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth_router)
api_router.include_router(abilities_router)
api_router.include_router(self_modify_router)
