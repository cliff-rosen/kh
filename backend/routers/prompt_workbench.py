"""
Prompt Workbench API endpoints

Provides endpoints for:
- Getting default prompts
- Getting/updating stream enrichment config
- Testing prompts against sample data or existing reports
"""

import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import Dict, Any, Optional, List
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

from database import get_db
from models import User, ResearchStream as ResearchStreamModel, Report
from schemas.research_stream import EnrichmentConfig, PromptTemplate
from services.research_stream_service import ResearchStreamService
from services.report_summary_service import ReportSummaryService
from routers.auth import get_current_user

router = APIRouter(prefix="/api/prompt-workbench", tags=["prompt-workbench"])


# ============================================================================
# Default Prompts
# ============================================================================

# Default prompts that match the current hardcoded prompts in ReportSummaryService
DEFAULT_EXECUTIVE_SUMMARY_PROMPT = PromptTemplate(
    system_prompt="""You are an expert research analyst who specializes in synthesizing scientific literature.

    Your task is to write a concise executive summary of a research report.

    The summary should:
    - Be 3-5 paragraphs (200-400 words total)
    - Highlight the most important findings and trends
    - Identify key themes across the literature
    - Note any significant developments or breakthroughs
    - Be written for an executive audience (technical but accessible)
    - Focus on insights and implications, not just listing papers

    Write in a professional, analytical tone. Include only the summary with no heading or other text.""",
    user_prompt_template="""Generate an executive summary for this research report.

    # Research Stream Purpose
    {stream.purpose}

    # Report Statistics
    - Total articles: {articles.count}
    - Categories covered: {categories.count}

    # Category Summaries
    {categories.summaries}

    # Sample Articles (representative of the full report)
    {articles.formatted}

    Generate a comprehensive executive summary that synthesizes the key findings and themes across all articles."""
)

DEFAULT_CATEGORY_SUMMARY_PROMPT = PromptTemplate(
    system_prompt="""You are an expert research analyst synthesizing scientific literature.

    Your task is to write a concise summary of articles in the "{category.name}" category.

    The summary should:
    - Be 2-3 paragraphs (150-250 words total)
    - Identify the main themes and findings in this category
    - Highlight the most significant or impactful articles
    - Note any emerging trends or patterns
    - Be written for a technical audience familiar with the field

    Write in a professional, analytical tone.""",
        user_prompt_template="""Generate a summary for the "{category.name}" category.

    # Category Description
    {category.description}

    # Research Stream Purpose
    {stream.purpose}

    # Articles in This Category ({articles.count} total)
    {articles.formatted}

    Generate a focused summary that captures the key insights from articles in this category."""
)


# Available slugs documentation
AVAILABLE_SLUGS = {
    "executive_summary": [
        {"slug": "{stream.name}", "description": "Name of the research stream"},
        {"slug": "{stream.purpose}", "description": "Purpose/description of the stream"},
        {"slug": "{articles.count}", "description": "Total number of articles in the report"},
        {"slug": "{articles.formatted}", "description": "Formatted list of articles (title, authors, journal, year, abstract)"},
        {"slug": "{categories.count}", "description": "Number of categories in the report"},
        {"slug": "{categories.summaries}", "description": "Formatted category summaries (if available)"},
    ],
    "category_summary": [
        {"slug": "{stream.name}", "description": "Name of the research stream"},
        {"slug": "{stream.purpose}", "description": "Purpose/description of the stream"},
        {"slug": "{category.name}", "description": "Name of the current category"},
        {"slug": "{category.description}", "description": "Description of what this category covers"},
        {"slug": "{category.topics}", "description": "List of topics in this category"},
        {"slug": "{articles.count}", "description": "Number of articles in this category"},
        {"slug": "{articles.formatted}", "description": "Formatted list of articles in this category"},
    ]
}


class DefaultPromptsResponse(BaseModel):
    """Response containing default prompts and available slugs"""
    prompts: Dict[str, PromptTemplate]
    available_slugs: Dict[str, List[Dict[str, str]]]


@router.get("/defaults", response_model=DefaultPromptsResponse)
async def get_default_prompts():
    """Get the default prompts and available slugs for each prompt type"""
    return DefaultPromptsResponse(
        prompts={
            "executive_summary": DEFAULT_EXECUTIVE_SUMMARY_PROMPT,
            "category_summary": DEFAULT_CATEGORY_SUMMARY_PROMPT
        },
        available_slugs=AVAILABLE_SLUGS
    )


# ============================================================================
# Stream Enrichment Config
# ============================================================================

class EnrichmentConfigResponse(BaseModel):
    """Response containing stream's enrichment config or defaults"""
    enrichment_config: Optional[EnrichmentConfig]
    is_using_defaults: bool
    defaults: Dict[str, PromptTemplate]


@router.get("/streams/{stream_id}/enrichment", response_model=EnrichmentConfigResponse)
async def get_stream_enrichment_config(
    stream_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get enrichment config for a stream (or defaults if not set)"""
    service = ResearchStreamService(db)
    stream = service.get_research_stream(stream_id, current_user.user_id)

    if not stream:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Research stream not found"
        )

    # Get the raw model to check enrichment_config
    stream_model = db.query(ResearchStreamModel).filter(
        ResearchStreamModel.stream_id == stream_id
    ).first()

    enrichment_config = None
    if stream_model.enrichment_config:
        enrichment_config = EnrichmentConfig(**stream_model.enrichment_config)

    return EnrichmentConfigResponse(
        enrichment_config=enrichment_config,
        is_using_defaults=enrichment_config is None,
        defaults={
            "executive_summary": DEFAULT_EXECUTIVE_SUMMARY_PROMPT,
            "category_summary": DEFAULT_CATEGORY_SUMMARY_PROMPT
        }
    )


class UpdateEnrichmentConfigRequest(BaseModel):
    """Request to update enrichment config"""
    enrichment_config: Optional[EnrichmentConfig] = Field(
        None,
        description="Set to null to reset to defaults"
    )


@router.put("/streams/{stream_id}/enrichment")
async def update_stream_enrichment_config(
    stream_id: int,
    request: UpdateEnrichmentConfigRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update enrichment config for a stream (set to null to reset to defaults)"""
    service = ResearchStreamService(db)

    # Verify ownership
    stream = service.get_research_stream(stream_id, current_user.user_id)
    if not stream:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Research stream not found"
        )

    # Get the raw model to update
    stream_model = db.query(ResearchStreamModel).filter(
        ResearchStreamModel.stream_id == stream_id
    ).first()

    # Update the enrichment config
    if request.enrichment_config is None:
        stream_model.enrichment_config = None
    else:
        stream_model.enrichment_config = request.enrichment_config.dict()

    db.commit()
    db.refresh(stream_model)

    return {"status": "success", "message": "Enrichment config updated"}


# ============================================================================
# Prompt Testing
# ============================================================================

class ArticleData(BaseModel):
    """Article data for testing"""
    title: str
    authors: Optional[List[str]] = []
    journal: Optional[str] = None
    year: Optional[int] = None
    abstract: Optional[str] = None


class TestPromptRequest(BaseModel):
    """Request to test a prompt"""
    prompt_type: str = Field(..., description="'executive_summary' or 'category_summary'")
    prompt: PromptTemplate = Field(..., description="The prompt to test")

    # Either provide sample data OR a report reference
    sample_data: Optional[Dict[str, Any]] = Field(
        None,
        description="Sample data with articles and context"
    )
    report_id: Optional[int] = Field(
        None,
        description="Reference to an existing report to use as test data"
    )

    # For category summary, specify which category
    category_id: Optional[str] = Field(
        None,
        description="Category ID for category_summary test"
    )


class TestPromptResponse(BaseModel):
    """Response from testing a prompt"""
    rendered_system_prompt: str
    rendered_user_prompt: str
    llm_response: Optional[str] = None
    error: Optional[str] = None


@router.post("/test", response_model=TestPromptResponse)
async def test_prompt(
    request: TestPromptRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Test a prompt by rendering it with sample data and optionally running it through the LLM.

    You can either:
    1. Provide sample_data directly with articles and context
    2. Provide a report_id to use data from an existing report
    """
    try:
        # Get context data from either sample_data or report
        if request.report_id:
            context = await _get_context_from_report(
                db, request.report_id, current_user.user_id,
                request.prompt_type, request.category_id
            )
        elif request.sample_data:
            context = request.sample_data
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Either sample_data or report_id must be provided"
            )

        # Render the prompts with slugs replaced
        rendered_system = _render_prompt(request.prompt.system_prompt, context)
        rendered_user = _render_prompt(request.prompt.user_prompt_template, context)

        # Run through LLM
        summary_service = ReportSummaryService()
        llm_response = await _run_prompt_through_llm(
            summary_service, rendered_system, rendered_user
        )

        return TestPromptResponse(
            rendered_system_prompt=rendered_system,
            rendered_user_prompt=rendered_user,
            llm_response=llm_response
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error testing prompt: {e}", exc_info=True)
        return TestPromptResponse(
            rendered_system_prompt=request.prompt.system_prompt,
            rendered_user_prompt=request.prompt.user_prompt_template,
            error=str(e)
        )


async def _get_context_from_report(
    db: Session,
    report_id: int,
    user_id: int,
    prompt_type: str,
    category_id: Optional[str] = None
) -> Dict[str, Any]:
    """Get context data from an existing report"""
    from models import Report, WipArticle, ResearchStream as ResearchStreamModel

    # Get the report
    report = db.query(Report).filter(Report.report_id == report_id).first()
    if not report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Report not found"
        )

    # Verify user has access to this report's stream
    stream = db.query(ResearchStreamModel).filter(
        ResearchStreamModel.stream_id == report.stream_id,
        ResearchStreamModel.user_id == user_id
    ).first()
    if not stream:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have access to this report"
        )

    # Get articles for this report
    wip_articles = db.query(WipArticle).filter(
        WipArticle.report_id == report_id
    ).all()

    # Build context based on prompt type
    if prompt_type == "executive_summary":
        # Format articles
        articles_formatted = _format_articles_for_prompt([
            {
                "title": a.title,
                "authors": a.authors[:3] if a.authors else [],
                "journal": a.journal,
                "year": a.year,
                "abstract": a.abstract[:500] if a.abstract else None
            }
            for a in wip_articles[:20]
        ])

        # Get category summaries if available
        category_summaries = ""
        if report.enrichments and report.enrichments.get("category_summaries"):
            category_summaries = "\n\n".join([
                f"**{cat_id}**: {summary}"
                for cat_id, summary in report.enrichments["category_summaries"].items()
            ])

        return {
            "stream": {
                "name": stream.stream_name,
                "purpose": stream.purpose
            },
            "articles": {
                "count": len(wip_articles),
                "formatted": articles_formatted
            },
            "categories": {
                "count": len(stream.presentation_config.get("categories", [])) if stream.presentation_config else 0,
                "summaries": category_summaries
            }
        }

    elif prompt_type == "category_summary":
        if not category_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="category_id is required for category_summary prompt type"
            )

        # Find the category
        categories = stream.presentation_config.get("categories", []) if stream.presentation_config else []
        category = next((c for c in categories if c.get("id") == category_id), None)
        if not category:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Category {category_id} not found in stream"
            )

        # Filter articles for this category
        category_articles = [
            a for a in wip_articles
            if a.presentation_categories and category_id in a.presentation_categories
        ]

        articles_formatted = _format_articles_for_prompt([
            {
                "title": a.title,
                "authors": a.authors[:3] if a.authors else [],
                "journal": a.journal,
                "year": a.year,
                "abstract": a.abstract[:400] if a.abstract else None
            }
            for a in category_articles[:15]
        ])

        return {
            "stream": {
                "name": stream.stream_name,
                "purpose": stream.purpose
            },
            "category": {
                "name": category.get("name", "Unknown"),
                "description": ", ".join(category.get("topics", [])),
                "topics": category.get("topics", [])
            },
            "articles": {
                "count": len(category_articles),
                "formatted": articles_formatted
            }
        }

    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown prompt type: {prompt_type}"
        )


def _format_articles_for_prompt(articles: List[Dict]) -> str:
    """Format articles for inclusion in LLM prompt"""
    formatted = []
    for i, article in enumerate(articles, 1):
        authors_str = ", ".join(article.get("authors", [])) if article.get("authors") else "Unknown"
        if len(article.get("authors", [])) > 3:
            authors_str += " et al."

        journal_year = []
        if article.get("journal"):
            journal_year.append(article["journal"])
        if article.get("year"):
            journal_year.append(f"({article['year']})")

        location = " ".join(journal_year) if journal_year else "Unknown source"

        formatted.append(f"{i}. {article.get('title', 'Unknown')}\n   {authors_str} - {location}")

        if article.get("abstract"):
            formatted.append(f"   Abstract: {article['abstract']}")

    return "\n\n".join(formatted)


def _render_prompt(template: str, context: Dict[str, Any]) -> str:
    """Render a prompt template by replacing slugs with context values"""
    result = template

    # Replace nested slugs like {stream.name}, {articles.count}, etc.
    for top_key, top_value in context.items():
        if isinstance(top_value, dict):
            for sub_key, sub_value in top_value.items():
                slug = f"{{{top_key}.{sub_key}}}"
                if isinstance(sub_value, list):
                    result = result.replace(slug, ", ".join(str(v) for v in sub_value))
                else:
                    result = result.replace(slug, str(sub_value))
        else:
            slug = f"{{{top_key}}}"
            result = result.replace(slug, str(top_value))

    return result


async def _run_prompt_through_llm(
    service: ReportSummaryService,
    system_prompt: str,
    user_prompt: str
) -> str:
    """Run a prompt through the LLM and return the response"""
    response = await service.client.chat.completions.create(
        model=service.model,
        max_tokens=2000,
        temperature=0.3,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ]
    )
    return response.choices[0].message.content
