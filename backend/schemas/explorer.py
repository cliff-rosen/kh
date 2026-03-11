"""Explorer schemas for request/response validation."""

from pydantic import BaseModel
from typing import List, Optional


# --- Explorer Search ---

class ExplorerArticleSource(BaseModel):
    type: str  # "stream", "collection", or "pubmed"
    id: Optional[int] = None
    name: str
    report_name: Optional[str] = None  # Only for stream sources


class ExplorerArticle(BaseModel):
    article_id: Optional[int] = None  # null for PubMed-only
    title: str
    authors: List[str] = []
    journal: Optional[str] = None
    pmid: Optional[str] = None
    doi: Optional[str] = None
    abstract: Optional[str] = None
    url: Optional[str] = None
    pub_year: Optional[int] = None
    pub_month: Optional[int] = None
    pub_day: Optional[int] = None
    sources: List[ExplorerArticleSource] = []
    is_local: bool = True


class PubMedPagination(BaseModel):
    total: int = 0           # Total PubMed matches for this query
    offset: int = 0          # Current offset into PubMed results
    returned: int = 0        # How many new-to-this-response PubMed articles
    overlap_count: int = 0   # How many PubMed results were already in local results
    has_more: bool = False   # Whether more PubMed pages are available


class ExplorerSearchResponse(BaseModel):
    articles: List[ExplorerArticle]
    total: int
    sources_searched: List[str]
    local_count: int = 0         # How many articles came from local DB
    pubmed: Optional[PubMedPagination] = None  # PubMed pagination info (only when PubMed searched)


# --- Collection Overlap Check ---

class OverlapCheckRequest(BaseModel):
    article_ids: List[int]


class OverlapArticleSummary(BaseModel):
    article_id: int
    title: str
    authors: List[str] = []


class OverlapCheckResponse(BaseModel):
    collection_name: str
    existing_count: int
    selected_count: int
    new_ids: List[int]
    overlap_ids: List[int]
    new_articles: List[OverlapArticleSummary]
    overlap_articles: List[OverlapArticleSummary]
    final_count: int
