from fastapi import APIRouter, Depends, HTTPException, status, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, EmailStr, Field
from typing import Annotated
from datetime import datetime
import logging

from database import get_async_db
from schemas.user import Token
from models import Invitation, Organization

from services import auth_service
from services.user_service import UserService, get_async_user_service
from services.login_email_service import LoginEmailService

logger = logging.getLogger(__name__)

# Re-export validate_token as get_current_user for convenient importing by other routers
# Usage: from routers.auth import get_current_user
get_current_user = auth_service.validate_token


# ============== Request Schemas ==============

class UserCreate(BaseModel):
    """Request schema for user registration."""
    email: EmailStr = Field(description="User's email address")
    password: str = Field(
        min_length=5,
        description="User's password"
    )
    invitation_token: str | None = Field(
        default=None,
        description="Optional invitation token for org assignment"
    )


class InvitationValidation(BaseModel):
    """Response schema for invitation validation."""
    valid: bool
    email: str | None = None
    org_name: str | None = None
    role: str | None = None
    expires_at: datetime | None = None
    error: str | None = None


router = APIRouter()


@router.post(
    "/register",
    response_model=Token,
    summary="Register a new user and automatically log them in"
)
async def register(user: UserCreate, db: AsyncSession = Depends(get_async_db)):
    """
    Register a new user and automatically log them in with:
    - **email**: valid email address
    - **password**: string
    - **invitation_token**: optional invitation token for org assignment

    Returns JWT token and session information, same as login endpoint.

    If no invitation token is provided, user is assigned to the default organization.
    If an invitation token is provided, user is assigned to the organization and role
    specified in the invitation.
    """
    return await auth_service.async_register_and_login_user(
        db, user.email, user.password, user.invitation_token
    )


@router.get(
    "/validate-invitation/{token}",
    response_model=InvitationValidation,
    summary="Validate an invitation token"
)
async def validate_invitation(token: str, db: AsyncSession = Depends(get_async_db)):
    """
    Validate an invitation token and return invitation details.
    This is a public endpoint (no authentication required).

    Returns:
    - **valid**: Whether the invitation is valid
    - **email**: Email the invitation was sent to
    - **org_name**: Organization name the user will join
    - **role**: Role the user will be assigned
    - **expires_at**: When the invitation expires
    - **error**: Error message if invalid
    """
    result = await db.execute(
        select(Invitation).where(Invitation.token == token)
    )
    invitation = result.scalars().first()

    if not invitation:
        return InvitationValidation(valid=False, error="Invitation not found")

    if invitation.is_revoked:
        return InvitationValidation(valid=False, error="Invitation has been revoked")

    if invitation.accepted_at:
        return InvitationValidation(valid=False, error="Invitation has already been used")

    if invitation.expires_at < datetime.utcnow():
        return InvitationValidation(valid=False, error="Invitation has expired")

    # Get organization name
    org_result = await db.execute(
        select(Organization).where(Organization.org_id == invitation.org_id)
    )
    org = org_result.scalars().first()
    org_name = org.name if org else "Unknown Organization"

    return InvitationValidation(
        valid=True,
        email=invitation.email,
        org_name=org_name,
        role=invitation.role,
        expires_at=invitation.expires_at
    )


@router.post(
    "/login",
    response_model=Token,
    summary="Login to get JWT token",
    responses={
        200: {
            "content": {
                "application/json": {
                    "example": {
                        "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
                        "token_type": "bearer",
                        "username": "john.doe"
                    }
                }
            }
        },
        401: {
            "description": "Invalid credentials"
        }
    }
)
async def login(
    username: Annotated[str, Form(description="User's email address")],
    password: Annotated[str, Form(description="User's password")],
    db: AsyncSession = Depends(get_async_db)
):
    """
    Login with email and password to get a JWT token.

    - **username**: email address
    - **password**: user password

    Returns:
    - **access_token**: JWT token to use for authentication
    - **token_type**: "bearer"
    - **username**: user's username
    """
    try:
        token = await auth_service.async_login_user(db, username, password)
        return token
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


# Note: User profile endpoints are in user.py (/api/user/me)
# Note: User management endpoints (list users, update roles) are in admin.py


@router.post(
    "/request-login-token",
    summary="Request one-time login token via email"
)
async def request_login_token(
    email: str = Form(..., description="User's email address"),
    user_service: UserService = Depends(get_async_user_service)
):
    """
    Request a one-time login token to be sent via email.

    - **email**: User's email address

    The token will be sent to the email address and expires in 30 minutes.
    """
    try:
        # Find user by email
        user = await user_service.async_get_user_by_email(email)
        if not user:
            # For security, don't reveal if email exists or not
            return {"message": "If an account with this email exists, a login link has been sent."}

        # Generate login token
        email_service = LoginEmailService()
        token, expires_at = email_service.generate_login_token()

        # Store token in database
        await user_service.async_update_login_token(user.user_id, token, expires_at)

        # Send email
        success = await email_service.send_login_token(email, token)

        if not success:
            # Clear token if email failed
            await user_service.async_clear_login_token(user.user_id)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to send login email. Please try again."
            )

        return {"message": "If an account with this email exists, a login link has been sent."}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error requesting login token: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred while processing your request."
        )


@router.post(
    "/login-with-token",
    response_model=Token,
    summary="Authenticate with one-time login token"
)
async def login_with_token(
    token: str = Form(..., description="Login token from email"),
    user_service: UserService = Depends(get_async_user_service)
):
    """
    Authenticate using a one-time login token.

    - **token**: Login token received via email

    Returns JWT access token and session information.
    The login token can only be used once and expires after 30 minutes.
    """
    try:
        # Find user by login token
        user = await user_service.async_get_user_by_login_token(token)

        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired login token"
            )

        # Clear the login token (one-time use)
        await user_service.async_clear_login_token(user.user_id)

        # Extract username from email
        username = user.email.split('@')[0]

        # Create JWT token data
        token_data = {
            "sub": user.email,
            "user_id": user.user_id,
            "org_id": user.org_id,
            "username": username,
            "role": user.role.value
        }

        # Create access token
        access_token = auth_service.create_access_token(data=token_data)

        logger.info(f"Successfully authenticated user {user.email} with login token")

        return Token(
            access_token=access_token,
            token_type="bearer",
            username=username,
            role=user.role,
            user_id=user.user_id,
            org_id=user.org_id,
            email=user.email
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error authenticating with login token: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred during authentication."
        )


@router.post(
    "/test-email",
    summary="Send test email to cliff.rosen@gmail.com"
)
async def test_email():
    """
    Send a simple test email to cliff.rosen@gmail.com to verify email functionality.
    """
    try:
        email_service = LoginEmailService()
        success = await email_service.send_test_email()

        if success:
            return {"message": "Test email sent successfully"}
        else:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to send test email"
            )

    except Exception as e:
        logger.error(f"Error sending test email: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred while sending test email."
        )


# ============== Password Reset Endpoints ==============

class PasswordResetRequest(BaseModel):
    """Request schema for password reset."""
    email: EmailStr = Field(description="User's email address")


class PasswordReset(BaseModel):
    """Request schema for setting new password."""
    token: str = Field(description="Password reset token from email")
    new_password: str = Field(min_length=8, description="New password (min 8 characters)")


@router.post(
    "/request-password-reset",
    summary="Request password reset via email"
)
async def request_password_reset(
    request: PasswordResetRequest,
    user_service: UserService = Depends(get_async_user_service)
):
    """
    Request a password reset email.

    - **email**: User's email address

    A reset link will be sent to the email if an account exists.
    The link expires in 1 hour.
    """
    try:
        # Find user by email
        user = await user_service.async_get_user_by_email(request.email)
        if not user:
            # For security, don't reveal if email exists or not
            return {"message": "If an account with this email exists, a password reset link has been sent."}

        # Generate password reset token
        email_service = LoginEmailService()
        token, expires_at = email_service.generate_password_reset_token()

        # Store token in database
        await user_service.async_update_password_reset_token(user.user_id, token, expires_at)

        # Send email
        success = await email_service.send_password_reset_token(request.email, token)

        if not success:
            # Clear token if email failed
            await user_service.async_clear_password_reset_token(user.user_id)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to send password reset email. Please try again."
            )

        # TODO: Add async tracking when UserTrackingService has async methods

        return {"message": "If an account with this email exists, a password reset link has been sent."}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error requesting password reset: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred while processing your request."
        )


@router.post(
    "/reset-password",
    summary="Reset password using token"
)
async def reset_password(
    request: PasswordReset,
    user_service: UserService = Depends(get_async_user_service),
    db: AsyncSession = Depends(get_async_db)
):
    """
    Reset password using a token from the password reset email.

    - **token**: Password reset token received via email
    - **new_password**: New password (minimum 8 characters)

    The token can only be used once and expires after 1 hour.
    """
    try:
        # Find user by password reset token
        user = await user_service.async_get_user_by_password_reset_token(request.token)

        if not user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid or expired password reset token"
            )

        # Hash and save new password
        new_hashed_password = auth_service.get_password_hash(request.new_password)
        user.password = new_hashed_password

        # Clear the password reset token (one-time use)
        await user_service.async_clear_password_reset_token(user.user_id)

        # Commit password change
        await db.commit()

        # TODO: Add async tracking when UserTrackingService has async methods

        logger.info(f"Password reset successfully for user {user.email}")

        return {"message": "Password has been reset successfully. You can now log in with your new password."}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error resetting password: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred while resetting your password."
        )
