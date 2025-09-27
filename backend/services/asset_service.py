from typing import List, Optional, Dict, Any
from schemas.asset import Asset, DatabaseEntityMetadata
from schemas.base import SchemaType
from sqlalchemy import text
from sqlalchemy.orm import Session
from fastapi import Depends

from datetime import datetime
import tiktoken
from services.db_entity_service import DatabaseEntityService
from services.asset_mapping_service import AssetMappingService
from database import get_db
from uuid import uuid4
from models import Asset as AssetModel
from exceptions import AssetNotFoundError

# In-memory storage for assets
ASSET_DB: Dict[str, Asset] = {}

class AssetService:
    def __init__(self, db: Session):
        self.db = db
        self.tokenizer = tiktoken.get_encoding("cl100k_base")
        self.db_entity_service = DatabaseEntityService(self.db)
        self.asset_mapping_service = AssetMappingService(self.db)

    def get_asset_with_details(self, asset_id: str) -> Asset:
        """Get an asset with all its details - throws AssetNotFoundError if not found"""
        result = self.db.execute(text("SELECT * FROM assets WHERE id = :id"), {"id": asset_id})
        asset_model = result.first()
        if not asset_model:
            raise AssetNotFoundError(asset_id)

        # Convert to schema (asset_model is now a Row object, convert to dict)
        asset_dict = dict(asset_model._mapping)
        asset = self._model_to_schema(asset_dict)

        if asset.schema_definition.type == "database_entity" and asset_dict.get('db_entity_metadata'):
            db_metadata = DatabaseEntityMetadata(**asset_dict['db_entity_metadata'])
            content = self.db_entity_service.fetch_entities(db_metadata)
            asset.value = content

        return asset

    def _calculate_token_count(self, content: Any) -> int:
        """Calculate token count for an asset's content"""
        if content is None:
            return 0
            
        if isinstance(content, str):
            return len(self.tokenizer.encode(content))
        elif isinstance(content, (list, tuple)):
            return sum(self._calculate_token_count(item) for item in content)
        elif isinstance(content, dict):
            return sum(self._calculate_token_count(v) for v in content.values())
        else:
            return len(self.tokenizer.encode(str(content)))

    def _model_to_schema(self, model: Dict[str, Any]) -> Asset:
        """Convert database model to unified Asset schema"""
        from schemas.asset import Asset as BackendAsset, AssetStatus, AssetRole, AssetScopeType
        from schemas.base import SchemaType
        import json
        
        # Get content from full content or summary
        content = model.get('content') or model.get('content_summary')
        
        # Parse metadata - handle both dict and JSON string
        raw_metadata = model.get('asset_metadata', {})
        if isinstance(raw_metadata, str):
            try:
                metadata_dict = json.loads(raw_metadata)
            except (json.JSONDecodeError, TypeError):
                metadata_dict = {}
        elif isinstance(raw_metadata, dict):
            metadata_dict = raw_metadata
        else:
            metadata_dict = {}
        
        # Create schema_definition from the legacy type field
        schema_definition = SchemaType(
            type=model.get('type', 'object'),
            description=model.get('description', ""),
            is_array=False
        )
        
        # Handle scope_type - convert enum name to enum value if needed
        raw_scope_type = model.get('scope_type', 'mission')
        if raw_scope_type == 'MISSION':
            scope_type_value = 'mission'
        elif raw_scope_type == 'HOP':
            scope_type_value = 'hop'
        else:
            scope_type_value = raw_scope_type
        
        # Handle status - convert enum name to enum value if needed
        raw_status = model.get('status', 'pending')
        status_mapping = {
            'PROPOSED': 'proposed',
            'PENDING': 'pending',
            'IN_PROGRESS': 'in_progress',
            'READY': 'ready',
            'ERROR': 'error',
            'EXPIRED': 'expired'
        }
        status_value = status_mapping.get(raw_status, raw_status)
        
        # Handle role - convert enum name to enum value if needed
        raw_role = model.get('role', 'intermediate')
        role_mapping = {
            'INPUT': 'input',
            'OUTPUT': 'output',
            'INTERMEDIATE': 'intermediate'
        }
        role_value = role_mapping.get(raw_role, raw_role)
        
        # Create proper backend Asset using the schema
        return BackendAsset(
            id=str(model.get('id')),
            name=model.get('name'),
            description=model.get('description', ""),
            schema_definition=schema_definition,
            subtype=model.get('subtype'),
            scope_type=AssetScopeType(scope_type_value),
            scope_id=str(model.get('scope_id')),
            status=AssetStatus(status_value),
            role=AssetRole(role_value),
            value_representation=str(content) if content else "",
            asset_metadata=metadata_dict,
            created_at=model.get('created_at', datetime.utcnow()),
            updated_at=model.get('updated_at', datetime.utcnow())
        )

    def create_asset(
        self,
        user_id: int,
        name: str,
        schema_definition: Dict[str, Any],
        subtype: Optional[str] = None,
        description: Optional[str] = None,
        content: Optional[Any] = None,
        asset_metadata: Optional[Dict[str, Any]] = None,
        scope_type: str = "mission",
        scope_id: str = "orphaned",
        role: str = "intermediate"
    ) -> Asset:
        """Create a new asset with scope-based organization"""

        token_count = self._calculate_token_count(content)

        asset_metadata_dict = (asset_metadata or {}).copy()
        asset_metadata_dict.setdefault("createdAt", datetime.utcnow().isoformat())
        asset_metadata_dict.setdefault("updatedAt", datetime.utcnow().isoformat())
        asset_metadata_dict.setdefault("version", 1)
        asset_metadata_dict["token_count"] = token_count

        asset_id = str(uuid4())
        
        # Use SQLAlchemy ORM to create the asset
        new_asset = AssetModel(
            id=asset_id,
            user_id=user_id,
            name=name,
            description=description,
            schema_definition=schema_definition,
            subtype=subtype,
            content=content,
            content_summary=str(content) if content else None,
            asset_metadata=asset_metadata_dict,
            scope_type=scope_type,
            scope_id=scope_id,
            role=role
        )
        
        self.db.add(new_asset)
        self.db.commit()
        self.db.refresh(new_asset)
        
        # Convert to dict for schema conversion
        asset_dict = {
            "id": new_asset.id,
            "user_id": new_asset.user_id,
            "name": new_asset.name,
            "description": new_asset.description,
            "schema_definition": new_asset.schema_definition,
            "subtype": new_asset.subtype,
            "content": new_asset.content,
            "asset_metadata": new_asset.asset_metadata,
            "scope_type": new_asset.scope_type,
            "scope_id": new_asset.scope_id,
            "role": new_asset.role,
            "status": new_asset.status
        }
        
        return self._model_to_schema(asset_dict)

    def get_asset(self, asset_id: str, user_id: int) -> Asset:
        """Get an asset by ID - throws AssetNotFoundError if not found"""
        result = self.db.execute(text("SELECT * FROM assets WHERE id = :id AND user_id = :user_id"), 
                               {"id": asset_id, "user_id": user_id})
        asset_model = result.first()
        if not asset_model:
            raise AssetNotFoundError(asset_id)
        return self._model_to_schema(dict(asset_model._mapping))

    def get_user_assets(
        self,
        user_id: int,
    ) -> List[Asset]:
        """Get all assets for a user"""
        result = self.db.execute(text("SELECT * FROM assets WHERE user_id = :user_id"), 
                               {"user_id": user_id})
        asset_models = result.fetchall()
        return [self._model_to_schema(dict(model._mapping)) for model in asset_models]

    def get_assets_by_scope(
        self,
        user_id: int,
        scope_type: str,
        scope_id: str
    ) -> List[Asset]:
        """Get all assets for a specific scope"""
        result = self.db.execute(text("SELECT * FROM assets WHERE user_id = :user_id AND scope_type = :scope_type AND scope_id = :scope_id"), 
                               {"user_id": user_id, "scope_type": scope_type, "scope_id": scope_id})
        asset_models = result.fetchall()
        return [self._model_to_schema(dict(model._mapping)) for model in asset_models]

    def get_assets_by_ids(
        self,
        user_id: int,
        asset_ids: List[str]
    ) -> List[Asset]:
        """Get multiple assets by their IDs"""
        if not asset_ids:
            return []
        
        placeholders = ", ".join(f":id_{i}" for i in range(len(asset_ids)))
        query = f"SELECT * FROM assets WHERE user_id = :user_id AND id IN ({placeholders})"
        
        values = {"user_id": user_id}
        for i, asset_id in enumerate(asset_ids):
            values[f"id_{i}"] = asset_id
        
        result = self.db.execute(text(query), values)
        asset_models = result.fetchall()
        return [self._model_to_schema(dict(model._mapping)) for model in asset_models]

    def update_asset(
        self,
        asset_id: str,
        user_id: int,
        updates: Dict[str, Any]
    ) -> Asset:
        """Update an asset - throws AssetNotFoundError if not found"""
        
        if 'content' in updates:
            new_token_count = self._calculate_token_count(updates['content'])
            
            if 'asset_metadata' not in updates:
                current_asset = self.get_asset(asset_id, user_id)
                updates['asset_metadata'] = current_asset.asset_metadata

            updates['asset_metadata']['token_count'] = new_token_count
            updates['asset_metadata']['updatedAt'] = datetime.utcnow().isoformat()

        updates['updated_at'] = datetime.utcnow()
        
        # Use SQLAlchemy ORM to update the asset
        asset = self.db.query(AssetModel).filter(AssetModel.id == asset_id, AssetModel.user_id == user_id).first()
        if not asset:
            raise AssetNotFoundError(asset_id)
        
        # Update the asset with new values
        for key, value in updates.items():
            setattr(asset, key, value)
        
        self.db.commit()
        self.db.refresh(asset)
        
        # Convert to dict for schema conversion
        asset_dict = {
            "id": asset.id,
            "user_id": asset.user_id,
            "name": asset.name,
            "description": asset.description,
            "schema_definition": asset.schema_definition,
            "subtype": asset.subtype,
            "content": asset.content,
            "asset_metadata": asset.asset_metadata,
            "scope_type": asset.scope_type,
            "scope_id": asset.scope_id,
            "role": asset.role,
            "status": asset.status
        }
        
        return self._model_to_schema(asset_dict)

    def delete_asset(self, asset_id: str, user_id: int) -> None:
        """Delete an asset - throws AssetNotFoundError if not found"""
        asset = self.db.query(AssetModel).filter(AssetModel.id == asset_id, AssetModel.user_id == user_id).first()
        if not asset:
            raise AssetNotFoundError(asset_id)
        
        self.db.delete(asset)
        self.db.commit()

    def get_hop_asset_context(self, hop_id: str, user_id: int) -> Dict[str, Asset]:
        """
        Get all assets mapped to a hop as a context dictionary.
        
        Args:
            hop_id: The hop ID to get assets for
            user_id: The user ID for access control
            
        Returns:
            Dictionary mapping asset ID to Asset object for all assets mapped to the hop
        """
        import logging
        logger = logging.getLogger(__name__)
        
        asset_context: Dict[str, Asset] = {}
        
        # Get all asset IDs mapped to this hop (regardless of their scope)
        hop_asset_mappings: Dict[str, str] = self.asset_mapping_service.get_hop_assets(hop_id)
        
        # Load the actual asset objects
        if hop_asset_mappings:
            asset_ids: List[str] = list(hop_asset_mappings.keys())
            assets: List[Asset] = self.get_assets_by_ids(user_id, asset_ids)
            
            for asset in assets:
                asset_context[asset.id] = asset
        
        return asset_context


# Dependency function for FastAPI dependency injection
async def get_asset_service(db: Session = Depends(get_db)) -> AssetService:
    """FastAPI dependency that provides AssetService instance"""
    return AssetService(db)