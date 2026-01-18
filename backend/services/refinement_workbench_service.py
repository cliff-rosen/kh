"""
Refinement Workbench Service

Service for testing and refining queries, filters, and categorization.
Provides isolated testing capabilities for each pipeline component.
"""

from typing import List, Dict, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import logging

from models import ResearchStream
from schemas.canonical_types import CanonicalResearchArticle
from schemas.research_article_converters import legacy_article_to_canonical_pubmed, pubmed_to_research_article
from services.pubmed_service import PubMedService, fetch_articles_by_ids
from services.ai_evaluation_service import get_ai_evaluation_service
from services.article_categorization_service import ArticleCategorizationService
from agents.prompts.llm import ModelConfig, LLMOptions

logger = logging.getLogger(__name__)


class RefinementWorkbenchService:
    """Service for refinement workbench operations."""

    def __init__(self, db: AsyncSession):
        self.MAX_ARTICLES_PER_SOURCE = 500
        self.db = db
        self.pubmed_service = PubMedService()
        self.eval_service = get_ai_evaluation_service()
        self.categorization_service = ArticleCategorizationService()

    async def run_query(
        self,
        stream_id: int,
        query_index: int,
        start_date: str,
        end_date: str
    ) -> Tuple[List[CanonicalResearchArticle], Dict, List[str]]:
        """
        Execute a broad query from the stream's retrieval config.

        Args:
            stream_id: Research stream ID
            query_index: Index of the broad query (0-based)
            start_date: Start date (YYYY-MM-DD)
            end_date: End date (YYYY-MM-DD)

        Returns:
            Tuple of (articles, metadata dict, all_matched_pmids)
        """
        # Get stream from database (async)
        stmt = select(ResearchStream).where(ResearchStream.stream_id == stream_id)
        result = await self.db.execute(stmt)
        stream = result.scalars().first()

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

        # Get ALL matched PMIDs (just IDs, not full articles) for comparison
        # Using a single API call ensures consistency between comparison and display
        all_pmids, total_count = self.pubmed_service.get_article_ids(
            query=query_expression,
            max_results=10000,  # Get up to 10k PMIDs for comparison
            start_date=start_date_formatted,
            end_date=end_date_formatted,
            date_type="publication",
            sort_by="relevance"
        )

        # Fetch full articles for the FIRST 100 of the same PMIDs (ensures consistency)
        display_pmids = all_pmids[:100]
        raw_articles = self.pubmed_service.get_articles_from_ids(display_pmids) if display_pmids else []

        # Convert to canonical format
        articles: List[CanonicalResearchArticle] = []
        for raw_article in raw_articles:
            try:
                canonical_pubmed = legacy_article_to_canonical_pubmed(raw_article)
                canonical_article = pubmed_to_research_article(canonical_pubmed)
                articles.append(canonical_article)
            except Exception as e:
                # Log but don't fail on individual article conversion errors
                print(f"Warning: Failed to convert article {getattr(raw_article, 'PMID', 'unknown')}: {e}")

        # Add additional metadata
        enriched_metadata = {
            "query_expression": query_expression,
            "query_index": query_index,
            "start_date": start_date,
            "end_date": end_date,
            "total_results": total_count,  # True total from PubMed
            "returned": len(articles)
        }

        return articles, enriched_metadata, all_pmids

    async def test_custom_query(
        self,
        query_expression: str,
        start_date: str,
        end_date: str
    ) -> Tuple[List[CanonicalResearchArticle], Dict, List[str]]:
        """
        Test a custom query expression (not necessarily saved to stream).

        Args:
            query_expression: PubMed query expression to test
            start_date: Start date (YYYY-MM-DD)
            end_date: End date (YYYY-MM-DD)

        Returns:
            Tuple of (articles, metadata dict, all_matched_pmids)
        """
        if not query_expression or not query_expression.strip():
            raise ValueError("Query expression cannot be empty")

        # Convert YYYY-MM-DD to YYYY/MM/DD for PubMed API
        start_date_formatted = start_date.replace("-", "/")
        end_date_formatted = end_date.replace("-", "/")

        # Get ALL matched PMIDs (just IDs, not full articles) for comparison
        # Using a single API call ensures consistency between comparison and display
        all_pmids, total_count = self.pubmed_service.get_article_ids(
            query=query_expression,
            max_results=10000,  # Get up to 10k PMIDs for comparison
            start_date=start_date_formatted,
            end_date=end_date_formatted,
            date_type="publication",
            sort_by="relevance"
        )

        # Fetch full articles for the FIRST N of the same PMIDs (ensures consistency)
        display_pmids = all_pmids[:self.MAX_ARTICLES_PER_SOURCE]
        raw_articles = self.pubmed_service.get_articles_from_ids(display_pmids) if display_pmids else []

        # Convert to canonical format
        articles: List[CanonicalResearchArticle] = []
        for raw_article in raw_articles:
            try:
                canonical_pubmed = legacy_article_to_canonical_pubmed(raw_article)
                canonical_article = pubmed_to_research_article(canonical_pubmed)
                articles.append(canonical_article)
            except Exception as e:
                print(f"Warning: Failed to convert article {getattr(raw_article, 'PMID', 'unknown')}: {e}")

        # Add additional metadata
        enriched_metadata = {
            "query_expression": query_expression,
            "start_date": start_date,
            "end_date": end_date,
            "total_results": total_count,  # True total from PubMed
            "returned": len(articles)
        }

        return articles, enriched_metadata, all_pmids

    async def fetch_manual_pmids(
        self,
        pmids: List[str]
    ) -> Tuple[List[CanonicalResearchArticle], Dict, List[str]]:
        """
        Fetch articles by PMID list.

        Args:
            pmids: List of PubMed IDs

        Returns:
            Tuple of (articles, metadata dict, all_matched_pmids)
        """
        # Fetch articles from PubMed - returns List[PubMedArticle]
        pubmed_articles = fetch_articles_by_ids(pmids)

        # Convert PubMedArticle to CanonicalResearchArticle
        articles = []
        for pm_article in pubmed_articles:
            # PubMedArticle has PMID (uppercase), not pmid
            pmid = pm_article.PMID
            articles.append(CanonicalResearchArticle(
                id=pmid,
                source='pubmed',
                pmid=pmid,
                title=pm_article.title or "",
                abstract=pm_article.abstract,
                journal=pm_article.journal,
                authors=pm_article.authors.split(', ') if isinstance(pm_article.authors, str) else [],
                publication_date=pm_article.pub_date,
                date_completed=pm_article.comp_date,
                date_revised=pm_article.date_revised,
                date_entered=pm_article.entry_date,
                date_published=pm_article.article_date,
                publication_year=int(pm_article.year) if pm_article.year and pm_article.year.isdigit() else None,
                url=f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/" if pmid else None
            ))

        # For manual PMIDs, all matched = all requested (that were found)
        found_pmids = [a.pmid for a in articles if a.pmid]

        metadata = {
            "requested_pmids": len(pmids),
            "found_pmids": len(articles),
            "total_results": len(pmids)  # For manual, total = requested
        }

        return articles, metadata, found_pmids

    async def filter_articles(
        self,
        articles: List[CanonicalResearchArticle],
        filter_criteria: str,
        threshold: float,
        output_type: str = "boolean"
    ) -> List[Dict]:
        """
        Apply semantic filtering to articles in parallel.

        Args:
            articles: List of articles to filter
            filter_criteria: Natural language filter criteria
            threshold: Minimum score to pass (0.0-1.0)
            output_type: Expected output type ('boolean', 'number', or 'text')

        Returns:
            List of filter result dicts with article, passed, score, reasoning
        """
        if not articles:
            return []

        # Convert articles to dicts for evaluation
        items = [article.model_dump() for article in articles]

        # Use AIEvaluationService based on output type
        # CanonicalResearchArticle uses "pmid" as the ID field
        if output_type == "boolean":
            eval_results = await self.eval_service.filter_batch(
                items=items,
                criteria=filter_criteria,
                id_field="pmid",
                include_reasoning=True,
                include_source_data=True,  # Include full article data for LLM context
                max_concurrent=50
            )
        elif output_type == "number":
            eval_results = await self.eval_service.score_batch(
                items=items,
                criteria=filter_criteria,
                id_field="pmid",
                include_reasoning=True,
                include_source_data=True,  # Include full article data for LLM context
                max_concurrent=50
            )
        else:  # "text"
            eval_results = await self.eval_service.extract_batch(
                items=items,
                instruction=filter_criteria,
                id_field="pmid",
                output_type="text",
                include_reasoning=True,
                include_source_data=True,  # Include full article data for LLM context
                max_concurrent=50
            )

        # Build a map from item_id to result for correlation
        result_map = {r.item_id: r for r in eval_results}

        # Convert results to expected format
        results = []
        for article in articles:
            result = result_map.get(article.pmid)
            if not result:
                # Shouldn't happen, but handle gracefully
                results.append({
                    "article": article,
                    "passed": False,
                    "score": 0.0,
                    "reasoning": "No result found"
                })
                continue

            if output_type == "boolean":
                passed = result.value is True
                score = result.confidence
            elif output_type == "number":
                passed = (result.value or 0) >= threshold
                score = result.value if result.value is not None else 0.0
            else:  # "text"
                passed = result.value is not None
                score = result.confidence

            results.append({
                "article": article,
                "passed": passed,
                "score": score,
                "reasoning": result.reasoning or result.error or ""
            })

        return results

    async def categorize_articles(
        self,
        stream_id: int,
        articles: List[CanonicalResearchArticle]
    ) -> List[Dict]:
        """
        Categorize articles using stream's Layer 3 categories in parallel.

        Args:
            stream_id: Research stream ID (to get categories)
            articles: List of articles to categorize

        Returns:
            List of categorization result dicts with article and assigned_categories
        """
        # Get stream from database (async)
        stmt = select(ResearchStream).where(ResearchStream.stream_id == stream_id)
        result = await self.db.execute(stmt)
        stream = result.scalars().first()

        if not stream:
            raise ValueError(f"Stream {stream_id} not found")

        # Get categories from presentation config
        if not stream.presentation_config or not stream.presentation_config.get("categories"):
            raise ValueError("Stream does not have categories configured")

        categories = stream.presentation_config["categories"]

        if not articles:
            return []

        # Format categories as JSON for the prompt
        categories_json = self.categorization_service.format_categories_json(categories)

        # Build items list for categorization service
        items = []
        for article in articles:
            items.append({
                "title": article.title or "Untitled",
                "abstract": article.abstract or "",
                "journal": article.journal or "Unknown",
                "year": str(article.year) if article.year else "Unknown",
                "categories_json": categories_json,
            })

        # Call categorization service
        llm_results = await self.categorization_service.categorize(
            items=items,
            model_config=ModelConfig(model="gpt-4.1", temperature=0.3),
            options=LLMOptions(max_concurrent=10),
        )

        # Count errors
        error_count = sum(1 for r in llm_results if not r.ok)
        if error_count > 0:
            logger.warning(f"Categorization had {error_count} errors out of {len(articles)} articles")

        # Convert results to expected format
        results = []
        for i, article in enumerate(articles):
            result = llm_results[i]
            if result.ok and result.data:
                category_id = result.data.get("category_id")
                assigned_categories = [category_id] if category_id else []
            else:
                assigned_categories = []
            results.append({
                "article": article,
                "assigned_categories": assigned_categories
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


# Dependency injection provider for async refinement workbench service
from fastapi import Depends
from database import get_async_db


async def get_refinement_workbench_service(
    db: AsyncSession = Depends(get_async_db)
) -> RefinementWorkbenchService:
    """Get a RefinementWorkbenchService instance with async database session."""
    return RefinementWorkbenchService(db)
