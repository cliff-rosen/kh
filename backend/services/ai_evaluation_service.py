"""
AI Evaluation Service

Unified service for all LLM-powered evaluation operations on data items.
Consolidates extraction and semantic filtering into a single, clean API.

Operations:
- filter(): Yes/No classification (boolean output)
- score(): Numeric rating with configurable range (float output)
- extract(): Single value extraction (any type)
- extract_fields(): Multi-field extraction (schema-based)

All operations support single and batch calls via call_llm unified interface.
"""

from typing import Dict, Any, List, Optional, Union, Literal
import logging

logger = logging.getLogger(__name__)

from agents.prompts.llm import call_llm, ModelConfig, LLMOptions, LLMResult
from config.llm_models import get_task_config


# =============================================================================
# Type Definitions
# =============================================================================

ExtractOutputType = Literal["text", "number", "boolean", "enum"]


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

Given source data and scoring criteria, provide a score within the specified range.
You must provide a score even when uncertain—use low confidence to signal unreliability.

## Response Format
- value: Your score (within the specified range)
- confidence: Your confidence based on evidence quality (0.0-1.0)
- reasoning: Brief explanation of your score
{CONFIDENCE_RUBRIC}"""

SYSTEM_MESSAGE_SCORE_NO_REASONING = f"""You are a scoring function that rates data on a numeric scale.

Given source data and scoring criteria, provide a score within the specified range.
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

    All operations support single and batch calls via call_llm unified interface.
    Caller provides user_message template, service provides system message.
    """

    def __init__(self):
        """Initialize the AI evaluation service."""
        pass

    def _get_default_model_config(self) -> ModelConfig:
        """Get default LLM model configuration for evaluation tasks."""
        default_cfg = get_task_config("extraction", "default")
        return ModelConfig(
            model=default_cfg.get("model", "gpt-4.1"),
            temperature=default_cfg.get("temperature", 0.0),
            reasoning_effort=default_cfg.get("reasoning_effort"),
        )

    # =========================================================================
    # Filter (boolean output)
    # =========================================================================

    async def filter(
        self,
        items: Union[Dict[str, Any], List[Dict[str, Any]]],
        user_message: str,
        criteria: str,
        include_reasoning: bool = True,
        model_config: Optional[ModelConfig] = None,
        options: Optional[LLMOptions] = None,
    ) -> Union[LLMResult, List[LLMResult]]:
        """
        Evaluate whether item(s) meet criteria (yes/no).

        Args:
            items: Single item dict or list of item dicts to evaluate
            user_message: Template for the user message with {field} placeholders.
                          Should include {criteria} and item fields.
            criteria: Natural language criteria text
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
            {criteria}'''

            result = await service.filter(
                items={"id": "1", "title": "...", "abstract": "..."},
                user_message=user_msg,
                criteria="Is this about cancer research?",
            )
            if result.ok:
                passed = result.data["value"]  # True or False
        """
        # Determine if single or batch
        is_single = isinstance(items, dict)
        items_list = [items] if is_single else items

        if not items_list:
            return [] if not is_single else LLMResult(input={}, data=None, error="No items provided")

        # Get system message and response schema
        system_message = SYSTEM_MESSAGE_FILTER if include_reasoning else SYSTEM_MESSAGE_FILTER_NO_REASONING
        response_schema = get_filter_response_schema(include_reasoning)

        # Build values list for call_llm
        # criteria comes FIRST so that any {field} placeholders in criteria get substituted
        values_list = []
        for item in items_list:
            values = {
                "criteria": criteria,
                **item,  # Item fields LAST so they substitute into criteria
            }
            values_list.append(values)

        # Apply default model config if not provided
        if model_config is None:
            model_config = self._get_default_model_config()

        # Call LLM
        logger.info(f"filter - items={len(items_list)}, model={model_config.model_id}")

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
                logger.debug(f"filter complete - value={result.data.get('value')}, confidence={result.data.get('confidence', 0.0):.2f}")
            else:
                logger.debug(f"filter failed - error={result.error}")
        else:
            passed = sum(1 for r in results if r.ok and r.data and r.data.get("value") is True)
            errors = sum(1 for r in results if not r.ok)
            logger.info(f"filter complete - items={len(items_list)}, passed={passed}, errors={errors}")

        return results

    # =========================================================================
    # Score (number output with configurable range)
    # =========================================================================

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
        system_message = SYSTEM_MESSAGE_SCORE if include_reasoning else SYSTEM_MESSAGE_SCORE_NO_REASONING
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
            model_config = self._get_default_model_config()

        # Call LLM
        logger.info(f"score - items={len(items_list)}, range=[{min_value}, {max_value}], model={model_config.model_id}")

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
        items: Union[Dict[str, Any], List[Dict[str, Any]]],
        user_message: str,
        instruction: str,
        output_type: ExtractOutputType = "text",
        enum_values: Optional[List[str]] = None,
        include_reasoning: bool = True,
        model_config: Optional[ModelConfig] = None,
        options: Optional[LLMOptions] = None,
    ) -> Union[LLMResult, List[LLMResult]]:
        """
        Extract a single value of any type from item(s).

        Args:
            items: Single item dict or list of item dicts to extract from
            user_message: Template for the user message with {field} placeholders.
                          Should include {instruction} and item fields.
            instruction: Natural language instruction text
            output_type: Expected type - "text", "number", "boolean", or "enum"
            enum_values: Required list of valid values if output_type is "enum"
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

            ## Instruction
            {instruction}'''

            result = await service.extract(
                items={"id": "1", "title": "...", "abstract": "..."},
                user_message=user_msg,
                instruction="Extract the primary disease studied",
                output_type="text",
            )
            if result.ok:
                disease = result.data["value"]
        """
        # Validate enum_values if needed
        if output_type == "enum" and not enum_values:
            raise ValueError("enum_values required when output_type is 'enum'")

        # Determine if single or batch
        is_single = isinstance(items, dict)
        items_list = [items] if is_single else items

        if not items_list:
            return [] if not is_single else LLMResult(input={}, data=None, error="No items provided")

        # Get system message and response schema
        system_message = SYSTEM_MESSAGE_EXTRACT if include_reasoning else SYSTEM_MESSAGE_EXTRACT_NO_REASONING
        response_schema = get_extract_response_schema(output_type, enum_values, include_reasoning)

        # Build type hint to include in instruction
        type_hint = ""
        if output_type == "number":
            type_hint = "\n\nRespond with a numeric value."
        elif output_type == "boolean":
            type_hint = "\n\nRespond with true or false."
        elif output_type == "enum":
            type_hint = f"\n\nRespond with one of: {', '.join(enum_values)}"
        full_instruction = instruction + type_hint

        # Build values list for call_llm
        values_list = []
        for item in items_list:
            values = {
                "instruction": full_instruction,
                **item,  # Item fields LAST so they substitute into instruction
            }
            values_list.append(values)

        # Apply default model config if not provided
        if model_config is None:
            model_config = self._get_default_model_config()

        # Call LLM
        logger.info(f"extract - items={len(items_list)}, output_type={output_type}, model={model_config.model_id}")

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
                logger.debug(f"extract complete - has_value={result.data.get('value') is not None}, confidence={result.data.get('confidence', 0.0):.2f}")
            else:
                logger.debug(f"extract failed - error={result.error}")
        else:
            extracted = sum(1 for r in results if r.ok and r.data and r.data.get("value") is not None)
            errors = sum(1 for r in results if not r.ok)
            logger.info(f"extract complete - items={len(items_list)}, extracted={extracted}, errors={errors}")

        return results

    # =========================================================================
    # Extract Fields (schema-based, multiple values)
    # =========================================================================

    async def extract_fields(
        self,
        items: Union[Dict[str, Any], List[Dict[str, Any]]],
        user_message: str,
        instructions: str,
        schema: Dict[str, Any],
        field_instructions: Optional[Dict[str, str]] = None,
        include_reasoning: bool = True,
        model_config: Optional[ModelConfig] = None,
        options: Optional[LLMOptions] = None,
    ) -> Union[LLMResult, List[LLMResult]]:
        """
        Extract multiple fields from item(s) according to a schema.

        Args:
            items: Single item dict or list of item dicts to extract from
            user_message: Template for the user message with {field} placeholders.
                          Should include {instructions} and item fields.
            instructions: Overall context/instructions text
            schema: JSON schema defining the output structure
            field_instructions: Optional per-field instructions
                               e.g., {"study_type": "Classify as RCT, cohort, etc."}
            include_reasoning: Whether to include overall reasoning about the extraction
            model_config: Model configuration (model, temperature, max_tokens, reasoning_effort)
            options: Call options (max_concurrent, on_progress, log_prompt)

        Returns:
            Single item: LLMResult with data containing {fields, confidence, reasoning?}
            List of items: List[LLMResult] in same order as input

        Example:
            user_msg = '''## Article
            Title: {title}
            Abstract: {abstract}

            ## Instructions
            {instructions}'''

            schema = {
                "type": "object",
                "properties": {
                    "study_type": {"type": "string"},
                    "sample_size": {"type": "integer"}
                }
            }

            result = await service.extract_fields(
                items={"id": "1", "title": "...", "abstract": "..."},
                user_message=user_msg,
                instructions="Extract study metadata",
                schema=schema,
            )
            if result.ok:
                fields = result.data["fields"]
        """
        # Determine if single or batch
        is_single = isinstance(items, dict)
        items_list = [items] if is_single else items

        if not items_list:
            return [] if not is_single else LLMResult(input={}, data=None, error="No items provided")

        # Get system message and response schema
        system_message = SYSTEM_MESSAGE_EXTRACT_FIELDS if include_reasoning else SYSTEM_MESSAGE_EXTRACT_FIELDS_NO_REASONING
        response_schema = get_extract_fields_response_schema(schema, include_reasoning)

        # Build full instructions with field-level guidance if provided
        full_instructions = instructions
        if field_instructions:
            field_lines = [f"- {field}: {instr}" for field, instr in field_instructions.items()]
            full_instructions += f"\n\n## Field Instructions\n" + "\n".join(field_lines)

        # Build values list for call_llm
        values_list = []
        for item in items_list:
            values = {
                "instructions": full_instructions,
                **item,  # Item fields LAST so they substitute into instructions
            }
            values_list.append(values)

        # Apply default model config if not provided
        if model_config is None:
            model_config = self._get_default_model_config()

        # Call LLM
        logger.info(f"extract_fields - items={len(items_list)}, model={model_config.model_id}")

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
                fields = result.data.get("fields")
                fields_count = len(fields) if fields else 0
                logger.debug(f"extract_fields complete - fields_extracted={fields_count}, confidence={result.data.get('confidence', 0.0):.2f}")
            else:
                logger.debug(f"extract_fields failed - error={result.error}")
        else:
            extracted = sum(1 for r in results if r.ok and r.data and r.data.get("fields") is not None)
            errors = sum(1 for r in results if not r.ok)
            logger.info(f"extract_fields complete - items={len(items_list)}, extracted={extracted}, errors={errors}")

        return results


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
