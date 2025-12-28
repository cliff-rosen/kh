"""
Report Service for Knowledge Horizon

This service is the ONLY place that should write to the Report and
ReportArticleAssociation tables. All other services should use this
service for report-related operations.
"""

import logging
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from typing import List, Optional, Dict, Any, Set
from datetime import date, datetime
from fastapi import HTTPException, status

from models import (
    Report, ReportArticleAssociation, Article, WipArticle,
    ResearchStream, User, UserRole, StreamScope,
    OrgStreamSubscription, UserStreamSubscription
)
from schemas.report import Report as ReportSchema
from services.user_service import UserService

logger = logging.getLogger(__name__)


class ReportService:
    """
    Service for all Report and ReportArticleAssociation operations.

    This is the single source of truth for Report table access.
    Only this service should write to the Report and ReportArticleAssociation tables.
    """

    def __init__(self, db: Session):
        self.db = db
        self._user_service: Optional[UserService] = None

    @property
    def user_service(self) -> UserService:
        """Lazy-load UserService."""
        if self._user_service is None:
            self._user_service = UserService(self.db)
        return self._user_service

    def _user_has_stream_access(self, user: User, stream: ResearchStream) -> bool:
        """
        Check if a user has access to view reports for a stream.

        Access rules:
        - Personal streams: only the creator
        - Organization streams: all members of that org (who are subscribed or org admins)
        - Global streams: platform admins + members of subscribed orgs
        """
        if not stream:
            return False

        # Personal stream - only creator
        if stream.scope == StreamScope.PERSONAL:
            return stream.user_id == user.user_id

        # Organization stream - must be in the same org
        if stream.scope == StreamScope.ORGANIZATION:
            if user.role == UserRole.PLATFORM_ADMIN:
                return True
            return user.org_id == stream.org_id

        # Global stream
        if stream.scope == StreamScope.GLOBAL:
            # Platform admins can see all global streams
            if user.role == UserRole.PLATFORM_ADMIN:
                return True
            # Check if user's org is subscribed
            if user.org_id:
                subscription = self.db.query(OrgStreamSubscription).filter(
                    and_(
                        OrgStreamSubscription.org_id == user.org_id,
                        OrgStreamSubscription.stream_id == stream.stream_id
                    )
                ).first()
                return subscription is not None

        return False

    def _get_accessible_stream_ids(self, user: User) -> Set[int]:
        """Get all stream IDs the user can access reports for."""
        accessible_ids = set()

        # Personal streams created by user
        personal_streams = self.db.query(ResearchStream.stream_id).filter(
            and_(
                ResearchStream.scope == StreamScope.PERSONAL,
                ResearchStream.user_id == user.user_id
            )
        ).all()
        accessible_ids.update(s[0] for s in personal_streams)

        # Platform admins see all global streams
        if user.role == UserRole.PLATFORM_ADMIN:
            global_streams = self.db.query(ResearchStream.stream_id).filter(
                ResearchStream.scope == StreamScope.GLOBAL
            ).all()
            accessible_ids.update(s[0] for s in global_streams)
        elif user.org_id:
            # Org streams for user's org
            org_streams = self.db.query(ResearchStream.stream_id).filter(
                and_(
                    ResearchStream.scope == StreamScope.ORGANIZATION,
                    ResearchStream.org_id == user.org_id
                )
            ).all()
            accessible_ids.update(s[0] for s in org_streams)

            # Global streams the user's org is subscribed to
            subscribed_global = self.db.query(OrgStreamSubscription.stream_id).filter(
                OrgStreamSubscription.org_id == user.org_id
            ).all()
            accessible_ids.update(s[0] for s in subscribed_global)

        return accessible_ids

    def get_report(self, report_id: int, user_id: int) -> Report:
        """
        Get a report by ID for a user.

        Args:
            report_id: The report ID
            user_id: The user ID (for access verification)

        Returns:
            Report ORM model

        Raises:
            HTTPException: 404 if report not found or user doesn't have access
        """
        report = self.db.query(Report).filter(
            Report.report_id == report_id
        ).first()

        if not report:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Report not found"
            )

        # Check stream access
        user = self.user_service.get_user_by_id(user_id)
        stream = self.db.query(ResearchStream).filter(
            ResearchStream.stream_id == report.research_stream_id
        ).first()

        if not user or not self._user_has_stream_access(user, stream):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Report not found"
            )

        return report

    def get_reports_for_stream(self, research_stream_id: int, user_id: int) -> List[ReportSchema]:
        """Get all reports for a research stream that the user has access to."""
        # Check stream access
        user = self.user_service.get_user_by_id(user_id)
        stream = self.db.query(ResearchStream).filter(
            ResearchStream.stream_id == research_stream_id
        ).first()

        if not user or not stream or not self._user_has_stream_access(user, stream):
            return []

        # Get all reports for this stream (not filtered by user_id)
        reports = self.db.query(Report).filter(
            Report.research_stream_id == research_stream_id
        ).order_by(Report.report_date.desc()).all()

        # Add article count to each report
        result = []
        for report in reports:
            report_dict = ReportSchema.from_orm(report).dict()
            article_count = self.db.query(ReportArticleAssociation).filter(
                ReportArticleAssociation.report_id == report.report_id
            ).count()
            report_dict['article_count'] = article_count
            result.append(ReportSchema(**report_dict))

        return result

    def get_latest_report_for_stream(self, research_stream_id: int, user_id: int) -> Optional[ReportSchema]:
        """Get the most recent report for a research stream that the user has access to."""
        # Check stream access
        user = self.user_service.get_user_by_id(user_id)
        stream = self.db.query(ResearchStream).filter(
            ResearchStream.stream_id == research_stream_id
        ).first()

        if not user or not stream or not self._user_has_stream_access(user, stream):
            return None

        # Get latest report for this stream (not filtered by user_id)
        report = self.db.query(Report).filter(
            Report.research_stream_id == research_stream_id
        ).order_by(Report.report_date.desc()).first()

        if not report:
            return None

        # Add article count
        article_count = self.db.query(ReportArticleAssociation).filter(
            ReportArticleAssociation.report_id == report.report_id
        ).count()

        report_dict = ReportSchema.from_orm(report).dict()
        report_dict['article_count'] = article_count
        return ReportSchema(**report_dict)

    def get_recent_reports(self, user_id: int, limit: int = 5) -> List[ReportSchema]:
        """Get the most recent reports across all accessible streams for a user."""
        user = self.user_service.get_user_by_id(user_id)
        if not user:
            return []

        # Get all accessible stream IDs
        accessible_stream_ids = self._get_accessible_stream_ids(user)

        if not accessible_stream_ids:
            return []

        # Get recent reports from accessible streams
        reports = self.db.query(Report).filter(
            Report.research_stream_id.in_(accessible_stream_ids)
        ).order_by(Report.created_at.desc()).limit(limit).all()

        result = []
        for report in reports:
            report_dict = ReportSchema.from_orm(report).dict()
            article_count = self.db.query(ReportArticleAssociation).filter(
                ReportArticleAssociation.report_id == report.report_id
            ).count()
            report_dict['article_count'] = article_count
            result.append(ReportSchema(**report_dict))

        return result

    def get_report_with_articles(self, report_id: int, user_id: int) -> Optional[Dict[str, Any]]:
        """Get a report with its associated articles for a user with stream access."""
        report = self.db.query(Report).filter(
            Report.report_id == report_id
        ).first()

        if not report:
            return None

        # Check stream access
        user = self.user_service.get_user_by_id(user_id)
        stream = self.db.query(ResearchStream).filter(
            ResearchStream.stream_id == report.research_stream_id
        ).first()

        if not user or not self._user_has_stream_access(user, stream):
            return None

        # Get articles with association data
        article_associations = self.db.query(
            ReportArticleAssociation, Article
        ).join(
            Article, Article.article_id == ReportArticleAssociation.article_id
        ).filter(
            ReportArticleAssociation.report_id == report_id
        ).order_by(
            ReportArticleAssociation.ranking
        ).all()

        # Build article list with association metadata
        articles = []
        for assoc, article in article_associations:
            article_dict = {
                'article_id': article.article_id,
                'title': article.title,
                'authors': article.authors,
                'journal': article.journal,
                'publication_date': article.publication_date.isoformat() if article.publication_date else None,
                'pmid': article.pmid,
                'doi': article.doi,
                'abstract': article.abstract,
                'url': article.url,
                'year': article.year,
                # Association metadata
                'relevance_score': assoc.relevance_score,
                'relevance_rationale': assoc.relevance_rationale,
                'ranking': assoc.ranking,
                'is_starred': assoc.is_starred,
                'is_read': assoc.is_read,
                'notes': assoc.notes,
                'presentation_categories': assoc.presentation_categories or [],
                'ai_enrichments': assoc.ai_enrichments
            }
            articles.append(article_dict)

        # Build complete report dict
        report_dict = ReportSchema.from_orm(report).dict()
        report_dict['article_count'] = len(articles)
        report_dict['articles'] = articles

        return report_dict

    def get_wip_articles_for_report(self, report_id: int, user_id: int, included_only: bool = True) -> List[WipArticle]:
        """
        Get WIP articles for a report.

        Args:
            report_id: The report ID
            user_id: The user ID (for access verification)
            included_only: If True, only return articles with included_in_report=True

        Returns:
            List of WipArticle objects
        """
        # Get the report
        report = self.db.query(Report).filter(
            Report.report_id == report_id
        ).first()

        if not report or not report.pipeline_execution_id:
            return []

        # Check stream access
        user = self.user_service.get_user_by_id(user_id)
        stream = self.db.query(ResearchStream).filter(
            ResearchStream.stream_id == report.research_stream_id
        ).first()

        if not user or not self._user_has_stream_access(user, stream):
            return []

        # Build query
        query = self.db.query(WipArticle).filter(
            WipArticle.pipeline_execution_id == report.pipeline_execution_id
        )

        if included_only:
            query = query.filter(WipArticle.included_in_report == True)

        return query.all()

    def delete_report(self, report_id: int, user_id: int) -> bool:
        """
        Delete a report and its associated data (wip_articles, article associations).
        Returns True if report was deleted, False if not found or unauthorized.
        """
        # Find the report
        report = self.db.query(Report).filter(
            and_(
                Report.report_id == report_id,
                Report.user_id == user_id
            )
        ).first()

        if not report:
            return False

        # Delete wip_articles associated with this pipeline execution (if any)
        if report.pipeline_execution_id:
            self.db.query(WipArticle).filter(
                WipArticle.pipeline_execution_id == report.pipeline_execution_id
            ).delete()

        # Delete article associations (due to foreign key constraints)
        self.db.query(ReportArticleAssociation).filter(
            ReportArticleAssociation.report_id == report_id
        ).delete()

        # Delete the report
        self.db.delete(report)
        self.db.commit()

        return True

    # =========================================================================
    # CREATE Operations
    # =========================================================================

    def create_report(
        self,
        user_id: int,
        research_stream_id: int,
        report_date: date,
        title: str,
        pipeline_execution_id: Optional[str] = None,
        executive_summary: Optional[str] = None,
        enrichments: Optional[Dict[str, Any]] = None
    ) -> Report:
        """
        Create a new report.

        Args:
            user_id: Owner user ID
            research_stream_id: Associated research stream ID
            report_date: Date of the report
            title: Report title
            pipeline_execution_id: Optional pipeline execution ID
            executive_summary: Optional executive summary
            enrichments: Optional enrichments dict (category summaries, etc.)

        Returns:
            Created Report instance
        """
        # Build enrichments with executive_summary included
        final_enrichments = enrichments or {}
        if executive_summary:
            final_enrichments["executive_summary"] = executive_summary

        report = Report(
            user_id=user_id,
            research_stream_id=research_stream_id,
            report_date=report_date,
            report_name=title,
            pipeline_execution_id=pipeline_execution_id,
            enrichments=final_enrichments,
            created_at=datetime.utcnow()
        )
        self.db.add(report)
        self.db.flush()  # Get the report_id
        return report

    def create_article_association(
        self,
        report_id: int,
        article_id: int,
        ranking: int,
        relevance_score: Optional[float] = None,
        relevance_rationale: Optional[str] = None,
        presentation_categories: Optional[List[str]] = None
    ) -> ReportArticleAssociation:
        """
        Create a report-article association.

        Args:
            report_id: Report ID
            article_id: Article ID
            ranking: Article ranking in the report
            relevance_score: Optional relevance score
            relevance_rationale: Optional relevance explanation
            presentation_categories: Optional list of category IDs

        Returns:
            Created ReportArticleAssociation instance
        """
        association = ReportArticleAssociation(
            report_id=report_id,
            article_id=article_id,
            ranking=ranking,
            relevance_score=relevance_score,
            relevance_rationale=relevance_rationale,
            presentation_categories=presentation_categories or [],
            is_starred=False,
            is_read=False
        )
        self.db.add(association)
        return association

    def update_report_enrichments(
        self,
        report: Report,
        executive_summary: Optional[str] = None,
        enrichments: Optional[Dict[str, Any]] = None
    ) -> None:
        """
        Update report enrichments (executive summary, category summaries).

        Args:
            report: Report instance to update
            executive_summary: New executive summary
            enrichments: New enrichments dict
        """
        if executive_summary is not None:
            report.executive_summary = executive_summary
        if enrichments is not None:
            report.enrichments = enrichments
        report.updated_at = datetime.utcnow()

    # =========================================================================
    # Extended READ Operations
    # =========================================================================

    def get_report_with_wip_articles(
        self,
        report_id: int,
        user_id: int
    ) -> Optional[Dict[str, Any]]:
        """
        Get report with all WIP articles for analytics/debugging.

        Args:
            report_id: Report ID
            user_id: User ID for access verification

        Returns:
            Dict with report data and wip_articles, or None if not found
        """
        report = self.db.query(Report).filter(
            Report.report_id == report_id
        ).first()

        if not report:
            return None

        # Check stream access
        user = self.user_service.get_user_by_id(user_id)
        stream = self.db.query(ResearchStream).filter(
            ResearchStream.stream_id == report.research_stream_id
        ).first()

        if not user or not self._user_has_stream_access(user, stream):
            return None

        # Get WIP articles if pipeline execution exists
        wip_articles = []
        if report.pipeline_execution_id:
            wip_articles = self.db.query(WipArticle).filter(
                WipArticle.pipeline_execution_id == report.pipeline_execution_id
            ).all()

        return {
            "report": report,
            "wip_articles": wip_articles
        }

    def get_report_article_associations(
        self,
        report_id: int
    ) -> List[ReportArticleAssociation]:
        """
        Get all article associations for a report.

        Args:
            report_id: Report ID

        Returns:
            List of ReportArticleAssociation instances with joined Article data
        """
        return self.db.query(ReportArticleAssociation).join(Article).filter(
            ReportArticleAssociation.report_id == report_id
        ).all()

    def get_report_pmids(self, report_id: int) -> Dict[str, Article]:
        """
        Get a mapping of PMIDs to Articles for a report.

        Args:
            report_id: Report ID

        Returns:
            Dict mapping PMID -> Article
        """
        associations = self.db.query(ReportArticleAssociation).join(Article).filter(
            ReportArticleAssociation.report_id == report_id
        ).all()

        return {
            assoc.article.pmid: assoc.article
            for assoc in associations
            if assoc.article.pmid
        }

    # =========================================================================
    # Article Association Operations
    # =========================================================================

    def get_article_association(
        self,
        report_id: int,
        article_id: int,
        user_id: int
    ) -> Optional[ReportArticleAssociation]:
        """
        Get a specific article association, verifying stream access.

        Args:
            report_id: The report ID
            article_id: The article ID
            user_id: The user ID (for access verification)

        Returns:
            ReportArticleAssociation or None if not found
        """
        # Verify report exists
        report = self.db.query(Report).filter(
            Report.report_id == report_id
        ).first()

        if not report:
            return None

        # Check stream access
        user = self.user_service.get_user_by_id(user_id)
        stream = self.db.query(ResearchStream).filter(
            ResearchStream.stream_id == report.research_stream_id
        ).first()

        if not user or not self._user_has_stream_access(user, stream):
            return None

        # Find the association
        return self.db.query(ReportArticleAssociation).filter(
            and_(
                ReportArticleAssociation.report_id == report_id,
                ReportArticleAssociation.article_id == article_id
            )
        ).first()

    def update_article_notes(
        self,
        report_id: int,
        article_id: int,
        user_id: int,
        notes: Optional[str]
    ) -> Optional[Dict[str, Any]]:
        """
        Update notes for an article within a report.

        Args:
            report_id: The report ID
            article_id: The article ID
            user_id: The user ID (for ownership verification)
            notes: The notes text (or None to clear)

        Returns:
            Dict with updated notes, or None if association not found
        """
        association = self.get_article_association(report_id, article_id, user_id)
        if not association:
            return None

        association.notes = notes
        self.db.commit()

        return {"notes": association.notes}

    def update_article_enrichments(
        self,
        report_id: int,
        article_id: int,
        user_id: int,
        ai_enrichments: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """
        Update AI enrichments for an article within a report.

        Args:
            report_id: The report ID
            article_id: The article ID
            user_id: The user ID (for ownership verification)
            ai_enrichments: The enrichments dict

        Returns:
            Dict with updated enrichments, or None if association not found
        """
        association = self.get_article_association(report_id, article_id, user_id)
        if not association:
            return None

        association.ai_enrichments = ai_enrichments
        self.db.commit()

        return {"ai_enrichments": association.ai_enrichments}

    def get_article_metadata(
        self,
        report_id: int,
        article_id: int,
        user_id: int
    ) -> Optional[Dict[str, Any]]:
        """
        Get notes and AI enrichments for an article within a report.

        Args:
            report_id: The report ID
            article_id: The article ID
            user_id: The user ID (for ownership verification)

        Returns:
            Dict with notes and ai_enrichments, or None if not found
        """
        association = self.get_article_association(report_id, article_id, user_id)
        if not association:
            return None

        return {
            "notes": association.notes,
            "ai_enrichments": association.ai_enrichments
        }

    # =========================================================================
    # Pipeline Analytics
    # =========================================================================

    def get_pipeline_analytics(
        self,
        report_id: int,
        user_id: int
    ) -> Optional[Dict[str, Any]]:
        """
        Get pipeline execution analytics for a report.

        Args:
            report_id: The report ID
            user_id: The user ID (for access verification)

        Returns:
            Dict with analytics data, or None if report not found.
            Raises ValueError if report has no pipeline execution data.
        """
        # Verify report exists
        report = self.db.query(Report).filter(
            Report.report_id == report_id
        ).first()

        if not report:
            return None

        # Check stream access
        user = self.user_service.get_user_by_id(user_id)
        stream = self.db.query(ResearchStream).filter(
            ResearchStream.stream_id == report.research_stream_id
        ).first()

        if not user or not self._user_has_stream_access(user, stream):
            return None

        # Check for pipeline execution ID
        if not report.pipeline_execution_id:
            raise ValueError("This report does not have pipeline execution data (legacy report)")

        # Get all wip_articles for this execution
        wip_articles = self.db.query(WipArticle).filter(
            WipArticle.pipeline_execution_id == report.pipeline_execution_id
        ).all()

        # Calculate analytics
        total_retrieved = len(wip_articles)
        duplicates = sum(1 for a in wip_articles if a.is_duplicate)
        filtered_out = sum(1 for a in wip_articles if a.passed_semantic_filter == False)
        passed_filter = sum(1 for a in wip_articles if a.passed_semantic_filter == True)
        included_in_report = sum(1 for a in wip_articles if a.included_in_report)

        # Group by retrieval group
        groups: Dict[str, Dict[str, Any]] = {}
        for article in wip_articles:
            if article.retrieval_group_id not in groups:
                groups[article.retrieval_group_id] = {
                    'group_id': article.retrieval_group_id,
                    'total': 0,
                    'duplicates': 0,
                    'filtered_out': 0,
                    'passed_filter': 0,
                    'included': 0
                }
            groups[article.retrieval_group_id]['total'] += 1
            if article.is_duplicate:
                groups[article.retrieval_group_id]['duplicates'] += 1
            if article.passed_semantic_filter == False:
                groups[article.retrieval_group_id]['filtered_out'] += 1
            if article.passed_semantic_filter == True:
                groups[article.retrieval_group_id]['passed_filter'] += 1
            if article.included_in_report:
                groups[article.retrieval_group_id]['included'] += 1

        # Get filter rejection reasons
        rejection_reasons: Dict[str, int] = {}
        for article in wip_articles:
            if article.filter_rejection_reason:
                reason = article.filter_rejection_reason[:100]  # Truncate for grouping
                rejection_reasons[reason] = rejection_reasons.get(reason, 0) + 1

        # Categorization stats
        category_counts: Dict[str, int] = {}
        for article in wip_articles:
            if article.presentation_categories:
                for cat_id in article.presentation_categories:
                    category_counts[cat_id] = category_counts.get(cat_id, 0) + 1

        # Serialize wip_articles for client
        wip_articles_data = []
        for article in wip_articles:
            wip_articles_data.append({
                'id': article.id,
                'title': article.title,
                'retrieval_group_id': article.retrieval_group_id,
                'is_duplicate': article.is_duplicate,
                'duplicate_of_id': article.duplicate_of_id,
                'passed_semantic_filter': article.passed_semantic_filter,
                'filter_rejection_reason': article.filter_rejection_reason,
                'included_in_report': article.included_in_report,
                'presentation_categories': article.presentation_categories,
                'authors': article.authors,
                'journal': article.journal,
                'year': article.year,
                'pmid': article.pmid,
                'doi': article.doi,
                'abstract': article.abstract
            })

        return {
            'report_id': report_id,
            'run_type': report.run_type.value if report.run_type else None,
            'report_date': report.report_date.isoformat(),
            'pipeline_metrics': report.pipeline_metrics,
            'summary': {
                'total_retrieved': total_retrieved,
                'duplicates': duplicates,
                'filtered_out': filtered_out,
                'passed_filter': passed_filter,
                'included_in_report': included_in_report
            },
            'by_group': list(groups.values()),
            'rejection_reasons': rejection_reasons,
            'category_counts': category_counts,
            'wip_articles': wip_articles_data
        }

    # =========================================================================
    # COMMIT Operations
    # =========================================================================

    def commit(self) -> None:
        """Commit pending changes to the database."""
        self.db.commit()

    def flush(self) -> None:
        """Flush pending changes without committing."""
        self.db.flush()
