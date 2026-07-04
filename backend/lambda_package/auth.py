import os

import jwt
from fastapi import Header, HTTPException
from jwt import PyJWKClient

COGNITO_USER_POOL_ID = os.environ["COGNITO_USER_POOL_ID"]
COGNITO_CLIENT_ID = os.environ["COGNITO_CLIENT_ID"]
COGNITO_REGION = os.environ.get("COGNITO_REGION", "us-east-2")

ISSUER = f"https://cognito-idp.{COGNITO_REGION}.amazonaws.com/{COGNITO_USER_POOL_ID}"
JWKS_URL = f"{ISSUER}/.well-known/jwks.json"

_jwk_client = PyJWKClient(JWKS_URL)


def get_current_user_id(authorization: str | None = Header(None)) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization.removeprefix("Bearer ").strip()

    try:
        signing_key = _jwk_client.get_signing_key_from_jwt(token)
        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            audience=COGNITO_CLIENT_ID,
            issuer=ISSUER,
        )
    except jwt.PyJWTError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")

    if claims.get("token_use") != "id":
        raise HTTPException(status_code=401, detail="Expected a Cognito ID token")

    return claims["sub"]
