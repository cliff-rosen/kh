from fastapi import APIRouter, Depends, HTTPException, status, Form
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr, Field
from typing import Annotated
from datetime import datetime
import logging

from database import get_db
from schemas.user import Token
from models import User

from services import auth_service
from services.login_email_service import LoginEmailService

logger = logging.getLogger(__name__)


# ============== Request Schemas ==============

class UserCreate(BaseModel):
    """Request schema for user registration."""
    email: EmailStr = Field(description="User's email address")
    password: str = Field(
        min_length=5,
        description="User's password"
    )

router = APIRouter()


@router.post(
    "/register",
    response_model=Token,
    summary="Register a new user and automatically log them in"
)
async def register(user: UserCreate, db: Session = Depends(get_db)):
    """
    Register a new user and automatically log them in with:
    - **email**: valid email address
    - **password**: string

    Returns JWT token and session information, same as login endpoint.
    """
    return await auth_service.register_and_login_user(db, user.email, user.password)


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
    db: Session = Depends(get_db)
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
        token = await auth_service.login_user(db, username, password)
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
    db: Session = Depends(get_db)
):
    """
    Request a one-time login token to be sent via email.
    
    - **email**: User's email address
    
    The token will be sent to the email address and expires in 30 minutes.
    """
    try:
        # Find user by email
        user = db.query(User).filter(User.email == email).first()
        if not user:
            # For security, don't reveal if email exists or not
            return {"message": "If an account with this email exists, a login link has been sent."}
        
        # Generate login token
        email_service = LoginEmailService()
        token, expires_at = email_service.generate_login_token()
        
        # Store token in database
        user.login_token = token
        user.login_token_expires = expires_at
        db.commit()
        
        # Send email
        success = await email_service.send_login_token(email, token)
        
        if not success:
            # Clear token if email failed
            user.login_token = None
            user.login_token_expires = None
            db.commit()
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
    db: Session = Depends(get_db)
):
    """
    Authenticate using a one-time login token.
    
    - **token**: Login token received via email
    
    Returns JWT access token and session information.
    The login token can only be used once and expires after 30 minutes.
    """
    try:
        # Find user by login token
        user = db.query(User).filter(
            User.login_token == token,
            User.login_token_expires > datetime.utcnow()
        ).first()
        
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired login token"
            )
        
        # Clear the login token (one-time use)
        user.login_token = None
        user.login_token_expires = None
        db.commit()
        
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
