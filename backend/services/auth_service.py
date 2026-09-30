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

    parts = token.split(".")
    if len(parts) != 2:
        raise HTTPException(status_code=401, detail="Malformed auth token format")

    payload_b64, signature = parts
    expected_signature = _sign(payload_b64)
    if not hmac.compare_digest(signature, expected_signature):
        raise HTTPException(status_code=401, detail="Invalid auth token signature")

    try:
        payload = json.loads(_b64url_decode(payload_b64).decode("utf-8"))
    except Exception:
        raise HTTPException(status_code=401, detail="Malformed auth token payload")

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


def verify_google_credential(
    credential: Optional[str] = None,
    access_token: Optional[str] = None,
    requested_client_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Verifies either a Google ID Token (credential) or a Google OAuth2 Access Token (access_token).
    """
    token = credential or access_token
    if not token:
        raise HTTPException(status_code=400, detail="Missing Google credential or access token")

    expected_client_id = config.GOOGLE_CLIENT_ID or requested_client_id

    # 1. Check if token is a Google OAuth2 Access Token
    if access_token or not ("." in token and len(token.split(".")) == 3):
        # Verify via Google UserInfo endpoint
        try:
            resp = requests.get(
                "https://www.googleapis.com/oauth2/v3/userinfo",
                headers={"Authorization": f"Bearer {token}"},
                timeout=10
            )
            if resp.status_code == 200:
                profile = resp.json()
                if profile.get("sub") and profile.get("email"):
                    return profile
        except Exception as exc:
            pass

    # 2. Verify via Google ID Token endpoint
    try:
        resp = requests.get(
            "https://oauth2.googleapis.com/tokeninfo",
            params={"id_token": token},
            timeout=10
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not reach Google verification servers: {exc}")

    valid_client_ids = {c.strip() for c in [config.GOOGLE_CLIENT_ID, requested_client_id] if c and c.strip()}
    if resp.status_code == 200:
        profile = resp.json()
        aud = profile.get("aud")
        azp = profile.get("azp")
        if valid_client_ids and (aud not in valid_client_ids and azp not in valid_client_ids):
            print(f"[AuthService] Warning: Google token aud/azp ({aud}/{azp}) not in expected {valid_client_ids}")
        if profile.get("iss") not in {"accounts.google.com", "https://accounts.google.com"}:
            raise HTTPException(status_code=401, detail="Google token issuer is invalid")
        if int(profile.get("exp", 0)) < int(time.time()):
            raise HTTPException(status_code=401, detail="Google credential is expired")
        return profile

    # 3. Fallback check for access_token param in tokeninfo
    try:
        resp = requests.get(
            "https://oauth2.googleapis.com/tokeninfo",
            params={"access_token": token},
            timeout=10
        )
        if resp.status_code == 200:
            profile = resp.json()
            if profile.get("sub") or profile.get("user_id"):
                profile["sub"] = profile.get("sub") or profile.get("user_id")
                return profile
    except Exception:
        pass

    raise HTTPException(status_code=401, detail="Invalid Google credential or expired token")


def sign_in_with_google(
    credential: Optional[str] = None,
    access_token: Optional[str] = None,
    client_id: Optional[str] = None
) -> Dict[str, Any]:
    profile = verify_google_credential(credential, access_token, client_id)
    user = upsert_google_user(profile)
    return {
        "user": user,
        "token": create_app_token(user["id"]),
        "expires_in": TOKEN_TTL_SECONDS
    }


def demo_login() -> Dict[str, Any]:
    """
    Demo / Guest login helper for local preview & testing environments.
    """
    demo_profile = {
        "sub": "demo-user-123456789",
        "email": "demo.user@auralis.ai",
        "email_verified": True,
        "name": "Alex Mercer (Demo)",
        "given_name": "Alex",
        "family_name": "Mercer",
        "picture": "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80",
        "locale": "en",
        "hd": "auralis.ai"
    }
    user = upsert_google_user(demo_profile)
    return {
        "user": user,
        "token": create_app_token(user["id"]),
        "expires_in": TOKEN_TTL_SECONDS
    }