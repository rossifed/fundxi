"""/api/auth — native email/password authentication.

Issues a JWT inside an HTTP-only cookie (BFF pattern — the token
never lands in the frontend's JS). The cookie is sent on every
same-origin request via ``fetch(..., { credentials: "include" })``.
"""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.dependencies import get_session, resolve_session_user_id
from src.application.activity_log import LOGIN, OPEN, REGISTER, record_activity
from src.application.auth_service import (
    AuthenticatedUser,
    EmailAlreadyExistsError,
    InvalidCredentialsError,
    get_user_by_id,
    login_user,
    register_user,
)
from src.application.password_reset_service import (
    InvalidResetTokenError,
    confirm_reset,
    request_reset,
)
from src.config import get_settings
from src.domain.auth.auth import (
    Email,
    InvalidEmailError,
    InvalidPasswordError,
    Password,
)
from src.infrastructure.email.sender import build_sender
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


class ForgotPasswordBody(BaseModel):
    email: str


class ResetPasswordBody(BaseModel):
    token: str = Field(min_length=1)
    password: str = Field(min_length=8)


class MeResponse(BaseModel):
    id: int
    email: str
    name: str

    @classmethod
    def of(cls, u: AuthenticatedUser) -> MeResponse:
        return cls(id=u.id, email=u.email, name=u.name)


def _set_session_cookie(response: Response, user_id: int) -> None:
    token = _issuer().issue(user_id)
    response.set_cookie(
        key=SESSION_COOKIE,
        value=token,
        max_age=60 * 60 * 24 * 30,
        httponly=True,
        samesite="lax",
        # Secure (HTTPS-only) everywhere except local dev, so the session
        # JWT never travels in cleartext in a real deployment.
        secure=not get_settings().is_dev,
        path="/",
    )


def _clear_session_cookie(response: Response) -> None:
    response.delete_cookie(SESSION_COOKIE, path="/")


@router.post("/register", response_model=MeResponse)
async def register(
    body: RegisterBody,
    request: Request,
    response: Response,
    background_tasks: BackgroundTasks,
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
    background_tasks.add_task(
        record_activity, kind=REGISTER, user_id=user.id, user_agent=request.headers.get("user-agent")
    )
    return MeResponse.of(user)


@router.post("/login", response_model=MeResponse)
async def login(
    body: LoginBody,
    request: Request,
    response: Response,
    background_tasks: BackgroundTasks,
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
    background_tasks.add_task(
        record_activity, kind=LOGIN, user_id=user.id, user_agent=request.headers.get("user-agent")
    )
    return MeResponse.of(user)


@router.post("/logout")
async def logout(response: Response) -> dict[str, str]:
    _clear_session_cookie(response)
    return {"status": "ok"}


@router.post("/forgot-password")
async def forgot_password(
    body: ForgotPasswordBody,
    session: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    """Request a password-reset link. Always returns 200 regardless of
    whether the email is registered (no user-enumeration oracle)."""
    settings = get_settings()
    try:
        email = Email.parse(body.email)
    except InvalidEmailError:
        # Malformed input can't match a user — answer the same as success.
        return {"status": "ok"}
    await request_reset(
        session,
        email=email,
        sender=build_sender(settings),
        settings=settings,
        now=datetime.now(UTC),
    )
    return {"status": "ok"}


@router.post("/reset-password")
async def reset_password(
    body: ResetPasswordBody,
    session: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    """Set a new password from a valid reset token. 400 if the token is
    unknown, expired or already used, or if the new password is too weak."""
    try:
        password = Password(value=body.password)
    except InvalidPasswordError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    try:
        await confirm_reset(session, raw_token=body.token, new_password=password, now=datetime.now(UTC))
    except InvalidResetTokenError as exc:
        raise HTTPException(status_code=400, detail="invalid or expired reset link") from exc
    return {"status": "ok"}


@router.get("/me", response_model=MeResponse | None)
async def me(
    request: Request,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
) -> MeResponse | None:
    user_id = await resolve_session_user_id(request, session)
    # /me is hit on every app load (signed-in OR anonymous) — our zero-frontend
    # "app open / return" signal. user_id None records an anonymous open.
    background_tasks.add_task(
        record_activity, kind=OPEN, user_id=user_id, user_agent=request.headers.get("user-agent")
    )
    if user_id is None:
        return None
    user = await get_user_by_id(session, user_id)
    return MeResponse.of(user) if user else None
