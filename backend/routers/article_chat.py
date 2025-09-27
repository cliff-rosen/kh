"""Article Chat Router - Stateless chat for article discussions"""

from typing import Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from openai import AsyncOpenAI
import os
import logging
import json

from models import User, UserCompanyProfile
from services.auth_service import validate_token
from database import get_db
from sqlalchemy.orm import Session
from config.settings import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/article-chat", tags=["article-chat"])

# Initialize OpenAI client
client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

class ArticleContext(BaseModel):
    """Context about the article being discussed"""
    id: str
    title: str
    authors: list[str] = Field(default_factory=list)
    abstract: Optional[str] = None
    journal: Optional[str] = None
    publication_year: Optional[int] = None
    doi: Optional[str] = None
    extracted_features: Dict[str, Any] = Field(default_factory=dict)
    source: str  # 'pubmed' or 'scholar'

class ArticleChatRequest(BaseModel):
    """Request for article chat"""
    message: str
    article_context: ArticleContext
    conversation_history: list[Dict[str, str]] = Field(
        default_factory=list,
        description="Previous messages in format [{'role': 'user'|'assistant', 'content': '...'}]"
    )
    # company_context is now generated dynamically from user's profile

class ArticleChatResponse(BaseModel):
    """Response from article chat"""
    response: str
    metadata: Dict[str, Any] = Field(default_factory=dict)

@router.post("/chat/stream")
async def chat_about_article_stream(
    request: ArticleChatRequest,
    current_user: User = Depends(validate_token),
    db: Session = Depends(get_db)
):
    """
    Streaming chat endpoint for article discussions.
    No database persistence - frontend manages conversation history.
    """
    async def generate_response():
        try:
            # Fetch user's company profile for dynamic context
            company_profile = db.query(UserCompanyProfile).filter(
                UserCompanyProfile.user_id == current_user.user_id
            ).first()
            
            if not company_profile:
                # Fallback to default context if no profile exists
                company_context = "You are a research agent focused on analyzing scientific literature for business relevance."
                analysis_instructions = "Analyze this article for potential business implications and opportunities."
            else:
                company_context = company_profile.generate_company_context()
                analysis_instructions = company_profile.generate_analysis_instructions()

            # Build the system prompt with dynamic company context
            system_prompt = f"""{company_context}

You are analyzing the following research article:

Title: {request.article_context.title}
Authors: {', '.join(request.article_context.authors)}
Journal: {request.article_context.journal or 'Not specified'}
Year: {request.article_context.publication_year or 'Not specified'}
DOI: {request.article_context.doi or 'Not specified'}

Abstract:
{request.article_context.abstract or 'No abstract available'}

Extracted Features:
{format_features(request.article_context.extracted_features)}

Your role is to:
{analysis_instructions}

Focus on providing business-relevant analysis while maintaining scientific accuracy."""

            # Build messages for OpenAI
            messages = [{"role": "system", "content": system_prompt}]
            
            # Add conversation history (last 10 messages for context)
            for msg in request.conversation_history[-10:]:
                messages.append({
                    "role": msg["role"],
                    "content": msg["content"]
                })
            
            # Add current message
            messages.append({
                "role": "user",
                "content": request.message
            })
            
            # Stream response from OpenAI
            stream = await client.chat.completions.create(
                model="gpt-4-turbo-preview",
                messages=messages,
                temperature=0.7,
                max_tokens=1500,
                stream=True
            )
            
            # Send initial metadata
            initial_data = {
                "type": "metadata",
                "data": {
                    "article_id": request.article_context.id,
                    "model": "gpt-4-turbo-preview"
                }
            }
            yield f"data: {json.dumps(initial_data)}\n\n"
            
            # Stream content chunks
            async for chunk in stream:
                if chunk.choices[0].delta.content is not None:
                    content_data = {
                        "type": "content",
                        "data": {
                            "content": chunk.choices[0].delta.content
                        }
                    }
                    yield f"data: {json.dumps(content_data)}\n\n"
            
            # Send completion signal
            completion_data = {
                "type": "done",
                "data": {}
            }
            yield f"data: {json.dumps(completion_data)}\n\n"
            
        except Exception as e:
            logger.error(f"Error in article chat stream: {str(e)}")
            error_data = {
                "type": "error",
                "data": {
                    "error": str(e)
                }
            }
            yield f"data: {json.dumps(error_data)}\n\n"
    
    return StreamingResponse(
        generate_response(),
        media_type="text/plain",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"}
    )

def format_features(features: Dict[str, Any]) -> str:
    """Format extracted features for the prompt"""
    if not features:
        return "No extracted features available"
    
    formatted = []
    for key, value in features.items():
        # Convert snake_case to Title Case
        formatted_key = key.replace('_', ' ').title()
        formatted.append(f"- {formatted_key}: {value}")
    
    return "\n".join(formatted)