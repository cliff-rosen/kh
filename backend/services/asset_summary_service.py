"""
Asset Summary Service

This service provides intelligent summarization of assets for use in chat contexts
where full asset values would be too large or inappropriate.
"""

import json
from datetime import datetime
from typing import List, Dict, Any, Optional

from schemas.asset import Asset, AssetStatus
from schemas.chat import AssetReference
from schemas.base import SchemaType


class AssetSummaryService:
    """Service for creating intelligent asset summaries"""
    
    def __init__(self):
        self.max_content_preview_length = 200
        self.max_array_items_to_show = 3
    
    def create_asset_summary(self, asset: Asset) -> AssetReference:
        """
        Create an intelligent summary of an asset for chat context.
        
        Args:
            asset: The asset to summarize
            
        Returns:
            AssetReference with summarized information
        """
        content_preview = self._create_content_preview(asset)
        
        return AssetReference(
            id=asset.id,
            name=asset.name,
            description=asset.description,
            type=asset.schema_definition.type if asset.schema_definition else "unknown",
            metadata={
                "status": asset.status.value,
                "content_preview": content_preview,
                "token_count": getattr(asset.asset_metadata, 'token_count', 0) if asset.asset_metadata else 0,
                "last_updated": asset.updated_at.isoformat() if asset.updated_at else None,
                "is_array": asset.schema_definition.is_array if asset.schema_definition else False,
                "subtype": asset.subtype,
                "role": asset.role
            }
        )
    
    def create_mission_asset_summaries(self, mission_state: Dict[str, Asset]) -> List[AssetReference]:
        """
        Create summaries for all assets in a mission state.
        
        Args:
            mission_state: Dictionary of asset_id -> Asset
            
        Returns:
            List of AssetReference objects
        """
        summaries = []
        for asset_id, asset in mission_state.items():
            # Only include non-proposed assets in chat context
            if asset.status != AssetStatus.PROPOSED:
                summaries.append(self.create_asset_summary(asset))
        
        return summaries
    
    def _create_content_preview(self, asset: Asset) -> str:
        """
        Create an intelligent preview of the asset's content based on its type.
        
        Args:
            asset: The asset to create a preview for
            
        Returns:
            String preview of the content
        """
        if asset.value_representation is None:
            return "<no content>"
        
        try:
            # Handle different content types intelligently
            if asset.schema_definition and asset.schema_definition.is_array:
                return self._summarize_array_content(asset.value_representation)
            elif asset.schema_definition and asset.schema_definition.type == "object":
                return self._summarize_object_content(asset.value_representation)
            elif isinstance(asset.value_representation, str):
                return self._truncate_string_content(asset.value_representation)
            elif isinstance(asset.value_representation, (int, float, bool)):
                return str(asset.value_representation)
            else:
                # For complex types, try JSON serialization
                return self._summarize_complex_content(asset.value_representation)
                
        except Exception as e:
            return f"<preview error: {str(e)}>"
    
    def _summarize_array_content(self, content: Any) -> str:
        """Summarize array content showing length and sample items."""
        if not isinstance(content, list):
            return self._truncate_string_content(str(content))
        
        length = len(content)
        if length == 0:
            return "[]"
        
        # Show first few items
        preview_items = content[:self.max_array_items_to_show]
        preview_strs = []
        
        for item in preview_items:
            if isinstance(item, dict):
                # For objects, show key names
                keys = list(item.keys())[:3]
                preview_strs.append(f"{{{', '.join(keys)}{'...' if len(item) > 3 else ''}}}")
            elif isinstance(item, str):
                preview_strs.append(f'"{item[:30]}{"..." if len(item) > 30 else ""}"')
            else:
                preview_strs.append(str(item)[:30])
        
        preview = f"[{', '.join(preview_strs)}"
        if length > self.max_array_items_to_show:
            preview += f", ...{length - self.max_array_items_to_show} more"
        preview += "]"
        
        return f"Array({length} items): {preview}"
    
    def _summarize_object_content(self, content: Any) -> str:
        """Summarize object content showing key structure."""
        if not isinstance(content, dict):
            return self._truncate_string_content(str(content))
        
        if not content:
            return "{}"
        
        # Show key names and some sample values
        keys = list(content.keys())
        preview_parts = []
        
        for key in keys[:5]:  # Show up to 5 keys
            value = content[key]
            if isinstance(value, str):
                value_preview = f'"{value[:20]}{"..." if len(value) > 20 else ""}"'
            elif isinstance(value, list):
                value_preview = f"[{len(value)} items]"
            elif isinstance(value, dict):
                value_preview = f"{{{len(value)} keys}}"
            else:
                value_preview = str(value)[:20]
            
            preview_parts.append(f"{key}: {value_preview}")
        
        if len(keys) > 5:
            preview_parts.append(f"...{len(keys) - 5} more")
        
        return f"Object({len(keys)} keys): {{{', '.join(preview_parts)}}}"
    
    def _truncate_string_content(self, content: str) -> str:
        """Truncate string content to a reasonable length."""
        if len(content) <= self.max_content_preview_length:
            return content
        
        return content[:self.max_content_preview_length] + "..."
    
    def _summarize_complex_content(self, content: Any) -> str:
        """Summarize complex content types."""
        try:
            json_str = json.dumps(content, default=str)
            return self._truncate_string_content(json_str)
        except Exception:
            return self._truncate_string_content(str(content)) 