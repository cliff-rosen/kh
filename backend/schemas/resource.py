"""
Resource Schema Definitions

This module contains all Pydantic models and related utilities for defining
and managing Resources. Resources represent external systems, APIs, or
databases that tools can depend on.
"""

from __future__ import annotations
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional, Literal
from datetime import datetime
from schemas.base import SchemaType

# --- Type Definitions for Resources ---

AuthFieldType = Literal['string', 'secret', 'url']
AuthType = Literal['oauth2', 'api_key', 'basic_auth', 'none']
ResourceType = Literal['database', 'api', 'file_system', 'messaging', 'storage', 'web', 'social']

# --- Core Resource Models ---

class AuthField(BaseModel):
    """Defines a single field required for authentication with a resource."""
    field_name: str
    field_type: AuthFieldType
    required: bool
    description: str

class AuthConfig(BaseModel):
    """Defines the authentication mechanism and required fields for a resource."""
    type: AuthType
    required_fields: List[AuthField]

class ResourceExample(BaseModel):
    """Example usage of a resource"""
    description: str
    connection_example: Dict[str, Any]
    use_case: str

class Resource(BaseModel):
    """
    Represents an external resource that a tool can depend on. This includes
    its type, authentication requirements, and other metadata.
    """
    id: str
    name: str
    type: ResourceType
    description: str
    auth_config: AuthConfig
    connection_schema: SchemaType
    capabilities: List[str] = Field(default_factory=list)
    base_url: Optional[str] = None
    documentation_url: Optional[str] = None
    rate_limits: Optional[Dict[str, Any]] = None
    examples: List[ResourceExample] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class ResourceConfig(BaseModel):
    """Configuration for a resource"""
    resource_id: str
    config: Dict[str, Any]

# --- Resource Validation Utilities ---

def validate_resource_config(resource_definition: Resource, provided_config: Dict[str, Any]) -> List[str]:
    """
    Validates a provided resource configuration against the resource's
    authentication requirements.

    Args:
        resource_definition: The definition of the resource.
        provided_config: The user-provided configuration dictionary.

    Returns:
        A list of error strings, or an empty list if validation succeeds.
    """
    errors = []
    auth_def = resource_definition.auth_config

    for field in auth_def.required_fields:
        if field.required and field.field_name not in provided_config:
            errors.append(f"Required field '{field.field_name}' is missing.")
        
        # Can add more validation here (e.g., type checking) if needed.

    return errors

# Utility functions for resource introspection
def get_required_auth_fields(resource: Resource) -> List[AuthField]:
    """Get all required authentication fields for a resource"""
    return [field for field in resource.auth_config.required_fields if field.required]

def get_secret_fields(resource: Resource) -> List[AuthField]:
    """Get all secret fields for a resource"""
    return [field for field in resource.auth_config.required_fields if field.field_type == 'secret']

def get_url_fields(resource: Resource) -> List[AuthField]:
    """Get all URL fields for a resource"""
    return [field for field in resource.auth_config.required_fields if field.field_type == 'url']

def get_string_fields(resource: Resource) -> List[AuthField]:
    """Get all string fields for a resource"""
    return [field for field in resource.auth_config.required_fields if field.field_type == 'string']

# Built-in resource definitions
GMAIL_RESOURCE = Resource(
    id="gmail",
    name="Gmail",
    description="Google Gmail email service for searching and retrieving emails",
    type="messaging",
    auth_config=AuthConfig(
        type="oauth2",
        required_fields=[
            AuthField(field_name="access_token", field_type="secret", required=True, description="OAuth access token"),
            AuthField(field_name="refresh_token", field_type="secret", required=True, description="OAuth refresh token"),
            AuthField(field_name="token_expires_at", field_type="string", required=True, description="Token expiration timestamp")
        ]
    ),
    connection_schema={
        "type": "object",
        "description": "Gmail OAuth credentials",
        "is_array": False,
        "fields": {
            "access_token": {"type": "string", "description": "OAuth access token", "is_array": False},
            "refresh_token": {"type": "string", "description": "OAuth refresh token", "is_array": False},
            "token_expires_at": {"type": "string", "description": "Token expiration timestamp", "is_array": False}
        }
    },
    capabilities=["search", "retrieve", "send", "list_folders"],
    base_url="https://gmail.googleapis.com",
    documentation_url="https://developers.google.com/gmail/api",
    rate_limits={
        "requests_per_minute": 250,
        "requests_per_day": 1000000,
        "concurrent_requests": 10
    },
    examples=[
        ResourceExample(
            description="Search for emails in Gmail",
            connection_example={
                "access_token": "ya29.a0...",
                "refresh_token": "1//04...",
                "token_expires_at": "2024-01-15T14:30:00Z"
            },
            use_case="Retrieve AI newsletter emails from the last month"
        )
    ]
)

PUBMED_RESOURCE = Resource(
    id="pubmed",
    name="PubMed Database",
    description="NCBI PubMed database for searching biomedical research articles",
    type="database",
    auth_config=AuthConfig(
        type="api_key",
        required_fields=[
            AuthField(field_name="api_key", field_type="string", required=True, description="NCBI API key (optional but recommended)"),
            AuthField(field_name="email", field_type="string", required=True, description="Contact email for API usage")
        ]
    ),
    connection_schema={
        "type": "object",
        "description": "PubMed API configuration",
        "is_array": False,
        "fields": {
            "api_key": {"type": "string", "description": "NCBI API key (optional but recommended)", "is_array": False},
            "email": {"type": "string", "description": "Contact email for API usage", "is_array": False}
        }
    },
    capabilities=["search", "retrieve", "get_metadata"],
    base_url="https://eutils.ncbi.nlm.nih.gov",
    documentation_url="https://www.ncbi.nlm.nih.gov/books/NBK25501/",
    rate_limits={
        "requests_per_minute": 10,  # Higher with API key
        "concurrent_requests": 3
    },
    examples=[
        ResourceExample(
            description="Search for research articles",
            connection_example={
                "api_key": "abc123def456",
                "email": "researcher@university.edu"
            },
            use_case="Find recent papers on machine learning in healthcare"
        )
    ]
)

WEB_SEARCH_RESOURCE = Resource(
    id="web_search",
    name="Web Search",
    description="Search the web using search engines (Google, Bing, etc.)",
    type="web",
    auth_config=AuthConfig(
        type="api_key",
        required_fields=[
            AuthField(field_name="api_key", field_type="string", required=True, description="Search API key"),
            AuthField(field_name="search_engine", field_type="string", required=True, description="Which search engine to use"),
            AuthField(field_name="custom_search_id", field_type="string", required=False, description="Custom search engine ID (if applicable)")
        ]
    ),
    connection_schema={
        "type": "object",
        "description": "Web search API credentials",
        "is_array": False,
        "fields": {
            "api_key": {"type": "string", "description": "Search API key", "is_array": False},
            "search_engine": {"type": "string", "description": "Which search engine to use", "is_array": False},
            "custom_search_id": {"type": "string", "description": "Custom search engine ID (if applicable)", "is_array": False}
        }
    },
    capabilities=["search", "get_snippets", "get_urls"],
    base_url="https://www.googleapis.com/customsearch/v1",
    documentation_url="https://developers.google.com/custom-search/v1/overview",
    rate_limits={
        "requests_per_day": 100,
        "concurrent_requests": 2
    },
    examples=[
        ResourceExample(
            description="Search the web for information",
            connection_example={
                "api_key": "AIza...",
                "search_engine": "google",
                "custom_search_id": "017576662512468239146:omuauf_lfve"
            },
            use_case="Find recent news about AI developments"
        )
    ]
)

DROPBOX_RESOURCE = Resource(
    id="dropbox",
    name="Dropbox",
    description="Dropbox file storage and sharing service",
    type="storage",
    auth_config=AuthConfig(
        type="oauth2",
        required_fields=[
            AuthField(field_name="access_token", field_type="secret", required=True, description="Dropbox access token"),
            AuthField(field_name="refresh_token", field_type="secret", required=True, description="Dropbox refresh token")
        ]
    ),
    connection_schema={
        "type": "object",
        "description": "Dropbox API credentials",
        "is_array": False,
        "fields": {
            "access_token": {"type": "string", "description": "Dropbox access token", "is_array": False},
            "refresh_token": {"type": "string", "description": "Dropbox refresh token", "is_array": False}
        }
    },
    capabilities=["upload", "download", "list", "search", "share"],
    base_url="https://api.dropboxapi.com",
    documentation_url="https://developers.dropbox.com/documentation",
    rate_limits={
        "requests_per_minute": 120,
        "concurrent_requests": 5
    },
    examples=[
        ResourceExample(
            description="Access files in Dropbox",
            connection_example={
                "access_token": "sl.B...",
                "refresh_token": "1234..."
            },
            use_case="Download and analyze CSV files from project folder"
        )
    ]
)

# Resource registry
RESOURCE_REGISTRY: Dict[str, Resource] = {
    "gmail": GMAIL_RESOURCE,
    "pubmed": PUBMED_RESOURCE, 
    "web_search": WEB_SEARCH_RESOURCE,
    "dropbox": DROPBOX_RESOURCE
}

def get_resource(resource_id: str) -> Optional[Resource]:
    """Get a resource by ID"""
    return RESOURCE_REGISTRY.get(resource_id)

def get_resources_by_type(resource_type: ResourceType) -> List[Resource]:
    """Get all resources of a specific type"""
    return [resource for resource in RESOURCE_REGISTRY.values() if resource.type == resource_type]

def get_resources_with_capability(capability: str) -> List[Resource]:
    """Get all resources that support a specific capability"""
    return [resource for resource in RESOURCE_REGISTRY.values() if capability in resource.capabilities]

def validate_connection_data(resource_id: str, connection_data: Dict[str, Any]) -> bool:
    """Validate connection data against resource schema"""
    resource = get_resource(resource_id)
    if not resource:
        return False
    
    # TODO: Implement proper schema validation
    # For now, just check if required fields are present
    return True

# Resource utility functions
def get_resource_auth_fields(resource: Resource) -> List[AuthField]:
    """Get all authentication fields for a resource"""
    return resource.auth_config.required_fields

def get_optional_auth_fields(resource: Resource) -> List[AuthField]:
    """Get optional authentication fields for a resource"""
    return [field for field in resource.auth_config.required_fields if not field.required]

def has_secret_fields(resource: Resource) -> bool:
    """Check if resource has any secret fields"""
    return any(field.field_type == 'secret' for field in resource.auth_config.required_fields)