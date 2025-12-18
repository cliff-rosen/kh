"""
Document Analysis API endpoints
"""

import logging
from fastapi import APIRouter, Depends, HTTPException, status
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
    Analyze a document with AI-powered extraction.

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


@router.get("/health")
async def health_check(current_user: User = Depends(auth_service.validate_token)):
    """Check if document analysis service is healthy"""
    return {"status": "healthy", "service": "document-analysis"}
