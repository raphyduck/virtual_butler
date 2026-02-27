from fastapi import APIRouter

from app.api.abilities import router as abilities_router
from app.api.auth import router as auth_router
from app.api.conversations import router as conversations_router
from app.api.self_modify import router as self_modify_router
from app.api.settings import router as settings_router
from app.api.setup import router as setup_router
from app.api.skills import router as skills_router
from app.api.update import router as update_router

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth_router)
api_router.include_router(abilities_router)
api_router.include_router(conversations_router)
api_router.include_router(self_modify_router)
api_router.include_router(setup_router)
api_router.include_router(settings_router)
api_router.include_router(skills_router)
api_router.include_router(update_router)
