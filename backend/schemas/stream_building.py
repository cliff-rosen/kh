"""
Stream Building Schemas
Types for the stream building workflow - how a stream is built
"""

from pydantic import BaseModel, Field
from typing import List, Optional
from enum import Enum


# ============================================================================
# Stream being built (all fields optional as they're filled in progressively)
# ============================================================================

class ChannelInProgress(BaseModel):
    """Channel being built within a stream - LLM creates only these 4 fields"""
    name: Optional[str] = None
    focus: Optional[str] = None
    type: Optional[str] = None  # string during building, validated on submission
    keywords: Optional[List[str]] = None
    # NOTE: semantic_filter is NOT created during workflow - added downstream


class StreamInProgress(BaseModel):
    """Stream being built - all fields optional as they're filled progressively"""
    stream_name: Optional[str] = None
    purpose: Optional[str] = None
    channels: Optional[List[ChannelInProgress]] = None
    report_frequency: Optional[str] = None  # string during building, validated on submission
    scoring_config: Optional[dict] = None


# ============================================================================
# Build workflow steps
# ============================================================================

class StreamBuildStep(str, Enum):
    """Steps in the stream building workflow"""
    EXPLORATION = "exploration"
    STREAM_NAME = "stream_name"
    PURPOSE = "purpose"
    CHANNELS = "channels"  # Collect all channels
    REPORT_FREQUENCY = "report_frequency"
    REVIEW = "review"
    COMPLETE = "complete"


# ============================================================================
# User actions during building
# ============================================================================

class UserActionType(str, Enum):
    """Types of actions a user can take during stream building"""
    SELECT_SUGGESTION = "select_suggestion"
    CONFIRM_SELECTION = "confirm_selection"
    TEXT_INPUT = "text_input"
    SKIP_STEP = "skip_step"
    ACCEPT_REVIEW = "accept_review"
    OPTION_SELECTED = "option_selected"
    OPTIONS_SELECTED = "options_selected"


class UserAction(BaseModel):
    """Metadata about what type of action the user is taking"""
    type: UserActionType
    target_field: Optional[str] = Field(None, description="Which field this action affects")
    selected_value: Optional[str] = Field(None, description="Single selection value")
    selected_values: Optional[List[str]] = Field(None, description="Multiple selection values")


# ============================================================================
# Interactive UI elements presented by AI
# ============================================================================

class Suggestion(BaseModel):
    """A suggestion chip for user selection"""
    label: str = Field(description="Display text for the suggestion")
    value: str = Field(description="Value to use when selected")


class MultiSelectOption(BaseModel):
    """A checkbox option for multi-selection"""
    label: str = Field(description="Display text for the option")
    value: str = Field(description="Value of the option")
    checked: bool = Field(description="Whether the option is currently selected")
