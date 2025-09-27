from typing import List, Optional, Dict, Any
from datetime import datetime
import base64
from bs4 import BeautifulSoup
from sqlalchemy import text
import logging
from sqlalchemy.orm import Session
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from google.auth.transport.requests import Request

from config.settings import settings
from models import ResourceCredentials
from schemas.email import DateRange
from schemas.resource import GMAIL_RESOURCE

logger = logging.getLogger(__name__)

# Google API Docs
# https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list

class EmailService:
    SCOPES = [
        'https://www.googleapis.com/auth/userinfo.profile',  # Match the order from error
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/gmail.readonly',
        'openid'
    ]


    def __init__(self):
        self.service = None
        self.credentials = None

    def has_full_access(self) -> bool:
        """
        Check if we have full access to message content or just metadata
        """
        return 'https://www.googleapis.com/auth/gmail.readonly' in self.credentials.scopes

    async def authenticate(self, user_id: int, db: Session) -> bool:
        """
        Authenticate with Gmail API using stored credentials
        
        Args:
            user_id: User ID
            db: Database session
            
        Returns:
            bool: True if authentication successful, False otherwise
        """
        try:
            # Get credentials from database
            db_credentials = db.query(ResourceCredentials).filter(
                ResourceCredentials.user_id == user_id,
                ResourceCredentials.resource_id == GMAIL_RESOURCE.id
            ).first()
            
            if not db_credentials:
                logger.error(f"No Gmail credentials found for user {user_id}")
                return False
                
            # Create credentials object
            creds_data = db_credentials.credentials
            self.credentials = Credentials(
                token=creds_data['access_token'],
                refresh_token=creds_data['refresh_token'],
                token_uri=creds_data['token_uri'],
                client_id=creds_data['client_id'],
                client_secret=creds_data['client_secret'],
                scopes=creds_data['scopes']
            )
            
            # Refresh token if expired
            if self.credentials.expired:
                try:
                    logger.info("Refreshing expired credentials")
                    self.credentials.refresh(Request())
                    
                    # Update database with new token
                    creds_data['access_token'] = self.credentials.token
                    creds_data['token_expires_at'] = self.credentials.expiry.isoformat()
                    db_credentials.credentials = creds_data
                    db.commit()
                    logger.info("Successfully refreshed credentials")
                except Exception as e:
                    logger.error(f"Error refreshing credentials: {str(e)}")
                    return False
            
            # Build Gmail API service
            self.service = build('gmail', 'v1', credentials=self.credentials)
            return True
            
        except Exception as e:
            logger.error(f"Error authenticating with Gmail API: {str(e)}")
            return False

    async def list_labels(self, include_system_labels: bool = True) -> List[Dict[str, Any]]:
        """
        List all email labels/folders
        
        Args:
            include_system_labels: Whether to include system labels
            
        Returns:
            List of label objects
        """
        try:
            if not self.service:
                raise ValueError("Service not initialized. Call authenticate first.")
                
            results = self.service.users().labels().list(userId='me').execute()
            labels = results.get('labels', [])
            
            if not include_system_labels:
                # Filter out system labels
                labels = [label for label in labels if label['type'] != 'system']
                
            return labels
            
        except HttpError as e:
            logger.error(f"Error listing labels: {str(e)}")
            raise

    # Get body - handle different message structures
    def get_body_from_parts(self, parts):
        plain = None
        html = None

        for part in parts:
            # Handle multipart messages
            if part.get('mimeType', '').startswith('multipart/'):
                if 'parts' in part:
                    body = self.get_body_from_parts(part['parts'])
                    if body:
                        return body
            # Handle text/plain
            elif part.get('mimeType') == 'text/plain':
                if 'data' in part['body']:
                    plain = base64.urlsafe_b64decode(part['body']['data']).decode('utf-8', errors='replace')
            # Handle text/html
            elif part.get('mimeType') == 'text/html':
                if 'data' in part['body']:
                    html_raw = base64.urlsafe_b64decode(part['body']['data']).decode('utf-8', errors='replace')
                    # Clean HTML using BeautifulSoup
                    soup = BeautifulSoup(html_raw, "html.parser")
                    
                    # Remove unwanted elements
                    for element in soup.find_all(['script', 'style', 'meta', 'link', 'noscript', 'iframe', 'form', 'input', 'button', 'img']):
                        element.decompose()
                    
                    # Remove empty tags
                    for tag in soup.find_all():
                        if len(tag.get_text(strip=True)) == 0:
                            tag.decompose()
                    
                    # Clean up whitespace and formatting
                    for tag in soup.find_all(['p', 'div', 'span', 'br']):
                        # Replace multiple spaces with single space
                        if tag.string:
                            tag.string.replace_with(' '.join(tag.string.split()))
                    
                    # Get text with proper spacing and formatting
                    html = soup.get_text(separator='\n', strip=True)
                    # Clean up multiple newlines
                    html = '\n'.join(line.strip() for line in html.split('\n') if line.strip())
        
        # Return both formats if available
        return {
            'html': html,
            'plain': plain
        }
            
    def get_best_body_from_parts(self, parts):
        plain = None
        html = None

        for part in parts:
            print("********************************************************************`")
            print("part mtype: ", part.get('mimeType', ''))
            mime = part.get('mimeType', '')
            body_data = part.get('body', {}).get('data')

            if mime.startswith('multipart/') and 'parts' in part:
                result = self.get_best_body_from_parts(part['parts'])
                if result:
                    return result

            elif mime == 'text/plain' and body_data and not plain:
                plain = base64.urlsafe_b64decode(body_data).decode('utf-8', errors='replace')

            elif mime == 'text/html' and body_data and not html:
                html_raw = base64.urlsafe_b64decode(body_data).decode('utf-8', errors='replace')
                html = BeautifulSoup(html_raw, "html.parser").get_text(separator="\n")

        return plain or html

    async def get_message(
        self,
        message_id: str,
        include_attachments: bool = False,
        include_metadata: bool = True
    ) -> Dict[str, Any]:
        """
        Get a specific message by ID
        
        Args:
            message_id: Message ID
            include_attachments: Whether to include attachment data (not used)
            include_metadata: Whether to include message metadata (not used)
            
        Returns:
            Message object with essential information
            
        Raises:
            ValueError: If full access is not available
        """
        try:
            logger.info(f"Fetching message {message_id}")
            
            if not self.service:
                logger.error("Service not initialized. Call authenticate first.")
                raise ValueError("Service not initialized. Call authenticate first.")
                
            # Check for full access
            if not self.has_full_access():
                logger.error("Full access to Gmail is required")
                raise ValueError("Full access to Gmail is required. Please reconnect with the correct permissions.")
                
            # Get full message details
            logger.debug(f"Making Gmail API request for message {message_id}")
            message = self.service.users().messages().get(
                userId='me',
                id=message_id,
                format='full'  # Changed from 'metadata' to 'full' to get body
            ).execute()
            
            # Parse message parts
            headers = {}
            body = {'html': None, 'plain': None}
            
            if 'payload' in message:
                payload = message['payload']
                
                # Get headers
                if 'headers' in payload:
                    headers = {
                        header['name'].lower(): header['value']
                        for header in payload['headers']
                    }
                    logger.debug(f"Extracted headers: {list(headers.keys())}")
               
                # Get body
                if 'parts' in payload:
                    logger.info(f"Message {message_id} has multiple parts")
                    body = self.get_body_from_parts(payload['parts'])
                elif 'body' in payload and 'data' in payload['body']:
                    logger.info(f"Message {message_id} has single part")
                    # Convert raw body to plain text
                    raw_body = base64.urlsafe_b64decode(payload['body']['data']).decode('utf-8', errors='replace')
                    body = {'plain': raw_body, 'html': None}
                            
            # Extract essential information
            result = {
                'id': message['id'],
                'date': str(message.get('internalDate', '')),  # Convert to string
                'from': headers.get('from', ''),
                'to': headers.get('to', ''),
                'subject': headers.get('subject', '(No Subject)'),
                'body': body,  # Now always returns {html, plain} structure
                'snippet': message.get('snippet', '')
            }
            
            logger.info(f"Successfully processed message {message_id}")
            return result
            
        except HttpError as e:
            logger.error(f"Gmail API error getting message {message_id}: {str(e)}", exc_info=True)
            raise
        except Exception as e:
            logger.error(f"Unexpected error getting message {message_id}: {str(e)}", exc_info=True)
            raise

    async def get_messages(
        self,
        label_ids: Optional[List[str]] = None,
        query: Optional[str] = None,
        max_results: int = 100,
        include_spam_trash: bool = False,
        page_token: Optional[str] = None,
        include_attachments: bool = False,
        include_metadata: bool = True,
        db: Optional[Session] = None,
        save_to_newsletters: bool = False
    ) -> Dict[str, Any]:
        """
        Get messages from specified labels
        
        Args:
            label_ids: List of label IDs to search in
            query: Gmail search query string
            max_results: Maximum number of results to return (1-500)
            include_spam_trash: Whether to include messages from SPAM and TRASH
            page_token: Token for retrieving the next page of results
            include_attachments: Whether to include attachment data (not used)
            include_metadata: Whether to include message metadata (not used)
            db: Database session (used for authentication and saving to newsletters)
            save_to_newsletters: Whether to save messages to newsletters table
            
        Returns:
            A dictionary containing:
            - messages: List of message objects
            - count: Number of messages retrieved
            - nextPageToken: Token for retrieving the next page (if any)
        """
        try:
            logger.info(f"Starting get_messages with params: label_ids={label_ids}, query={query}, max_results={max_results}")
            
            if not self.service:
                logger.error("Service not initialized. Call authenticate first.")
                raise ValueError("Service not initialized. Call authenticate first.")
                
            # Get messages with proper label handling
            logger.info(f"Making Gmail API request with query={query}, label_ids={label_ids}")
            results = self.service.users().messages().list(
                userId='me',
                q=query,
                maxResults=max_results,
                labelIds=label_ids,
                includeSpamTrash=include_spam_trash,
                pageToken=page_token
            ).execute()
            
            messages = results.get('messages', [])
            logger.info(f"Retrieved {len(messages)} messages from Gmail API")
            
            detailed_messages = []
            for i, msg in enumerate(messages):
                try:
                    logger.debug(f"Fetching details for message {i+1}/{len(messages)}: {msg['id']}")
                    message = await self.get_message(msg['id'])
                    detailed_messages.append(message)
                    logger.debug(f"Successfully fetched message {i+1}")
                except Exception as e:
                    logger.error(f"Error fetching message {msg['id']}: {str(e)}")
                    continue
                
            logger.info(f"Successfully fetched {len(detailed_messages)} detailed messages")
            return {
                'messages': detailed_messages,
                'count': len(detailed_messages),
                'nextPageToken': results.get('nextPageToken')
            }
            
        except HttpError as e:
            logger.error(f"Gmail API error getting messages: {str(e)}", exc_info=True)
            raise
        except Exception as e:
            logger.error(f"Unexpected error getting messages: {str(e)}", exc_info=True)
            raise

    async def store_messages_to_newsletters(self, messages: List[Dict[str, Any]], db: Session) -> List[int]:
        """
        Store a list of email messages in the newsletters table
        
        Args:
            messages: List of message objects from get_messages
            db: Database session
            
        Returns:
            List of inserted newsletter IDs
        """
        try:
            inserted_ids = []
            
            for message in messages:
                # Extract date from internalDate (which is in milliseconds since epoch)
                email_date = datetime.fromtimestamp(int(message['date']) / 1000).date()
                
                # Get the best content - prefer HTML if available, fall back to plain text
                content = message['body'].get('html') or message['body'].get('plain') or ''
                
                # Create newsletter record
                newsletter = {
                    'source_name': message['from'],
                    'issue_identifier': None,  # Can be populated later if needed
                    'email_date': email_date,
                    'subject_line': message['subject'],
                    'raw_content': content,
                    'cleaned_content': None,  # Can be populated later
                    'extraction': '{}',  # Empty JSON object as default
                    'processed_status': 'pending'
                }
                
                # Insert into database using SQLAlchemy text()
                query = text("""
                    INSERT INTO newsletters 
                    (source_name, issue_identifier, email_date, subject_line, 
                     raw_content, cleaned_content, extraction, processed_status)
                    VALUES 
                    (:source_name, :issue_identifier, :email_date, :subject_line,
                     :raw_content, :cleaned_content, :extraction, :processed_status)
                """)
                
                result = db.execute(query, newsletter)
                inserted_ids.append(result.lastrowid)
                
            db.commit()
            return inserted_ids
            
        except Exception as e:
            db.rollback()
            logger.error(f"Error storing messages to newsletters: {str(e)}", exc_info=True)
            raise 

    async def get_messages_and_store(
        self,
        db: Session,
        label_ids: Optional[List[str]] = None,
        query: Optional[str] = None,
        max_results: int = 100,
        include_spam_trash: bool = False,
        page_token: Optional[str] = None,
        include_attachments: bool = False,
        include_metadata: bool = True
    ) -> Dict[str, Any]:
        """
        Get messages from Gmail and store them in the newsletters table
        
        Args:
            db: Database session (required)
            label_ids: List of label IDs to search in
            query: Gmail search query string
            max_results: Maximum number of results to return (1-500)
            include_spam_trash: Whether to include messages from SPAM and TRASH
            page_token: Token for retrieving the next page of results
            include_attachments: Whether to include attachment data
            include_metadata: Whether to include message metadata
            
        Returns:
            Dictionary containing:
            - messages: List of fetched message objects
            - count: Number of messages retrieved
            - stored_ids: List of IDs of successfully stored newsletters
            - error: Error message if storage failed (None if successful)
            - nextPageToken: Token for retrieving the next page (if any)
        """
        try:
            print("Retrieving messages with params: ", label_ids, query, max_results, include_spam_trash, page_token)
            # First get the messages
            result = await self.get_messages(
                label_ids=label_ids,
                query=query,
                max_results=max_results,
                include_spam_trash=include_spam_trash,
                page_token=page_token,
                include_attachments=include_attachments,
                include_metadata=include_metadata,
                db=db
            )
            messages = result.get('messages', [])
            count = result.get('count', 0)
            
            # Then store them
            try:
                stored_ids = await self.store_messages_to_newsletters(messages, db)
                return {
                    'messages': messages,
                    'count': count,
                    'stored_ids': stored_ids,
                    'error': None,
                    'nextPageToken': result.get('nextPageToken')
                }
            except Exception as e:
                logger.error(f"Error storing messages to newsletters: {str(e)}")
                return {
                    'messages': messages,
                    'count': count,
                    'stored_ids': [],
                    'error': str(e),
                    'nextPageToken': result.get('nextPageToken')
                }
                
        except Exception as e:
            logger.error(f"Error in get_messages_and_store: {str(e)}")
            raise 