import os
import time
from typing import Any, Dict, Optional

import httpx
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import jwt, JWTError

# ---- establish Cognito config ---
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

async def _get_jwks():
    now = time.time()
    if _jwks_cache["data"] is not None and _jwks_cache["expires_at"] >= now:
        return _jwks_cache["data"]
    #fetch keys from AWS Cognito
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(COGNITO_JWKS_URL)
            response.raise_for_status()
            jwks = response.json()
    except Exception as e:
        print("exception occured while retrieving json web keys, ", e)
        raise HTTPException(status_code=503, detail=f"unable to retrieve JWKS: {e}")
    
    now = time.time() #reset time because of http request may have just occured
    _jwks_cache['data'] = jwks
    _jwks_cache['expires_at'] = now + _JWKS_TTL_SECONDS
    return jwks

async def verify_jwt_token(
        creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme)
) -> Dict[str, Any]:
    if not creds or creds.scheme.lower() != 'bearer':
        raise HTTPException(status_code=401, detail='Missing Bearer Token')
    token = creds.credentials
    if not token:
        raise HTTPException(status_code=401, detail='Missing Bearer Token')

    try:
        #read key id from token header
        unverified_header = jwt.get_unverified_header(token)
        kid = unverified_header.get("kid")
        if not kid:
            raise HTTPException(status_code=401, detail="Invalid token header")
        
        #search if incoming key valid
        jwks = await _get_jwks()
        keys = jwks.get("keys", [])
        key = None
        for k in keys:
            if k.get("kid") == kid:
                key = k
                break
        if key is None:
            raise HTTPException(status_code=401, detail="Signing key not found")
        
        #ensure token sentby frontend is valid
        decoded_token = jwt.decode(
              token,
              key,
              algorithms=["RS256"],
              issuer=COGNITO_ISSUER,
              audience=COGNITO_APP_CLIENT_ID,
              options={"verify_at_hash": False},
        )
        if decoded_token.get("token_use") != "id":
            #check if a token is the type to verify user identity
            raise HTTPException(status_code=401, detail="Invalid token_use")
    
        return decoded_token

    
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid or expired token {e}")








    
