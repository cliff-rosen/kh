"""
Article Group Detail Service V2

Simplified service for managing individual article details within groups.
Handles notes, metadata, canonical study representation, and feature extraction.
"""

from typing import Dict, Any, Optional, List
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified
from sqlalchemy import and_, func
from datetime import datetime
import json

from models import ArticleGroup, ArticleGroupDetail
from schemas.features import FeatureDefinition
from services.extraction_service import ExtractionService
from schemas.workbench import ArticleDetailResponse
from schemas.canonical_types import CanonicalResearchArticle


class ArticleGroupDetailService:
    """Simplified service for managing individual article details within groups."""
    
    def __init__(self, db: Session, extraction_service: ExtractionService = None):
        self.db = db
        self.extraction_service = extraction_service
    
    # ==================== CORE CRUD OPERATIONS ====================
    
    def get_article_detail(
        self, 
        user_id: int, 
        group_id: str, 
        article_id: str
    ) -> Optional[ArticleDetailResponse]:
        """Get complete article detail data for an article in a group."""
        article_detail = self._get_article_detail_record(user_id, group_id, article_id)
        if not article_detail:
            return None
        
        # Get group info for context
        group = self.db.query(ArticleGroup).filter(ArticleGroup.id == group_id).first()
        
        return ArticleDetailResponse(
            article=CanonicalResearchArticle(**article_detail.article_data),
            notes=article_detail.notes or "",
            feature_data=article_detail.feature_data or {},
            metadata=article_detail.article_metadata or {},
            position=article_detail.position,
            group_id=group_id,
            group_name=group.name if group else "Unknown",
            created_at=article_detail.created_at.isoformat(),
            updated_at=article_detail.updated_at.isoformat() if article_detail.updated_at else None
        )
    
    def update_notes(
        self, 
        user_id: int, 
        group_id: str, 
        article_id: str, 
        notes: str
    ) -> bool:
        """Update research notes for an article."""
        article_detail = self._get_article_detail_record(user_id, group_id, article_id)
        if not article_detail:
            return False
        
        article_detail.notes = notes
        article_detail.updated_at = datetime.utcnow()
        
        self.db.commit()
        return True
    
    def update_metadata(
        self, 
        user_id: int, 
        group_id: str, 
        article_id: str, 
        metadata_updates: Dict[str, Any]
    ) -> bool:
        """Update or merge metadata for an article."""
        article_detail = self._get_article_detail_record(user_id, group_id, article_id)
        if not article_detail:
            return False
        
        # Merge with existing metadata
        current_metadata = article_detail.article_metadata or {}
        current_metadata.update(metadata_updates)
        
        article_detail.article_metadata = current_metadata
        article_detail.updated_at = datetime.utcnow()
        
        # Ensure SQLAlchemy detects the JSON change
        flag_modified(article_detail, 'article_metadata')
        
        self.db.commit()
        return True
    
    # ==================== CANONICAL STUDY REPRESENTATION ====================
    
    def get_canonical_study(
        self,
        user_id: int,
        group_id: str,
        article_id: str
    ) -> Dict[str, Any]:
        """Get unified canonical study representation (archetype + ER graph)."""
        article_detail = self._get_article_detail_record(user_id, group_id, article_id)
        if not article_detail or not article_detail.article_metadata:
            return {}
        
        metadata = article_detail.article_metadata
        
        # Combine archetype and entity analysis data
        archetype_data = metadata.get('archetype', {})
        entity_data = metadata.get('entity_analysis', {})
        
        return {
            'archetype_text': archetype_data.get('text'),
            'study_type': archetype_data.get('study_type'),
            'pattern_id': archetype_data.get('pattern_id'),
            'entity_analysis': entity_data.get('data'),
            'last_updated': archetype_data.get('updated_at') or entity_data.get('extracted_at'),
            'version': archetype_data.get('version', '1.0')
        }
    
    def save_canonical_study(
        self,
        user_id: int,
        group_id: str,
        article_id: str,
        archetype_text: Optional[str] = None,
        study_type: Optional[str] = None,
        pattern_id: Optional[str] = None,
        entity_analysis: Optional[Dict[str, Any]] = None,
        update_entity_analysis: Optional[bool] = None
    ) -> bool:
        """
        Save canonical study representation - supports partial updates.
        
        Args:
            archetype_text: If provided, updates archetype data
            study_type: Study type (only used if archetype_text provided)
            pattern_id: Pattern ID (only used if archetype_text provided)
            entity_analysis: If provided, updates entity analysis
            update_entity_analysis: If True, updates entity_analysis even if None (to clear it)
        """
        article_detail = self._get_article_detail_record(user_id, group_id, article_id)
        if not article_detail:
            return False
            
        current_metadata = article_detail.article_metadata or {}
        timestamp = datetime.utcnow().isoformat()
        
        # Only update archetype data if archetype_text is provided
        if archetype_text is not None:
            current_metadata['archetype'] = {
                'text': archetype_text,
                'study_type': study_type,
                'pattern_id': pattern_id,
                'updated_at': timestamp,
                'version': '2.0'
            }
        
        # Update entity analysis if provided or explicitly requested to update
        if entity_analysis is not None or update_entity_analysis:
            if entity_analysis is not None:
                # Serialize the analysis data
                serialized_analysis = self._serialize_data(entity_analysis)
                current_metadata['entity_analysis'] = {
                    'data': serialized_analysis,
                    'extracted_at': timestamp,
                    'version': '2.0'
                }
            elif update_entity_analysis:
                # Clear entity analysis if explicitly requested
                current_metadata.pop('entity_analysis', None)
        
        article_detail.article_metadata = current_metadata
        article_detail.updated_at = datetime.utcnow()
        
        # Ensure SQLAlchemy detects the JSON change
        flag_modified(article_detail, 'article_metadata')
        
        self.db.commit()
        return True
    
    # ==================== FEATURE EXTRACTION ====================
    
    async def extract_features(
        self,
        articles: List[Dict[str, Any]],
        features: List[FeatureDefinition],
        user_id: Optional[int] = None,
        group_id: Optional[str] = None
    ) -> Dict[str, Dict[str, str]]:
        """
        Extract features from articles using AI.
        
        Args:
            user_id: User ID for authorization
            group_id: Group ID to save results to
            articles: List of articles with id, title, abstract
            features: List of feature definitions with name, description, type, options
            
        Returns:
            Dictionary mapping article ID to feature_id to extracted value
        """
        if not features or not self.extraction_service:
            return {}
        
        # Build the schema for extraction
        properties = {}
        for feature in features:
            properties[feature.name] = self._build_feature_schema(feature)
        
        result_schema = {
            "type": "object",
            "properties": properties,
            "required": [f.name for f in features]
        }
        
        # Build extraction instructions
        instruction_parts = []
        for feature in features:
            if feature.type == 'boolean':
                format_hint = "(Answer: 'yes' or 'no')"
            elif feature.type in ['score', 'number']:
                options = feature.options or {}
                min_val = options.get('min', 1)
                max_val = options.get('max', 10)
                format_hint = f"(Numeric score {min_val}-{max_val})"
            else:
                format_hint = "(Brief text, max 100 chars)"
            
            instruction_parts.append(f"- {feature.name}: {feature.description} {format_hint}")
        
        extraction_instructions = "\n".join(instruction_parts)
        
        # Extract for all articles and persist results
        results = {}
        for article in articles:
            article_id = article['id']
            
            try:
                # Perform extraction
                extraction_result = await self.extraction_service.perform_extraction(
                    item={
                        "id": article['id'],
                        "title": article.get('title', ''),
                        "abstract": article.get('abstract', '')
                    },
                    result_schema=result_schema,
                    extraction_instructions=extraction_instructions,
                    schema_key=f"features_{hash(tuple(f.name for f in features))}"
                )
                
                # Process results
                article_results = {}
                if extraction_result.extraction:
                    for feature in features:
                        if feature.name in extraction_result.extraction:
                            raw_value = extraction_result.extraction[feature.name]
                            article_results[feature.id] = self._clean_value(raw_value, feature.type, feature.options)
                        else:
                            article_results[feature.id] = self._get_default_value(feature.type, feature.options)
                
                results[article_id] = article_results
                
                # Persist to database if group context provided
                if user_id and group_id:
                    self._save_feature_data(user_id, group_id, article_id, article_results)
                
            except Exception as e:
                # On error, use default values
                article_results = {}
                for feature in features:
                    article_results[feature.id] = self._get_default_value(feature.type, feature.options)
                results[article_id] = article_results
        
        return results
    
    # ==================== BATCH OPERATIONS ====================
    
    def batch_update_metadata(
        self, 
        user_id: int, 
        group_id: str,
        updates: Dict[str, Dict[str, Any]]  # article_id -> metadata
    ) -> Dict[str, bool]:
        """Update metadata for multiple articles. Returns success status for each."""
        results = {}
        
        # Verify group ownership
        group = self.db.query(ArticleGroup).filter(
            and_(
                ArticleGroup.id == group_id,
                ArticleGroup.user_id == user_id
            )
        ).first()
        
        if not group:
            return {}
        
        # Get all articles to update
        article_ids = list(updates.keys())
        articles = self.db.query(ArticleGroupDetail).filter(
            and_(
                ArticleGroupDetail.article_group_id == group_id,
                func.json_extract(ArticleGroupDetail.article_data, "$.id").in_(article_ids)
            )
        ).all()
        
        for article_detail in articles:
            article_id = article_detail.article_data["id"]
            if article_id in updates:
                # Merge metadata
                current_metadata = article_detail.article_metadata or {}
                current_metadata.update(updates[article_id])
                
                article_detail.article_metadata = current_metadata
                article_detail.updated_at = datetime.utcnow()
                flag_modified(article_detail, 'article_metadata')
                
                results[article_id] = True
        
        self.db.commit()
        return results
    
    # ==================== PRIVATE HELPER METHODS ====================
    
    def _get_article_detail_record(
        self, 
        user_id: int, 
        group_id: str, 
        article_id: str
    ) -> Optional[ArticleGroupDetail]:
        """Get article detail record with proper authorization."""
        return self.db.query(ArticleGroupDetail).join(
            ArticleGroup, ArticleGroupDetail.article_group_id == ArticleGroup.id
        ).filter(
            and_(
                ArticleGroup.user_id == user_id,
                ArticleGroup.id == group_id,
                func.json_extract(ArticleGroupDetail.article_data, "$.id") == article_id
            )
        ).first()
    
    def _save_feature_data(
        self,
        user_id: int,
        group_id: str,
        article_id: str,
        feature_data: Dict[str, str]
    ) -> bool:
        """Save extracted feature data for an article."""
        article_detail = self._get_article_detail_record(user_id, group_id, article_id)
        if not article_detail:
            return False
        
        # Update feature data
        current_features = article_detail.feature_data or {}
        current_features.update(feature_data)
        
        article_detail.feature_data = current_features
        article_detail.updated_at = datetime.utcnow()
        flag_modified(article_detail, 'feature_data')
        
        self.db.commit()
        return True
    
    def _serialize_data(self, data: Any) -> Any:
        """Serialize data to ensure it's JSON-compatible."""
        if hasattr(data, 'model_dump'):
            return data.model_dump()
        elif hasattr(data, 'dict'):
            return data.dict()
        elif isinstance(data, dict):
            # Recursively handle nested structures
            return {
                key: self._serialize_data(value) if isinstance(value, (dict, list)) 
                     else value.value if hasattr(value, 'value') 
                     else value
                for key, value in data.items()
            }
        elif isinstance(data, list):
            return [self._serialize_data(item) for item in data]
        elif hasattr(data, 'value'):  # Enum
            return data.value
        else:
            return data
    
    def _build_feature_schema(self, feature: FeatureDefinition) -> Dict[str, Any]:
        """Build JSON schema for a single feature."""
        if feature.type == 'boolean':
            return {
                "type": "string",
                "enum": ["yes", "no"],
                "description": feature.description
            }
        elif feature.type in ['score', 'number']:
            options = feature.options or {}
            return {
                "type": "number",
                "minimum": options.get('min', 1),
                "maximum": options.get('max', 10),
                "description": feature.description
            }
        else:  # text
            return {
                "type": "string",
                "maxLength": 100,
                "description": feature.description
            }
    
    def _clean_value(self, value: Any, feature_type: str, options: Optional[Dict[str, Any]] = None) -> str:
        """Clean and validate extracted values based on feature type."""
        if feature_type == "boolean":
            clean_val = str(value).lower().strip()
            return clean_val if clean_val in ["yes", "no"] else "no"
        elif feature_type in ["score", "number"]:
            try:
                num_val = float(value)
                opts = options or {}
                min_val = opts.get('min', 1)
                max_val = opts.get('max', 10)
                clamped = max(min_val, min(max_val, num_val))
                return str(int(clamped) if clamped.is_integer() else clamped)
            except (ValueError, TypeError):
                return str(options.get('min', 1) if options else 1)
        else:  # text
            return str(value)[:100] if value is not None else ""
    
    def _get_default_value(self, feature_type: str, options: Optional[Dict[str, Any]] = None) -> str:
        """Get default value for a feature type."""
        if feature_type == "boolean":
            return "no"
        elif feature_type in ["score", "number"]:
            return str(options.get('min', 1) if options else 1)
        else:  # text
            return ""


def get_article_group_detail_service(
    db: Session = None, 
    extraction_service: ExtractionService = None
) -> ArticleGroupDetailService:
    """Dependency injection for ArticleGroupDetailService."""
    return ArticleGroupDetailService(db, extraction_service)