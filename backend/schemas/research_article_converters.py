"""
Research Article Converters

This module provides conversion functions between source-specific article formats
(PubMed, Google Scholar) and the unified CanonicalResearchArticle format for
consistent workbench representation.
"""

from typing import List, Dict, Any, Union, Optional, TYPE_CHECKING
from datetime import datetime
import hashlib

from schemas.canonical_types import (
    CanonicalResearchArticle, 
    CanonicalPubMedArticle,
    CanonicalScholarArticle
)

if TYPE_CHECKING:
    from services.pubmed_service import PubMedArticle
    from services.google_scholar_service import GoogleScholarArticle


def legacy_article_to_canonical_pubmed(article: 'PubMedArticle') -> CanonicalPubMedArticle:
    """
    Convert legacy PubMed PubMedArticle to CanonicalPubMedArticle.
    
    Args:
        article: Legacy PubMedArticle object from pubmed_service
        
    Returns:
        CanonicalPubMedArticle
    """
    # Construct publication date from year/month/day if available
    publication_date = None
    if hasattr(article, 'year') and article.year and article.year.strip():
        publication_date = article.year.strip()
        # Add month/day if available (not implemented in current PubMedArticle class)
    
    # Convert authors string to list
    authors = []
    if hasattr(article, 'authors') and article.authors:
        if isinstance(article.authors, str):
            # Split comma-separated authors
            authors = [author.strip() for author in article.authors.split(',')]
        elif isinstance(article.authors, list):
            authors = article.authors
    
    return CanonicalPubMedArticle(
        pmid=article.PMID,
        title=article.title,
        abstract=article.abstract if article.abstract else "",
        authors=authors,
        journal=article.journal if article.journal else "",
        publication_date=publication_date,
        doi=None,  # Not available in legacy PubMedArticle
        keywords=[],  # Not available in legacy PubMedArticle
        mesh_terms=[],  # Not available in legacy PubMedArticle
        citation_count=None,  # Not available in legacy PubMedArticle
        metadata={
            'volume': article.volume if hasattr(article, 'volume') else None,
            'issue': article.issue if hasattr(article, 'issue') else None,
            'pages': article.pages if hasattr(article, 'pages') else None,
            'comp_date': article.comp_date if hasattr(article, 'comp_date') else None,
            'date_revised': article.date_revised if hasattr(article, 'date_revised') else None,
            'article_date': article.article_date if hasattr(article, 'article_date') else None,
            'entry_date': article.entry_date if hasattr(article, 'entry_date') else None,
            'pub_date': article.pub_date if hasattr(article, 'pub_date') else None,
            'medium': article.medium if hasattr(article, 'medium') else None
        }
    )


def pubmed_to_research_article(pubmed_article: CanonicalPubMedArticle) -> CanonicalResearchArticle:
    """
    Convert a CanonicalPubMedArticle to the unified CanonicalResearchArticle format.
    
    Args:
        pubmed_article: PubMed article to convert
        
    Returns:
        Unified research article format
    """
    # Extract publication year from date if available
    publication_year = None
    if pubmed_article.publication_date and pubmed_article.publication_date.strip():
        try:
            # Handle both full dates (2023-01-01) and just years (2023)
            year_str = pubmed_article.publication_date.split('-')[0].strip()
            if year_str:
                publication_year = int(year_str)
        except (ValueError, IndexError):
            pass
    
    # Extract all dates from metadata if available
    metadata = pubmed_article.metadata or {}
    
    # Log debug info about date extraction
    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"Converting PubMed article {pubmed_article.pmid}")
  
    result = CanonicalResearchArticle(
        id=f"pubmed_{pubmed_article.pmid}",  # Use consistent ID format
        source="pubmed",
        pmid=pubmed_article.pmid,  # Include PMID field for easy access
        title=pubmed_article.title,
        authors=pubmed_article.authors,
        abstract=pubmed_article.abstract,
        snippet=None,  # PubMed has abstracts, not snippets
        journal=pubmed_article.journal,
        publication_date=metadata.get('pub_date') or pubmed_article.publication_date,
        publication_year=publication_year,
        # Populate all 4 date fields from metadata (convert empty strings to None)
        date_completed=metadata.get('comp_date') if metadata.get('comp_date') else None,
        date_revised=metadata.get('date_revised') if metadata.get('date_revised') else None,
        date_entered=metadata.get('entry_date') if metadata.get('entry_date') else None,
        date_published=metadata.get('pub_date') if metadata.get('pub_date') else pubmed_article.publication_date,
        doi=pubmed_article.doi,
        url=f"https://pubmed.ncbi.nlm.nih.gov/{pubmed_article.pmid}/" if pubmed_article.pmid else None,
        pdf_url=None,  # PubMed doesn't provide direct PDF links
        keywords=pubmed_article.keywords,
        mesh_terms=pubmed_article.mesh_terms,
        categories=[],  # Could be derived from MeSH terms
        citation_count=pubmed_article.citation_count,
        cited_by_url=None,  # PubMed doesn't provide this directly
        related_articles_url=f"https://pubmed.ncbi.nlm.nih.gov/?linkname=pubmed_pubmed&from_uid={pubmed_article.pmid}" if pubmed_article.pmid else None,
        versions_url=None,  # Not applicable for PubMed
        search_position=None,  # Not from search context
        relevance_score=None,  # Will be populated by feature extraction
        extracted_features=None,  # Will be populated by feature extraction
        quality_scores=None,  # Will be populated by feature extraction
        source_metadata=pubmed_article.metadata,
        indexed_at=None,
        retrieved_at=datetime.utcnow().isoformat()
    )
    
    return result


def scholar_to_research_article(scholar_article: 'GoogleScholarArticle', position: Optional[int] = None) -> CanonicalResearchArticle:
    """
    Convert a GoogleScholarArticle to the unified CanonicalResearchArticle format.
    
    Args:
        scholar_article: Google Scholar article to convert (new GoogleScholarArticle class)
        position: Position in search results (optional)
        
    Returns:
        Unified research article format
    """
    return CanonicalResearchArticle(
        id=scholar_article.id,  # Use the ID generated by GoogleScholarArticle
        source="google_scholar",
        title=scholar_article.title,
        authors=scholar_article.authors,
        abstract=(getattr(scholar_article, 'abstract', None) or scholar_article.snippet),
        snippet=scholar_article.snippet,
        journal=scholar_article.journal,  # GoogleScholarArticle extracts this
        publication_date=None,  # Scholar doesn't provide structured dates
        publication_year=scholar_article.year,
        doi=scholar_article.doi,  # GoogleScholarArticle extracts DOI
        url=scholar_article.link,
        pdf_url=scholar_article.pdf_link,
        keywords=[],  # Scholar doesn't provide keywords directly
        mesh_terms=[],  # Scholar doesn't have MeSH terms
        categories=[],  # Could be inferred from content
        citation_count=scholar_article.cited_by_count,
        cited_by_url=scholar_article.cited_by_link,
        related_articles_url=scholar_article.related_pages_link,
        versions_url=scholar_article.versions_link,
        search_position=position or scholar_article.position,
        relevance_score=None,  # Will be populated by feature extraction
        extracted_features=None,  # Will be populated by feature extraction
        quality_scores=None,  # Will be populated by feature extraction
        source_metadata={
            "position": scholar_article.position,
            "publication_info": scholar_article.publication_info
        },
        metadata=getattr(scholar_article, 'metadata', None),  # Pass through enrichment metadata
        indexed_at=None,
        retrieved_at=datetime.utcnow().isoformat()
    )


def dict_to_research_article(article_dict: Dict[str, Any], source: str) -> CanonicalResearchArticle:
    """
    Convert a dictionary representation to CanonicalResearchArticle.
    Useful for converting API responses directly.
    
    Args:
        article_dict: Dictionary containing article data
        source: Source system ('pubmed' or 'scholar')
        
    Returns:
        Unified research article format
    """
    if source == "pubmed":
        # Convert dict to PubMed canonical format first
        pubmed_article = CanonicalPubMedArticle(**article_dict)
        return pubmed_to_research_article(pubmed_article)
    elif source == "scholar":
        # Convert dict to Scholar canonical format first
        scholar_article = CanonicalScholarArticle(**article_dict)
        return scholar_to_research_article(scholar_article)
    else:
        raise ValueError(f"Unsupported source: {source}")


def research_article_to_source_format(
    research_article: CanonicalResearchArticle
) -> Union[CanonicalPubMedArticle, CanonicalScholarArticle]:
    """
    Convert a CanonicalResearchArticle back to its source-specific format.
    Useful for compatibility with existing source-specific handlers.
    
    Args:
        research_article: Unified research article
        
    Returns:
        Source-specific canonical article format
    """
    if research_article.source == "pubmed":
        return CanonicalPubMedArticle(
            pmid=research_article.id,
            title=research_article.title,
            abstract=research_article.abstract or "",
            authors=research_article.authors,
            journal=research_article.journal or "",
            publication_date=research_article.publication_date,
            doi=research_article.doi,
            keywords=research_article.keywords,
            mesh_terms=research_article.mesh_terms,
            citation_count=research_article.citation_count,
            metadata=research_article.source_metadata
        )
    elif research_article.source == "scholar":
        return CanonicalScholarArticle(
            title=research_article.title,
            link=research_article.url,
            authors=research_article.authors,
            publication_info=research_article.journal,  # Simplified mapping
            snippet=research_article.snippet,
            cited_by_count=research_article.citation_count,
            cited_by_link=research_article.cited_by_url,
            related_pages_link=research_article.related_articles_url,
            versions_link=research_article.versions_url,
            pdf_link=research_article.pdf_url,
            year=research_article.publication_year,
            position=research_article.search_position or 0,
            metadata=research_article.source_metadata
        )
    else:
        raise ValueError(f"Unsupported source: {research_article.source}")


def convert_articles_to_unified(
    articles: List[Union[CanonicalPubMedArticle, CanonicalScholarArticle, Dict[str, Any]]], 
    source: str
) -> List[CanonicalResearchArticle]:
    """
    Batch convert articles to unified format.
    
    Args:
        articles: List of articles in various formats
        source: Source system ('pubmed' or 'scholar')
        
    Returns:
        List of unified research articles
    """
    unified_articles = []
    
    for article in articles:
        try:
            if isinstance(article, dict):
                unified_article = dict_to_research_article(article, source)
            elif isinstance(article, CanonicalPubMedArticle):
                unified_article = pubmed_to_research_article(article)
            elif isinstance(article, CanonicalScholarArticle):
                # Pass position for consistent ID generation
                unified_article = scholar_to_research_article(article, position=len(unified_articles) + 1)
            else:
                continue  # Skip unsupported formats
                
            unified_articles.append(unified_article)
            
        except Exception as e:
            # Log error but continue processing other articles
            print(f"Warning: Failed to convert article to unified format: {e}")
            continue
    
    return unified_articles


def enrich_research_article_with_features(
    research_article: CanonicalResearchArticle,
    features: Dict[str, Any]
) -> CanonicalResearchArticle:
    """
    Add extracted features to a research article.
    
    Args:
        research_article: The research article to enrich
        features: Extracted features from LLM analysis
        
    Returns:
        Research article with extracted features
    """
    # Extract relevance score if present
    relevance_score = features.get('relevance_score')
    
    # Create quality scores dictionary
    quality_scores = {}
    if 'confidence_score' in features:
        quality_scores['confidence'] = features['confidence_score']
    if relevance_score is not None:
        quality_scores['relevance'] = float(relevance_score)
    
    # Create a copy with enriched data
    enriched_article = research_article.copy(deep=True)
    enriched_article.extracted_features = features
    enriched_article.relevance_score = relevance_score
    enriched_article.quality_scores = quality_scores if quality_scores else None
    
    return enriched_article