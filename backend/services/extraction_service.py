"""
Extraction Service

This service provides LLM-powered extraction capabilities for processing
items with custom schemas and instructions. Primary usage is via the
Tablizer /api/tablizer/extract endpoint.
"""

from typing import Dict, Any, List, Optional
from datetime import datetime
import uuid
import json
import asyncio
from pydantic import BaseModel, Field

from agents.prompts.base_prompt_caller import BasePromptCaller
from config.llm_models import get_task_config, supports_reasoning_effort


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
        continue_on_error: bool = True,
        max_concurrent: int = 50
    ) -> List[ExtractionResult]:
        """
        Extract information from multiple items using the same schema and instructions.
        Runs extractions in parallel with rate limiting via semaphore.

        Args:
            items: List of source items to extract from
            result_schema: JSON schema defining the structure of extraction results
            extraction_instructions: Natural language instructions for extraction
            schema_key: Optional key for caching the prompt caller
            continue_on_error: Whether to continue processing if individual items fail
            max_concurrent: Maximum number of concurrent extractions (default: 50)

        Returns:
            List of ExtractionResult objects (in same order as input items)
        """
        if not items:
            return []

        # Create semaphore to limit concurrent LLM calls (avoid rate limits)
        semaphore = asyncio.Semaphore(max_concurrent)

        async def extract_single(item: Dict[str, Any]) -> ExtractionResult:
            """Extract from a single item with rate limiting"""
            async with semaphore:
                try:
                    return await self.perform_extraction(
                        item=item,
                        result_schema=result_schema,
                        extraction_instructions=extraction_instructions,
                        schema_key=schema_key
                    )
                except Exception as e:
                    if continue_on_error:
                        # Create error result
                        item_id = item.get("id", str(uuid.uuid4()))
                        return ExtractionResult(
                            item_id=item_id,
                            original_item=item,
                            extraction=None,
                            error=str(e)
                        )
                    else:
                        raise

        # Execute all extractions in parallel
        results = await asyncio.gather(
            *[extract_single(item) for item in items],
            return_exceptions=not continue_on_error
        )

        # Handle any exceptions that were returned (when continue_on_error=True)
        final_results = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                item = items[i]
                item_id = item.get("id", str(uuid.uuid4()))
                final_results.append(ExtractionResult(
                    item_id=item_id,
                    original_item=item,
                    extraction=None,
                    error=str(result)
                ))
            else:
                final_results.append(result)

        return final_results


# Singleton instance
_extraction_service = None


def get_extraction_service() -> ExtractionService:
    """Get the singleton extraction service instance"""
    global _extraction_service
    if _extraction_service is None:
        _extraction_service = ExtractionService()
    return _extraction_service
