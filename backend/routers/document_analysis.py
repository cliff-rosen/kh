"""
Document Analysis API endpoints
"""

import logging
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from database import get_db
from models import User
from services import auth_service
from services.document_analysis_service import get_document_analysis_service
from schemas.document_analysis import (
    DocumentAnalysisRequest,
    DocumentAnalysisResult,
    AnalysisOptions
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/tools/document-analysis", tags=["document-analysis"])


@router.post("/analyze", response_model=DocumentAnalysisResult)
async def analyze_document(
    request: DocumentAnalysisRequest,
    db: Session = Depends(get_db),
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
    db: Session = Depends(get_db),
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


@router.get("/health")
async def health_check(current_user: User = Depends(auth_service.validate_token)):
    """Check if document analysis service is healthy"""
    return {"status": "healthy", "service": "document-analysis"}
