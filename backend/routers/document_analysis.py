"""
Document Analysis API endpoints
"""

import logging
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_async_db
from models import User
from services import auth_service
from services.document_analysis_service import get_document_analysis_service
from services.research_stream_service import ResearchStreamService, get_async_research_stream_service
from schemas.document_analysis import (
    DocumentAnalysisRequest,
    DocumentAnalysisResult,
    AnalysisOptions,
    StanceAnalysisRequest,
    StanceAnalysisResult
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/tools/document-analysis", tags=["document-analysis"])


@router.post("/analyze", response_model=DocumentAnalysisResult)
async def analyze_document(
    request: DocumentAnalysisRequest,
    current_user: User = Depends(auth_service.validate_token)
):
    """
    Analyze a document with AI-powered extraction (non-streaming).

    Performs hierarchical summarization, entity extraction, and claim/argument
    extraction based on the provided options.

    Returns structured analysis data including graph nodes/edges for visualization.
    """
    try:
        logger.info(f"Document analysis request from user {current_user.user_id}, text length: {len(request.document_text)}")

        service = get_document_analysis_service()

        result = await service.analyze_document(
            document_text=request.document_text,
            document_title=request.document_title,
            analysis_options=request.analysis_options
        )

        logger.info(f"Document analysis complete: {result.document_id}")
        return result

    except Exception as e:
        logger.error(f"Document analysis failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Document analysis failed: {str(e)}"
        )


@router.post("/analyze-stream")
async def analyze_document_stream(
    request: DocumentAnalysisRequest,
    current_user: User = Depends(auth_service.validate_token)
):
    """
    Analyze a document with AI-powered extraction (streaming).

    Streams progress updates as each analysis phase completes:
    - status: Initial status and phase transitions
    - progress: Phase start notifications
    - summary: Hierarchical summary complete
    - entities: Entity extraction complete
    - claims: Claim extraction complete
    - result: Final complete result
    - error: Error message if analysis fails

    Returns SSE-formatted stream of AnalysisStreamMessage objects.
    """
    try:
        logger.info(f"Streaming document analysis request from user {current_user.user_id}, text length: {len(request.document_text)}")

        service = get_document_analysis_service()

        async def generate():
            try:
                async for message in service.analyze_document_streaming(
                    document_text=request.document_text,
                    document_title=request.document_title,
                    analysis_options=request.analysis_options
                ):
                    yield message
            except Exception as e:
                logger.error(f"Streaming error for user {current_user.user_id}: {e}", exc_info=True)
                from schemas.document_analysis import AnalysisStreamMessage
                error_message = AnalysisStreamMessage(
                    type="error",
                    message=f"Analysis failed: {str(e)}",
                    data={"error": str(e)}
                )
                yield f"data: {error_message.model_dump_json()}\n\n"

        return StreamingResponse(
            generate(),
            media_type="text/plain",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no"  # Disable nginx buffering
            }
        )

    except Exception as e:
        logger.error(f"Failed to start streaming for user {current_user.user_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to start document analysis: {str(e)}"
        )


@router.post("/analyze-stance", response_model=StanceAnalysisResult)
async def analyze_article_stance(
    request: StanceAnalysisRequest,
    stream_service: ResearchStreamService = Depends(get_async_research_stream_service),
    current_user: User = Depends(auth_service.validate_token)
):
    """
    Analyze an article's stance (pro-defense vs pro-plaintiff) based on
    stream-specific classification instructions.

    Requires a stream_id to load the stream's chat_instructions which define
    the classification criteria.
    """
    logger.info(f"[STANCE] Endpoint entered - user_id={current_user.user_id}, stream_id={request.stream_id}")

    try:
        # Load the research stream via service (handles access control)
        stream = await stream_service.get_research_stream(request.stream_id, current_user.user_id)

        logger.info(f"Stance analysis request from user {current_user.user_id} for stream {stream.stream_name}")

        service = get_document_analysis_service()

        result = await service.analyze_article_stance(
            article_title=request.article.title,
            article_abstract=request.article.abstract,
            article_authors=request.article.authors,
            article_journal=request.article.journal,
            article_year=request.article.publication_year,
            stream_name=stream.stream_name,
            stream_purpose=stream.purpose,
            chat_instructions=stream.chat_instructions
        )

        logger.info(f"Stance analysis complete: {result.get('stance')} (confidence: {result.get('confidence')})")
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Stance analysis failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Stance analysis failed: {str(e)}"
        )


@router.get("/health")
async def health_check(current_user: User = Depends(auth_service.validate_token)):
    """Check if document analysis service is healthy"""
    return {"status": "healthy", "service": "document-analysis"}
