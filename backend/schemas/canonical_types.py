"""
Canonical Schema Definitions for Custom Data Types

This module serves as the single source of truth for all custom data types
used throughout the system. Tools, handlers, and application code should
reference these canonical schemas instead of defining their own.

This ensures consistency, maintainability, and type safety across the entire
codebase.
"""

from pydantic import BaseModel, Field, ConfigDict, field_validator, model_validator
from typing import Dict, Optional, List, Any, Union, Literal
from datetime import datetime
from schemas.base import SchemaType
import hashlib

# --- Registry of Canonical Schemas ---

class CanonicalFeatureDefinition(BaseModel):
    """
    Canonical Feature Definition schema - the definitive structure for feature
    definitions across the entire system (Smart Search, Workbench, etc.).
    """
    id: str = Field(description="Stable UUID for feature identification")
    name: str = Field(description="Feature display name")
    description: str = Field(description="Feature description for LLM extraction")
    type: Literal['boolean', 'text', 'score', 'number'] = Field(description="Feature data type")
    options: Optional[Dict[str, Any]] = Field(None, description="Feature options (e.g., min/max for score)")


# Type alias for feature values - aligned with CanonicalFeatureDefinition.type
CanonicalFeatureValue = Union[str, float, int, bool]
"""
Type for extracted feature values:
- bool: for 'boolean' type features
- str: for 'text' type features
- int: for 'number' type features (discrete values)
- float: for 'score' type features (continuous values)
"""

class CanonicalResearchArticle(BaseModel):
    """
    Unified canonical schema for research articles from any source (PubMed, Google Scholar, etc).
    This provides a consistent interface for the research workbench regardless of the data source.
    """
    model_config = ConfigDict(extra='forbid')
    
    # Core identification fields  
    id: Optional[str] = Field(default=None, description="Unique identifier (e.g., PMID for PubMed, URL for Scholar)")
    source: str = Field(description="Data source (e.g., 'pubmed', 'google_scholar')")
    title: str = Field(description="Article title")
    
    # Legacy fields for backward compatibility with existing session data
    # TODO: Remove these once all sessions are migrated to proper field names
    year: Optional[int] = Field(default=None, description="DEPRECATED: Use publication_year instead")
    pmid: Optional[str] = Field(default=None, description="DEPRECATED: Use id instead for PubMed articles")
    
    # Core metadata
    authors: List[str] = Field(default=[], description="List of author names")
    publication_date: Optional[str] = Field(default=None, description="Publication date (ISO format preferred)")
    publication_year: Optional[int] = Field(default=None, description="Publication year")
    journal: Optional[str] = Field(default=None, description="Journal or publication venue name")
    
    # PubMed-specific date fields (always populated for PubMed articles)
    date_completed: Optional[str] = Field(default=None, description="Date record was completed (YYYY-MM-DD)")
    date_revised: Optional[str] = Field(default=None, description="Date record was last revised (YYYY-MM-DD)")
    date_entered: Optional[str] = Field(default=None, description="Date entered into PubMed (YYYY-MM-DD)")
    date_published: Optional[str] = Field(default=None, description="Publication date with full precision (YYYY-MM-DD)")
    
    # Article content
    abstract: Optional[str] = Field(default=None, description="Full abstract text")
    snippet: Optional[str] = Field(default=None, description="Brief excerpt or summary")
    
    # Identifiers and links
    doi: Optional[str] = Field(default=None, description="Digital Object Identifier")
    url: Optional[str] = Field(default=None, description="Direct link to article")
    pdf_url: Optional[str] = Field(default=None, description="Direct link to PDF version")
    
    # Classification and indexing
    keywords: List[str] = Field(default=[], description="Article keywords")
    mesh_terms: List[str] = Field(default=[], description="MeSH terms (for biomedical articles)")
    categories: List[str] = Field(default=[], description="Article categories or classifications")
    
    # Metrics and citations
    citation_count: Optional[int] = Field(default=None, description="Number of citations")
    cited_by_url: Optional[str] = Field(default=None, description="Link to citing articles")
    
    # Related content
    related_articles_url: Optional[str] = Field(default=None, description="Link to related articles")
    versions_url: Optional[str] = Field(default=None, description="Link to different versions")
    
    # Search context
    search_position: Optional[int] = Field(default=None, description="Position in search results")
    relevance_score: Optional[float] = Field(default=None, description="Search relevance score")
    
    # Source-specific data
    source_metadata: Optional[Dict[str, Any]] = Field(default=None, description="Additional source-specific metadata")

    # Enrichment metadata (e.g., abstract source tracking)
    metadata: Optional[Dict[str, Any]] = Field(default=None, description="General metadata including enrichment information")

    # Extraction and analysis results (if applicable)
    extracted_features: Optional[Dict[str, CanonicalFeatureValue]] = Field(default=None, description="Extracted feature data keyed by feature.id -> CanonicalFeatureValue")
    quality_scores: Optional[Dict[str, float]] = Field(default=None, description="Various quality and relevance scores")
    
    # Timestamps
    indexed_at: Optional[str] = Field(default=None, description="When article was indexed by source")
    retrieved_at: Optional[str] = Field(default=None, description="When article was retrieved")

    @model_validator(mode='after')
    def generate_id_if_missing(self) -> 'CanonicalResearchArticle':
        """Generate an ID if missing, for backward compatibility with legacy session data."""
        if not self.id:
            # Generate a consistent ID based on title and source
            content = f"{self.title}|{self.source}"
            self.id = hashlib.md5(content.encode()).hexdigest()[:16]
        return self

class CanonicalExtractedFeature(BaseModel):
    """
    Canonical Extracted Feature schema - the definitive structure for extracted
    feature values across the entire system.
    """
    feature_id: str = Field(description="ID of the feature definition")
    value: Any = Field(description="Extracted feature value")
    confidence: Optional[float] = Field(None, description="Extraction confidence (0-1)")
    extraction_method: Literal['ai', 'manual', 'computed'] = Field(description="How the feature was extracted")
    extracted_at: str = Field(description="ISO timestamp when feature was extracted")
    error_message: Optional[str] = Field(None, description="Error message if extraction failed")

class CanonicalEmail(BaseModel):
    """
    Canonical Email schema - the definitive structure for email objects
    across the entire system.
    """
    id: str = Field(description="Unique email identifier")
    subject: str = Field(description="Email subject line")
    body: str = Field(description="Email body content (HTML or plain text)")
    sender: str = Field(description="Sender email address")
    recipients: List[str] = Field(default=[], description="List of recipient email addresses")
    timestamp: datetime = Field(description="Email timestamp")
    labels: List[str] = Field(default=[], description="Email labels/folders")
    thread_id: Optional[str] = Field(default=None, description="Thread ID if part of conversation")
    snippet: Optional[str] = Field(default=None, description="Email preview snippet")
    attachments: List[Dict[str, Any]] = Field(default=[], description="List of email attachments")
    metadata: Optional[Dict[str, Any]] = Field(default=None, description="Additional email metadata")

class CanonicalSearchResult(BaseModel):
    """
    Canonical Search Result schema - the definitive structure for web search
    results across the entire system.
    """
    title: str = Field(description="Page title")
    url: str = Field(description="Page URL")
    snippet: str = Field(description="Page snippet/description")
    published_date: Optional[str] = Field(default=None, description="Publication date (ISO format)")
    source: str = Field(description="Source domain")
    rank: int = Field(description="Search result rank")
    relevance_score: Optional[float] = Field(default=None, description="Relevance score (0-1)")
    metadata: Optional[Dict[str, Any]] = Field(default=None, description="Additional search metadata")

class CanonicalWebpage(BaseModel):
    """
    Canonical Webpage schema - the definitive structure for webpage objects.
    """
    url: str = Field(description="Webpage URL")
    title: str = Field(description="Webpage title")
    content: str = Field(description="Webpage content/text")
    html: Optional[str] = Field(default=None, description="Raw HTML content")
    last_modified: Optional[datetime] = Field(default=None, description="Last modification date")
    content_type: Optional[str] = Field(default=None, description="Content type (e.g., 'text/html')")
    status_code: Optional[int] = Field(default=None, description="HTTP status code")
    headers: Optional[Dict[str, str]] = Field(default=None, description="HTTP headers")
    metadata: Optional[Dict[str, Any]] = Field(default=None, description="Additional webpage metadata")

class CanonicalPubMedArticle(BaseModel):
    """
    Canonical PubMed Article schema - the definitive structure for academic articles.
    """
    pmid: str = Field(description="PubMed ID")
    title: str = Field(description="Article title")
    abstract: str = Field(description="Article abstract")
    authors: List[str] = Field(default=[], description="List of author names")
    journal: str = Field(description="Journal name")
    publication_date: Optional[str] = Field(default=None, description="Publication date")
    doi: Optional[str] = Field(default=None, description="Digital Object Identifier")
    keywords: List[str] = Field(default=[], description="Article keywords")
    mesh_terms: List[str] = Field(default=[], description="MeSH terms")
    citation_count: Optional[int] = Field(default=None, description="Number of citations")
    metadata: Optional[Dict[str, Any]] = Field(default=None, description="Additional article metadata")

class CanonicalScholarArticle(BaseModel):
    """
    Canonical Google Scholar Article schema - the definitive structure for Google Scholar
    search results across the entire system.
    """
    title: str = Field(description="Article title")
    link: Optional[str] = Field(default=None, description="Direct link to the article")
    authors: List[str] = Field(default=[], description="List of article authors")
    publication_info: Optional[str] = Field(default=None, description="Publication venue and details")
    snippet: Optional[str] = Field(default=None, description="Article snippet/excerpt")
    cited_by_count: Optional[int] = Field(default=None, description="Number of citations")
    cited_by_link: Optional[str] = Field(default=None, description="Link to citing articles")
    related_pages_link: Optional[str] = Field(default=None, description="Link to related articles")
    versions_link: Optional[str] = Field(default=None, description="Link to different versions")
    pdf_link: Optional[str] = Field(default=None, description="Direct PDF link if available")
    year: Optional[int] = Field(default=None, description="Publication year")
    position: int = Field(description="Position in search results")
    metadata: Optional[Dict[str, Any]] = Field(default=None, description="Additional Scholar metadata")

class CanonicalPubMedExtraction(BaseModel):
    """
    Canonical PubMed Extraction schema - the definitive structure for extracted features from articles.
    """
    item_id: str = Field(description="Unique identifier for the original article")
    original_article: CanonicalPubMedArticle = Field(description="Original PubMed article")
    extraction: Dict[str, Any] = Field(description="Extracted features/data fields")
    extraction_metadata: Optional[Dict[str, Any]] = Field(default=None, description="Extraction processing metadata")

class CanonicalScoredArticle(BaseModel):
    """
    Canonical Scored Article schema - the definitive structure for scored PubMed articles.
    """
    article_with_features: CanonicalPubMedExtraction = Field(description="Article with extracted features")
    total_score: float = Field(description="Total calculated score")
    score_breakdown: Dict[str, float] = Field(description="Breakdown of score components")
    percentile_rank: Optional[float] = Field(default=None, description="Percentile rank among all scored articles")
    scoring_metadata: Optional[Dict[str, Any]] = Field(default=None, description="Scoring methodology metadata")

class CanonicalNewsletter(BaseModel):
    """
    Canonical Newsletter schema - the definitive structure for newsletter objects.
    """
    id: str = Field(description="Newsletter unique identifier")
    title: str = Field(description="Newsletter title")
    content: str = Field(description="Newsletter content")
    source: str = Field(description="Newsletter source/publisher")
    publish_date: datetime = Field(description="Publication date")
    subject_line: Optional[str] = Field(default=None, description="Email subject line")
    categories: List[str] = Field(default=[], description="Newsletter categories/tags")
    articles: List[Dict[str, Any]] = Field(default=[], description="Individual articles within newsletter")
    summary: Optional[str] = Field(default=None, description="Newsletter summary")
    metadata: Optional[Dict[str, Any]] = Field(default=None, description="Additional newsletter metadata")

class CanonicalDailyNewsletterRecap(BaseModel):
    """
    Canonical Daily Newsletter Recap schema - the definitive structure for daily recap objects.
    """
    date: str = Field(description="Recap date (ISO format)")
    title: str = Field(description="Recap title")
    summary: str = Field(description="Daily summary content")
    newsletter_count: int = Field(description="Number of newsletters processed")
    key_topics: List[str] = Field(default=[], description="Key topics covered")
    sentiment_score: Optional[float] = Field(default=None, description="Overall sentiment score")
    top_articles: List[Dict[str, Any]] = Field(default=[], description="Most important articles")
    statistics: Optional[Dict[str, Any]] = Field(default=None, description="Processing statistics")
    metadata: Optional[Dict[str, Any]] = Field(default=None, description="Additional recap metadata")

# --- Schema Type Definitions ---

def _pydantic_field_to_schema_type(field_info, field_name: str) -> SchemaType:
    """
    Convert a Pydantic field to a SchemaType object.
    
    Args:
        field_info: Pydantic field information
        field_name: Name of the field
        
    Returns:
        SchemaType object representing the field
    """
    from pydantic.fields import FieldInfo
    from typing import get_origin, get_args
    
    # Get the field type
    field_type = field_info.annotation
    description = field_info.description or f"{field_name} field"
    
    # Handle Optional types
    origin = get_origin(field_type)
    args = get_args(field_type)
    
    if origin is Union:
        # Handle Optional[T] (Union[T, None])
        non_none_types = [arg for arg in args if arg is not type(None)]
        if len(non_none_types) == 1:
            field_type = non_none_types[0]
            origin = get_origin(field_type)
            args = get_args(field_type)
    
    # Check if it's a list/array type
    is_array = origin is list or (origin and issubclass(origin, list))
    
    if is_array:
        # Get the item type from List[T]
        item_type = args[0] if args else str
        schema_type = _python_type_to_schema_type(item_type)
    else:
        schema_type = _python_type_to_schema_type(field_type)
    
    return SchemaType(
        type=schema_type,
        description=description,
        is_array=is_array
    )

def _python_type_to_schema_type(python_type) -> str:
    """Convert a Python type to a schema type string."""
    if python_type is str:
        return 'string'
    elif python_type is int or python_type is float:
        return 'number'
    elif python_type is bool:
        return 'boolean'
    elif python_type is datetime:
        return 'string'  # ISO format
    elif python_type is dict or str(python_type).startswith('typing.Dict'):
        return 'object'
    elif python_type is list or str(python_type).startswith('typing.List'):
        return 'object'  # Will be handled by is_array flag
    else:
        return 'object'  # Default for complex types

def get_canonical_schema(type_name: str) -> SchemaType:
    """
    Get the canonical SchemaType definition for a custom data type.
    
    This function dynamically generates SchemaType objects from the 
    Pydantic BaseModel classes, ensuring no duplication of schema definitions.
    
    Args:
        type_name: The name of the custom type (e.g., 'email', 'search_result')
        
    Returns:
        SchemaType object defining the canonical structure
        
    Raises:
        ValueError: If the type_name is not recognized
    """
    model_class = get_canonical_model(type_name)
    
    # Get the model fields
    fields = {}
    for field_name, field_info in model_class.model_fields.items():
        fields[field_name] = _pydantic_field_to_schema_type(field_info, field_name)
    
    return SchemaType(
        type=type_name,
        description=f"{type_name.replace('_', ' ').title()} object",
        is_array=False,
        fields=fields
    )

# --- Utility Functions ---

def get_canonical_model(type_name: str) -> type[BaseModel]:
    """
    Get the canonical Pydantic model class for a custom data type.
    
    Args:
        type_name: The name of the custom type
        
    Returns:
        Pydantic model class
        
    Raises:
        ValueError: If the type_name is not recognized
    """
    models = {
        'email': CanonicalEmail,
        'search_result': CanonicalSearchResult,
        'webpage': CanonicalWebpage,
        'pubmed_article': CanonicalPubMedArticle,
        'scholar_article': CanonicalScholarArticle,
        'research_article': CanonicalResearchArticle,
        'newsletter': CanonicalNewsletter,
        'daily_newsletter_recap': CanonicalDailyNewsletterRecap,
        'pubmed_extraction': CanonicalPubMedExtraction,
        'scored_article': CanonicalScoredArticle
    }
    
    if type_name not in models:
        raise ValueError(f"Unknown canonical type: {type_name}. Available types: {list(models.keys())}")
    
    return models[type_name]

def list_canonical_types() -> List[str]:
    """Get a list of all available canonical types."""
    return ['email', 'search_result', 'webpage', 'pubmed_article', 'scholar_article', 'research_article', 'newsletter', 'daily_newsletter_recap', 'pubmed_extraction', 'scored_article']

def validate_canonical_data(type_name: str, data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Validate data against a canonical schema.
    
    Args:
        type_name: The name of the custom type
        data: The data to validate
        
    Returns:
        Validated and potentially transformed data
        
    Raises:
        ValueError: If validation fails
    """
    model_class = get_canonical_model(type_name)
    validated = model_class.model_validate(data)
    return validated.model_dump() 