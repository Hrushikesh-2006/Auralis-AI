import base64
import hashlib
import hmac
import json
import time
from typing import Any, Dict, Optional

import requests
from fastapi import HTTPException

from backend.config import config
from backend.services.database_service import get_user_by_id, upsert_google_user

TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("utf-8").rstrip("=")


def _b64url_decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


def _sign(payload_b64: str) -> str:
    secret = config.AUTH_SECRET.encode("utf-8")
    return _b64url_encode(hmac.new(secret, payload_b64.encode("utf-8"), hashlib.sha256).digest())


def create_app_token(user_id: str) -> str:
    now = int(time.time())
    payload = {
        "sub": user_id,
        "iat": now,
        "exp": now + TOKEN_TTL_SECONDS
    }
    payload_b64 = _b64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signature = _sign(payload_b64)
    return f"{payload_b64}.{signature}"


def verify_app_token(token: str) -> Dict[str, Any]:
    if not token or "." not in token:
        raise HTTPException(status_code=401, detail="Missing auth token")

    payload_b64, signature = token.split(".", 1)
    expected_signature = _sign(payload_b64)
    if not hmac.compare_digest(signature, expected_signature):
        raise HTTPException(status_code=401, detail="Invalid auth token")

    try:
        payload = json.loads(_b64url_decode(payload_b64).decode("utf-8"))
    except Exception:
        raise HTTPException(status_code=401, detail="Malformed auth token")

    if int(payload.get("exp", 0)) < int(time.time()):
        raise HTTPException(status_code=401, detail="Expired auth token")

    return payload


def get_current_user_from_header(authorization: Optional[str]) -> Dict[str, Any]:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")

    token = authorization.split(" ", 1)[1].strip()
    payload = verify_app_token(token)
    user = get_user_by_id(payload.get("sub", ""))
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def verify_google_credential(credential: str, requested_client_id: Optional[str] = None) -> Dict[str, Any]:
    if not credential:
        raise HTTPException(status_code=400, detail="Missing Google credential")

    expected_client_id = config.GOOGLE_CLIENT_ID or requested_client_id
    if not expected_client_id:
        raise HTTPException(status_code=400, detail="GOOGLE_CLIENT_ID is not configured")

    try:
        resp = requests.get(
            "https://oauth2.googleapis.com/tokeninfo",
            params={"id_token": credential},
            timeout=10
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not verify Google token: {exc}")

    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid Google credential")

    profile = resp.json()
    if profile.get("aud") != expected_client_id:
        raise HTTPException(status_code=401, detail="Google token audience does not match this app")
    if profile.get("iss") not in {"accounts.google.com", "https://accounts.google.com"}:
        raise HTTPException(status_code=401, detail="Google token issuer is invalid")
    if int(profile.get("exp", 0)) < int(time.time()):
        raise HTTPException(status_code=401, detail="Google credential is expired")
    if str(profile.get("email_verified", "")).lower() not in {"true", "1"}:
        raise HTTPException(status_code=401, detail="Google email is not verified")

    return profile


def sign_in_with_google(credential: str, client_id: Optional[str] = None) -> Dict[str, Any]:
    profile = verify_google_credential(credential, client_id)
    user = upsert_google_user(profile)
    return {
        "user": user,
        "token": create_app_token(user["id"]),
        "expires_in": TOKEN_TTL_SECONDS
    }