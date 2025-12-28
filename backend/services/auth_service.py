"""
Auth Service - Authentication and token management.

This service owns:
- JWT token creation and validation
- Password hashing utilities
- Login/logout flows

User CRUD operations are handled by user_service.
"""

from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import HTTPException, status, Depends, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from models import User
from schemas.user import Token
from services.user_service import UserService
from config.settings import settings
from database import get_db
import logging
import time
import traceback

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
SECRET_KEY = settings.JWT_SECRET_KEY
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = settings.ACCESS_TOKEN_EXPIRE_MINUTES
logger = logging.getLogger(__name__)

security = HTTPBearer()


def get_password_hash(password: str) -> str:
    """Hash a password using bcrypt."""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash."""
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """
    Create a JWT access token.

    Args:
        data: Token payload data (should include sub, user_id, role, etc.)
        expires_delta: Optional custom expiration time

    Returns:
        Encoded JWT token string
    """
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    logger.info(f"Created access token for user_id={data.get('user_id')}")
    return encoded_jwt


def _create_token_for_user(user: User) -> Token:
    """
    Create a Token response for an authenticated user.

    Args:
        user: Authenticated user model

    Returns:
        Token schema with access_token and user info
    """
    username = user.email.split('@')[0]

    token_data = {
        "sub": user.email,
        "user_id": user.user_id,
        "org_id": user.org_id,
        "username": username,
        "role": user.role.value
    }

    access_token = create_access_token(data=token_data)

    return Token(
        access_token=access_token,
        token_type="bearer",
        username=username,
        role=user.role,
        user_id=user.user_id,
        org_id=user.org_id,
        email=user.email
    )


async def register_and_login_user(
    db: Session,
    email: str,
    password: str,
    invitation_token: Optional[str] = None
) -> Token:
    """
    Register a new user and automatically log them in.

    Args:
        db: Database session
        email: User's email address
        password: User's password
        invitation_token: Optional invitation token for org assignment

    Returns:
        Token with JWT and user info

    Raises:
        HTTPException: If email already exists or invitation invalid
    """
    from services.user_service import UserService
    from models import Invitation, Organization, UserRole as UserRoleModel
    from schemas.user import UserRole
    from datetime import datetime

    logger.info(f"Registering new user: {email}")

    # Determine org_id and role from invitation or default
    org_id = None
    role = UserRole.MEMBER

    if invitation_token:
        # Validate invitation
        invitation = db.query(Invitation).filter(
            Invitation.token == invitation_token,
            Invitation.is_revoked == False,
            Invitation.accepted_at == None
        ).first()

        if not invitation:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid or expired invitation"
            )

        if invitation.expires_at < datetime.utcnow():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invitation has expired"
            )

        if invitation.email.lower() != email.lower():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email does not match invitation"
            )

        # Use invitation settings
        org_id = invitation.org_id
        role = UserRole(invitation.role)

        # Mark invitation as accepted
        invitation.accepted_at = datetime.utcnow()
        db.commit()

        logger.info(f"User {email} registered via invitation to org {org_id}")
    else:
        # No invitation - assign to default organization
        default_org = db.query(Organization).filter(
            Organization.name == "Default Organization"
        ).first()

        if default_org:
            org_id = default_org.org_id
            logger.info(f"User {email} assigned to default organization (id={org_id})")
        else:
            logger.warning(f"No default organization found for user {email}")

    user_service = UserService(db)
    user = user_service.create_user(
        email=email,
        password=password,
        role=role,
        org_id=org_id
    )

    logger.info(f"Successfully registered user: {email}")
    return _create_token_for_user(user)


async def login_user(db: Session, email: str, password: str) -> Token:
    """
    Authenticate user and return JWT token.

    Args:
        db: Database session
        email: User's email
        password: User's password

    Returns:
        Token with JWT and user info

    Raises:
        HTTPException: If credentials invalid or user inactive
    """
    from services.user_service import UserService

    logger.info(f"Login attempt for: {email}")

    user_service = UserService(db)
    user = user_service.verify_credentials(email, password)

    if not user:
        logger.warning(f"Failed login attempt for: {email}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )

    logger.info(f"Successful login for: {email}")
    return _create_token_for_user(user)


async def validate_token(
    credentials: HTTPAuthorizationCredentials = Security(security),
    db: Session = Depends(get_db)
) -> User:
    """
    Validate JWT token and return user.

    This is used as a dependency in routers: Depends(auth_service.validate_token)

    Args:
        credentials: HTTP Authorization header with Bearer token
        db: Database session

    Returns:
        Authenticated User model

    Raises:
        HTTPException: If token invalid or user not found
    """
    try:
        token = credentials.credentials
        logger.debug(f"Validating token: {token[:10]}...")

        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])

        email: str = payload.get("sub")
        username: str = payload.get("username")
        role: str = payload.get("role")

        if email is None:
            logger.error("Token missing email claim")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token payload"
            )

        # Log token expiry info
        exp_timestamp = payload.get('exp')
        if exp_timestamp:
            time_until_expiry = exp_timestamp - int(time.time())
            logger.debug(f"Token expires in {time_until_expiry} seconds")

        # Get user from database
        user_service = UserService(db)
        user = user_service.get_user_by_email(email)
        if user is None:
            logger.error(f"Token user not found: {email}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found"
            )

        # Check if user is active
        if not user.is_active:
            logger.warning(f"Inactive user attempted access: {email}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User account is deactivated"
            )

        # Add username to user object for convenience
        user.username = username

        # Warn if role has changed since token was issued
        if role and user.role.value != role:
            logger.warning(f"Role mismatch for {email}: token={role}, db={user.role.value}")

        logger.debug(f"Token validated for: {email}")
        return user

    except JWTError as e:
        logger.error(f"JWT validation error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token format or signature"
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Token validation error: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Token validation failed: {str(e)}"
        )
