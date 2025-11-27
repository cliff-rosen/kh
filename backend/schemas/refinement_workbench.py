"""
Refinement Workbench Schemas

Request/Response models for testing and refining queries, filters, and categorization.
"""

from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any


# ============================================================================
# Source Operations
# ============================================================================

class RunQueryRequest(BaseModel):
    """Request to execute a broad query from a stream's retrieval config"""
    stream_id: int = Field(..., description="Research stream ID")
    query_index: int = Field(..., description="Index of the broad query (0-based)")
    start_date: str = Field(..., description="Start date (YYYY-MM-DD)")
    end_date: str = Field(..., description="End date (YYYY-MM-DD)")


class ManualPMIDsRequest(BaseModel):
    """Request to fetch articles by PMID list"""
    pmids: List[str] = Field(..., description="List of PubMed IDs")


class ArticleResult(BaseModel):
    """Article data returned from source operations"""
    pmid: Optional[str] = Field(None, description="PubMed ID")
    title: str = Field(..., description="Article title")
    abstract: Optional[str] = Field(None, description="Article abstract")
    journal: Optional[str] = Field(None, description="Journal name")
    authors: Optional[List[str]] = Field(None, description="Author list")
    publication_date: Optional[str] = Field(None, description="Publication date")
    doi: Optional[str] = Field(None, description="DOI")
    url: Optional[str] = Field(None, description="Article URL")


class SourceResponse(BaseModel):
    """Response from source operations"""
    articles: List[ArticleResult] = Field(..., description="Retrieved articles")
    count: int = Field(..., description="Number of articles retrieved")
    metadata: Optional[Dict[str, Any]] = Field(None, description="Additional metadata")


# ============================================================================
# Filter Operations
# ============================================================================

class FilterArticlesRequest(BaseModel):
    """Request to apply semantic filtering to articles"""
    articles: List[ArticleResult] = Field(..., description="Articles to filter")
    filter_criteria: str = Field(..., description="Natural language filter criteria")
    threshold: float = Field(0.7, ge=0.0, le=1.0, description="Minimum score to pass (0.0-1.0)")


class FilterResult(BaseModel):
    """Result of filtering a single article"""
    article: ArticleResult = Field(..., description="The article")
    passed: bool = Field(..., description="Whether article passed the filter")
    score: float = Field(..., description="Relevance score (0.0-1.0)")
    reasoning: str = Field(..., description="Explanation of the score")


class FilterResponse(BaseModel):
    """Response from filter operation"""
    results: List[FilterResult] = Field(..., description="Filter results for each article")
    count: int = Field(..., description="Total articles processed")
    passed: int = Field(..., description="Number of articles that passed")
    failed: int = Field(..., description="Number of articles that failed")


# ============================================================================
# Categorize Operations
# ============================================================================

class CategorizeArticlesRequest(BaseModel):
    """Request to categorize articles using stream's Layer 3 categories"""
    stream_id: int = Field(..., description="Research stream ID (to get categories)")
    articles: List[ArticleResult] = Field(..., description="Articles to categorize")


class CategoryAssignment(BaseModel):
    """Result of categorizing a single article"""
    article: ArticleResult = Field(..., description="The article")
    assigned_categories: List[str] = Field(..., description="Assigned category IDs")


class CategorizeResponse(BaseModel):
    """Response from categorize operation"""
    results: List[CategoryAssignment] = Field(..., description="Categorization results")
    count: int = Field(..., description="Total articles processed")
    category_distribution: Dict[str, int] = Field(..., description="Count per category")


# ============================================================================
# Compare Operations
# ============================================================================

class ComparePMIDsRequest(BaseModel):
    """Request to compare retrieved vs expected PMIDs"""
    retrieved_pmids: List[str] = Field(..., description="PMIDs that were retrieved")
    expected_pmids: List[str] = Field(..., description="PMIDs that were expected")


class ComparisonResult(BaseModel):
    """Result of PMID comparison"""
    matched: List[str] = Field(..., description="PMIDs in both lists")
    missed: List[str] = Field(..., description="Expected PMIDs that were not retrieved")
    extra: List[str] = Field(..., description="Retrieved PMIDs that were not expected")
    matched_count: int = Field(..., description="Number of matches")
    missed_count: int = Field(..., description="Number missed")
    extra_count: int = Field(..., description="Number extra")
    recall: float = Field(..., description="Recall = matched / expected")
    precision: float = Field(..., description="Precision = matched / retrieved")
    f1_score: float = Field(..., description="F1 score = 2 * (precision * recall) / (precision + recall)")
