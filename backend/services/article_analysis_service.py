"""
Article Analysis Service - Stance analysis and article-level AI features.

This service handles:
- Stance analysis with configurable prompts using call_llm pattern
- Default prompts and slug definitions
- Integration with stream-level article_analysis_config
"""

import logging
from typing import Dict, List, Optional, Any

from agents.prompts.llm import call_llm, LLMResult
from schemas.llm import ModelConfig
from config.llm_models import get_task_config

logger = logging.getLogger(__name__)


# =============================================================================
# Default Prompts - Single source of truth for stance analysis defaults
# =============================================================================

DEFAULT_STANCE_SYSTEM_PROMPT = """You are an expert litigation analyst evaluating scientific articles for their implications in legal contexts, specifically product liability and toxic tort litigation.

Your task is to analyze whether the article's findings and conclusions would tend to support a defense position or a plaintiff position in litigation.

Stance classifications:
- **pro-defense**: Findings suggest the product/substance is safe, risks are minimal, causation is not established, or methodology of plaintiff-favorable studies is flawed
- **pro-plaintiff**: Findings suggest the product/substance causes harm, establishes causation, identifies risks, or supports injury claims
- **neutral**: Article is purely descriptive, methodological, or does not take a position relevant to litigation
- **mixed**: Article contains findings that could support both sides, or presents conflicting evidence
- **unclear**: Insufficient information to determine litigation relevance

When analyzing:
- Focus on conclusions about causation, safety, and risk
- Consider how findings would be used by expert witnesses
- Note the strength and quality of evidence presented
- Identify limitations that could be exploited by either side
- Consider whether the article supports or undermines common litigation arguments

Provide a thorough but concise analysis focused on litigation implications."""

DEFAULT_STANCE_USER_PROMPT = """Analyze this article's stance in the context of litigation support:

# Research Stream Context
Stream: {stream_name}
Purpose: {stream_purpose}

# Article Information
Title: {article_title}
Authors: {article_authors}
Journal: {article_journal}
Year: {article_year}

# Abstract
{article_abstract}

# AI-Generated Summary
{article_summary}

Determine whether this article's findings would primarily support a defense position (product/substance is safe, no causation) or a plaintiff position (product/substance causes harm, establishes causation) in litigation. Consider how each side's expert witnesses might use or attack this article."""

# Combined default prompt dict for API responses
DEFAULT_STANCE_PROMPT = {
    "system_prompt": DEFAULT_STANCE_SYSTEM_PROMPT,
    "user_prompt_template": DEFAULT_STANCE_USER_PROMPT,
}


# =============================================================================
# Single Source of Truth for Stance Analysis Slugs
# =============================================================================
# Each entry: (frontend_slug, flat_key, description)
# - frontend_slug: What users see in UI, e.g., "{stream.name}"
# - flat_key: The key used in API/service calls, e.g., "stream_name"
# - description: Help text for UI

STANCE_ANALYSIS_SLUGS = [
    ("{stream.name}", "stream_name", "Name of the research stream"),
    ("{stream.purpose}", "stream_purpose", "Purpose/description of the stream"),
    ("{article.title}", "article_title", "Title of the article"),
    (
        "{article.authors}",
        "article_authors",
        "Authors of the article (comma-separated)",
    ),
    ("{article.journal}", "article_journal", "Journal where the article was published"),
    ("{article.year}", "article_year", "Publication year"),
    ("{article.abstract}", "article_abstract", "Full abstract of the article"),
    ("{article.summary}", "article_summary", "AI-generated summary of the article"),
]


def get_stance_slug_mappings() -> Dict[str, str]:
    """Get slug mappings for stance analysis: {frontend_slug} -> {flat_key}"""
    return {slug: f"{{{flat_key}}}" for slug, flat_key, _ in STANCE_ANALYSIS_SLUGS}


def get_stance_available_slugs() -> List[Dict[str, str]]:
    """Get available slugs for UI/help for stance analysis."""
    return [
        {"slug": slug, "description": desc} for slug, _, desc in STANCE_ANALYSIS_SLUGS
    ]


def get_stance_required_keys() -> List[str]:
    """Get list of flat keys that must be supplied for stance analysis."""
    return [flat_key for _, flat_key, _ in STANCE_ANALYSIS_SLUGS]


# Derived mappings for prompt processing
STANCE_SLUG_MAPPINGS = get_stance_slug_mappings()


# =============================================================================
# Stance Analysis Result Schema
# =============================================================================

STANCE_RESULT_SCHEMA = {
    "type": "object",
    "properties": {
        "stance": {
            "type": "string",
            "enum": ["pro-defense", "pro-plaintiff", "neutral", "mixed", "unclear"],
            "description": "The article's overall stance",
        },
        "confidence": {
            "type": "number",
            "minimum": 0,
            "maximum": 1,
            "description": "Confidence in the stance assessment (0-1)",
        },
        "analysis": {
            "type": "string",
            "description": "Detailed explanation of the stance assessment",
        },
        "key_factors": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Key factors that influenced the stance determination",
        },
        "relevant_quotes": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Relevant quotes from the abstract supporting the analysis",
        },
    },
    "required": ["stance", "confidence", "analysis", "key_factors", "relevant_quotes"],
}


# =============================================================================
# Prompt Resolution
# =============================================================================


def _convert_frontend_slugs_to_flat(text: str) -> str:
    """Convert frontend slugs like {stream.name} to flat keys like {stream_name}."""
    for old_slug, new_placeholder in STANCE_SLUG_MAPPINGS.items():
        text = text.replace(old_slug, new_placeholder)
    return text


def get_stance_prompts(
    custom_prompt: Optional[Dict[str, str]] = None,
) -> tuple[str, str]:
    """
    Get system and user prompts for stance analysis.

    Args:
        custom_prompt: Custom prompt dict with 'system_prompt' and 'user_prompt_template' keys,
                       or None to use defaults

    Returns:
        Tuple of (system_prompt, user_prompt_template) with flat placeholders
    """
    if custom_prompt:
        system_message = custom_prompt.get(
            "system_prompt", DEFAULT_STANCE_SYSTEM_PROMPT
        )
        user_message = custom_prompt.get(
            "user_prompt_template", DEFAULT_STANCE_USER_PROMPT
        )

        # Convert nested slugs to flat placeholders for custom prompts
        system_message = _convert_frontend_slugs_to_flat(system_message)
        user_message = _convert_frontend_slugs_to_flat(user_message)
    else:
        # Default prompts already use flat placeholders
        system_message = DEFAULT_STANCE_SYSTEM_PROMPT
        user_message = DEFAULT_STANCE_USER_PROMPT

    return system_message, user_message


# =============================================================================
# Main Service Function
# =============================================================================


async def analyze_article_stance(
    article_title: str,
    article_abstract: Optional[str],
    article_authors: Optional[List[str]],
    article_journal: Optional[str],
    article_year: Optional[int],
    stream_name: str,
    stream_purpose: Optional[str],
    stance_analysis_prompt: Optional[Dict[str, str]] = None,
    model_config: Optional[ModelConfig] = None,
    article_summary: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Analyze an article's stance using the call_llm pattern.

    Args:
        article_title: Article title
        article_abstract: Article abstract
        article_authors: List of authors
        article_journal: Journal name
        article_year: Publication year
        stream_name: Research stream name
        stream_purpose: Stream's stated purpose
        stance_analysis_prompt: Custom prompt dict with 'system_prompt' and
                               'user_prompt_template' keys (None = use defaults)
        model_config: Optional model configuration override
        article_summary: AI-generated summary of the article

    Returns:
        Dict with stance, confidence, analysis, key_factors, relevant_quotes
    """
    # Handle missing abstract
    if not article_abstract:
        return {
            "stance": "unclear",
            "confidence": 0.0,
            "analysis": "No abstract available for analysis.",
            "key_factors": [],
            "relevant_quotes": [],
        }

    # Get prompt templates (custom or defaults)
    system_template, user_template = get_stance_prompts(stance_analysis_prompt)

    # Build values dict for template rendering
    values = {
        "stream_name": stream_name,
        "stream_purpose": stream_purpose or "Not specified",
        "article_title": article_title,
        "article_authors": (
            ", ".join(article_authors) if article_authors else "Unknown authors"
        ),
        "article_journal": article_journal or "Unknown",
        "article_year": str(article_year) if article_year else "Unknown",
        "article_abstract": article_abstract,
        "article_summary": article_summary or "No AI summary available",
    }

    # Get model config from task config if not provided
    if model_config is None:
        task_config = get_task_config("document_analysis", "stance_analysis")
        model_config = ModelConfig(
            model_id=task_config["model"],
            temperature=task_config.get("temperature", 0.2),
            reasoning_effort=task_config.get("reasoning_effort"),
        )

    # Call LLM using unified pattern
    result: LLMResult = await call_llm(
        system_message=system_template,
        user_message=user_template,
        values=values,
        model_config=model_config,
        response_schema=STANCE_RESULT_SCHEMA,
    )

    # Handle result
    if not result.ok:
        logger.error(f"Stance analysis failed: {result.error}")
        return {
            "stance": "unclear",
            "confidence": 0.0,
            "analysis": f"Analysis failed: {result.error}",
            "key_factors": [],
            "relevant_quotes": [],
        }

    # Return structured response
    return {
        "stance": result.data.get("stance", "unclear"),
        "confidence": result.data.get("confidence", 0.5),
        "analysis": result.data.get("analysis", ""),
        "key_factors": result.data.get("key_factors", []),
        "relevant_quotes": result.data.get("relevant_quotes", []),
    }
