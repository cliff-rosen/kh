from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import text
# from routers import search, auth, workflow, tools, files, bot, asset
# Import only Knowledge Horizon compatible routers (legacy routers removed)
from routers import auth, llm, search, web_retrieval, pubmed, extraction, unified_search, lab, research_streams, profiles
from database import init_db
from config import settings, setup_logging
from middleware import LoggingMiddleware
from pydantic import ValidationError
from starlette.responses import JSONResponse

# Setup logging first
logger, request_id_filter = setup_logging()

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.SETTING_VERSION,
    swagger_ui_parameters={
        "persistAuthorization": True,
        "displayRequestDuration": True,
        "tryItOutEnabled": True,
        "defaultModelsExpandDepth": -1,
    }
)

# Add logging middleware
app.add_middleware(LoggingMiddleware, request_id_filter=request_id_filter)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=settings.CORS_ALLOW_CREDENTIALS,
    allow_methods=settings.CORS_ALLOW_METHODS,
    allow_headers=settings.CORS_ALLOW_HEADERS,
    expose_headers=settings.CORS_EXPOSE_HEADERS,
)

# Include routers
logger.info("Including routers...")

# Auth router with custom prefix
app.include_router(
    auth.router,
    prefix="/api/auth",
    tags=["auth"],
    responses={401: {"description": "Not authenticated"}}
)

# Core API routers (prefix added here)
# Chat router removed - Knowledge Horizon uses different chat approach
# User session router removed - Knowledge Horizon uses simplified auth
app.include_router(llm.router, prefix="/api")
app.include_router(search.router, prefix="/api")
app.include_router(web_retrieval.router, prefix="/api")
app.include_router(pubmed.router, prefix="/api")
# Google Scholar removed - legacy feature with EventType dependency
app.include_router(extraction.router, prefix="/api")
app.include_router(unified_search.router, prefix="/api")
app.include_router(lab.router, prefix="/api")
app.include_router(research_streams.router)
app.include_router(profiles.router)
# Smart Search 2 removed - legacy feature with EventType dependency

# Legacy routers removed for Knowledge Horizon transition:
# - workbench: Uses legacy Asset/Mission models
# - article_chat: Uses UserCompanyProfile
# - pubmed_search_designer: Uses legacy models
# - analytics: Uses EventType/UserEvent models

logger.info("Routers included")


@app.on_event("startup")
async def startup_event():
    logger.info("Application starting up...")
    init_db()
    logger.info("Database initialized")
    #logger.info(f"Settings object: {settings}")
    #logger.info(f"ACCESS_TOKEN_EXPIRE_MINUTES value: {settings.ACCESS_TOKEN_EXPIRE_MINUTES}")


@app.get("/")
async def root():
    """Root endpoint - redirects to API health check"""
    return {"message": "JamBot API", "health": "/api/health", "docs": "/docs"}

@app.get("/api/health")
async def health_check():
    """Health check endpoint for monitoring"""
    return {"status": "healthy", "version": settings.SETTING_VERSION}


@app.exception_handler(ValidationError)
async def validation_exception_handler(request: Request, exc: ValidationError):
    logger.error(f"Validation error in {request.url.path}:")
    for error in exc.errors():
        logger.error(f"  - {error['loc']}: {error['msg']} (type: {error['type']})")
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors()}
    )


logger.info("Application startup complete")