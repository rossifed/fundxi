"""/api/auth — native email/password authentication.

Issues a JWT inside an HTTP-only cookie (BFF pattern — the token
never lands in the frontend's JS). The cookie is sent on every
same-origin request via ``fetch(..., { credentials: "include" })``.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.dependencies import get_session
from src.application.auth_service import (
    AuthenticatedUser,
    EmailAlreadyExistsError,
    InvalidCredentialsError,
    get_user_by_id,
    login_user,
    register_user,
)
from src.config import get_settings
from src.domain.auth.auth import (
    Email,
    InvalidEmailError,
    InvalidPasswordError,
    Password,
)
from src.infrastructure.security.jwt_tokens import JwtIssuer

router = APIRouter(prefix="/api/auth", tags=["auth"])

SESSION_COOKIE = "fundxi_session"


def _issuer() -> JwtIssuer:
    return JwtIssuer(secret=get_settings().jwt_secret)


class RegisterBody(BaseModel):
    email: str = Field(min_length=3)
    password: str = Field(min_length=8)
    display_name: str | None = None


class LoginBody(BaseModel):
    email: str
    password: str


class MeResponse(BaseModel):
    id: int
    email: str
    name: str

    @classmethod
    def of(cls, u: AuthenticatedUser) -> "MeResponse":
        return cls(id=u.id, email=u.email, name=u.name)


def _set_session_cookie(response: Response, user_id: int) -> None:
    token = _issuer().issue(user_id)
    response.set_cookie(
        key=SESSION_COOKIE,
        value=token,
        max_age=60 * 60 * 24 * 30,
        httponly=True,
        samesite="lax",
        secure=False,  # local dev; flip to True in prod (HTTPS)
        path="/",
    )


def _clear_session_cookie(response: Response) -> None:
    response.delete_cookie(SESSION_COOKIE, path="/")


@router.post("/register", response_model=MeResponse)
async def register(
    body: RegisterBody,
    response: Response,
    session: AsyncSession = Depends(get_session),
) -> MeResponse:
    try:
        email = Email.parse(body.email)
        password = Password(value=body.password)
    except (InvalidEmailError, InvalidPasswordError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    try:
        user = await register_user(session, email=email, password=password, display_name=body.display_name)
    except EmailAlreadyExistsError as exc:
        raise HTTPException(status_code=409, detail="email already registered") from exc
    _set_session_cookie(response, user.id)
    return MeResponse.of(user)


@router.post("/login", response_model=MeResponse)
async def login(
    body: LoginBody,
    response: Response,
    session: AsyncSession = Depends(get_session),
) -> MeResponse:
    try:
        email = Email.parse(body.email)
        password = Password(value=body.password)
    except (InvalidEmailError, InvalidPasswordError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    try:
        user = await login_user(session, email=email, password=password)
    except InvalidCredentialsError as exc:
        raise HTTPException(status_code=401, detail="invalid email or password") from exc
    _set_session_cookie(response, user.id)
    return MeResponse.of(user)


@router.post("/logout")
async def logout(response: Response) -> dict[str, str]:
    _clear_session_cookie(response)
    return {"status": "ok"}


@router.get("/me", response_model=MeResponse | None)
async def me(
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> MeResponse | None:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        return None
    user_id = _issuer().verify(token)
    if user_id is None:
        return None
    user = await get_user_by_id(session, user_id)
    return MeResponse.of(user) if user else None
