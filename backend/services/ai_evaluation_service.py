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
import logging
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

from agents.prompts.base_prompt_caller import BasePromptCaller
from agents.prompts.llm import call_llm, ModelConfig, LLMOptions, LLMResult
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

    def _get_item_id(self, item: Dict[str, Any], id_field: str) -> str:
        """Extract item ID from the item dict using the specified field."""
        return str(item.get(id_field, "unknown"))

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

    def _populate_template(self, template: str, item: Dict[str, Any]) -> str:
        """
        Populate a template string with item field values.

        Replaces {field_name} placeholders with corresponding item values.
        Unmatched placeholders are left as-is.

        Args:
            template: String with {field_name} placeholders
            item: Dict with field values

        Returns:
            Template with placeholders replaced by item values
        """
        result = template
        for key, value in item.items():
            if value is not None:
                # Handle lists (like authors)
                if isinstance(value, list):
                    value = ", ".join(str(v) for v in value)
                # Replace {key} with value
                result = result.replace(f"{{{key}}}", str(value))
        return result

    def _build_user_message(
        self,
        instruction: str,
        item: Optional[Dict[str, Any]] = None,
        include_source_data: bool = False
    ) -> "ChatMessage":
        """
        Build a ChatMessage for the LLM call.

        Args:
            instruction: The instruction/criteria (may contain {field} templates)
            item: Item data for template population and optional source data
            include_source_data: If True, include full item data in prompt

        Returns:
            ChatMessage with populated content
        """
        from schemas.llm import ChatMessage, MessageRole

        # Populate any template placeholders in the instruction
        if item:
            instruction = self._populate_template(instruction, item)

        # Build content based on whether to include source data
        if include_source_data and item:
            item_text = self._format_item_for_prompt(item)
            content = f"## Source Data\n{item_text}\n\n## Instruction\n{instruction}"
        else:
            content = instruction

        return ChatMessage(
            id="evaluation",
            chat_id="evaluation",
            role=MessageRole.USER,
            content=content,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )

    def _get_model_config(self) -> Dict[str, Any]:
        """Get LLM model configuration for evaluation tasks."""
        return get_task_config("extraction", "default")

    def _create_prompt_caller(
        self,
        response_schema: Dict[str, Any],
        system_message: str,
        model_override: Optional[str] = None,
        temperature_override: Optional[float] = None,
        reasoning_effort_override: Optional[str] = None
    ) -> BasePromptCaller:
        """Create a BasePromptCaller with the given schema and system message.

        Args:
            response_schema: JSON schema for the response
            system_message: System message for the LLM
            model_override: Optional model to use instead of default
            temperature_override: Optional temperature to use instead of default
            reasoning_effort_override: Optional reasoning effort (for reasoning models)
        """
        default_config = self._get_model_config()

        # Use overrides if provided, otherwise fall back to defaults
        model = model_override or default_config["model"]
        temperature = temperature_override if temperature_override is not None else default_config.get("temperature", 0.0)
        reasoning_effort = reasoning_effort_override or default_config.get("reasoning_effort")

        return BasePromptCaller(
            response_model=response_schema,
            system_message=system_message,
            messages_placeholder=True,
            model=model,
            temperature=temperature,
            reasoning_effort=reasoning_effort if supports_reasoning_effort(model) else None
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
        id_field: str,
        include_reasoning: bool = True,
        include_source_data: bool = False
    ) -> EvaluationResult:
        """
        Evaluate whether an item meets criteria (yes/no).

        Args:
            item: Source data to evaluate (as dict)
            criteria: Natural language criteria (may contain {field} templates)
            id_field: Name of the field containing the item's unique identifier
            include_reasoning: Whether to include explanation in result
            include_source_data: If True, include all item fields in prompt context

        Returns:
            EvaluationResult with boolean value
        """
        item_id = self._get_item_id(item, id_field)
        logger.debug(f"filter - item_id={item_id}")

        try:
            # Get appropriate system message and schema
            system_message = SYSTEM_MESSAGE_FILTER if include_reasoning else SYSTEM_MESSAGE_FILTER_NO_REASONING
            response_schema = get_filter_response_schema(include_reasoning)

            # Create prompt caller and build message
            prompt_caller = self._create_prompt_caller(response_schema, system_message)
            user_message = self._build_user_message(criteria, item, include_source_data)

            # Call LLM
            result = await self._call_llm(prompt_caller, user_message)

            logger.debug(f"filter complete - item_id={item_id}, value={result.get('value')}, confidence={result.get('confidence', 0.0):.2f}")
            return EvaluationResult(
                item_id=item_id,
                value=result.get("value"),
                confidence=result.get("confidence", 0.0),
                reasoning=result.get("reasoning") if include_reasoning else None
            )

        except Exception as e:
            logger.error(f"filter failed - item_id={item_id}: {e}", exc_info=True)
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
        id_field: str,
        include_reasoning: bool = True,
        include_source_data: bool = False,
        max_concurrent: int = 50,
        on_progress: Optional[callable] = None
    ) -> List[EvaluationResult]:
        """
        Filter multiple items in parallel.

        Args:
            items: List of source data items to evaluate
            criteria: Natural language criteria (may contain {field} templates)
            id_field: Name of the field containing each item's unique identifier
            include_reasoning: Whether to include explanation in results
            include_source_data: If True, include all item fields in prompt context
            max_concurrent: Maximum concurrent LLM calls (default: 50)
            on_progress: Optional callback(completed, total) called after each item completes

        Returns:
            List of EvaluationResult objects in same order as input items
        """
        if not items:
            return []

        logger.info(f"filter_batch - items={len(items)}, max_concurrent={max_concurrent}")

        # Create semaphore to limit concurrent LLM calls
        semaphore = asyncio.Semaphore(max_concurrent)

        async def filter_one(idx: int, item: Dict[str, Any]) -> tuple:
            async with semaphore:
                result = await self.filter(item, criteria, id_field, include_reasoning, include_source_data)
                return idx, result

        # Execute with as_completed for progress reporting
        tasks = [filter_one(i, item) for i, item in enumerate(items)]
        results_by_idx = {}
        completed = 0
        errors = 0

        for coro in asyncio.as_completed(tasks):
            try:
                idx, result = await coro
                results_by_idx[idx] = result
            except Exception as e:
                # Find which task failed (we can't know for sure, but log it)
                logger.error(f"filter_batch item failed: {e}", exc_info=False)
                errors += 1

            completed += 1
            if on_progress:
                try:
                    await on_progress(completed, len(items))
                except Exception as cb_err:
                    logger.warning(f"Progress callback failed: {cb_err}")

        # Build final results in original order
        final_results = []
        for i in range(len(items)):
            if i in results_by_idx:
                final_results.append(results_by_idx[i])
            else:
                item_id = self._get_item_id(items[i], id_field)
                final_results.append(EvaluationResult(
                    item_id=item_id,
                    value=None,
                    confidence=0.0,
                    reasoning=None,
                    error="Processing failed"
                ))

        passed = sum(1 for r in final_results if r.value is True)
        logger.info(f"filter_batch complete - items={len(items)}, passed={passed}, errors={errors}")
        return final_results

    # =========================================================================
    # Score (number output with configurable range)
    # =========================================================================

    # System message for scoring operations
    SCORE_SYSTEM_MESSAGE = """You are a scoring function that rates data on a numeric scale.

Given source data and scoring criteria, provide a score within the specified range.
You must provide a score even when uncertain—use low confidence to signal unreliability.

## Response Format
- value: Your score (within the specified range)
- confidence: Your confidence based on evidence quality (0.0-1.0)
- reasoning: Brief explanation of your score

## Confidence Calibration
- 0.9–1.0: Explicit statement in source text
- 0.7–0.89: Strong inference with clear supporting context
- 0.4–0.69: Weak inference or ambiguous evidence
- Below 0.4: Insufficient evidence"""

    SCORE_SYSTEM_MESSAGE_NO_REASONING = """You are a scoring function that rates data on a numeric scale.

Given source data and scoring criteria, provide a score within the specified range.
You must provide a score even when uncertain—use low confidence to signal unreliability.

## Response Format
- value: Your score (within the specified range)
- confidence: Your confidence based on evidence quality (0.0-1.0)

## Confidence Calibration
- 0.9–1.0: Explicit statement in source text
- 0.7–0.89: Strong inference with clear supporting context
- 0.4–0.69: Weak inference or ambiguous evidence
- Below 0.4: Insufficient evidence"""

    async def score(
        self,
        items: Union[Dict[str, Any], List[Dict[str, Any]]],
        user_message: str,
        criteria: str,
        min_value: float = 0,
        max_value: float = 1,
        interval: Optional[float] = None,
        include_reasoning: bool = True,
        model_config: Optional[ModelConfig] = None,
        options: Optional[LLMOptions] = None,
    ) -> Union[LLMResult, List[LLMResult]]:
        """
        Score item(s) on a numeric scale based on criteria.

        Args:
            items: Single item dict or list of item dicts to evaluate
            user_message: Template for the user message with {field} placeholders.
                          Should include {criteria}, {min_value}, {max_value} and item fields.
            criteria: Natural language scoring criteria text
            min_value: Lower bound of score range (default: 0)
            max_value: Upper bound of score range (default: 1)
            interval: Optional step size (e.g., 0.5 for discrete steps)
            include_reasoning: Whether to include explanation in result
            model_config: Model configuration (model, temperature, max_tokens, reasoning_effort)
            options: Call options (max_concurrent, on_progress, log_prompt)

        Returns:
            Single item: LLMResult with data containing {value, confidence, reasoning?}
            List of items: List[LLMResult] in same order as input

        Example:
            user_msg = '''## Article
            Title: {title}
            Abstract: {abstract}

            ## Criteria
            {criteria}

            Score from {min_value} to {max_value}.'''

            result = await service.score(
                items={"id": "1", "title": "...", "abstract": "..."},
                user_message=user_msg,
                criteria="Rate relevance to cancer research",
            )
            if result.ok:
                score = result.data["value"]
        """
        # Determine if single or batch
        is_single = isinstance(items, dict)
        items_list = [items] if is_single else items

        if not items_list:
            return [] if not is_single else LLMResult(input={}, data=None, error="No items provided")

        # Get system message and response schema
        system_message = self.SCORE_SYSTEM_MESSAGE if include_reasoning else self.SCORE_SYSTEM_MESSAGE_NO_REASONING
        response_schema = get_score_response_schema(min_value, max_value, interval, include_reasoning)

        # Build values list for call_llm
        # criteria, min_value, max_value come FIRST so that any {field}
        # placeholders in criteria get substituted when item fields are processed
        values_list = []
        for item in items_list:
            values = {
                "criteria": criteria,
                "min_value": min_value,
                "max_value": max_value,
                **item,  # Item fields LAST so they substitute into criteria
            }
            values_list.append(values)

        # Apply default model config if not provided
        if model_config is None:
            default_cfg = self._get_model_config()
            model_config = ModelConfig(
                model=default_cfg.get("model", "gpt-4.1"),
                temperature=default_cfg.get("temperature", 0.0),
                reasoning_effort=default_cfg.get("reasoning_effort"),
            )

        # Call LLM
        logger.info(f"score - items={len(items_list)}, range=[{min_value}, {max_value}], model={model_config.model}")

        results = await call_llm(
            system_message=system_message,
            user_message=user_message,
            values=values_list if not is_single else values_list[0],
            model_config=model_config,
            response_schema=response_schema,
            options=options,
        )

        # Log summary
        if is_single:
            result = results
            if result.ok:
                logger.debug(f"score complete - value={result.data.get('value')}, confidence={result.data.get('confidence', 0.0):.2f}")
            else:
                logger.debug(f"score failed - error={result.error}")
        else:
            scored = [r.data.get("value") for r in results if r.ok and r.data]
            avg_score = sum(scored) / max(1, len(scored)) if scored else 0
            errors = sum(1 for r in results if not r.ok)
            logger.info(f"score complete - items={len(items_list)}, avg_score={avg_score:.2f}, errors={errors}")

        return results

    # =========================================================================
    # Extract (single value, any type)
    # =========================================================================

    async def extract(
        self,
        item: Dict[str, Any],
        instruction: str,
        id_field: str,
        output_type: ExtractOutputType = "text",
        enum_values: Optional[List[str]] = None,
        include_reasoning: bool = True,
        include_source_data: bool = False
    ) -> EvaluationResult:
        """
        Extract a single value of any type from an item.

        Args:
            item: Source data to extract from (as dict)
            instruction: Natural language instruction (may contain {field} templates)
            id_field: Name of the field containing the item's unique identifier
            output_type: Expected type - "text", "number", "boolean", or "enum"
            enum_values: Required list of valid values if output_type is "enum"
            include_reasoning: Whether to include explanation in result
            include_source_data: If True, include all item fields in prompt context

        Returns:
            EvaluationResult with value of specified type (or None if not present)
        """
        item_id = self._get_item_id(item, id_field)
        logger.debug(f"extract - item_id={item_id}, output_type={output_type}")

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
            user_message = self._build_user_message(full_instruction, item, include_source_data)

            # Call LLM
            result = await self._call_llm(prompt_caller, user_message)

            logger.debug(f"extract complete - item_id={item_id}, has_value={result.get('value') is not None}, confidence={result.get('confidence', 0.0):.2f}")
            return EvaluationResult(
                item_id=item_id,
                value=result.get("value"),
                confidence=result.get("confidence", 0.0),
                reasoning=result.get("reasoning") if include_reasoning else None
            )

        except Exception as e:
            logger.error(f"extract failed - item_id={item_id}: {e}", exc_info=True)
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
        id_field: str,
        output_type: ExtractOutputType = "text",
        enum_values: Optional[List[str]] = None,
        include_reasoning: bool = True,
        include_source_data: bool = False,
        max_concurrent: int = 50
    ) -> List[EvaluationResult]:
        """
        Extract single value from multiple items in parallel.

        Args:
            items: List of source data items to extract from
            instruction: Natural language instruction (may contain {field} templates)
            id_field: Name of the field containing each item's unique identifier
            output_type: Expected type - "text", "number", "boolean", or "enum"
            enum_values: Required list of valid values if output_type is "enum"
            include_reasoning: Whether to include explanation in results
            include_source_data: If True, include all item fields in prompt context
            max_concurrent: Maximum concurrent LLM calls (default: 50)

        Returns:
            List of EvaluationResult objects in same order as input items
        """
        if not items:
            return []

        logger.info(f"extract_batch - items={len(items)}, output_type={output_type}, max_concurrent={max_concurrent}")

        # Create semaphore to limit concurrent LLM calls
        semaphore = asyncio.Semaphore(max_concurrent)

        async def extract_one(item: Dict[str, Any]) -> EvaluationResult:
            async with semaphore:
                return await self.extract(item, instruction, id_field, output_type, enum_values, include_reasoning, include_source_data)

        # Execute all extractions in parallel
        results = await asyncio.gather(
            *[extract_one(item) for item in items],
            return_exceptions=True
        )

        # Handle any exceptions that were returned
        final_results = []
        errors = 0
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                item_id = self._get_item_id(items[i], id_field)
                logger.error(f"extract_batch item failed - item_id={item_id}: {result}", exc_info=False)
                errors += 1
                final_results.append(EvaluationResult(
                    item_id=item_id,
                    value=None,
                    confidence=0.0,
                    reasoning=None,
                    error=str(result)
                ))
            else:
                final_results.append(result)

        extracted = sum(1 for r in final_results if r.value is not None)
        logger.info(f"extract_batch complete - items={len(items)}, extracted={extracted}, errors={errors}")
        return final_results

    # =========================================================================
    # Extract Fields (schema-based, multiple values)
    # =========================================================================

    async def extract_fields(
        self,
        item: Dict[str, Any],
        schema: Dict[str, Any],
        instructions: str,
        id_field: str,
        field_instructions: Optional[Dict[str, str]] = None,
        include_reasoning: bool = True,
        include_source_data: bool = False
    ) -> FieldsResult:
        """
        Extract multiple fields from an item according to a schema.

        Args:
            item: Source data to extract from (as dict)
            schema: JSON schema defining the output structure
            instructions: Overall context/instructions (may contain {field} templates)
            id_field: Name of the field containing the item's unique identifier
            field_instructions: Optional per-field instructions
                               e.g., {"study_type": "Classify as RCT, cohort, etc."}
            include_reasoning: Whether to include overall reasoning about the extraction
            include_source_data: If True, include all item fields in prompt context

        Returns:
            FieldsResult with extracted fields matching the schema
        """
        item_id = self._get_item_id(item, id_field)
        logger.debug(f"extract_fields - item_id={item_id}")

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
            user_message = self._build_user_message(full_instruction, item, include_source_data)

            # Call LLM
            result = await self._call_llm(prompt_caller, user_message)

            fields = result.get("fields")
            fields_count = len(fields) if fields else 0
            logger.debug(f"extract_fields complete - item_id={item_id}, fields_extracted={fields_count}, confidence={result.get('confidence', 0.0):.2f}")
            return FieldsResult(
                item_id=item_id,
                fields=fields,
                confidence=result.get("confidence", 0.0),
                reasoning=result.get("reasoning") if include_reasoning else None
            )

        except Exception as e:
            logger.error(f"extract_fields failed - item_id={item_id}: {e}", exc_info=True)
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
        id_field: str,
        field_instructions: Optional[Dict[str, str]] = None,
        include_reasoning: bool = True,
        include_source_data: bool = False,
        max_concurrent: int = 50
    ) -> List[FieldsResult]:
        """
        Extract multiple fields from multiple items in parallel.

        Args:
            items: List of source data items to extract from
            schema: JSON schema defining the output structure
            instructions: Overall context/instructions (may contain {field} templates)
            id_field: Name of the field containing each item's unique identifier
            field_instructions: Optional per-field instructions
            include_reasoning: Whether to include overall reasoning
            include_source_data: If True, include all item fields in prompt context
            max_concurrent: Maximum concurrent LLM calls (default: 50)

        Returns:
            List of FieldsResult objects in same order as input items
        """
        if not items:
            return []

        logger.info(f"extract_fields_batch - items={len(items)}, max_concurrent={max_concurrent}")

        # Create semaphore to limit concurrent LLM calls
        semaphore = asyncio.Semaphore(max_concurrent)

        async def extract_one(item: Dict[str, Any]) -> FieldsResult:
            async with semaphore:
                return await self.extract_fields(item, schema, instructions, id_field, field_instructions, include_reasoning, include_source_data)

        # Execute all extractions in parallel
        results = await asyncio.gather(
            *[extract_one(item) for item in items],
            return_exceptions=True
        )

        # Handle any exceptions that were returned
        final_results = []
        errors = 0
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                item_id = self._get_item_id(items[i], id_field)
                logger.error(f"extract_fields_batch item failed - item_id={item_id}: {result}", exc_info=False)
                errors += 1
                final_results.append(FieldsResult(
                    item_id=item_id,
                    fields=None,
                    confidence=0.0,
                    reasoning=None,
                    error=str(result)
                ))
            else:
                final_results.append(result)

        extracted = sum(1 for r in final_results if r.fields is not None)
        logger.info(f"extract_fields_batch complete - items={len(items)}, extracted={extracted}, errors={errors}")
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
