from typing import Optional

from fastapi import Depends, HTTPException, Query, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from database import supabase

_bearer = HTTPBearer(auto_error=False)


async def require_auth(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
    token: Optional[str] = Query(default=None),
) -> dict:
    """Accept JWT from Authorization header (regular endpoints) or ?token= (SSE)."""
    jwt = None
    if credentials:
        jwt = credentials.credentials
    elif token:
        jwt = token

    if not jwt:
        raise HTTPException(status_code=401, detail="Not authenticated")

    try:
        response = supabase.auth.get_user(jwt)
        return {"user_id": response.user.id, "email": response.user.email}
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
