"""
User Service - Single source of truth for all user operations.

This service owns:
- User CRUD operations
- Role management
- Organization assignment
- User queries and listing

Authentication (tokens, passwords) is handled by auth_service.
"""

from sqlalchemy.orm import Session
from sqlalchemy import and_
from typing import Optional, List, Dict, Any
from datetime import datetime
from fastapi import HTTPException, status
from passlib.context import CryptContext
import logging

from models import User as UserModel, Organization, UserRole as UserRoleModel
from schemas.user import UserRole, OrgMember

logger = logging.getLogger(__name__)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class UserService:
    """Service for user management operations."""

    def __init__(self, db: Session):
        self.db = db

    # ==================== Create Operations ====================

    def create_user(
        self,
        email: str,
        password: str,
        full_name: Optional[str] = None,
        role: UserRole = UserRole.MEMBER,
        org_id: Optional[int] = None
    ) -> UserModel:
        """
        Create a new user.

        Args:
            email: User's email (must be unique)
            password: Plain text password (will be hashed)
            full_name: Optional display name
            role: User role (defaults to MEMBER)
            org_id: Optional organization assignment

        Returns:
            Created User model instance

        Raises:
            HTTPException: If email already exists
        """
        # Check for existing email
        existing = self.db.query(UserModel).filter(UserModel.email == email).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered"
            )

        # Validate org_id if provided
        if org_id:
            org = self.db.query(Organization).filter(Organization.org_id == org_id).first()
            if not org:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Organization not found"
                )

        # Create user
        hashed_password = pwd_context.hash(password)
        user = UserModel(
            email=email,
            password=hashed_password,
            full_name=full_name,
            role=UserRoleModel(role.value),
            org_id=org_id
        )

        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)

        logger.info(f"Created user: {email} (id={user.user_id})")
        return user

    # ==================== Read Operations ====================

    def get_user_by_id(self, user_id: int) -> Optional[UserModel]:
        """Get user by ID."""
        return self.db.query(UserModel).filter(UserModel.user_id == user_id).first()

    def get_user_by_email(self, email: str) -> Optional[UserModel]:
        """Get user by email."""
        return self.db.query(UserModel).filter(UserModel.email == email).first()

    def get_user_or_404(self, user_id: int) -> UserModel:
        """Get user by ID or raise 404."""
        user = self.get_user_by_id(user_id)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        return user

    def list_users(
        self,
        org_id: Optional[int] = None,
        role: Optional[UserRole] = None,
        is_active: Optional[bool] = None,
        limit: int = 100,
        offset: int = 0
    ) -> tuple[List[UserModel], int]:
        """
        List users with optional filters.

        Returns:
            Tuple of (users list, total count)
        """
        query = self.db.query(UserModel)

        # Apply filters
        if org_id is not None:
            query = query.filter(UserModel.org_id == org_id)
        if role is not None:
            query = query.filter(UserModel.role == UserRoleModel(role.value))
        if is_active is not None:
            query = query.filter(UserModel.is_active == is_active)

        # Get total count
        total = query.count()

        # Apply pagination
        users = query.order_by(UserModel.user_id).offset(offset).limit(limit).all()

        return users, total

    def get_org_members(self, org_id: int) -> List[OrgMember]:
        """Get all members of an organization."""
        users = self.db.query(UserModel).filter(UserModel.org_id == org_id).all()

        return [
            OrgMember(
                user_id=u.user_id,
                email=u.email,
                full_name=u.full_name,
                role=UserRole(u.role.value),
                joined_at=u.created_at  # Using created_at as joined_at for now
            )
            for u in users
        ]

    # ==================== Update Operations ====================

    def update_user(
        self,
        user_id: int,
        updates: Dict[str, Any],
        updated_by: Optional[UserModel] = None
    ) -> UserModel:
        """
        Update user fields.

        Args:
            user_id: User to update
            updates: Dict of fields to update (full_name, job_title, is_active)
            updated_by: User performing the update (for permission checks)

        Returns:
            Updated user
        """
        user = self.get_user_or_404(user_id)

        # Only allow updating specific fields
        allowed_fields = {'full_name', 'job_title', 'is_active'}
        for field, value in updates.items():
            if field in allowed_fields and value is not None:
                setattr(user, field, value)

        self.db.commit()
        self.db.refresh(user)

        logger.info(f"Updated user {user_id}: {list(updates.keys())}")
        return user

    def update_role(
        self,
        user_id: int,
        new_role: UserRole,
        updated_by: UserModel
    ) -> UserModel:
        """
        Update user's role.

        Args:
            user_id: User to update
            new_role: New role to assign
            updated_by: User performing the update (must be admin)

        Returns:
            Updated user

        Raises:
            HTTPException: If permission denied or invalid operation
        """
        # Permission check: only platform_admin can change roles
        if updated_by.role != UserRoleModel.PLATFORM_ADMIN:
            # Org admins can only promote to org_admin or demote to member within their org
            if updated_by.role == UserRoleModel.ORG_ADMIN:
                target_user = self.get_user_or_404(user_id)
                if target_user.org_id != updated_by.org_id:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Cannot modify users outside your organization"
                    )
                if new_role == UserRole.PLATFORM_ADMIN:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Only platform admins can create platform admins"
                    )
            else:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Insufficient permissions to change roles"
                )

        user = self.get_user_or_404(user_id)

        # Prevent removing the last platform admin
        if user.role == UserRoleModel.PLATFORM_ADMIN and new_role != UserRole.PLATFORM_ADMIN:
            admin_count = self.db.query(UserModel).filter(
                UserModel.role == UserRoleModel.PLATFORM_ADMIN
            ).count()
            if admin_count <= 1:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot remove the last platform admin"
                )

        user.role = UserRoleModel(new_role.value)
        self.db.commit()
        self.db.refresh(user)

        logger.info(f"Updated role for user {user_id} to {new_role.value}")
        return user

    def assign_to_org(
        self,
        user_id: int,
        org_id: int,
        assigned_by: UserModel
    ) -> UserModel:
        """
        Assign user to an organization.

        Args:
            user_id: User to assign
            org_id: Organization to assign to
            assigned_by: User performing the assignment (must be platform_admin)

        Returns:
            Updated user
        """
        # Only platform admins can assign users to orgs
        if assigned_by.role != UserRoleModel.PLATFORM_ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only platform admins can assign users to organizations"
            )

        # Validate org exists
        org = self.db.query(Organization).filter(Organization.org_id == org_id).first()
        if not org:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Organization not found"
            )

        user = self.get_user_or_404(user_id)
        user.org_id = org_id
        self.db.commit()
        self.db.refresh(user)

        logger.info(f"Assigned user {user_id} to org {org_id}")
        return user

    def remove_from_org(
        self,
        user_id: int,
        removed_by: UserModel
    ) -> UserModel:
        """
        Remove user from their organization.

        Args:
            user_id: User to remove
            removed_by: User performing the removal

        Returns:
            Updated user
        """
        user = self.get_user_or_404(user_id)

        # Permission check
        if removed_by.role == UserRoleModel.PLATFORM_ADMIN:
            pass  # Platform admins can remove anyone
        elif removed_by.role == UserRoleModel.ORG_ADMIN:
            if user.org_id != removed_by.org_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Cannot modify users outside your organization"
                )
            if user.user_id == removed_by.user_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot remove yourself from the organization"
                )
        else:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions"
            )

        user.org_id = None
        self.db.commit()
        self.db.refresh(user)

        logger.info(f"Removed user {user_id} from organization")
        return user

    # ==================== Delete Operations ====================

    def deactivate_user(self, user_id: int, deactivated_by: UserModel) -> UserModel:
        """
        Soft delete - deactivate a user.

        Args:
            user_id: User to deactivate
            deactivated_by: User performing the deactivation

        Returns:
            Updated user
        """
        # Only platform admins can deactivate users
        if deactivated_by.role != UserRoleModel.PLATFORM_ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only platform admins can deactivate users"
            )

        user = self.get_user_or_404(user_id)

        # Prevent self-deactivation
        if user.user_id == deactivated_by.user_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot deactivate yourself"
            )

        user.is_active = False
        self.db.commit()
        self.db.refresh(user)

        logger.info(f"Deactivated user {user_id}")
        return user

    def reactivate_user(self, user_id: int, reactivated_by: UserModel) -> UserModel:
        """Reactivate a deactivated user."""
        if reactivated_by.role != UserRoleModel.PLATFORM_ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only platform admins can reactivate users"
            )

        user = self.get_user_or_404(user_id)
        user.is_active = True
        self.db.commit()
        self.db.refresh(user)

        logger.info(f"Reactivated user {user_id}")
        return user

    # ==================== Authentication Helpers ====================

    def verify_credentials(self, email: str, password: str) -> Optional[UserModel]:
        """
        Verify user credentials.

        Args:
            email: User's email
            password: Plain text password

        Returns:
            User if credentials valid, None otherwise
        """
        user = self.get_user_by_email(email)
        if not user:
            return None

        if not pwd_context.verify(password, user.password):
            return None

        if not user.is_active:
            return None

        return user

    # ==================== Permission Helpers ====================

    def is_platform_admin(self, user: UserModel) -> bool:
        """Check if user is a platform admin."""
        return user.role == UserRoleModel.PLATFORM_ADMIN

    def is_org_admin(self, user: UserModel) -> bool:
        """Check if user is an org admin (or higher)."""
        return user.role in (UserRoleModel.PLATFORM_ADMIN, UserRoleModel.ORG_ADMIN)

    def can_manage_user(self, manager: UserModel, target_user_id: int) -> bool:
        """Check if manager can manage target user."""
        if self.is_platform_admin(manager):
            return True

        if self.is_org_admin(manager):
            target = self.get_user_by_id(target_user_id)
            if target and target.org_id == manager.org_id:
                return True

        return False
