import os
import time
from typing import Any, Dict, Optional

import httpx
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import jwt, JWTError

# --- Cognito config ---
COGNITO_REGION = os.environ.get("COGNITO_REGION", "us-east-2")
COGNITO_USER_POOL_ID = os.environ.get("COGNITO_USER_POOL_ID", "")
COGNITO_APP_CLIENT_ID = os.environ.get("COGNITO_APP_CLIENT_ID", "")

if not COGNITO_USER_POOL_ID or not COGNITO_APP_CLIENT_ID:
    print("WARNING: Cognito env vars missing (COGNITO_USER_POOL_ID / COGNITO_APP_CLIENT_ID)")

COGNITO_ISSUER = f"https://cognito-idp.{COGNITO_REGION}.amazonaws.com/{COGNITO_USER_POOL_ID}"
COGNITO_JWKS_URL = f"{COGNITO_ISSUER}/.well-known/jwks.json"

bearer_scheme = HTTPBearer(auto_error=False)

_jwks_cache: Dict[str, Any] = {"data": None, "expires_at": 0}
_JWKS_TTL_SECONDS = 60 * 60  # 1 hour