from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
from datetime import datetime, date
from pydantic import BaseModel, Field
from google_auth_oauthlib.flow import Flow
from jose import JWTError, jwt
import asyncio

import logging
from config.settings import settings

from database import get_db
from models import ResourceCredentials, User

from schemas.email import DateRange
from schemas.resource import GMAIL_RESOURCE

from services.auth_service import validate_token
from services.email_service import EmailService


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/email", tags=["email"])
email_service = EmailService()


# Request/Response models for email endpoints
class EmailSearchParams(BaseModel):
    """Parameters for email search"""
    query: str = Field(description="Gmail search query")
    folder: Optional[str] = Field(default="INBOX", description="Gmail folder/label to search in")
    date_range: Optional[DateRange] = Field(default=None, description="Date range to search within")
    limit: int = Field(default=100, ge=1, le=500, description="Maximum number of results to return")
    include_attachments: bool = Field(default=False, description="Whether to include attachment data")
    include_metadata: bool = Field(default=True, description="Whether to include message metadata")

class EmailAgentResponse(BaseModel):
    """Response model for email agent operations"""
    success: bool
    data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None

##########################
### Email Management ###
##########################

@router.get("/labels", response_model=EmailAgentResponse)
async def list_labels(
    include_system_labels: bool = True,
    user = Depends(validate_token),
    db: Session = Depends(get_db)
):
    """
    List all email labels/folders
    
    Args:
        include_system_labels: Whether to include system labels
        user: Authenticated user
        db: Database session
        
    Returns:
        EmailAgentResponse with list of labels
    """
    try:
        # Authenticate with Gmail API
        if not await email_service.authenticate(user.user_id, db):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Failed to authenticate with Gmail API"
            )
            
        # Get labels
        labels = await email_service.list_labels(include_system_labels)
        
        return EmailAgentResponse(
            success=True,
            data={'labels': labels},
            metadata={'total_labels': len(labels)}
        )
        
    except Exception as e:
        logger.error(f"Error listing labels: {str(e)}")
        return EmailAgentResponse(
            success=False,
            error=str(e)
        )

@router.post("/messages", response_model=EmailAgentResponse)
async def get_messages(
    params: EmailSearchParams,
    user = Depends(validate_token),
    db: Session = Depends(get_db)
):
    """
    Get messages based on search parameters
    
    Args:
        params: Search parameters
        user: Authenticated user
        db: Database session
        
    Returns:
        EmailAgentResponse with list of messages
    """
    try:
        # Authenticate with Gmail API
        if not await email_service.authenticate(user.user_id, db):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Failed to authenticate with Gmail API"
            )
            
        # Get messages
        print(f"Params: {params}")
        messages = await email_service.get_messages(
            folders=params.folders,
            date_range=params.date_range,
            query_terms=params.query_terms,
            max_results=params.max_results,
            include_attachments=params.include_attachments,
            include_metadata=params.include_metadata
        )
        
        return EmailAgentResponse(
            success=True,
            data={
                'messages': messages
            },
            metadata={
                'total_messages': len(messages),
                'query': params.dict()
            }
        )
        
    except Exception as e:
        logger.error(f"Error getting messages: {str(e)}")
        return EmailAgentResponse(
            success=False,
            error=str(e)
        )

@router.post("/messages/store", response_model=EmailAgentResponse)
async def get_messages_and_store(
    params: EmailSearchParams,
    user = Depends(validate_token),
    db: Session = Depends(get_db)
):
    """
    Get messages from Gmail and store them in the newsletters table
    
    Args:
        params: Email search parameters
        user: Authenticated user
        db: Database session
        
    Returns:
        EmailAgentResponse with messages and storage results
    """
    try:
        # Authenticate with Gmail API
        if not await email_service.authenticate(user.user_id, db):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Failed to authenticate with Gmail API"
            )
            
        # Get messages and store them
        result = await email_service.get_messages_and_store(
            db=db,
            folders=params.folders,
            date_range=params.date_range,
            query_terms=params.query_terms,
            max_results=params.max_results,
            include_attachments=params.include_attachments,
            include_metadata=params.include_metadata
        )
        
        # Check if there was an error storing messages
        if result['error']:
            return EmailAgentResponse(
                success=True,  # Still true because we got the messages
                data={
                    'messages': result['messages'],
                    'stored_ids': result['stored_ids'],
                    'storage_error': result['error']
                },
                message=f"Retrieved {len(result['messages'])} messages. Warning: {result['error']}"
            )
            
        return EmailAgentResponse(
            success=True,
            data={
                'messages': result['messages'],
                'stored_ids': result['stored_ids']
            },
            message=f"Successfully retrieved and stored {len(result['messages'])} messages"
        )
        
    except Exception as e:
        logger.error(f"Error in get_messages_and_store: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.get("/messages/{message_id}", response_model=EmailAgentResponse)
async def get_message(
    message_id: str,
    include_attachments: bool = False,
    include_metadata: bool = True,
    user = Depends(validate_token),
    db: Session = Depends(get_db)
):
    """
    Get a specific message by ID
    
    Args:
        message_id: Message ID
        include_attachments: Whether to include attachment data
        include_metadata: Whether to include message metadata
        user: Authenticated user
        db: Database session
        
    Returns:
        EmailAgentResponse with message details
    """
    try:
        # Authenticate with Gmail API
        if not await email_service.authenticate(user.user_id, db):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Failed to authenticate with Gmail API"
            )
            
        # Get message
        message = await email_service.get_message(
            message_id,
            include_attachments=include_attachments,
            include_metadata=include_metadata
        )
        
        return EmailAgentResponse(
            success=True,
            data={'message': message},
            metadata={
                'has_attachments': len(message.get('attachments', [])) > 0,
                'attachment_count': len(message.get('attachments', []))
            }
        )
        
    except Exception as e:
        logger.error(f"Error getting message: {str(e)}")
        return EmailAgentResponse(
            success=False,
            error=str(e)
        )

##########################
### Session Management ###
##########################

def credentials_to_dict(credentials):
    return {
        "token": credentials.token,
        "refresh_token": credentials.refresh_token,
        "token_uri": credentials.token_uri,
        "client_id": credentials.client_id,
        "client_secret": credentials.client_secret,
        "scopes": credentials.scopes,
    }

@router.get("/auth/init")
async def init_oauth2(
    user = Depends(validate_token),
    db: Session = Depends(get_db)
):
    """
    Initialize the OAuth2 flow for Google Mail API
    
    Args:
        user: Authenticated user
        db: Database session
        
    Returns:
        JSON response with the authorization URL
    """
    try:
        # Log the redirect URI being used
        logger.info(f"Using redirect URI: {settings.GOOGLE_REDIRECT_URI}")
        
        # Create OAuth2 flow
        flow = Flow.from_client_config(
            {
                "web": {
                    "client_id": settings.GOOGLE_CLIENT_ID,
                    "client_secret": settings.GOOGLE_CLIENT_SECRET,
                    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                    "token_uri": "https://oauth2.googleapis.com/token",
                    "redirect_uris": [settings.GOOGLE_REDIRECT_URI],
                    "scopes": email_service.SCOPES
                }
            },
            scopes=email_service.SCOPES,
            redirect_uri=settings.GOOGLE_REDIRECT_URI
        )
        
        # Generate authorization URL
        auth_url, state = flow.authorization_url(
            access_type='offline',
            include_granted_scopes='false',
            prompt='consent'
        )
        
        # Log the generated authorization URL
        logger.info(f"Generated authorization URL: {auth_url}")
        
        # Store state in session or database for verification
        # For now, we'll use the user_id as part of the state
        state = f"{state}_{user.user_id}"
        
        return {"url": auth_url}
        
    except Exception as e:
        logger.error(f"Error initializing OAuth2 flow: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error initializing OAuth2 flow: {str(e)}"
        )

@router.get("/auth/callback")
async def oauth2_callback(
    code: str,
    state: str,
    db: Session = Depends(get_db)
):
    """
    Handle the OAuth2 callback from Google
    
    Args:
        code: Authorization code from Google
        state: State parameter for verification
        db: Database session
        
    Returns:
        JSON response with success status
    """
    try:
        # Log the received parameters
        logger.info(f"Received callback with state: {state}")
        
        # Create OAuth2 flow
        flow = Flow.from_client_config(
            {
                "web": {
                    "client_id": settings.GOOGLE_CLIENT_ID,
                    "client_secret": settings.GOOGLE_CLIENT_SECRET,
                    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                    "token_uri": "https://oauth2.googleapis.com/token",
                    "redirect_uris": [settings.GOOGLE_REDIRECT_URI],
                    "scopes": email_service.SCOPES
                }
            },
            scopes=email_service.SCOPES,
            redirect_uri=settings.GOOGLE_REDIRECT_URI
        )
        
        # Exchange code for tokens
        flow.fetch_token(code=code)
        credentials = flow.credentials
        
        # Decode the ID token
        try:
            # Add a small delay to ensure token is valid
            await asyncio.sleep(1)
            
            # Get the raw ID token
            raw_id_token = credentials.id_token
            print("Raw ID token: ", raw_id_token)

            # Decode without verification to get the token data
            decoded_token = jwt.decode(
                raw_id_token, 
                None, 
                options={
                    "verify_signature": False, 
                    "verify_aud": False,
                    "verify_exp": False,
                    "verify_at_hash": False
                }
            )

            # Get the email from the decoded token
            user_email = decoded_token.get('email')
            if not user_email:
                raise ValueError("No email found in ID token")
                
            logger.info(f"Got email from ID token: {user_email}")
            
        except JWTError as e:
            logger.error(f"Error decoding ID token: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to decode ID token: {str(e)}"
            )
        
        user = db.query(User).filter(User.email == user_email).first()
        
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"User not found for email: {user_email}"
            )
        
        # Prepare credentials data
        credentials_data = {
            'access_token': credentials.token,
            'refresh_token': credentials.refresh_token,
            'token_uri': credentials.token_uri,
            'client_id': credentials.client_id,
            'client_secret': credentials.client_secret,
            'scopes': credentials.scopes,
            'token_expires_at': credentials.expiry.isoformat() if credentials.expiry else None
        }
        
        # Store credentials in database
        db_credentials = ResourceCredentials(
            user_id=user.user_id,
            resource_id=GMAIL_RESOURCE.id,
            credentials=credentials_data
        )
        
        # Update or insert credentials
        existing_credentials = db.query(ResourceCredentials).filter(
            ResourceCredentials.user_id == user.user_id,
            ResourceCredentials.resource_id == GMAIL_RESOURCE.id
        ).first()
        
        if existing_credentials:
            # Check if scopes have changed
            if set(existing_credentials.credentials.get('scopes', [])) != set(credentials.scopes):
                logger.info(f"Scopes have changed for user {user.user_id}. Updating credentials.")
                existing_credentials.credentials = credentials_data
            else:
                # Only update token-related fields if scopes haven't changed
                existing_credentials.credentials.update({
                    'access_token': credentials.token,
                    'refresh_token': credentials.refresh_token,
                    'token_expires_at': credentials.expiry.isoformat() if credentials.expiry else None
                })
        else:
            db.add(db_credentials)
            
        db.commit()
        
        # Return success response
        return {"success": True, "message": "Gmail connected successfully"}
        
    except Exception as e:
        logger.error(f"Error handling OAuth2 callback: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error handling OAuth2 callback: {str(e)}"
        )

@router.post("/auth/disconnect")
async def disconnect_gmail(
    user = Depends(validate_token),
    db: Session = Depends(get_db)
):
    """
    Disconnect Gmail by removing OAuth2 credentials
    
    Args:
        user: Authenticated user
        db: Database session
        
    Returns:
        JSON response with success status
    """
    try:
        # Find and delete the user's Gmail credentials
        credentials = db.query(ResourceCredentials).filter(
            ResourceCredentials.user_id == user.user_id,
            ResourceCredentials.resource_id == GMAIL_RESOURCE.id
        ).first()
        
        if credentials:
            db.delete(credentials)
            db.commit()
            return {"success": True, "message": "Gmail disconnected successfully"}
        else:
            return {"success": True, "message": "Gmail was not connected"}
            
    except Exception as e:
        logger.error(f"Error disconnecting Gmail: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error disconnecting Gmail: {str(e)}"
        )
