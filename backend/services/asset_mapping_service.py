"""
Asset Mapping Service

This service handles the mapping between missions/hops and assets through
the MissionAsset and HopAsset tables. It provides methods to create, query,
and manage asset relationships.
"""

from typing import Dict, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import and_

from models import MissionAsset, HopAsset, Asset, AssetRole
from exceptions import ValidationError


class AssetMappingService:
    """Service for managing asset mappings between missions/hops and assets"""
    
    def __init__(self, db: Session):
        self.db = db
    
    # Mission Asset Mappings
    
    def add_mission_asset(self, mission_id: str, asset_id: str, role: AssetRole) -> str:
        """Add an asset to a mission with specified role"""
        try:
            # Check if mapping already exists
            existing = self.db.query(MissionAsset).filter(
                and_(
                    MissionAsset.mission_id == mission_id,
                    MissionAsset.asset_id == asset_id
                )
            ).first()
            
            if existing:
                # Update existing mapping
                existing.role = role
                self.db.flush()
                return existing.id
            else:
                # Create new mapping
                mapping = MissionAsset(
                    mission_id=mission_id,
                    asset_id=asset_id,
                    role=role
                )
                self.db.add(mapping)
                self.db.flush()
                return mapping.id
                
        except Exception as e:
            raise ValidationError(f"Failed to add mission asset mapping: {str(e)}")
    
    def remove_mission_asset(self, mission_id: str, asset_id: str) -> bool:
        """Remove an asset from a mission"""
        try:
            mapping = self.db.query(MissionAsset).filter(
                and_(
                    MissionAsset.mission_id == mission_id,
                    MissionAsset.asset_id == asset_id
                )
            ).first()
            
            if mapping:
                self.db.delete(mapping)
                self.db.flush()
                return True
            return False
            
        except Exception as e:
            raise ValidationError(f"Failed to remove mission asset mapping: {str(e)}")
    
    def get_mission_assets(self, mission_id: str) -> Dict[str, AssetRole]:
        """Get all assets for a mission as {asset_id: role} mapping"""
        try:
            mappings = self.db.query(MissionAsset).filter(
                MissionAsset.mission_id == mission_id
            ).all()
            
            return {mapping.asset_id: mapping.role for mapping in mappings}
            
        except Exception as e:
            raise ValidationError(f"Failed to get mission assets: {str(e)}")
    
    def get_mission_assets_by_role(self, mission_id: str, role: AssetRole) -> List[str]:
        """Get asset IDs for a mission with specific role"""
        try:
            mappings = self.db.query(MissionAsset).filter(
                and_(
                    MissionAsset.mission_id == mission_id,
                    MissionAsset.role == role
                )
            ).all()
            
            return [mapping.asset_id for mapping in mappings]
            
        except Exception as e:
            raise ValidationError(f"Failed to get mission assets by role: {str(e)}")
    
    # Hop Asset Mappings
    
    def add_hop_asset(self, hop_id: str, asset_id: str, role: AssetRole) -> str:
        """Add an asset to a hop with specified role"""
        try:
            # Check if mapping already exists
            existing = self.db.query(HopAsset).filter(
                and_(
                    HopAsset.hop_id == hop_id,
                    HopAsset.asset_id == asset_id
                )
            ).first()
            
            if existing:
                # Update existing mapping
                existing.role = role
                self.db.flush()
                return existing.id
            else:
                # Create new mapping
                mapping = HopAsset(
                    hop_id=hop_id,
                    asset_id=asset_id,
                    role=role
                )
                self.db.add(mapping)
                self.db.flush()
                return mapping.id
                
        except Exception as e:
            raise ValidationError(f"Failed to add hop asset mapping: {str(e)}")
    
    def remove_hop_asset(self, hop_id: str, asset_id: str) -> bool:
        """Remove an asset from a hop"""
        try:
            mapping = self.db.query(HopAsset).filter(
                and_(
                    HopAsset.hop_id == hop_id,
                    HopAsset.asset_id == asset_id
                )
            ).first()
            
            if mapping:
                self.db.delete(mapping)
                self.db.flush()
                return True
            return False
            
        except Exception as e:
            raise ValidationError(f"Failed to remove hop asset mapping: {str(e)}")
    
    def get_hop_assets(self, hop_id: str) -> Dict[str, AssetRole]:
        """Get all assets for a hop as {asset_id: role} mapping"""
        try:
            mappings = self.db.query(HopAsset).filter(
                HopAsset.hop_id == hop_id
            ).all()
            
            return {mapping.asset_id: mapping.role for mapping in mappings}
            
        except Exception as e:
            raise ValidationError(f"Failed to get hop assets: {str(e)}")
    
    def get_hop_assets_by_role(self, hop_id: str, role: AssetRole) -> List[str]:
        """Get asset IDs for a hop with specific role"""
        try:
            mappings = self.db.query(HopAsset).filter(
                and_(
                    HopAsset.hop_id == hop_id,
                    HopAsset.role == role
                )
            ).all()
            
            return [mapping.asset_id for mapping in mappings]
            
        except Exception as e:
            raise ValidationError(f"Failed to get hop assets by role: {str(e)}")
    
    # Cross-entity queries
    
    def get_asset_missions(self, asset_id: str) -> List[str]:
        """Get all mission IDs that use this asset"""
        try:
            mappings = self.db.query(MissionAsset).filter(
                MissionAsset.asset_id == asset_id
            ).all()
            
            return [mapping.mission_id for mapping in mappings]
            
        except Exception as e:
            raise ValidationError(f"Failed to get asset missions: {str(e)}")
    
    def get_asset_hops(self, asset_id: str) -> List[str]:
        """Get all hop IDs that use this asset"""
        try:
            mappings = self.db.query(HopAsset).filter(
                HopAsset.asset_id == asset_id
            ).all()
            
            return [mapping.hop_id for mapping in mappings]
            
        except Exception as e:
            raise ValidationError(f"Failed to get asset hops: {str(e)}")
    
    def get_asset_role_in_mission(self, mission_id: str, asset_id: str) -> Optional[AssetRole]:
        """Get the role of an asset in a specific mission"""
        try:
            mapping = self.db.query(MissionAsset).filter(
                and_(
                    MissionAsset.mission_id == mission_id,
                    MissionAsset.asset_id == asset_id
                )
            ).first()
            
            return mapping.role if mapping else None
            
        except Exception as e:
            raise ValidationError(f"Failed to get asset role in mission: {str(e)}")
    
    def get_asset_role_in_hop(self, hop_id: str, asset_id: str) -> Optional[AssetRole]:
        """Get the role of an asset in a specific hop"""
        try:
            mapping = self.db.query(HopAsset).filter(
                and_(
                    HopAsset.hop_id == hop_id,
                    HopAsset.asset_id == asset_id
                )
            ).first()
            
            return mapping.role if mapping else None
            
        except Exception as e:
            raise ValidationError(f"Failed to get asset role in hop: {str(e)}")
    
    # Bulk operations
    
    def bulk_add_mission_assets(self, mission_id: str, asset_role_map: Dict[str, AssetRole]) -> List[str]:
        """Add multiple assets to a mission"""
        mapping_ids = []
        for asset_id, role in asset_role_map.items():
            mapping_id = self.add_mission_asset(mission_id, asset_id, role)
            mapping_ids.append(mapping_id)
        return mapping_ids
    
    def bulk_add_hop_assets(self, hop_id: str, asset_role_map: Dict[str, AssetRole]) -> List[str]:
        """Add multiple assets to a hop"""
        mapping_ids = []
        for asset_id, role in asset_role_map.items():
            mapping_id = self.add_hop_asset(hop_id, asset_id, role)
            mapping_ids.append(mapping_id)
        return mapping_ids
    
    def clear_mission_assets(self, mission_id: str) -> int:
        """Remove all asset mappings for a mission"""
        try:
            count = self.db.query(MissionAsset).filter(
                MissionAsset.mission_id == mission_id
            ).delete()
            self.db.flush()
            return count
            
        except Exception as e:
            raise ValidationError(f"Failed to clear mission assets: {str(e)}")
    
    def clear_hop_assets(self, hop_id: str) -> int:
        """Remove all asset mappings for a hop"""
        try:
            count = self.db.query(HopAsset).filter(
                HopAsset.hop_id == hop_id
            ).delete()
            self.db.flush()
            return count
            
        except Exception as e:
            raise ValidationError(f"Failed to clear hop assets: {str(e)}") 