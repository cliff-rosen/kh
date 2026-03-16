from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from config import settings
from database import get_async_db

router = APIRouter()


@router.get("/health")
async def health_check(db: AsyncSession = Depends(get_async_db)):
    """Health check endpoint for monitoring"""
    db_status = "healthy"
    db_error = None
    try:
        await db.execute(text("SELECT 1"))
    except Exception as e:
        db_status = "unhealthy"
        db_error = str(e)

    overall = "healthy" if db_status == "healthy" else "degraded"

    result = {
        "status": overall,
        "version": settings.SETTING_VERSION,
        "database": db_status,
    }
    if db_error:
        result["database_error"] = db_error

    return result
