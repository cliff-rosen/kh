"""
Research Streams API endpoints
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from database import get_db
from models import User
from schemas.research_stream import ResearchStream, StreamType, ReportFrequency
from services.research_stream_service import ResearchStreamService
from routers.auth import get_current_user

# Request/Response schemas for this endpoint
from pydantic import BaseModel

class ResearchStreamCreateRequest(BaseModel):
    stream_name: str
    description: str = None
    stream_type: StreamType = StreamType.MIXED
    focus_areas: List[str] = []
    competitors: List[str] = []
    report_frequency: ReportFrequency = ReportFrequency.WEEKLY

class ResearchStreamUpdateRequest(BaseModel):
    stream_name: str = None
    description: str = None
    stream_type: StreamType = None
    focus_areas: List[str] = None
    competitors: List[str] = None
    report_frequency: ReportFrequency = None
    is_active: bool = None

class ResearchStreamResponse(BaseModel):
    data: ResearchStream
    message: str = None

class ResearchStreamsListResponse(BaseModel):
    data: List[ResearchStream]
    message: str = None
    total: int

class ToggleStatusRequest(BaseModel):
    is_active: bool

router = APIRouter(prefix="/api/research-streams", tags=["research-streams"])


@router.get("", response_model=List[ResearchStream])
async def get_research_streams(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all research streams for the current user"""
    service = ResearchStreamService(db)
    return service.get_user_research_streams(current_user.user_id)


@router.get("/{stream_id}", response_model=ResearchStream)
async def get_research_stream(
    stream_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get a specific research stream by ID"""
    service = ResearchStreamService(db)
    stream = service.get_research_stream(stream_id, current_user.user_id)
    if not stream:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Research stream not found"
        )
    return stream


@router.post("", response_model=ResearchStream, status_code=status.HTTP_201_CREATED)
async def create_research_stream(
    request: ResearchStreamCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new research stream"""
    service = ResearchStreamService(db)
    return service.create_research_stream(
        user_id=current_user.user_id,
        stream_name=request.stream_name,
        description=request.description,
        stream_type=request.stream_type,
        focus_areas=request.focus_areas,
        competitors=request.competitors,
        report_frequency=request.report_frequency
    )


@router.put("/{stream_id}", response_model=ResearchStream)
async def update_research_stream(
    stream_id: int,
    request: ResearchStreamUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update an existing research stream"""
    service = ResearchStreamService(db)

    # Verify ownership
    existing_stream = service.get_research_stream(stream_id, current_user.user_id)
    if not existing_stream:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Research stream not found"
        )

    # Prepare update data (only non-None values)
    update_data = {k: v for k, v in request.dict().items() if v is not None}

    return service.update_research_stream(stream_id, update_data)


@router.delete("/{stream_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_research_stream(
    stream_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a research stream"""
    service = ResearchStreamService(db)

    # Verify ownership
    existing_stream = service.get_research_stream(stream_id, current_user.user_id)
    if not existing_stream:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Research stream not found"
        )

    service.delete_research_stream(stream_id)


@router.patch("/{stream_id}/status", response_model=ResearchStream)
async def toggle_research_stream_status(
    stream_id: int,
    request: ToggleStatusRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Toggle research stream active status"""
    service = ResearchStreamService(db)

    # Verify ownership
    existing_stream = service.get_research_stream(stream_id, current_user.user_id)
    if not existing_stream:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Research stream not found"
        )

    return service.update_research_stream(stream_id, {"is_active": request.is_active})