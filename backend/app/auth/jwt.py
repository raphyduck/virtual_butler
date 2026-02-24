import uuid
from datetime import UTC, datetime, timedelta

from jose import JWTError, jwt

from app.config import settings

_ACCESS = "access"
_REFRESH = "refresh"


def _create_token(subject: str, kind: str, expires_delta: timedelta) -> str:
    payload = {
        "sub": subject,
        "kind": kind,
        "jti": str(uuid.uuid4()),
        "iat": datetime.now(UTC),
        "exp": datetime.now(UTC) + expires_delta,
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


def create_access_token(user_id: str) -> str:
    return _create_token(user_id, _ACCESS, timedelta(minutes=settings.access_token_expire_minutes))


def create_refresh_token(user_id: str) -> str:
    return _create_token(user_id, _REFRESH, timedelta(days=settings.refresh_token_expire_days))


def decode_token(token: str, expected_kind: str = _ACCESS) -> str:
    """Return user_id (sub) or raise JWTError."""
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    except JWTError:
        raise

    if payload.get("kind") != expected_kind:
        raise JWTError("Invalid token kind")

    sub: str | None = payload.get("sub")
    if sub is None:
        raise JWTError("Missing subject")

    return sub


def decode_refresh_token(token: str) -> str:
    return decode_token(token, _REFRESH)
