from fastapi import APIRouter, Depends, HTTPException, status, Form
from sqlalchemy.orm import Session
from typing import Annotated, List
from datetime import datetime
import logging

from database import get_db

from schemas import UserCreate, Token, UserResponse
from models import User, UserRole

from services import auth_service
from services.login_email_service import LoginEmailService

logger = logging.getLogger(__name__)

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
    return await auth_service.register_and_login_user(db, user)


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


@router.get(
    "/me",
    response_model=UserResponse,
    summary="Get current user information"
)
async def get_current_user(
    current_user: User = Depends(auth_service.validate_token),
    db: Session = Depends(get_db)
):
    """
    Get current user information including role
    """
    return UserResponse(
        email=current_user.email,
        user_id=current_user.user_id,
        registration_date=current_user.registration_date,
        role=current_user.role
    )


@router.put(
    "/users/{user_id}/role",
    response_model=UserResponse,
    summary="Update user role (admin only)"
)
async def update_user_role(
    user_id: int,
    new_role: UserRole,
    current_user: User = Depends(auth_service.validate_token),
    db: Session = Depends(get_db)
):
    """
    Update a user's role. Only admins can perform this action.
    
    - **user_id**: ID of the user to update
    - **new_role**: New role to assign ("admin", "user", "tester")
    """
    # Check if current user is admin
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators can update user roles"
        )
    
    # Find the target user
    target_user = db.query(User).filter(User.user_id == user_id).first()
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Update the role
    target_user.role = new_role
    db.commit()
    db.refresh(target_user)
    
    return UserResponse(
        email=target_user.email,
        user_id=target_user.user_id,
        registration_date=target_user.registration_date,
        role=target_user.role
    )


@router.get(
    "/users",
    response_model=List[UserResponse],
    summary="List all users (admin only)"
)
async def list_users(
    current_user: User = Depends(auth_service.validate_token),
    db: Session = Depends(get_db)
):
    """
    List all users in the system. Only admins can perform this action.
    """
    # Check if current user is admin
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators can list users"
        )
    
    # Get all users
    users = db.query(User).all()
    
    return [
        UserResponse(
            email=user.email,
            user_id=user.user_id,
            registration_date=user.registration_date,
            role=user.role
        )
        for user in users
    ]


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
            "username": username,
            "role": user.role.value
        }
        
        # Create access token
        access_token = auth_service.create_access_token(data=token_data)
        
        # Load or create session (same logic as regular login)
        from services.user_session_service import UserSessionService
        session_service = UserSessionService(db)
        session = session_service.get_active_session(user.user_id)
        
        if session:
            # Update session activity
            session_service.update_session_activity(user.user_id, session.id)
            session_id = session.id
            session_name = session.name
            chat_id = session.chat_id
            mission_id = session.mission_id
            session_metadata = session.session_metadata or {}
        else:
            # Create new session
            from routers.user_session import CreateUserSessionRequest
            session_request = CreateUserSessionRequest(
                session_metadata={
                    "created_via": "token_login",
                    "initialized_at": datetime.utcnow().isoformat()
                }
            )
            session_response = session_service.create_user_session(user.user_id, session_request)
            session_id = session_response.user_session.id
            session_name = session_response.user_session.name
            chat_id = session_response.user_session.chat_id
            mission_id = session_response.user_session.mission_id
            session_metadata = session_response.user_session.session_metadata or {}
        
        logger.info(f"Successfully authenticated user {user.email} with login token")
        
        return Token(
            access_token=access_token,
            token_type="bearer",
            username=username,
            role=user.role,
            session_id=session_id,
            session_name=session_name,
            chat_id=chat_id,
            mission_id=mission_id,
            session_metadata=session_metadata
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
