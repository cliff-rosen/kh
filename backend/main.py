from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import text
# from routers import search, auth, workflow, tools, files, bot, email, asset
from routers import auth, email, asset, chat, llm, tools, search, web_retrieval, mission, hop, tool_step, user_session, state_transition, pubmed, google_scholar, extraction, unified_search, lab, article_chat, workbench, smart_search, smart_search2, pubmed_search_designer, analytics
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
app.include_router(chat.router, prefix="/api")
app.include_router(email.router, prefix="/api")
app.include_router(asset.router, prefix="/api")
app.include_router(mission.router, prefix="/api")
app.include_router(hop.router, prefix="/api")
app.include_router(tool_step.router, prefix="/api")
app.include_router(user_session.router, prefix="/api")
app.include_router(llm.router, prefix="/api")
app.include_router(tools.router, prefix="/api")
app.include_router(search.router, prefix="/api")
app.include_router(web_retrieval.router, prefix="/api")
app.include_router(state_transition.router, prefix="/api")
app.include_router(pubmed.router, prefix="/api")
app.include_router(google_scholar.router, prefix="/api")
app.include_router(extraction.router, prefix="/api")
app.include_router(unified_search.router, prefix="/api")
app.include_router(lab.router, prefix="/api")
app.include_router(smart_search.router, prefix="/api")
app.include_router(smart_search2.router, prefix="/api")

# Additional API routers (prefix added here)
app.include_router(workbench.router, prefix="/api")        # /api/workbench (unified)
app.include_router(article_chat.router, prefix="/api")     # /api/article-chat
app.include_router(pubmed_search_designer.router, prefix="/api/pubmed")  # /api/pubmed/fetch-articles, /api/pubmed/test-search
app.include_router(analytics.router, prefix="/api")  # /api/analytics

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