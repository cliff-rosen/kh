from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime
from enum import Enum

class EmailLabelType(str, Enum):
    """Types of email labels"""
    SYSTEM = "system"  # Built-in labels like INBOX, SENT, etc.
    USER = "user"      # User-created labels
    CATEGORY = "category"  # Gmail categories like Social, Promotions, etc.

class EmailLabel(BaseModel):
    """Email label/folder model"""
    id: str
    name: str
    type: str
    messageListVisibility: Optional[str] = None
    labelListVisibility: Optional[str] = None

class EmailAttachment(BaseModel):
    """Email attachment model"""
    id: str
    filename: str
    mimeType: str
    size: Optional[int] = None
    data: Optional[str] = None  # Base64 encoded attachment data

class EmailMessage(BaseModel):
    """Email message model"""
    id: str
    threadId: str
    labelIds: List[str]
    snippet: Optional[str] = None
    headers: Optional[Dict[str, str]] = None
    body: Optional[str] = None
    attachments: List[EmailAttachment] = []
    internalDate: Optional[str] = None
    sizeEstimate: Optional[int] = None
    historyId: Optional[str] = None
    raw: Optional[str] = None

class EmailThread(BaseModel):
    """Schema for email threads"""
    id: str = Field(description="Unique identifier for the thread")
    message_ids: List[str] = Field(description="List of message IDs in this thread")
    snippet: str = Field(description="Short preview of the thread content")
    history_id: str = Field(description="History ID for tracking changes")
    messages: Optional[List[EmailMessage]] = Field(description="Full message objects (if expanded)")
    label_ids: List[str] = Field(description="List of label IDs applied to this thread")

class DateRange(BaseModel):
    """Date range model for email search"""
    start: Optional[datetime] = None
    end: Optional[datetime] = None

 