"""
Extraction Service

Provides LLM-powered extraction capabilities for processing items.
Primary usage is via the Tablizer /api/tablizer/extract endpoint.

API Overview:
- extract_value(): Extract a single value from one item
- extract_value_batch(): Extract the same single value from many items (parallel)
- extract_fields(): Extract multiple fields from one item (schema-based)
- extract_fields_batch(): Extract multiple fields from many items (parallel)
"""

from typing import Dict, Any, List, Optional, Union, Literal
from datetime import datetime
import asyncio
from pydantic import BaseModel, Field

from agents.prompts.base_prompt_caller import BasePromptCaller
from config.llm_models import get_task_config, supports_reasoning_effort


# =============================================================================
# Output Types and Result Models
# =============================================================================

OutputType = Literal["boolean", "number", "text"]


class SingleValueResult(BaseModel):
    """Result from extracting a single value from an item"""
    item_id: str = Field(description="Identifier for the source item")
    value: Union[bool, float, str, None] = Field(description="The extracted value")
    score: float = Field(description="Confidence score (0-1)")
    reasoning: str = Field(description="Explanation of the result")
    error: Optional[str] = Field(default=None, description="Error message if extraction failed")


class FieldsResult(BaseModel):
    """Result from extracting multiple fields from an item"""
    item_id: str = Field(description="Identifier for the source item")
    fields: Optional[Dict[str, Any]] = Field(description="Extracted field values")
    error: Optional[str] = Field(default=None, description="Error message if extraction failed")


# =============================================================================
# Response Schemas (used by LLM)
# =============================================================================

BOOLEAN_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "value": {"type": "boolean", "description": "Yes (true) or No (false)"},
        "score": {"type": "number", "minimum": 0, "maximum": 1, "description": "Confidence in the answer (0-1)"},
        "reasoning": {"type": "string", "description": "Brief explanation"}
    },
    "required": ["value", "score", "reasoning"]
}

NUMBER_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "value": {"type": "number", "minimum": 0, "maximum": 1, "description": "Score from 0 to 1"},
        "score": {"type": "number", "minimum": 0, "maximum": 1, "description": "Confidence in the score (0-1)"},
        "reasoning": {"type": "string", "description": "Brief explanation"}
    },
    "required": ["value", "score", "reasoning"]
}

TEXT_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "value": {"type": "string", "description": "The extracted text value"},
        "score": {"type": "number", "minimum": 0, "maximum": 1, "description": "Confidence in the answer (0-1)"},
        "reasoning": {"type": "string", "description": "Brief explanation"}
    },
    "required": ["value", "score", "reasoning"]
}


def get_response_schema(output_type: OutputType) -> Dict[str, Any]:
    """Get the appropriate response schema for the output type"""
    if output_type == "boolean":
        return BOOLEAN_RESPONSE_SCHEMA
    elif output_type == "number":
        return NUMBER_RESPONSE_SCHEMA
    else:
        return TEXT_RESPONSE_SCHEMA


# =============================================================================
# System Messages (owned by the service)
# =============================================================================

SYSTEM_MESSAGE_BOOLEAN = """You are an evaluation function that answers yes/no questions about data.

## Your Task
Given source data and a question, determine whether the answer is Yes or No.

## Response Format
- value: true for Yes, false for No
- score: Your confidence in this answer (0.0 = no confidence, 1.0 = certain)
- reasoning: Brief explanation of why you answered Yes or No"""

SYSTEM_MESSAGE_NUMBER = """You are an evaluation function that scores data on a 0-1 scale.

## Your Task
Given source data and scoring criteria, provide a score from 0.0 to 1.0.

## Response Format
- value: Your score (0.0 = lowest, 1.0 = highest)
- score: Your confidence in this score (0.0 = no confidence, 1.0 = certain)
- reasoning: Brief explanation of the score"""

SYSTEM_MESSAGE_TEXT = """You are an extraction function that extracts text values from data.

## Your Task
Given source data and an instruction, extract or generate the requested text value.

## Response Format
- value: The extracted or generated text
- score: Your confidence in this value (0.0 = no confidence, 1.0 = certain)
- reasoning: Brief explanation"""


def get_system_message(output_type: OutputType) -> str:
    """Get the appropriate system message for the output type"""
    if output_type == "boolean":
        return SYSTEM_MESSAGE_BOOLEAN
    elif output_type == "number":
        return SYSTEM_MESSAGE_NUMBER
    else:
        return SYSTEM_MESSAGE_TEXT


# =============================================================================
# Extraction Service
# =============================================================================

class ExtractionService:
    """
    Service for LLM-powered extraction.

    Single-value extraction (Tablizer use case):
    - extract_value(): One item → one value
    - extract_value_batch(): Many items → one value each (parallel)

    Schema-based extraction (future use):
    - extract_fields(): One item → multiple fields
    - extract_fields_batch(): Many items → multiple fields each (parallel)
    """

    def __init__(self):
        """Initialize the extraction service"""
        self._prompt_callers: Dict[str, BasePromptCaller] = {}

    def _get_value_prompt_caller(self, output_type: OutputType) -> BasePromptCaller:
        """Get or create a prompt caller for single-value extraction"""
        cache_key = f"value_{output_type}"

        if cache_key not in self._prompt_callers:
            model_config = get_task_config("extraction", "default")

            self._prompt_callers[cache_key] = BasePromptCaller(
                response_model=get_response_schema(output_type),
                system_message=get_system_message(output_type),
                messages_placeholder=True,
                model=model_config["model"],
                temperature=model_config.get("temperature", 0.0),
                reasoning_effort=model_config.get("reasoning_effort") if supports_reasoning_effort(model_config["model"]) else None
            )

        return self._prompt_callers[cache_key]

    def _format_item_for_prompt(self, item: Dict[str, Any]) -> str:
        """Format an item as a readable string for the prompt"""
        lines = []
        for key, value in item.items():
            if value is not None and value != "":
                # Handle lists (like authors)
                if isinstance(value, list):
                    value = ", ".join(str(v) for v in value)
                lines.append(f"{key}: {value}")
        return "\n".join(lines)

    async def extract_value(
        self,
        item: Dict[str, Any],
        instruction: str,
        output_type: OutputType,
        item_id: Optional[str] = None
    ) -> SingleValueResult:
        """
        Extract a single value from one item.

        Args:
            item: Source data to extract from (e.g., article with title, abstract)
            instruction: Natural language instruction describing what to extract
            output_type: Expected output type ("boolean", "number", or "text")
            item_id: Optional identifier for the item (defaults to item's "id" field or "unknown")

        Returns:
            SingleValueResult with the extracted value, confidence score, and reasoning
        """
        # Determine item ID
        if item_id is None:
            item_id = str(item.get("id", item.get("pmid", "unknown")))

        try:
            # Get the appropriate prompt caller
            prompt_caller = self._get_value_prompt_caller(output_type)

            # Format the item as readable text
            item_text = self._format_item_for_prompt(item)

            # Build the user message
            from schemas.llm import ChatMessage, MessageRole
            user_message = ChatMessage(
                id="extraction",
                chat_id="extraction",
                role=MessageRole.USER,
                content=f"## Source Data\n{item_text}\n\n## Instruction\n{instruction}",
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow()
            )

            # Call the LLM
            response = await prompt_caller.invoke(
                messages=[user_message],
                return_usage=False,
                log_prompt=True
            )

            # Extract result from response
            if hasattr(response, 'model_dump'):
                result_data = response.model_dump()
            elif hasattr(response, 'dict'):
                result_data = response.dict()
            else:
                result_data = dict(response)

            return SingleValueResult(
                item_id=item_id,
                value=result_data.get("value"),
                score=result_data.get("score", 0.0),
                reasoning=result_data.get("reasoning", "")
            )

        except Exception as e:
            return SingleValueResult(
                item_id=item_id,
                value=None,
                score=0.0,
                reasoning="",
                error=str(e)
            )

    async def extract_value_batch(
        self,
        items: List[Dict[str, Any]],
        instruction: str,
        output_type: OutputType,
        max_concurrent: int = 50
    ) -> List[SingleValueResult]:
        """
        Extract the same single value from many items in parallel.

        Args:
            items: List of source data items to extract from
            instruction: Natural language instruction (same for all items)
            output_type: Expected output type ("boolean", "number", or "text")
            max_concurrent: Maximum concurrent LLM calls (default: 50)

        Returns:
            List of SingleValueResult objects in the same order as input items
        """
        if not items:
            return []

        # Create semaphore to limit concurrent LLM calls
        semaphore = asyncio.Semaphore(max_concurrent)

        async def extract_one(item: Dict[str, Any]) -> SingleValueResult:
            """Extract from a single item with rate limiting"""
            async with semaphore:
                return await self.extract_value(
                    item=item,
                    instruction=instruction,
                    output_type=output_type
                )

        # Execute all extractions in parallel
        results = await asyncio.gather(
            *[extract_one(item) for item in items],
            return_exceptions=True
        )

        # Handle any exceptions that were returned
        final_results = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                item = items[i]
                item_id = str(item.get("id", item.get("pmid", "unknown")))
                final_results.append(SingleValueResult(
                    item_id=item_id,
                    value=None,
                    score=0.0,
                    reasoning="",
                    error=str(result)
                ))
            else:
                final_results.append(result)

        return final_results

    async def extract_fields(
        self,
        item: Dict[str, Any],
        schema: Dict[str, Any],
        instructions: str,
        item_id: Optional[str] = None
    ) -> FieldsResult:
        """
        Extract multiple fields from one item using a schema.

        Args:
            item: Source data to extract from
            schema: JSON schema defining the fields to extract
            instructions: Natural language instructions for extraction
            item_id: Optional identifier for the item

        Returns:
            FieldsResult with the extracted fields
        """
        # Determine item ID
        if item_id is None:
            item_id = str(item.get("id", item.get("pmid", "unknown")))

        try:
            # Get model config
            model_config = get_task_config("extraction", "default")

            # Create prompt caller for this schema
            system_message = """You are an extraction function that extracts structured data.

## Your Task
Given source data and instructions, extract the requested fields according to the schema.

## Guidelines
- Follow the schema exactly
- Return null for missing information
- Maintain specified data types"""

            prompt_caller = BasePromptCaller(
                response_model=schema,
                system_message=system_message,
                messages_placeholder=True,
                model=model_config["model"],
                temperature=model_config.get("temperature", 0.0),
                reasoning_effort=model_config.get("reasoning_effort") if supports_reasoning_effort(model_config["model"]) else None
            )

            # Format the item
            item_text = self._format_item_for_prompt(item)

            # Build the user message
            from schemas.llm import ChatMessage, MessageRole
            user_message = ChatMessage(
                id="extraction",
                chat_id="extraction",
                role=MessageRole.USER,
                content=f"## Source Data\n{item_text}\n\n## Instructions\n{instructions}",
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow()
            )

            # Call the LLM
            response = await prompt_caller.invoke(
                messages=[user_message],
                return_usage=False,
                log_prompt=True
            )

            # Extract result
            if hasattr(response, 'model_dump'):
                fields = response.model_dump()
            elif hasattr(response, 'dict'):
                fields = response.dict()
            else:
                fields = dict(response)

            return FieldsResult(
                item_id=item_id,
                fields=fields
            )

        except Exception as e:
            return FieldsResult(
                item_id=item_id,
                fields=None,
                error=str(e)
            )

    async def extract_fields_batch(
        self,
        items: List[Dict[str, Any]],
        schema: Dict[str, Any],
        instructions: str,
        max_concurrent: int = 50
    ) -> List[FieldsResult]:
        """
        Extract multiple fields from many items in parallel.

        Args:
            items: List of source data items
            schema: JSON schema defining the fields to extract
            instructions: Natural language instructions (same for all items)
            max_concurrent: Maximum concurrent LLM calls (default: 50)

        Returns:
            List of FieldsResult objects in the same order as input items
        """
        if not items:
            return []

        # Create semaphore to limit concurrent LLM calls
        semaphore = asyncio.Semaphore(max_concurrent)

        async def extract_one(item: Dict[str, Any]) -> FieldsResult:
            """Extract from a single item with rate limiting"""
            async with semaphore:
                return await self.extract_fields(
                    item=item,
                    schema=schema,
                    instructions=instructions
                )

        # Execute all extractions in parallel
        results = await asyncio.gather(
            *[extract_one(item) for item in items],
            return_exceptions=True
        )

        # Handle any exceptions
        final_results = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                item = items[i]
                item_id = str(item.get("id", item.get("pmid", "unknown")))
                final_results.append(FieldsResult(
                    item_id=item_id,
                    fields=None,
                    error=str(result)
                ))
            else:
                final_results.append(result)

        return final_results


# =============================================================================
# Singleton Instance
# =============================================================================

_extraction_service = None


def get_extraction_service() -> ExtractionService:
    """Get the singleton extraction service instance"""
    global _extraction_service
    if _extraction_service is None:
        _extraction_service = ExtractionService()
    return _extraction_service
