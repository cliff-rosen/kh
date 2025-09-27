"""
Feature Preset Service

Handles all database operations for feature presets.
Manages both global (system) and user-specific presets.
"""

from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from datetime import datetime
import uuid

from models import FeaturePresetGroup, FeaturePresetFeature
from schemas.features import FeatureDefinition


class FeaturePresetService:
    """Service for managing feature presets"""
    
    def __init__(self, db: Session):
        self.db = db
    
    def get_available_presets(self, user_id: Optional[int] = None) -> List[Dict[str, Any]]:
        """
        Get all presets available to a user (global + their own).
        If user_id is None, only return global presets.
        """
        if user_id:
            # Get global presets and user's own presets
            presets = self.db.query(FeaturePresetGroup).filter(
                or_(
                    FeaturePresetGroup.scope == 'global',
                    and_(
                        FeaturePresetGroup.scope == 'user',
                        FeaturePresetGroup.scope_id == user_id
                    )
                )
            ).order_by(
                FeaturePresetGroup.scope,  # Global first
                FeaturePresetGroup.category,
                FeaturePresetGroup.name
            ).all()
        else:
            # Only global presets
            presets = self.db.query(FeaturePresetGroup).filter(
                FeaturePresetGroup.scope == 'global'
            ).order_by(
                FeaturePresetGroup.category,
                FeaturePresetGroup.name
            ).all()
        
        return [preset.to_dict() for preset in presets]
    
    def get_preset_by_id(self, preset_id: str, user_id: Optional[int] = None) -> Optional[Dict[str, Any]]:
        """
        Get a specific preset by ID.
        Verifies user has access (global or owns it).
        """
        preset = self.db.query(FeaturePresetGroup).filter(
            FeaturePresetGroup.id == preset_id
        ).first()
        
        if not preset:
            return None
        
        # Check access
        if preset.scope == 'global':
            return preset.to_dict()
        elif preset.scope == 'user' and preset.scope_id == user_id:
            return preset.to_dict()
        else:
            return None  # No access
    
    def create_preset(
        self, 
        user_id: int,
        name: str,
        description: Optional[str],
        category: Optional[str],
        features: List[FeatureDefinition]
    ) -> Dict[str, Any]:
        """Create a new user preset"""
        
        # Create preset group
        preset_group = FeaturePresetGroup(
            name=name,
            description=description,
            category=category,
            scope='user',
            scope_id=user_id
        )
        self.db.add(preset_group)
        self.db.flush()  # Get the ID
        
        # Add features
        for position, feature in enumerate(features):
            preset_feature = FeaturePresetFeature(
                preset_group_id=preset_group.id,
                feature_id=feature.id,
                feature_name=feature.name,
                feature_description=feature.description,
                feature_type=feature.type,
                feature_options=feature.options,
                position=position
            )
            self.db.add(preset_feature)
        
        self.db.commit()
        self.db.refresh(preset_group)
        
        return preset_group.to_dict()
    
    def update_preset(
        self,
        preset_id: str,
        user_id: int,
        name: Optional[str] = None,
        description: Optional[str] = None,
        category: Optional[str] = None,
        features: Optional[List[FeatureDefinition]] = None
    ) -> Optional[Dict[str, Any]]:
        """Update a preset (user's own or system preset - any user can edit system presets)"""
        
        # Get preset and verify access (user owns it OR it's a global preset)
        preset = self.db.query(FeaturePresetGroup).filter(
            and_(
                FeaturePresetGroup.id == preset_id,
                or_(
                    # User owns this preset
                    and_(
                        FeaturePresetGroup.scope == 'user',
                        FeaturePresetGroup.scope_id == user_id
                    ),
                    # Or it's a global preset (any user can edit)
                    FeaturePresetGroup.scope == 'global'
                )
            )
        ).first()
        
        if not preset:
            return None
        
        # Update fields if provided
        if name is not None:
            preset.name = name
        if description is not None:
            preset.description = description
        if category is not None:
            preset.category = category
        
        # Update features if provided
        if features is not None:
            # Delete existing features
            self.db.query(FeaturePresetFeature).filter(
                FeaturePresetFeature.preset_group_id == preset_id
            ).delete()
            
            # Add new features
            for position, feature in enumerate(features):
                preset_feature = FeaturePresetFeature(
                    preset_group_id=preset.id,
                    feature_id=feature.id,
                    feature_name=feature.name,
                    feature_description=feature.description,
                    feature_type=feature.type,
                    feature_options=feature.options,
                    position=position
                )
                self.db.add(preset_feature)
        
        preset.updated_at = datetime.utcnow()
        self.db.commit()
        self.db.refresh(preset)
        
        return preset.to_dict()
    
    def delete_preset(self, preset_id: str, user_id: int) -> bool:
        """Delete a user's preset (system presets cannot be deleted)"""
        
        # Verify ownership
        preset = self.db.query(FeaturePresetGroup).filter(
            and_(
                FeaturePresetGroup.id == preset_id,
                FeaturePresetGroup.scope == 'user',
                FeaturePresetGroup.scope_id == user_id
            )
        ).first()
        
        if not preset:
            return False
        
        self.db.delete(preset)
        self.db.commit()
        return True
    
    def duplicate_preset(
        self,
        preset_id: str,
        user_id: int,
        new_name: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Duplicate a preset (global or user's own) as a new user preset.
        Useful for customizing system presets.
        """
        
        # Get source preset
        source_preset = self.get_preset_by_id(preset_id, user_id)
        if not source_preset:
            return None
        
        # Create new preset with duplicated features
        features = [
            FeatureDefinition(
                id=f['id'],
                name=f['name'],
                description=f['description'],
                type=f['type'],
                options=f.get('options', {})
            )
            for f in source_preset['features']
        ]
        
        return self.create_preset(
            user_id=user_id,
            name=new_name or f"Copy of {source_preset['name']}",
            description=source_preset.get('description'),
            category=source_preset.get('category'),
            features=features
        )
    
    def create_global_preset(
        self,
        name: str,
        description: Optional[str],
        category: Optional[str],
        features: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Create a global (system) preset.
        Should only be used for seeding or admin operations.
        """
        
        preset_group = FeaturePresetGroup(
            name=name,
            description=description,
            category=category,
            scope='global',
            scope_id=None
        )
        self.db.add(preset_group)
        self.db.flush()
        
        for position, feature in enumerate(features):
            preset_feature = FeaturePresetFeature(
                preset_group_id=preset_group.id,
                feature_id=feature['id'],
                feature_name=feature['name'],
                feature_description=feature['description'],
                feature_type=feature['type'],
                feature_options=feature.get('options'),
                position=position
            )
            self.db.add(preset_feature)
        
        self.db.commit()
        self.db.refresh(preset_group)
        
        return preset_group.to_dict()


def get_feature_preset_service(db: Session) -> FeaturePresetService:
    """Dependency injection for FeaturePresetService"""
    return FeaturePresetService(db)