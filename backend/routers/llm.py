from fastapi import APIRouter, HTTPException
from typing import Dict, Any, List
from services.llm.model_data import (
    OPENAI_MODELS,
    ANTHROPIC_MODELS,
    MODEL_CATEGORIES,
    MODEL_FAMILY_CATEGORIES,
    MODEL_FAMILIES
)

router = APIRouter(prefix="/llm", tags=["llm"])

@router.get("/models")
async def get_models() -> Dict[str, Any]:
    """
    Get all available models and their configurations.
    Returns model data organized by provider, categories, and families.
    """
    try:
        return {
            "openai": {
                "models": OPENAI_MODELS,
                "categories": MODEL_CATEGORIES,
                "families": MODEL_FAMILY_CATEGORIES,
                "family_configs": MODEL_FAMILIES
            },
            "anthropic": {
                "models": ANTHROPIC_MODELS
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) 