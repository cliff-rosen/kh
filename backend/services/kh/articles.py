"""
Article Service for Knowledge Horizon

Manages standalone articles and their associations with reports.
"""

import logging
from datetime import datetime, date
from typing import List, Dict, Any, Optional

from sqlalchemy import and_, or_, desc
from sqlalchemy.orm import Session

from .base import BaseKHService
from models import Article, ReportArticleAssociation, InformationSource
from schemas.kh_schemas import (
    ArticleCreate,
    ArticleResponse,
    ArticleUpdate,
    ReportArticleAssociationCreate,
    ReportArticleAssociationResponse,
    ReportArticleWithAssociation,
    ArticleSearchFilters,
    SourceType
)

logger = logging.getLogger(__name__)


class ArticleService(BaseKHService):
    """
    Service for managing articles and their report associations
    """

    async def health_check(self) -> Dict[str, Any]:
        """Check service health"""
        try:
            article_count = self.db.query(Article).count()
            association_count = self.db.query(ReportArticleAssociation).count()

            return {
                'status': 'healthy',
                'database': 'connected',
                'total_articles': article_count,
                'total_associations': association_count
            }
        except Exception as e:
            return {
                'status': 'unhealthy',
                'error': str(e)
            }

    async def create_or_update_article(self, article_data: ArticleCreate) -> ArticleResponse:
        """
        Create a new article or update existing one if URL already exists

        Args:
            article_data: Article data

        Returns:
            Created or updated article
        """
        self._log_operation('create_or_update_article', {'url': article_data.url})

        # Check if article already exists by URL
        existing_article = None
        if article_data.url:
            existing_article = self.db.query(Article).filter(
                Article.url == article_data.url
            ).first()

        if existing_article:
            # Update existing article
            existing_article.fetch_count += 1
            existing_article.last_updated = datetime.utcnow()

            # Update fields if they're more complete
            if article_data.ai_summary and not existing_article.ai_summary:
                existing_article.ai_summary = article_data.ai_summary

            if article_data.theme_tags:
                # Merge theme tags
                existing_tags = set(existing_article.theme_tags or [])
                new_tags = set(article_data.theme_tags)
                existing_article.theme_tags = list(existing_tags.union(new_tags))

            self.db.commit()
            self.db.refresh(existing_article)

            return ArticleResponse.from_orm(existing_article)

        # Create new article
        article = Article(
            source_id=article_data.source_id,
            title=article_data.title,
            url=article_data.url,
            authors=article_data.authors,
            publication_date=article_data.publication_date,
            summary=article_data.summary,
            ai_summary=article_data.ai_summary,
            source_type=article_data.source_type,
            article_metadata=article_data.article_metadata,
            theme_tags=article_data.theme_tags,
            fetch_count=1
        )

        self.db.add(article)
        self.db.commit()
        self.db.refresh(article)

        return ArticleResponse.from_orm(article)

    async def get_article(self, article_id: int) -> Optional[ArticleResponse]:
        """
        Get an article by ID

        Args:
            article_id: Article ID

        Returns:
            Article or None if not found
        """
        article = self.db.query(Article).filter(
            Article.article_id == article_id
        ).first()

        if article:
            return ArticleResponse.from_orm(article)

        return None

    async def search_articles(self,
                             filters: ArticleSearchFilters,
                             limit: int = 50,
                             offset: int = 0) -> List[ArticleResponse]:
        """
        Search articles with filters

        Args:
            filters: Search filters
            limit: Maximum results
            offset: Results offset

        Returns:
            List of matching articles
        """
        query = self.db.query(Article)

        # Apply filters
        if filters.source_types:
            query = query.filter(Article.source_type.in_(filters.source_types))

        if filters.date_from:
            query = query.filter(Article.publication_date >= filters.date_from)

        if filters.date_to:
            query = query.filter(Article.publication_date <= filters.date_to)

        if filters.theme_tags:
            # JSON array overlap
            for tag in filters.theme_tags:
                query = query.filter(Article.theme_tags.contains([tag]))

        if filters.search_query:
            # Search in title and summary
            search_term = f"%{filters.search_query}%"
            query = query.filter(
                or_(
                    Article.title.ilike(search_term),
                    Article.summary.ilike(search_term),
                    Article.ai_summary.ilike(search_term)
                )
            )

        # Order by publication date desc
        query = query.order_by(desc(Article.publication_date))

        # Apply pagination
        articles = query.offset(offset).limit(limit).all()

        return [ArticleResponse.from_orm(article) for article in articles]

    async def associate_article_with_report(
        self,
        association_data: ReportArticleAssociationCreate
    ) -> ReportArticleAssociationResponse:
        """
        Associate an article with a report

        Args:
            association_data: Association data

        Returns:
            Created association
        """
        self._log_operation('associate_article_with_report', {
            'report_id': association_data.report_id,
            'article_id': association_data.article_id
        })

        # Check if association already exists
        existing = self.db.query(ReportArticleAssociation).filter(
            and_(
                ReportArticleAssociation.report_id == association_data.report_id,
                ReportArticleAssociation.article_id == association_data.article_id
            )
        ).first()

        if existing:
            return ReportArticleAssociationResponse.from_orm(existing)

        # Create new association
        association = ReportArticleAssociation(
            report_id=association_data.report_id,
            article_id=association_data.article_id,
            relevance_score=association_data.relevance_score,
            relevance_rationale=association_data.relevance_rationale,
            ranking=association_data.ranking
        )

        self.db.add(association)
        self.db.commit()
        self.db.refresh(association)

        return ReportArticleAssociationResponse.from_orm(association)

    async def get_report_articles(self, report_id: int) -> List[ReportArticleWithAssociation]:
        """
        Get all articles for a report with their association metadata

        Args:
            report_id: Report ID

        Returns:
            List of articles with association data
        """
        # Join articles with their associations for this report
        query = self.db.query(Article, ReportArticleAssociation).join(
            ReportArticleAssociation,
            Article.article_id == ReportArticleAssociation.article_id
        ).filter(
            ReportArticleAssociation.report_id == report_id
        ).order_by(ReportArticleAssociation.ranking.asc())

        results = query.all()

        articles_with_associations = []
        for article, association in results:
            article_data = ReportArticleWithAssociation(
                # Article fields
                article_id=article.article_id,
                title=article.title,
                url=article.url,
                authors=article.authors,
                publication_date=article.publication_date,
                summary=article.summary,
                ai_summary=article.ai_summary,
                source_type=article.source_type,
                theme_tags=article.theme_tags,

                # Association fields
                relevance_score=association.relevance_score,
                relevance_rationale=association.relevance_rationale,
                ranking=association.ranking,
                user_feedback=association.user_feedback,
                is_starred=association.is_starred,
                is_read=association.is_read,
                notes=association.notes,
                added_at=association.added_at
            )
            articles_with_associations.append(article_data)

        return articles_with_associations

    async def update_article_association(self,
                                        report_id: int,
                                        article_id: int,
                                        updates: Dict[str, Any]) -> ReportArticleAssociationResponse:
        """
        Update an article-report association

        Args:
            report_id: Report ID
            article_id: Article ID
            updates: Fields to update

        Returns:
            Updated association
        """
        association = self.db.query(ReportArticleAssociation).filter(
            and_(
                ReportArticleAssociation.report_id == report_id,
                ReportArticleAssociation.article_id == article_id
            )
        ).first()

        if not association:
            raise ValueError(f"Association not found for report {report_id} and article {article_id}")

        # Apply updates
        for key, value in updates.items():
            if hasattr(association, key):
                setattr(association, key, value)

        self.db.commit()
        self.db.refresh(association)

        return ReportArticleAssociationResponse.from_orm(association)

    async def mark_article_read(self, report_id: int, article_id: int) -> bool:
        """
        Mark an article as read in a specific report

        Args:
            report_id: Report ID
            article_id: Article ID

        Returns:
            Success status
        """
        return await self.update_article_association(
            report_id=report_id,
            article_id=article_id,
            updates={
                'is_read': True,
                'read_at': datetime.utcnow()
            }
        )

    async def star_article(self, report_id: int, article_id: int, starred: bool = True) -> bool:
        """
        Star or unstar an article in a specific report

        Args:
            report_id: Report ID
            article_id: Article ID
            starred: Whether to star (True) or unstar (False)

        Returns:
            Success status
        """
        await self.update_article_association(
            report_id=report_id,
            article_id=article_id,
            updates={'is_starred': starred}
        )
        return True

    async def get_duplicate_articles(self) -> List[Dict[str, Any]]:
        """
        Find duplicate articles based on URL

        Returns:
            List of duplicate article groups
        """
        # This would need a more complex query to find duplicates
        # For now, return empty list
        return []

    async def get_article_history(self, article_id: int) -> Dict[str, Any]:
        """
        Get the history of an article across reports

        Args:
            article_id: Article ID

        Returns:
            Article history
        """
        article = await self.get_article(article_id)
        if not article:
            raise ValueError(f"Article {article_id} not found")

        # Get all report associations
        associations = self.db.query(ReportArticleAssociation).filter(
            ReportArticleAssociation.article_id == article_id
        ).order_by(ReportArticleAssociation.added_at.desc()).all()

        return {
            'article': article,
            'total_reports': len(associations),
            'reports': [
                {
                    'report_id': assoc.report_id,
                    'relevance_score': assoc.relevance_score,
                    'ranking': assoc.ranking,
                    'added_at': assoc.added_at,
                    'user_feedback': assoc.user_feedback
                }
                for assoc in associations
            ]
        }