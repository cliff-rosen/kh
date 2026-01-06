"""
AI Evaluation Service

Unified service for all LLM-powered evaluation operations on data items.
Consolidates extraction and semantic filtering into a single, clean API.

Operations:
- filter(): Yes/No classification (boolean output)
- score(): Numeric rating with configurable range (float output)
- extract(): Single value extraction (any type)
- extract_fields(): Multi-field extraction (schema-based)

All operations have batch variants for parallel processing.
"""

from typing import Dict, Any, List, Optional, Union, Literal
from datetime import datetime
import asyncio
from pydantic import BaseModel, Field

from agents.prompts.base_prompt_caller import BasePromptCaller
from config.llm_models import get_task_config, supports_reasoning_effort


# =============================================================================
# Type Definitions
# =============================================================================

ExtractOutputType = Literal["text", "number", "boolean", "enum"]


# =============================================================================
# Result Models
# =============================================================================

class EvaluationResult(BaseModel):
    """Result from filter, score, or single-value extract operations."""
    item_id: str = Field(description="Identifier for the source item")
    value: Union[str, bool, float, int, None] = Field(description="The result (type depends on operation)")
    confidence: float = Field(description="LLM's confidence based on evidence quality (0-1)")
    reasoning: Optional[str] = Field(default=None, description="Explanation (if include_reasoning=True)")
    error: Optional[str] = Field(default=None, description="Error message if evaluation failed")


class FieldsResult(BaseModel):
    """Result from multi-field extraction."""
    item_id: str = Field(description="Identifier for the source item")
    fields: Optional[Dict[str, Any]] = Field(default=None, description="Extracted field values (matches schema)")
    confidence: float = Field(description="LLM's overall confidence in the extraction (0-1)")
    reasoning: Optional[str] = Field(default=None, description="Overall explanation (if include_reasoning=True)")
    error: Optional[str] = Field(default=None, description="Error message if extraction failed")


# =============================================================================
# Confidence Rubric (embedded in all prompts)
# =============================================================================

CONFIDENCE_RUBRIC = """
## Confidence Calibration
Rate your confidence based on evidence quality in the source data:
- 0.9–1.0: Explicit statement in source text
- 0.7–0.89: Strong inference with clear supporting context
- 0.4–0.69: Weak inference or ambiguous evidence
- Below 0.4: Insufficient evidence"""


# =============================================================================
# System Messages
# =============================================================================

SYSTEM_MESSAGE_FILTER = f"""You are a classification function that answers yes/no questions about data.

## Your Task
Given source data and criteria, determine whether the answer is Yes or No.
You must provide an answer (true or false) even when uncertain—use low confidence to signal unreliability.

## Response Format
- value: true for Yes, false for No
- confidence: Your confidence based on evidence quality (0.0-1.0)
- reasoning: Brief explanation (if requested)
{CONFIDENCE_RUBRIC}"""

SYSTEM_MESSAGE_FILTER_NO_REASONING = f"""You are a classification function that answers yes/no questions about data.

## Your Task
Given source data and criteria, determine whether the answer is Yes or No.
You must provide an answer (true or false) even when uncertain—use low confidence to signal unreliability.

## Response Format
- value: true for Yes, false for No
- confidence: Your confidence based on evidence quality (0.0-1.0)
{CONFIDENCE_RUBRIC}"""

SYSTEM_MESSAGE_SCORE = f"""You are a scoring function that rates data on a numeric scale.

## Your Task
Given source data and criteria, provide a score within the specified range.
You must provide a score even when uncertain—use low confidence to signal unreliability.

## Response Format
- value: Your score (within the specified range)
- confidence: Your confidence based on evidence quality (0.0-1.0)
- reasoning: Brief explanation (if requested)
{CONFIDENCE_RUBRIC}"""

SYSTEM_MESSAGE_SCORE_NO_REASONING = f"""You are a scoring function that rates data on a numeric scale.

## Your Task
Given source data and criteria, provide a score within the specified range.
You must provide a score even when uncertain—use low confidence to signal unreliability.

## Response Format
- value: Your score (within the specified range)
- confidence: Your confidence based on evidence quality (0.0-1.0)
{CONFIDENCE_RUBRIC}"""

SYSTEM_MESSAGE_EXTRACT = f"""You are an extraction function that extracts specific information from data.

## Your Task
Given source data and an instruction, extract the requested value.
If the information is not present in the source data, return null for value.

## Response Format
- value: The extracted value (or null if not present)
- confidence: Your confidence based on evidence quality (0.0-1.0)
- reasoning: Brief explanation (if requested)
{CONFIDENCE_RUBRIC}"""

SYSTEM_MESSAGE_EXTRACT_NO_REASONING = f"""You are an extraction function that extracts specific information from data.

## Your Task
Given source data and an instruction, extract the requested value.
If the information is not present in the source data, return null for value.

## Response Format
- value: The extracted value (or null if not present)
- confidence: Your confidence based on evidence quality (0.0-1.0)
{CONFIDENCE_RUBRIC}"""

SYSTEM_MESSAGE_EXTRACT_FIELDS = f"""You are an extraction function that extracts structured data.

## Your Task
Given source data and a schema, extract all requested fields.
Follow per-field instructions where provided.
For fields where information is not present, return null.

## Response Format
Return a JSON object matching the schema, plus:
- confidence: Your overall confidence based on evidence quality (0.0-1.0)
- reasoning: Brief explanation of the extraction (if requested)
{CONFIDENCE_RUBRIC}"""

SYSTEM_MESSAGE_EXTRACT_FIELDS_NO_REASONING = f"""You are an extraction function that extracts structured data.

## Your Task
Given source data and a schema, extract all requested fields.
Follow per-field instructions where provided.
For fields where information is not present, return null.

## Response Format
Return a JSON object matching the schema, plus:
- confidence: Your overall confidence based on evidence quality (0.0-1.0)
{CONFIDENCE_RUBRIC}"""


# =============================================================================
# Response Schemas
# =============================================================================

def get_filter_response_schema(include_reasoning: bool) -> Dict[str, Any]:
    """Get response schema for filter operation."""
    schema = {
        "type": "object",
        "properties": {
            "value": {"type": "boolean", "description": "Yes (true) or No (false)"},
            "confidence": {"type": "number", "minimum": 0, "maximum": 1, "description": "Confidence based on evidence quality (0-1)"}
        },
        "required": ["value", "confidence"]
    }
    if include_reasoning:
        schema["properties"]["reasoning"] = {"type": "string", "description": "Brief explanation"}
        schema["required"].append("reasoning")
    return schema


def get_score_response_schema(min_value: float, max_value: float, interval: Optional[float], include_reasoning: bool) -> Dict[str, Any]:
    """Get response schema for score operation."""
    value_schema = {
        "type": "number",
        "minimum": min_value,
        "maximum": max_value,
        "description": f"Score from {min_value} to {max_value}"
    }
    if interval:
        value_schema["description"] += f" (in increments of {interval})"

    schema = {
        "type": "object",
        "properties": {
            "value": value_schema,
            "confidence": {"type": "number", "minimum": 0, "maximum": 1, "description": "Confidence based on evidence quality (0-1)"}
        },
        "required": ["value", "confidence"]
    }
    if include_reasoning:
        schema["properties"]["reasoning"] = {"type": "string", "description": "Brief explanation"}
        schema["required"].append("reasoning")
    return schema


def get_extract_response_schema(output_type: ExtractOutputType, enum_values: Optional[List[str]], include_reasoning: bool) -> Dict[str, Any]:
    """Get response schema for extract operation."""
    # Build value schema based on output type
    if output_type == "text":
        value_schema = {"type": ["string", "null"], "description": "Extracted text value (null if not present)"}
    elif output_type == "number":
        value_schema = {"type": ["number", "null"], "description": "Extracted numeric value (null if not present)"}
    elif output_type == "boolean":
        value_schema = {"type": ["boolean", "null"], "description": "Extracted boolean value (null if not present)"}
    elif output_type == "enum":
        if not enum_values:
            raise ValueError("enum_values required when output_type is 'enum'")
        value_schema = {"type": ["string", "null"], "enum": enum_values + [None], "description": f"One of: {', '.join(enum_values)} (null if not present)"}
    else:
        value_schema = {"type": ["string", "null"], "description": "Extracted value (null if not present)"}

    schema = {
        "type": "object",
        "properties": {
            "value": value_schema,
            "confidence": {"type": "number", "minimum": 0, "maximum": 1, "description": "Confidence based on evidence quality (0-1)"}
        },
        "required": ["value", "confidence"]
    }
    if include_reasoning:
        schema["properties"]["reasoning"] = {"type": "string", "description": "Brief explanation"}
        schema["required"].append("reasoning")
    return schema


def get_extract_fields_response_schema(schema: Dict[str, Any], include_reasoning: bool) -> Dict[str, Any]:
    """
    Get response schema for extract_fields operation.
    Wraps the user's schema and adds confidence/reasoning fields.
    """
    # Clone the schema and add our metadata fields
    response_schema = {
        "type": "object",
        "properties": {
            "fields": schema,  # User's schema for the extracted fields
            "confidence": {"type": "number", "minimum": 0, "maximum": 1, "description": "Overall confidence based on evidence quality (0-1)"}
        },
        "required": ["fields", "confidence"]
    }
    if include_reasoning:
        response_schema["properties"]["reasoning"] = {"type": "string", "description": "Brief explanation of the extraction"}
        response_schema["required"].append("reasoning")
    return response_schema


# =============================================================================
# AI Evaluation Service
# =============================================================================

class AIEvaluationService:
    """
    Unified service for LLM-powered evaluation of data items.

    Operations:
    - filter(): Yes/No classification (boolean)
    - score(): Numeric rating with configurable range
    - extract(): Single value extraction (any type)
    - extract_fields(): Multi-field extraction (schema-based)

    All operations have batch variants for parallel processing.
    """

    def __init__(self):
        """Initialize the AI evaluation service."""
        self._prompt_callers: Dict[str, BasePromptCaller] = {}

    # =========================================================================
    # Helper Methods
    # =========================================================================

    def _get_item_id(self, item: Dict[str, Any]) -> str:
        """
        Determine item ID by checking common ID fields.
        Checks: id, pmid, nct_id, then falls back to 'unknown'.
        """
        return str(item.get("id") or item.get("pmid") or item.get("nct_id") or "unknown")

    def _format_item_for_prompt(self, item: Dict[str, Any]) -> str:
        """
        Format an item as readable text for the prompt.
        Excludes empty/null values for cleaner prompts.
        """
        lines = []
        for key, value in item.items():
            if value is not None and value != "":
                # Handle lists (like authors)
                if isinstance(value, list):
                    value = ", ".join(str(v) for v in value)
                lines.append(f"{key}: {value}")
        return "\n".join(lines)

    def _build_user_message(self, item_text: str, instruction: str) -> "ChatMessage":
        """Build a ChatMessage for the LLM call."""
        from schemas.llm import ChatMessage, MessageRole
        return ChatMessage(
            id="evaluation",
            chat_id="evaluation",
            role=MessageRole.USER,
            content=f"## Source Data\n{item_text}\n\n## Instruction\n{instruction}",
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )

    def _get_model_config(self) -> Dict[str, Any]:
        """Get LLM model configuration for evaluation tasks."""
        return get_task_config("extraction", "default")

    def _create_prompt_caller(self, response_schema: Dict[str, Any], system_message: str) -> BasePromptCaller:
        """Create a BasePromptCaller with the given schema and system message."""
        model_config = self._get_model_config()
        return BasePromptCaller(
            response_model=response_schema,
            system_message=system_message,
            messages_placeholder=True,
            model=model_config["model"],
            temperature=model_config.get("temperature", 0.0),
            reasoning_effort=model_config.get("reasoning_effort") if supports_reasoning_effort(model_config["model"]) else None
        )

    async def _call_llm(self, prompt_caller: BasePromptCaller, user_message: "ChatMessage") -> Dict[str, Any]:
        """
        Call the LLM and return the response as a dict.
        Handles various response formats from BasePromptCaller.
        """
        response = await prompt_caller.invoke(
            messages=[user_message],
            return_usage=False,
            log_prompt=True
        )

        # Convert response to dict
        if hasattr(response, 'model_dump'):
            return response.model_dump()
        elif hasattr(response, 'dict'):
            return response.dict()
        else:
            return dict(response)

    # =========================================================================
    # Filter (boolean output)
    # =========================================================================

    async def filter(
        self,
        item: Dict[str, Any],
        criteria: str,
        include_reasoning: bool = True
    ) -> EvaluationResult:
        """
        Evaluate whether an item meets criteria (yes/no).

        Args:
            item: Source data to evaluate (as dict)
            criteria: Natural language criteria to evaluate against
            include_reasoning: Whether to include explanation in result

        Returns:
            EvaluationResult with boolean value
        """
        item_id = self._get_item_id(item)

        try:
            # Get appropriate system message and schema
            system_message = SYSTEM_MESSAGE_FILTER if include_reasoning else SYSTEM_MESSAGE_FILTER_NO_REASONING
            response_schema = get_filter_response_schema(include_reasoning)

            # Create prompt caller and build message
            prompt_caller = self._create_prompt_caller(response_schema, system_message)
            item_text = self._format_item_for_prompt(item)
            user_message = self._build_user_message(item_text, criteria)

            # Call LLM
            result = await self._call_llm(prompt_caller, user_message)

            return EvaluationResult(
                item_id=item_id,
                value=result.get("value"),
                confidence=result.get("confidence", 0.0),
                reasoning=result.get("reasoning") if include_reasoning else None
            )

        except Exception as e:
            return EvaluationResult(
                item_id=item_id,
                value=None,
                confidence=0.0,
                reasoning=None,
                error=str(e)
            )

    async def filter_batch(
        self,
        items: List[Dict[str, Any]],
        criteria: str,
        include_reasoning: bool = True,
        max_concurrent: int = 50
    ) -> List[EvaluationResult]:
        """
        Filter multiple items in parallel.

        Args:
            items: List of source data items to evaluate
            criteria: Natural language criteria (same for all items)
            include_reasoning: Whether to include explanation in results
            max_concurrent: Maximum concurrent LLM calls (default: 50)

        Returns:
            List of EvaluationResult objects in same order as input items
        """
        if not items:
            return []

        # Create semaphore to limit concurrent LLM calls
        semaphore = asyncio.Semaphore(max_concurrent)

        async def filter_one(item: Dict[str, Any]) -> EvaluationResult:
            async with semaphore:
                return await self.filter(item, criteria, include_reasoning)

        # Execute all filters in parallel
        results = await asyncio.gather(
            *[filter_one(item) for item in items],
            return_exceptions=True
        )

        # Handle any exceptions that were returned
        final_results = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                item_id = self._get_item_id(items[i])
                final_results.append(EvaluationResult(
                    item_id=item_id,
                    value=None,
                    confidence=0.0,
                    reasoning=None,
                    error=str(result)
                ))
            else:
                final_results.append(result)

        return final_results

    # =========================================================================
    # Score (number output with configurable range)
    # =========================================================================

    async def score(
        self,
        item: Dict[str, Any],
        criteria: str,
        min_value: float = 0,
        max_value: float = 1,
        interval: Optional[float] = None,
        include_reasoning: bool = True
    ) -> EvaluationResult:
        """
        Score an item on a numeric scale based on criteria.

        Args:
            item: Source data to evaluate (as dict)
            criteria: Natural language scoring criteria
            min_value: Lower bound of score range (default: 0)
            max_value: Upper bound of score range (default: 1)
            interval: Optional step size (e.g., 0.5 for discrete steps)
            include_reasoning: Whether to include explanation in result

        Returns:
            EvaluationResult with float value in specified range
        """
        item_id = self._get_item_id(item)

        try:
            # Get appropriate system message and schema
            system_message = SYSTEM_MESSAGE_SCORE if include_reasoning else SYSTEM_MESSAGE_SCORE_NO_REASONING
            response_schema = get_score_response_schema(min_value, max_value, interval, include_reasoning)

            # Build instruction with range info
            range_instruction = f"Score from {min_value} to {max_value}"
            if interval:
                range_instruction += f" (use increments of {interval})"
            full_instruction = f"{criteria}\n\n{range_instruction}"

            # Create prompt caller and build message
            prompt_caller = self._create_prompt_caller(response_schema, system_message)
            item_text = self._format_item_for_prompt(item)
            user_message = self._build_user_message(item_text, full_instruction)

            # Call LLM
            result = await self._call_llm(prompt_caller, user_message)

            return EvaluationResult(
                item_id=item_id,
                value=result.get("value"),
                confidence=result.get("confidence", 0.0),
                reasoning=result.get("reasoning") if include_reasoning else None
            )

        except Exception as e:
            return EvaluationResult(
                item_id=item_id,
                value=None,
                confidence=0.0,
                reasoning=None,
                error=str(e)
            )

    async def score_batch(
        self,
        items: List[Dict[str, Any]],
        criteria: str,
        min_value: float = 0,
        max_value: float = 1,
        interval: Optional[float] = None,
        include_reasoning: bool = True,
        max_concurrent: int = 50
    ) -> List[EvaluationResult]:
        """
        Score multiple items in parallel.

        Args:
            items: List of source data items to score
            criteria: Natural language scoring criteria (same for all items)
            min_value: Lower bound of score range (default: 0)
            max_value: Upper bound of score range (default: 1)
            interval: Optional step size (e.g., 0.5 for discrete steps)
            include_reasoning: Whether to include explanation in results
            max_concurrent: Maximum concurrent LLM calls (default: 50)

        Returns:
            List of EvaluationResult objects in same order as input items
        """
        if not items:
            return []

        # Create semaphore to limit concurrent LLM calls
        semaphore = asyncio.Semaphore(max_concurrent)

        async def score_one(item: Dict[str, Any]) -> EvaluationResult:
            async with semaphore:
                return await self.score(item, criteria, min_value, max_value, interval, include_reasoning)

        # Execute all scores in parallel
        results = await asyncio.gather(
            *[score_one(item) for item in items],
            return_exceptions=True
        )

        # Handle any exceptions that were returned
        final_results = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                item_id = self._get_item_id(items[i])
                final_results.append(EvaluationResult(
                    item_id=item_id,
                    value=None,
                    confidence=0.0,
                    reasoning=None,
                    error=str(result)
                ))
            else:
                final_results.append(result)

        return final_results

    # =========================================================================
    # Extract (single value, any type)
    # =========================================================================

    async def extract(
        self,
        item: Dict[str, Any],
        instruction: str,
        output_type: ExtractOutputType = "text",
        enum_values: Optional[List[str]] = None,
        include_reasoning: bool = True
    ) -> EvaluationResult:
        """
        Extract a single value of any type from an item.

        Args:
            item: Source data to extract from (as dict)
            instruction: Natural language instruction describing what to extract
            output_type: Expected type - "text", "number", "boolean", or "enum"
            enum_values: Required list of valid values if output_type is "enum"
            include_reasoning: Whether to include explanation in result

        Returns:
            EvaluationResult with value of specified type (or None if not present)
        """
        item_id = self._get_item_id(item)

        try:
            # Validate enum_values if needed
            if output_type == "enum" and not enum_values:
                raise ValueError("enum_values required when output_type is 'enum'")

            # Get appropriate system message and schema
            system_message = SYSTEM_MESSAGE_EXTRACT if include_reasoning else SYSTEM_MESSAGE_EXTRACT_NO_REASONING
            response_schema = get_extract_response_schema(output_type, enum_values, include_reasoning)

            # Build instruction with type info
            type_hint = ""
            if output_type == "number":
                type_hint = "\n\nRespond with a numeric value."
            elif output_type == "boolean":
                type_hint = "\n\nRespond with true or false."
            elif output_type == "enum":
                type_hint = f"\n\nRespond with one of: {', '.join(enum_values)}"
            full_instruction = instruction + type_hint

            # Create prompt caller and build message
            prompt_caller = self._create_prompt_caller(response_schema, system_message)
            item_text = self._format_item_for_prompt(item)
            user_message = self._build_user_message(item_text, full_instruction)

            # Call LLM
            result = await self._call_llm(prompt_caller, user_message)

            return EvaluationResult(
                item_id=item_id,
                value=result.get("value"),
                confidence=result.get("confidence", 0.0),
                reasoning=result.get("reasoning") if include_reasoning else None
            )

        except Exception as e:
            return EvaluationResult(
                item_id=item_id,
                value=None,
                confidence=0.0,
                reasoning=None,
                error=str(e)
            )

    async def extract_batch(
        self,
        items: List[Dict[str, Any]],
        instruction: str,
        output_type: ExtractOutputType = "text",
        enum_values: Optional[List[str]] = None,
        include_reasoning: bool = True,
        max_concurrent: int = 50
    ) -> List[EvaluationResult]:
        """
        Extract single value from multiple items in parallel.

        Args:
            items: List of source data items to extract from
            instruction: Natural language instruction (same for all items)
            output_type: Expected type - "text", "number", "boolean", or "enum"
            enum_values: Required list of valid values if output_type is "enum"
            include_reasoning: Whether to include explanation in results
            max_concurrent: Maximum concurrent LLM calls (default: 50)

        Returns:
            List of EvaluationResult objects in same order as input items
        """
        if not items:
            return []

        # Create semaphore to limit concurrent LLM calls
        semaphore = asyncio.Semaphore(max_concurrent)

        async def extract_one(item: Dict[str, Any]) -> EvaluationResult:
            async with semaphore:
                return await self.extract(item, instruction, output_type, enum_values, include_reasoning)

        # Execute all extractions in parallel
        results = await asyncio.gather(
            *[extract_one(item) for item in items],
            return_exceptions=True
        )

        # Handle any exceptions that were returned
        final_results = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                item_id = self._get_item_id(items[i])
                final_results.append(EvaluationResult(
                    item_id=item_id,
                    value=None,
                    confidence=0.0,
                    reasoning=None,
                    error=str(result)
                ))
            else:
                final_results.append(result)

        return final_results

    # =========================================================================
    # Extract Fields (schema-based, multiple values)
    # =========================================================================

    async def extract_fields(
        self,
        item: Dict[str, Any],
        schema: Dict[str, Any],
        instructions: str,
        field_instructions: Optional[Dict[str, str]] = None,
        include_reasoning: bool = True
    ) -> FieldsResult:
        """
        Extract multiple fields from an item according to a schema.

        Args:
            item: Source data to extract from (as dict)
            schema: JSON schema defining the output structure
            instructions: Overall context/instructions for the extraction
            field_instructions: Optional per-field instructions
                               e.g., {"study_type": "Classify as RCT, cohort, etc."}
            include_reasoning: Whether to include overall reasoning about the extraction

        Returns:
            FieldsResult with extracted fields matching the schema
        """
        item_id = self._get_item_id(item)

        try:
            # Get appropriate system message and schema
            system_message = SYSTEM_MESSAGE_EXTRACT_FIELDS if include_reasoning else SYSTEM_MESSAGE_EXTRACT_FIELDS_NO_REASONING
            response_schema = get_extract_fields_response_schema(schema, include_reasoning)

            # Build instruction with field-level guidance if provided
            full_instruction = f"## Overall Instructions\n{instructions}"
            if field_instructions:
                field_lines = [f"- {field}: {instr}" for field, instr in field_instructions.items()]
                full_instruction += f"\n\n## Field Instructions\n" + "\n".join(field_lines)

            # Create prompt caller and build message
            prompt_caller = self._create_prompt_caller(response_schema, system_message)
            item_text = self._format_item_for_prompt(item)
            user_message = self._build_user_message(item_text, full_instruction)

            # Call LLM
            result = await self._call_llm(prompt_caller, user_message)

            return FieldsResult(
                item_id=item_id,
                fields=result.get("fields"),
                confidence=result.get("confidence", 0.0),
                reasoning=result.get("reasoning") if include_reasoning else None
            )

        except Exception as e:
            return FieldsResult(
                item_id=item_id,
                fields=None,
                confidence=0.0,
                reasoning=None,
                error=str(e)
            )

    async def extract_fields_batch(
        self,
        items: List[Dict[str, Any]],
        schema: Dict[str, Any],
        instructions: str,
        field_instructions: Optional[Dict[str, str]] = None,
        include_reasoning: bool = True,
        max_concurrent: int = 50
    ) -> List[FieldsResult]:
        """
        Extract multiple fields from multiple items in parallel.

        Args:
            items: List of source data items to extract from
            schema: JSON schema defining the output structure
            instructions: Overall context/instructions (same for all items)
            field_instructions: Optional per-field instructions
            include_reasoning: Whether to include overall reasoning
            max_concurrent: Maximum concurrent LLM calls (default: 50)

        Returns:
            List of FieldsResult objects in same order as input items
        """
        if not items:
            return []

        # Create semaphore to limit concurrent LLM calls
        semaphore = asyncio.Semaphore(max_concurrent)

        async def extract_one(item: Dict[str, Any]) -> FieldsResult:
            async with semaphore:
                return await self.extract_fields(item, schema, instructions, field_instructions, include_reasoning)

        # Execute all extractions in parallel
        results = await asyncio.gather(
            *[extract_one(item) for item in items],
            return_exceptions=True
        )

        # Handle any exceptions that were returned
        final_results = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                item_id = self._get_item_id(items[i])
                final_results.append(FieldsResult(
                    item_id=item_id,
                    fields=None,
                    confidence=0.0,
                    reasoning=None,
                    error=str(result)
                ))
            else:
                final_results.append(result)

        return final_results


# =============================================================================
# Singleton Instance
# =============================================================================

_ai_evaluation_service: Optional[AIEvaluationService] = None


def get_ai_evaluation_service() -> AIEvaluationService:
    """Get the singleton AI evaluation service instance."""
    global _ai_evaluation_service
    if _ai_evaluation_service is None:
        _ai_evaluation_service = AIEvaluationService()
    return _ai_evaluation_service
