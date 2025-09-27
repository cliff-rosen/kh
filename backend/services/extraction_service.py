"""
Extraction Service

This service provides LLM-powered extraction capabilities that can be used
by various handlers including the generic extract handler and specific
feature extraction handlers like Google Scholar feature extraction.
"""

from typing import Dict, Any, List, Optional
from datetime import datetime
import uuid
import json
from pydantic import BaseModel, Field
from typing import Union

from agents.prompts.base_prompt_caller import BasePromptCaller
from config.llm_models import get_task_config, supports_reasoning_effort

from schemas.entity_extraction import (
    EntityRelationshipAnalysis, 
    EntityExtractionResponse,
    ArticleArchetype,
    StudyType
)


class ExtractionResult(BaseModel):
    """Result of an extraction operation"""
    item_id: str = Field(description="Unique identifier for the source item")
    original_item: Dict[str, Any] = Field(description="The original source item")
    extraction: Optional[Dict[str, Any]] = Field(description="Extracted data matching the schema")
    error: Optional[str] = Field(default=None, description="Error message if extraction failed")
    confidence_score: Optional[float] = Field(default=None, description="Confidence in extraction (0-1)")
    extraction_timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat())


class ExtractionPromptCaller(BasePromptCaller):
    """Prompt caller for extraction functions"""
    
    def __init__(self, result_schema: Dict[str, Any]):
        """
        Initialize the extraction prompt caller with a dynamic schema.
        
        Args:
            result_schema: The JSON schema for the expected result
        """
        # Define the system message template
        system_message = """You are an extraction function that processes data according to specific instructions.

        ## Your Task
        Given a source item and field instructions, extract the requested information according to the schema.

        ## Guidelines
        - Follow field-specific instructions precisely
        - Use exact output format specified in schema
        - Return null/default for missing information
        - Maintain data types as specified in the schema (string, number, boolean, array, object)

        ## Schema
        {result_schema}

        ## Field Instructions
        {extraction_instructions}

        ## Source Item
        {source_item}

        Please extract the required information and return it in the specified schema format."""
        
        # Get model config for extraction
        model_config = get_task_config("extraction", "default")
        
        # Initialize the base class with the JSON schema directly
        # BasePromptCaller will handle the conversion to Pydantic model
        super().__init__(
            response_model=result_schema,  # Pass JSON schema directly
            system_message=system_message,
            messages_placeholder=False,  # We don't need conversation history for extraction
            model=model_config["model"],
            temperature=model_config.get("temperature", 0.0),
            reasoning_effort=model_config.get("reasoning_effort") if supports_reasoning_effort(model_config["model"]) else None
        )
    
    async def invoke_extraction(
        self,
        source_item: Dict[str, Any],
        extraction_instructions: str
    ) -> Dict[str, Any]:
        """
        Invoke the extraction function.
        
        Args:
            source_item: The item to extract from
            extraction_instructions: Natural language instructions for extraction
            
        Returns:
            The extracted result matching the schema
        """
        # Format the source item as a readable string
        source_item_str = json.dumps(source_item, indent=2, default=str)
        
        # Call the base invoke method with our variables
        response = await self.invoke(
            source_item=source_item_str,
            extraction_instructions=extraction_instructions,
            messages=[],  # No conversation history needed
            result_schema=json.dumps(self.get_schema(), indent=2)
        )
        
        # The response is the structured Pydantic model, convert to dict
        if hasattr(response, 'model_dump'):
            return response.model_dump()
        elif hasattr(response, 'dict'):
            return response.dict()
        else:
            # Fallback - should not happen with proper Pydantic models
            return dict(response) if hasattr(response, '__dict__') else response


class ExtractionService:
    """
    Service for performing LLM-powered extractions with various schemas and instructions.
    This service can be used by multiple handlers for different extraction tasks.
    """
    
    def __init__(self):
        """Initialize the extraction service"""
        self._prompt_callers: Dict[str, ExtractionPromptCaller] = {}
    
    def _get_prompt_caller(self, schema_key: str, result_schema: Dict[str, Any]) -> ExtractionPromptCaller:
        """
        Get or create a prompt caller for the given schema.
        
        Args:
            schema_key: Unique key for this schema type
            result_schema: The JSON schema for extraction results
            
        Returns:
            ExtractionPromptCaller configured for this schema
        """
        if schema_key not in self._prompt_callers:
            self._prompt_callers[schema_key] = ExtractionPromptCaller(result_schema)
        return self._prompt_callers[schema_key]
    
    async def perform_extraction(
        self,
        item: Dict[str, Any],
        result_schema: Dict[str, Any],
        extraction_instructions: str,
        schema_key: Optional[str] = None
    ) -> ExtractionResult:
        """
        Extract information from a single item using the provided schema and instructions.
        
        Args:
            item: The source item to extract from
            result_schema: JSON schema defining the structure of extraction results
            extraction_instructions: Natural language instructions for extraction
            schema_key: Optional key for caching the prompt caller (defaults to hash of schema)
            
        Returns:
            ExtractionResult containing the extracted data or error information
        """
        # Generate schema key if not provided
        if schema_key is None:
            schema_key = str(hash(json.dumps(result_schema, sort_keys=True)))
        
        # Get item ID
        item_id = item.get("id", str(uuid.uuid4()))
        
        try:
            # Get the appropriate prompt caller
            prompt_caller = self._get_prompt_caller(schema_key, result_schema)
            
            # Perform the extraction
            extraction_result = await prompt_caller.invoke_extraction(
                source_item=item,
                extraction_instructions=extraction_instructions
            )
            
            return ExtractionResult(
                item_id=item_id,
                original_item=item,
                extraction=extraction_result,
                confidence_score=extraction_result.get("confidence_score")
            )
            
        except Exception as e:
            return ExtractionResult(
                item_id=item_id,
                original_item=item,
                extraction=None,
                error=str(e)
            )
    
    async def extract_multiple_items(
        self,
        items: List[Dict[str, Any]],
        result_schema: Dict[str, Any],
        extraction_instructions: str,
        schema_key: Optional[str] = None,
        continue_on_error: bool = True
    ) -> List[ExtractionResult]:
        """
        Extract information from multiple items using the same schema and instructions.
        
        Args:
            items: List of source items to extract from
            result_schema: JSON schema defining the structure of extraction results
            extraction_instructions: Natural language instructions for extraction
            schema_key: Optional key for caching the prompt caller
            continue_on_error: Whether to continue processing if individual items fail
            
        Returns:
            List of ExtractionResult objects
        """
        results = []
        
        for item in items:
            try:
                result = await self.perform_extraction(
                    item=item,
                    result_schema=result_schema,
                    extraction_instructions=extraction_instructions,
                    schema_key=schema_key
                )
                results.append(result)
                
            except Exception as e:
                if continue_on_error:
                    # Create error result and continue
                    item_id = item.get("id", str(uuid.uuid4()))
                    results.append(ExtractionResult(
                        item_id=item_id,
                        original_item=item,
                        extraction=None,
                        error=str(e)
                    ))
                else:
                    # Re-raise the exception to stop processing
                    raise
        
        return results
    
    async def extract_with_predefined_schema(
        self,
        items: List[Dict[str, Any]],
        schema_name: str,
        predefined_schemas: Dict[str, Dict[str, Any]],
        predefined_instructions: Dict[str, str]
    ) -> List[ExtractionResult]:
        """
        Extract using predefined schemas and instructions (e.g., for Google Scholar features).
        
        Args:
            items: List of source items to extract from
            schema_name: Name of the predefined schema to use
            predefined_schemas: Dictionary mapping schema names to JSON schemas
            predefined_instructions: Dictionary mapping schema names to extraction instructions
            
        Returns:
            List of ExtractionResult objects
        """
        if schema_name not in predefined_schemas:
            raise ValueError(f"Unknown schema: {schema_name}")
        
        if schema_name not in predefined_instructions:
            raise ValueError(f"No instructions defined for schema: {schema_name}")
        
        # Perform the extraction
        results = await self.extract_multiple_items(
            items=items,
            result_schema=predefined_schemas[schema_name],
            extraction_instructions=predefined_instructions[schema_name],
            schema_key=schema_name
        )
        
        # Apply post-processing based on schema type
        if schema_name == "research_features":
            results = self._apply_research_features_post_processing(results)
        
        return results
    
    def _apply_research_features_post_processing(self, results: List[ExtractionResult]) -> List[ExtractionResult]:
        """
        Apply research features post-processing including relevance scoring.
        
        Args:
            results: List of extraction results
            
        Returns:
            List of extraction results with relevance scores added
        """
        from schemas.research_features import calculate_relevance_score
        
        processed_results = []
        
        for result in results:
            if result.extraction:
                # Calculate relevance score and add to extraction
                relevance_score = calculate_relevance_score(result.extraction)
                
                # Add score to the extraction data
                enhanced_extraction = result.extraction.copy()
                enhanced_extraction["relevance_score"] = relevance_score
                
                # Create new result with enhanced extraction
                enhanced_result = ExtractionResult(
                    item_id=result.item_id,
                    original_item=result.original_item,
                    extraction=enhanced_extraction,
                    error=result.error,
                    confidence_score=result.confidence_score,
                    extraction_timestamp=result.extraction_timestamp
                )
                processed_results.append(enhanced_result)
            else:
                # Keep original result if extraction failed
                processed_results.append(result)
        
        return processed_results
    
    async def extract_article_archetype(self, article_id: str, title: str, abstract: str, full_text: Optional[str] = None) -> ArticleArchetype:
        """
        Stage 1: Extract a natural-language study archetype from the article text.
        Returns an ArticleArchetype object with archetype text and optional study type.
        """
        from schemas.archetype_config import get_archetype_schema, get_archetype_instructions, get_archetype_schema_key
        
        article_data = {
            "id": article_id,
            "title": title,
            "abstract": abstract,
            "full_text": full_text or ""
        }

        # Use centralized archetype configuration to ensure schema and instructions are aligned
        result_schema = get_archetype_schema()
        instructions = get_archetype_instructions()
        schema_key = get_archetype_schema_key()
        
        prompt_caller = self._get_prompt_caller(schema_key, result_schema)
        extraction = await prompt_caller.invoke_extraction(
            source_item=article_data,
            extraction_instructions=instructions
        )
        
        # Convert extraction dict to ArticleArchetype model
        return ArticleArchetype(
            archetype=extraction.get("archetype", ""),
            study_type=extraction.get("study_type"),
            pattern_id=extraction.get("pattern_id", "")
        )

    async def extract_er_graph_from_archetype(self, article_id: str, archetype_text: str, study_type: Optional[str] = None, pattern_id: Optional[str] = None) -> EntityExtractionResponse:
        """
        Stage 2: Generate entity-relationship graph from archetype using pattern-based approach.
        Simple and reliable - maps directly from archetype pattern to graph structure.
        """
        from schemas.pattern_graph_config import get_pattern_graph_template, get_extraction_instructions, GraphRole, ConnectionType, PATTERN_GRAPHS
        
        if not pattern_id:
            # Fallback to simple extraction if no pattern
            return await self._extract_simple_graph_from_text(article_id, archetype_text)
        
        # Get the pattern template
        template = get_pattern_graph_template(pattern_id)
        if not template:
            # Pattern not found, use simple extraction
            print(f"WARNING: Pattern ID '{pattern_id}' not found in PATTERN_GRAPHS")
            return await self._extract_simple_graph_from_text(article_id, archetype_text)
        
        # Build schema for pattern-based extraction
        result_schema = {
            "type": "object", 
            "properties": {
                "entities": {
                    "type": "object",
                    "properties": {
                        role_def["role"].value: {
                            "type": "object",
                            "properties": {
                                "name": {"type": "string", "description": f"Specific {role_def['extract_from']} from the archetype"},
                                "description": {"type": "string", "description": "What this entity represents in the study"}
                            },
                            "required": ["name", "description"]
                        }
                        for role_def in template["entities"]
                    }
                }
            },
            "required": ["entities"]
        }
        
        # Get extraction instructions
        instructions = get_extraction_instructions(pattern_id)
        
        # Perform extraction
        extraction_result = await self.perform_extraction(
            item={"archetype": archetype_text, "pattern_id": pattern_id},
            result_schema=result_schema,
            extraction_instructions=instructions,
            schema_key=f"pattern_graph_{pattern_id}"
        )

        if extraction_result.error:
            raise ValueError(f"ER graph from archetype failed: {extraction_result.error}")
        
        if not extraction_result.extraction:
            raise ValueError("No extraction results returned")
        
        # Build entities and relationships from pattern
        entities = []
        entity_id_map = {}  # role -> entity_id
        
        # Create entities from extracted data
        for role_def in template["entities"]:
            role = role_def["role"].value
            if role in extraction_result.extraction.get("entities", {}):
                entity_data = extraction_result.extraction["entities"][role]
                entity_id = f"{role}_{len(entities)}"
                
                entities.append({
                    "id": entity_id,
                    "name": entity_data["name"],
                    "type": self._map_role_to_entity_type(role_def["role"]),
                    "description": entity_data.get("description", ""),
                    "role": role
                })
                entity_id_map[role_def["role"]] = entity_id
        
        # Create relationships from pattern template
        relationships = []
        for source_role, connection_type, target_role in template["connections"]:
            if source_role in entity_id_map and target_role in entity_id_map:
                relationships.append({
                    "source_entity_id": entity_id_map[source_role],
                    "target_entity_id": entity_id_map[target_role],
                    "type": self._map_connection_to_relationship_type(connection_type),
                    "description": f"{source_role.value} {connection_type.value} {target_role.value}",
                    "evidence": "Pattern-based relationship",
                    "strength": "strong"  # Pattern relationships are definitive
                })
        
        # Build response
        from schemas.entity_extraction import EntityRelationshipAnalysis
        analysis = EntityRelationshipAnalysis(
            pattern_complexity="SIMPLE",  # Pattern-based is always simple
            entities=entities,
            relationships=relationships,
            complexity_justification=f"Generated from pattern {pattern_id}",
            clinical_significance=f"Study follows {pattern_id} pattern structure",
            key_findings=[f"Pattern {pattern_id}: {len(entities)} entities, {len(relationships)} relationships"]
        )
        
        return EntityExtractionResponse(
            article_id=article_id,
            analysis=analysis,
            extraction_metadata={
                "method": "pattern_based",
                "pattern_id": pattern_id,
                "entities_extracted": len(entities),
                "relationships_generated": len(relationships)
            }
        )
    
    def _map_role_to_entity_type(self, role) -> str:
        """Map graph role to entity type enum."""
        from schemas.pattern_graph_config import GraphRole
        
        role_to_type = {
            GraphRole.POPULATION: "patient_characteristic",
            GraphRole.CONDITION: "medical_condition", 
            GraphRole.INTERVENTION: "intervention",
            GraphRole.CONTROL: "intervention",
            GraphRole.OUTCOME: "outcome",
            GraphRole.EXPOSURE: "exposure",
            GraphRole.TEST: "intervention",
            GraphRole.TIME: "other",
            GraphRole.FACTOR: "biological_factor"
        }
        return role_to_type.get(role, "other")
    
    def _map_connection_to_relationship_type(self, connection_type) -> str:
        """Map connection type to relationship type enum."""
        from schemas.pattern_graph_config import ConnectionType
        
        connection_to_type = {
            ConnectionType.RECEIVES: "therapeutic",
            ConnectionType.TREATS: "therapeutic", 
            ConnectionType.MEASURES: "associative",
            ConnectionType.COMPARES_TO: "associative",
            ConnectionType.HAS_CONDITION: "associative",
            ConnectionType.PRODUCES: "causal",
            ConnectionType.EXPOSES_TO: "causal"
        }
        return connection_to_type.get(connection_type, "associative")
    
    async def _extract_simple_graph_from_text(self, article_id: str, text: str) -> EntityExtractionResponse:
        """Fallback simple extraction when no pattern is available."""
        # Simple fallback - just extract basic entities from text
        from schemas.entity_extraction import EntityRelationshipAnalysis
        
        analysis = EntityRelationshipAnalysis(
            pattern_complexity="SIMPLE",
            entities=[],
            relationships=[],
            complexity_justification="Fallback extraction - no pattern available",
            clinical_significance="Unable to determine without pattern",
            key_findings=["Pattern-based extraction not available"]
        )
        
        return EntityExtractionResponse(
            article_id=article_id,
            analysis=analysis,
            extraction_metadata={"method": "fallback", "reason": "no_pattern"}
        )


# Singleton instance
_extraction_service = None

def get_extraction_service() -> ExtractionService:
    """Get the singleton extraction service instance"""
    global _extraction_service
    if _extraction_service is None:
        _extraction_service = ExtractionService()
    return _extraction_service