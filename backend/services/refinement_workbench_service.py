"""
Refinement Workbench Service

Service for testing and refining queries, filters, and categorization.
Provides isolated testing capabilities for each pipeline component.
"""

from typing import List, Dict, Tuple
from sqlalchemy.orm import Session

from models import ResearchStream
from schemas.canonical_types import CanonicalResearchArticle
from services.pubmed_service import PubMedService, fetch_articles_by_ids
from services.semantic_filter_service import SemanticFilterService
from services.article_categorization_service import ArticleCategorizationService


class RefinementWorkbenchService:
    """Service for refinement workbench operations"""

    def __init__(self, db: Session):
        self.db = db
        self.pubmed_service = PubMedService()
        self.filter_service = SemanticFilterService()
        self.categorization_service = ArticleCategorizationService()

    async def run_query(
        self,
        stream_id: int,
        query_index: int,
        start_date: str,
        end_date: str
    ) -> Tuple[List[CanonicalResearchArticle], Dict]:
        """
        Execute a broad query from the stream's retrieval config.

        Args:
            stream_id: Research stream ID
            query_index: Index of the broad query (0-based)
            start_date: Start date (YYYY-MM-DD)
            end_date: End date (YYYY-MM-DD)

        Returns:
            Tuple of (articles, metadata dict)
        """
        # Get stream from database
        stream = self.db.query(ResearchStream).filter(
            ResearchStream.stream_id == stream_id
        ).first()

        if not stream:
            raise ValueError(f"Stream {stream_id} not found")

        # Check for broad search configuration
        if not stream.retrieval_config or not stream.retrieval_config.get("broad_search"):
            raise ValueError("Stream does not have broad search configuration")

        broad_search = stream.retrieval_config["broad_search"]
        queries = broad_search.get("queries", [])

        if query_index < 0 or query_index >= len(queries):
            raise ValueError(f"Query index {query_index} out of range (0-{len(queries)-1})")

        broad_query = queries[query_index]
        query_expression = broad_query.get("query_expression")

        if not query_expression:
            raise ValueError("Query expression is empty")

        # Convert YYYY-MM-DD to YYYY/MM/DD for PubMed API
        start_date_formatted = start_date.replace("-", "/")
        end_date_formatted = end_date.replace("-", "/")

        # Execute query on PubMed
        articles, metadata = self.pubmed_service.search_articles(
            query=query_expression,
            max_results=100,  # Reasonable limit for testing
            start_date=start_date_formatted,
            end_date=end_date_formatted,
            date_type="entry",
            sort_by="relevance"
        )

        # Add additional metadata
        enriched_metadata = {
            "query_expression": query_expression,
            "query_index": query_index,
            "start_date": start_date,
            "end_date": end_date,
            **metadata
        }

        return articles, enriched_metadata

    async def fetch_manual_pmids(
        self,
        pmids: List[str]
    ) -> Tuple[List[CanonicalResearchArticle], Dict]:
        """
        Fetch articles by PMID list.

        Args:
            pmids: List of PubMed IDs

        Returns:
            Tuple of (articles, metadata dict)
        """
        # Fetch articles from PubMed - returns List[PubMedArticle]
        pubmed_articles = fetch_articles_by_ids(pmids)

        # Convert PubMedArticle to CanonicalResearchArticle
        articles = []
        for pm_article in pubmed_articles:
            articles.append(CanonicalResearchArticle(
                id=pm_article.pmid,
                source='pubmed',
                pmid=pm_article.pmid,
                title=pm_article.title or "",
                abstract=pm_article.abstract,
                journal=pm_article.journal,
                authors=pm_article.authors or [],
                publication_date=pm_article.pub_date,
                doi=pm_article.doi,
                url=pm_article.url
            ))

        metadata = {
            "requested_pmids": len(pmids),
            "found_pmids": len(articles)
        }

        return articles, metadata

    async def filter_articles(
        self,
        articles: List[CanonicalResearchArticle],
        filter_criteria: str,
        threshold: float
    ) -> List[Dict]:
        """
        Apply semantic filtering to articles.

        Args:
            articles: List of articles to filter
            filter_criteria: Natural language filter criteria
            threshold: Minimum score to pass (0.0-1.0)

        Returns:
            List of filter result dicts with article, passed, score, reasoning
        """
        results = []

        for article in articles:
            # Evaluate article relevance
            is_relevant, score, reasoning = await self.filter_service.evaluate_article_relevance(
                article_title=article.title,
                article_abstract=article.abstract or "",
                article_journal=article.journal,
                article_year=article.publication_date[:4] if article.publication_date else None,
                filter_criteria=filter_criteria,
                threshold=threshold
            )

            results.append({
                "article": article,
                "passed": is_relevant,
                "score": score,
                "reasoning": reasoning
            })

        return results

    async def categorize_articles(
        self,
        stream_id: int,
        articles: List[CanonicalResearchArticle]
    ) -> List[Dict]:
        """
        Categorize articles using stream's Layer 3 categories.

        Args:
            stream_id: Research stream ID (to get categories)
            articles: List of articles to categorize

        Returns:
            List of categorization result dicts with article and assigned_categories
        """
        # Get stream from database
        stream = self.db.query(ResearchStream).filter(
            ResearchStream.stream_id == stream_id
        ).first()

        if not stream:
            raise ValueError(f"Stream {stream_id} not found")

        # Get categories from presentation config
        if not stream.presentation_config or not stream.presentation_config.get("categories"):
            raise ValueError("Stream does not have categories configured")

        categories = stream.presentation_config["categories"]

        # Categorize each article
        results = []

        for article in articles:
            # Call categorization service
            assigned_category_ids = await self.categorization_service.categorize_article(
                article_title=article.title,
                article_abstract=article.abstract or "",
                categories=categories
            )

            results.append({
                "article": article,
                "assigned_categories": assigned_category_ids
            })

        return results

    def compare_pmid_lists(
        self,
        retrieved_pmids: List[str],
        expected_pmids: List[str]
    ) -> Dict:
        """
        Compare retrieved vs expected PMID lists.

        Args:
            retrieved_pmids: PMIDs that were retrieved
            expected_pmids: PMIDs that were expected

        Returns:
            Dict with match statistics
        """
        # Convert to sets for comparison
        retrieved_set = set(retrieved_pmids)
        expected_set = set(expected_pmids)

        # Calculate overlaps
        matched = list(retrieved_set & expected_set)
        missed = list(expected_set - retrieved_set)
        extra = list(retrieved_set - expected_set)

        # Calculate metrics
        matched_count = len(matched)
        missed_count = len(missed)
        extra_count = len(extra)

        # Calculate recall and precision
        recall = matched_count / len(expected_set) if len(expected_set) > 0 else 0.0
        precision = matched_count / len(retrieved_set) if len(retrieved_set) > 0 else 0.0

        # Calculate F1 score
        if precision + recall > 0:
            f1_score = 2 * (precision * recall) / (precision + recall)
        else:
            f1_score = 0.0

        return {
            "matched": matched,
            "missed": missed,
            "extra": extra,
            "matched_count": matched_count,
            "missed_count": missed_count,
            "extra_count": extra_count,
            "recall": recall,
            "precision": precision,
            "f1_score": f1_score
        }
