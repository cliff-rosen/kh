from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Dict, Any
from pydantic import BaseModel

from database import get_db

from schemas.workflow import Mission, MissionStatus

from services.auth_service import validate_token
from services.mission_service import MissionService

router = APIRouter(prefix="/missions", tags=["missions"])


class MissionStatusUpdate(BaseModel):
    status: MissionStatus


@router.post("/", response_model=dict)
async def create_mission(
    mission: Mission,
    db: Session = Depends(get_db),
    current_user = Depends(validate_token)
):
    """Create a new mission"""
    try:
        mission_service = MissionService(db)
        mission_id = await mission_service.create_mission(current_user.user_id, mission)
        return {"mission_id": mission_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{mission_id}", response_model=Mission)
async def get_mission(
    mission_id: str,
    db: Session = Depends(get_db),
    current_user = Depends(validate_token)
):
    """Get a mission by ID"""
    try:
        mission_service = MissionService(db)
        mission = await mission_service.get_mission(mission_id, current_user.user_id)
        if not mission:
            raise HTTPException(status_code=404, detail="Mission not found")
        return mission
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{mission_id}/full", response_model=Dict[str, Any])
async def get_mission_with_hops(
    mission_id: str,
    db: Session = Depends(get_db),
    current_user = Depends(validate_token)
):
    """Get a mission with its hops and tool steps"""
    try:
        mission_service = MissionService(db)
        result = await mission_service.get_mission_with_hops(mission_id, current_user.user_id)
        if not result:
            raise HTTPException(status_code=404, detail="Mission not found")
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{mission_id}")
async def update_mission(
    mission_id: str,
    mission: Mission,
    db: Session = Depends(get_db),
    current_user = Depends(validate_token)
):
    """Update an existing mission"""
    try:
        mission_service = MissionService(db)
        success = await mission_service.update_mission(mission_id, current_user.user_id, mission)
        if not success:
            raise HTTPException(status_code=404, detail="Mission not found")
        return {"message": "Mission updated successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/{mission_id}/status")
async def update_mission_status(
    mission_id: str,
    status_update: MissionStatusUpdate,
    db: Session = Depends(get_db),
    current_user = Depends(validate_token)
):
    """Update mission status"""
    try:
        mission_service = MissionService(db)
        success = await mission_service.update_mission_status(
            mission_id, 
            current_user.user_id, 
            status_update.status
        )
        if not success:
            raise HTTPException(status_code=404, detail="Mission not found")
        return {"message": "Mission status updated successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{mission_id}")
async def delete_mission(
    mission_id: str,
    db: Session = Depends(get_db),
    current_user = Depends(validate_token)
):
    """Delete a mission"""
    try:
        mission_service = MissionService(db)
        success = await mission_service.delete_mission(mission_id, current_user.user_id)
        if not success:
            raise HTTPException(status_code=404, detail="Mission not found")
        return {"message": "Mission deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/", response_model=List[Mission])
async def get_user_missions(
    db: Session = Depends(get_db),
    current_user = Depends(validate_token)
):
    """Get all missions for the current user"""
    try:
        mission_service = MissionService(db)
        missions = await mission_service.get_user_missions(current_user.user_id)
        return missions
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) 