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
    OrgStreamSubscription, UserStreamSubscription, PipelineExecution,
    ApprovalStatus
)
from schemas.report import Report as ReportSchema
from services.user_service import UserService
from services.email_template_service import (
    EmailTemplateService, EmailReportData, EmailCategory, EmailArticle
)

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
        self._stream_service = None  # Lazy-loaded to avoid circular import

    @property
    def user_service(self) -> UserService:
        """Lazy-load UserService."""
        if self._user_service is None:
            self._user_service = UserService(self.db)
        return self._user_service

    @property
    def stream_service(self):
        """Lazy-load ResearchStreamService."""
        if self._stream_service is None:
            from services.research_stream_service import ResearchStreamService
            self._stream_service = ResearchStreamService(self.db)
        return self._stream_service

    def get_report_by_id(self, report_id: int) -> Report:
        """
        Get a report by ID, raising ValueError if not found.

        This is the canonical method for internal services.
        For HTTP-facing code, use get_report_or_404.

        Args:
            report_id: The report ID to look up

        Returns:
            Report model instance

        Raises:
            ValueError: if report not found
        """
        report = self.db.query(Report).filter(Report.report_id == report_id).first()
        if not report:
            raise ValueError(f"Report {report_id} not found")
        return report

    def get_report_or_404(self, report_id: int) -> Report:
        """
        Get a report by ID, raising HTTPException 404 if not found.

        For HTTP-facing code. For internal services, use get_report_by_id.

        Args:
            report_id: The report ID to look up

        Returns:
            Report model instance

        Raises:
            HTTPException: 404 if report not found
        """
        try:
            return self.get_report_by_id(report_id)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Report not found"
            )

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
        report = self.get_report_or_404(report_id)
        user = self.user_service.get_user_or_404(user_id)
        stream = self.stream_service.get_stream_or_404(report.research_stream_id)

        if not self._user_has_stream_access(user, stream):
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

        # Build query for reports
        query = self.db.query(Report).filter(
            Report.research_stream_id == research_stream_id
        )

        # Non-admins can only see approved reports (hide awaiting_approval and rejected)
        if user.role != UserRole.PLATFORM_ADMIN:
            query = query.filter(Report.approval_status == ApprovalStatus.APPROVED)

        reports = query.order_by(Report.report_date.desc()).all()

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

        # Build query for latest report
        query = self.db.query(Report).filter(
            Report.research_stream_id == research_stream_id
        )

        # Non-admins can only see approved reports
        if user.role != UserRole.PLATFORM_ADMIN:
            query = query.filter(Report.approval_status == ApprovalStatus.APPROVED)

        report = query.order_by(Report.report_date.desc()).first()

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

        # Build query for recent reports
        query = self.db.query(Report).filter(
            Report.research_stream_id.in_(accessible_stream_ids)
        )

        # Non-admins can only see approved reports
        if user.role != UserRole.PLATFORM_ADMIN:
            query = query.filter(Report.approval_status == ApprovalStatus.APPROVED)

        reports = query.order_by(Report.created_at.desc()).limit(limit).all()

        result = []
        for report in reports:
            report_dict = ReportSchema.from_orm(report).dict()
            article_count = self.db.query(ReportArticleAssociation).filter(
                ReportArticleAssociation.report_id == report.report_id
            ).count()
            report_dict['article_count'] = article_count
            result.append(ReportSchema(**report_dict))

        return result

    def get_report_articles_list(
        self,
        report_id: int,
        user_id: int,
        include_abstract: bool = False
    ) -> Optional[Dict[str, Any]]:
        """
        Get the list of articles in a report with metadata.

        This is optimized for LLM consumption - returns a structured list
        with category names resolved from IDs.

        Args:
            report_id: The report ID
            user_id: The user ID (for access verification)
            include_abstract: If True, include full abstracts (expanded mode)

        Returns:
            Dict with report info and articles list, or None if not found/no access
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

        # Build category ID -> name mapping from stream's presentation_config
        category_map = {}
        if stream and stream.presentation_config:
            categories = stream.presentation_config.get("categories", [])
            for cat in categories:
                if isinstance(cat, dict):
                    category_map[cat.get("id", "")] = cat.get("name", cat.get("id", "Unknown"))

        # Get articles with their associations
        results = self.db.query(
            Article, ReportArticleAssociation
        ).join(
            ReportArticleAssociation,
            Article.article_id == ReportArticleAssociation.article_id
        ).filter(
            ReportArticleAssociation.report_id == report_id
        ).order_by(
            ReportArticleAssociation.ranking.asc()
        ).all()

        articles = []
        for article, assoc in results:
            # Resolve category IDs to names
            category_ids = assoc.presentation_categories or []
            category_names = [category_map.get(cid, cid) for cid in category_ids]

            article_data = {
                "pmid": article.pmid,
                "title": article.title,
                "journal": article.journal,
                "publication_date": article.year or "Unknown",
                "categories": category_names,
                "category_ids": category_ids,
                "relevance_score": assoc.relevance_score,
                "ranking": assoc.ranking
            }

            if include_abstract:
                article_data["authors"] = article.authors
                article_data["abstract"] = article.abstract
                article_data["doi"] = article.doi

            articles.append(article_data)

        return {
            "report_id": report_id,
            "report_name": report.report_name,
            "report_date": report.report_date.isoformat() if report.report_date else None,
            "total_articles": len(articles),
            "articles": articles
        }

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
            created_at=datetime.utcnow(),
            approval_status=ApprovalStatus.AWAITING_APPROVAL  # Explicitly set pending approval
        )
        self.db.add(report)
        self.db.flush()  # Get the report_id

        # Update PipelineExecution with the report_id (bidirectional link)
        if pipeline_execution_id:
            execution = self.db.query(PipelineExecution).filter(
                PipelineExecution.id == pipeline_execution_id
            ).first()
            if execution:
                execution.report_id = report.report_id

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

        # Get the pipeline execution record (source of truth for run_type and config)
        execution = self.db.query(PipelineExecution).filter(
            PipelineExecution.id == report.pipeline_execution_id
        ).first()

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

        # Get filter score reasons (for articles that were filtered out)
        filter_reasons: Dict[str, int] = {}
        for article in wip_articles:
            if article.filter_score_reason and article.passed_semantic_filter == False:
                reason = article.filter_score_reason[:100]  # Truncate for grouping
                filter_reasons[reason] = filter_reasons.get(reason, 0) + 1

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
                'filter_score': article.filter_score,
                'filter_score_reason': article.filter_score_reason,
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
            'run_type': execution.run_type.value if execution and execution.run_type else None,
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
            'filter_reasons': filter_reasons,
            'category_counts': category_counts,
            'wip_articles': wip_articles_data
        }

    # =========================================================================
    # Email Generation
    # =========================================================================

    def generate_report_email_html(self, report_id: int, user_id: int) -> Optional[str]:
        """
        Generate HTML email content for a report.

        Args:
            report_id: The report ID
            user_id: The user ID (for access verification)

        Returns:
            HTML string, or None if report not found/no access
        """
        # Get report with access check
        report = self.db.query(Report).filter(Report.report_id == report_id).first()
        if not report:
            return None

        # Check stream access
        user = self.user_service.get_user_by_id(user_id)
        stream = self.db.query(ResearchStream).filter(
            ResearchStream.stream_id == report.research_stream_id
        ).first()

        if not user or not self._user_has_stream_access(user, stream):
            return None

        # Build email data
        email_data = self._build_email_report_data(report, stream)

        # Generate HTML
        template_service = EmailTemplateService()
        return template_service.generate_report_email(email_data)

    def generate_and_store_report_email(self, report_id: int, user_id: int) -> Optional[str]:
        """
        Generate HTML email for a report and store it in enrichments.

        Args:
            report_id: The report ID
            user_id: The user ID (for access verification)

        Returns:
            HTML string, or None if report not found/no access
        """
        html = self.generate_report_email_html(report_id, user_id)
        if html is None:
            return None

        # Store in enrichments
        report = self.db.query(Report).filter(Report.report_id == report_id).first()
        if report:
            enrichments = report.enrichments or {}
            enrichments['email_html'] = html
            report.enrichments = enrichments
            self.db.commit()

        return html

    def store_report_email_html(self, report_id: int, user_id: int, html: str) -> bool:
        """
        Store email HTML for a report.

        Args:
            report_id: The report ID
            user_id: The user ID (for access verification)
            html: The HTML content to store

        Returns:
            True if stored successfully, False if report not found/no access
        """
        report = self.db.query(Report).filter(Report.report_id == report_id).first()
        if not report:
            return False

        # Check stream access
        user = self.user_service.get_user_by_id(user_id)
        stream = self.db.query(ResearchStream).filter(
            ResearchStream.stream_id == report.research_stream_id
        ).first()

        if not user or not self._user_has_stream_access(user, stream):
            return False

        # Store in enrichments
        enrichments = report.enrichments or {}
        enrichments['email_html'] = html
        report.enrichments = enrichments
        self.db.commit()

        return True

    def get_report_email_html(self, report_id: int, user_id: int) -> Optional[str]:
        """
        Get stored email HTML for a report.

        Args:
            report_id: The report ID
            user_id: The user ID (for access verification)

        Returns:
            Stored HTML string, or None if not found/no access/not generated
        """
        report = self.db.query(Report).filter(Report.report_id == report_id).first()
        if not report:
            return None

        # Check stream access
        user = self.user_service.get_user_by_id(user_id)
        stream = self.db.query(ResearchStream).filter(
            ResearchStream.stream_id == report.research_stream_id
        ).first()

        if not user or not self._user_has_stream_access(user, stream):
            return None

        # Get from enrichments
        enrichments = report.enrichments or {}
        return enrichments.get('email_html')

    def _build_email_report_data(self, report: Report, stream: ResearchStream) -> EmailReportData:
        """
        Build EmailReportData from report and stream.

        Args:
            report: Report model instance
            stream: ResearchStream model instance

        Returns:
            EmailReportData for template generation
        """
        # Get categories from stream's presentation_config
        categories_config = []
        category_lookup = {}
        if stream and stream.presentation_config:
            categories_config = stream.presentation_config.get('categories', [])
            category_lookup = {cat['id']: cat for cat in categories_config}

        # Get enrichments
        enrichments = report.enrichments or {}
        executive_summary = enrichments.get('executive_summary', '')
        category_summaries = enrichments.get('category_summaries', {})

        # Get articles with associations
        associations = self.db.query(ReportArticleAssociation, Article).join(
            Article, ReportArticleAssociation.article_id == Article.article_id
        ).filter(
            ReportArticleAssociation.report_id == report.report_id
        ).order_by(
            ReportArticleAssociation.ranking
        ).all()

        # Group articles by category
        articles_by_category: Dict[str, List[EmailArticle]] = {}
        uncategorized: List[EmailArticle] = []

        for assoc, article in associations:
            email_article = EmailArticle(
                title=article.title,
                url=article.url,
                doi=article.doi,
                pmid=article.pmid,
                authors=article.authors if isinstance(article.authors, list) else [],
                journal=article.journal,
                publication_date=article.publication_date.strftime('%Y-%m-%d') if article.publication_date else article.year,
                summary=article.ai_summary or article.abstract or article.summary
            )

            cat_ids = assoc.presentation_categories or []
            if not cat_ids:
                uncategorized.append(email_article)
            else:
                for cat_id in cat_ids:
                    if cat_id not in articles_by_category:
                        articles_by_category[cat_id] = []
                    articles_by_category[cat_id].append(email_article)

        # Build EmailCategory list (preserving order from config)
        email_categories = []
        for cat_config in categories_config:
            cat_id = cat_config['id']
            cat_articles = articles_by_category.get(cat_id, [])
            if cat_articles:  # Only include categories with articles
                email_categories.append(EmailCategory(
                    id=cat_id,
                    name=cat_config.get('name', cat_id),
                    summary=category_summaries.get(cat_id, ''),
                    articles=cat_articles
                ))

        # Build final data
        return EmailReportData(
            report_name=report.report_name,
            stream_name=stream.stream_name if stream else "Research Report",
            report_date=report.report_date.strftime('%B %d, %Y') if report.report_date else '',
            executive_summary=executive_summary,
            categories=email_categories,
            uncategorized_articles=uncategorized
        )

    # =========================================================================
    # CURATION Operations
    # =========================================================================

    def _get_report_for_curation(
        self,
        report_id: int,
        user_id: int
    ) -> tuple[Report, User, ResearchStream]:
        """
        Get report with access verification for curation operations.

        Args:
            report_id: The report ID
            user_id: The user ID

        Returns:
            Tuple of (report, user, stream)

        Raises:
            HTTPException: 404 if report not found or user doesn't have access
        """
        report = self.get_report_or_404(report_id)
        user = self.user_service.get_user_or_404(user_id)
        stream = self.stream_service.get_stream_or_404(report.research_stream_id)

        if not self._user_has_stream_access(user, stream):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Report not found"
            )

        return report, user, stream

    def get_curation_view(self, report_id: int, user_id: int) -> Dict[str, Any]:
        """
        Get full curation view data for a report.

        Returns:
            Dict with:
            - report: Report content with originals for comparison
            - included_articles: Articles currently in the report
            - filtered_articles: Articles pipeline rejected (available for inclusion)
            - duplicate_articles: Articles marked as duplicates
            - curated_articles: Articles with curator overrides
            - categories: Stream's presentation categories

        Raises:
            HTTPException: 404 if report not found or user doesn't have access
        """
        report, user, stream = self._get_report_for_curation(report_id, user_id)

        # Get categories from stream config
        categories = []
        if stream and stream.presentation_config:
            categories = stream.presentation_config.get('categories', [])

        # Get included articles (from ReportArticleAssociation)
        included_results = self.db.query(
            ReportArticleAssociation, Article
        ).join(
            Article, Article.article_id == ReportArticleAssociation.article_id
        ).filter(
            ReportArticleAssociation.report_id == report_id
        ).order_by(
            ReportArticleAssociation.ranking
        ).all()

        included_articles = []
        for assoc, article in included_results:
            included_articles.append({
                'article_id': article.article_id,
                'pmid': article.pmid,
                'doi': article.doi,
                'title': article.title,
                'authors': article.authors,
                'journal': article.journal,
                'year': article.year,
                'abstract': article.abstract,
                'url': article.url,
                # Association data
                'ranking': assoc.ranking,
                'original_ranking': assoc.original_ranking,
                'presentation_categories': assoc.presentation_categories or [],
                'original_presentation_categories': assoc.original_presentation_categories or [],
                'ai_summary': assoc.ai_summary,
                'original_ai_summary': assoc.original_ai_summary,
                'relevance_score': assoc.relevance_score,
                'curation_notes': assoc.curation_notes,
                'curated_by': assoc.curated_by,
                'curated_at': assoc.curated_at.isoformat() if assoc.curated_at else None,
            })

        # Get WIP articles for this execution
        filtered_articles = []
        duplicate_articles = []
        curated_articles = []

        if report.pipeline_execution_id:
            wip_articles = self.db.query(WipArticle).filter(
                WipArticle.pipeline_execution_id == report.pipeline_execution_id
            ).all()

            for wip in wip_articles:
                wip_data = {
                    'wip_article_id': wip.id,
                    'pmid': wip.pmid,
                    'doi': wip.doi,
                    'title': wip.title,
                    'authors': wip.authors,
                    'journal': wip.journal,
                    'year': wip.year,
                    'abstract': wip.abstract,
                    'url': wip.url,
                    'filter_score': wip.filter_score,
                    'filter_score_reason': wip.filter_score_reason,
                    'passed_semantic_filter': wip.passed_semantic_filter,
                    'is_duplicate': wip.is_duplicate,
                    'duplicate_of_pmid': wip.duplicate_of_pmid,
                    'included_in_report': wip.included_in_report,
                    'curator_included': wip.curator_included,
                    'curator_excluded': wip.curator_excluded,
                    'curation_notes': wip.curation_notes,
                    'presentation_categories': wip.presentation_categories or [],
                }

                if wip.is_duplicate:
                    duplicate_articles.append(wip_data)
                elif not wip.included_in_report and not wip.is_duplicate:
                    filtered_articles.append(wip_data)

                # Track curated articles (curator override)
                if wip.curator_included or wip.curator_excluded:
                    curated_articles.append(wip_data)

        # Build report data with originals
        enrichments = report.enrichments or {}
        original_enrichments = report.original_enrichments or {}

        report_data = {
            'report_id': report.report_id,
            'report_name': report.report_name,
            'original_report_name': report.original_report_name,
            'report_date': report.report_date.isoformat() if report.report_date else None,
            'approval_status': report.approval_status.value if report.approval_status else None,
            'executive_summary': enrichments.get('executive_summary', ''),
            'original_executive_summary': original_enrichments.get('executive_summary', ''),
            'category_summaries': enrichments.get('category_summaries', {}),
            'original_category_summaries': original_enrichments.get('category_summaries', {}),
            'has_curation_edits': report.has_curation_edits,
            'last_curated_by': report.last_curated_by,
            'last_curated_at': report.last_curated_at.isoformat() if report.last_curated_at else None,
        }

        return {
            'report': report_data,
            'included_articles': included_articles,
            'filtered_articles': filtered_articles,
            'duplicate_articles': duplicate_articles,
            'curated_articles': curated_articles,
            'categories': categories,
            'stream_name': stream.stream_name if stream else None,
        }

    def update_report_content(
        self,
        report_id: int,
        user_id: int,
        title: Optional[str] = None,
        executive_summary: Optional[str] = None,
        category_summaries: Optional[Dict[str, str]] = None
    ) -> Dict[str, Any]:
        """
        Update report content (title, summaries) for curation.

        Sets has_curation_edits=True and records curator info.
        Creates CurationEvent for audit trail.

        Raises:
            HTTPException: 404 if report not found or user doesn't have access
        """
        report, user, stream = self._get_report_for_curation(report_id, user_id)

        # Import CurationEvent here to avoid circular imports
        from models import CurationEvent
        import json

        changes_made = []

        # Update title if provided
        if title is not None and title != report.report_name:
            old_value = report.report_name
            report.report_name = title
            changes_made.append(('report_name', old_value, title))

        # Update enrichments
        enrichments = report.enrichments or {}

        if executive_summary is not None:
            old_value = enrichments.get('executive_summary', '')
            if executive_summary != old_value:
                enrichments['executive_summary'] = executive_summary
                changes_made.append(('executive_summary', old_value, executive_summary))

        if category_summaries is not None:
            old_value = enrichments.get('category_summaries', {})
            if category_summaries != old_value:
                enrichments['category_summaries'] = category_summaries
                changes_made.append(('category_summaries', json.dumps(old_value), json.dumps(category_summaries)))

        if changes_made:
            report.enrichments = enrichments
            report.has_curation_edits = True
            report.last_curated_by = user_id
            report.last_curated_at = datetime.utcnow()

            # Create audit events
            for field_name, old_val, new_val in changes_made:
                event = CurationEvent(
                    report_id=report_id,
                    event_type='edit_report',
                    field_name=field_name,
                    old_value=str(old_val) if old_val else None,
                    new_value=str(new_val) if new_val else None,
                    curator_id=user_id
                )
                self.db.add(event)

            self.db.commit()

        return {
            'report_name': report.report_name,
            'executive_summary': enrichments.get('executive_summary', ''),
            'category_summaries': enrichments.get('category_summaries', {}),
            'has_curation_edits': report.has_curation_edits,
        }

    def exclude_article(
        self,
        report_id: int,
        article_id: int,
        user_id: int,
        notes: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Curator excludes an article from the report.

        - Deletes ReportArticleAssociation
        - Updates WipArticle: included_in_report=False, curator_excluded=True
        - Creates CurationEvent for audit trail

        Raises:
            HTTPException: 404 if report or article not found, or user doesn't have access
        """
        report, user, stream = self._get_report_for_curation(report_id, user_id)

        # Find the association
        association = self.db.query(ReportArticleAssociation).filter(
            and_(
                ReportArticleAssociation.report_id == report_id,
                ReportArticleAssociation.article_id == article_id
            )
        ).first()

        if not association:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Article not found in report"
            )

        # Get the article for PMID lookup
        article = self.db.query(Article).filter(Article.article_id == article_id).first()

        # Find corresponding WipArticle
        wip_article = None
        if report.pipeline_execution_id and article:
            wip_article = self.db.query(WipArticle).filter(
                and_(
                    WipArticle.pipeline_execution_id == report.pipeline_execution_id,
                    or_(
                        WipArticle.pmid == article.pmid,
                        WipArticle.doi == article.doi
                    )
                )
            ).first()

        # Import CurationEvent
        from models import CurationEvent

        # Delete the association
        self.db.delete(association)

        # Update WipArticle
        if wip_article:
            wip_article.included_in_report = False
            wip_article.curator_excluded = True
            wip_article.curation_notes = notes
            wip_article.curated_by = user_id
            wip_article.curated_at = datetime.utcnow()

        # Update report curation tracking
        report.has_curation_edits = True
        report.last_curated_by = user_id
        report.last_curated_at = datetime.utcnow()

        # Create audit event
        event = CurationEvent(
            report_id=report_id,
            article_id=article_id,
            event_type='exclude_article',
            notes=notes,
            curator_id=user_id
        )
        self.db.add(event)

        self.db.commit()

        return {
            'article_id': article_id,
            'excluded': True,
            'wip_article_updated': wip_article is not None,
        }

    def include_article(
        self,
        report_id: int,
        wip_article_id: int,
        user_id: int,
        category: Optional[str] = None,
        notes: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Curator includes a filtered article into the report.

        - Creates/finds Article record
        - Creates ReportArticleAssociation
        - Updates WipArticle: included_in_report=True, curator_included=True
        - Creates CurationEvent for audit trail

        Raises:
            HTTPException: 404 if report or WIP article not found
            HTTPException: 400 if article is already in the report
        """
        report, user, stream = self._get_report_for_curation(report_id, user_id)

        # Find the WipArticle
        wip_article = self.db.query(WipArticle).filter(
            and_(
                WipArticle.id == wip_article_id,
                WipArticle.pipeline_execution_id == report.pipeline_execution_id
            )
        ).first()

        if not wip_article:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="WIP article not found for this report"
            )

        # Check if already included
        if wip_article.included_in_report:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Article is already in the report"
            )

        # Find or create Article record
        article = None
        if wip_article.pmid:
            article = self.db.query(Article).filter(Article.pmid == wip_article.pmid).first()
        if not article and wip_article.doi:
            article = self.db.query(Article).filter(Article.doi == wip_article.doi).first()

        if not article:
            # Create new Article from WipArticle
            article = Article(
                source_id=wip_article.source_id,
                title=wip_article.title,
                url=wip_article.url,
                authors=wip_article.authors,
                publication_date=wip_article.publication_date,
                summary=wip_article.summary,
                abstract=wip_article.abstract,
                article_metadata=wip_article.article_metadata,
                pmid=wip_article.pmid,
                doi=wip_article.doi,
                journal=wip_article.journal,
                volume=wip_article.volume,
                issue=wip_article.issue,
                pages=wip_article.pages,
                year=wip_article.year,
            )
            self.db.add(article)
            self.db.flush()  # Get article_id

        # Get current max ranking
        max_ranking = self.db.query(ReportArticleAssociation.ranking).filter(
            ReportArticleAssociation.report_id == report_id
        ).order_by(ReportArticleAssociation.ranking.desc()).first()

        new_ranking = (max_ranking[0] + 1) if max_ranking and max_ranking[0] else 1

        # Create association
        categories = [category] if category else []
        association = ReportArticleAssociation(
            report_id=report_id,
            article_id=article.article_id,
            ranking=new_ranking,
            presentation_categories=categories,
            original_ranking=None,  # Curator-added, no pipeline original
            original_presentation_categories=[],
            is_starred=False,
            is_read=False
        )
        self.db.add(association)

        # Update WipArticle
        wip_article.included_in_report = True
        wip_article.curator_included = True
        wip_article.curation_notes = notes
        wip_article.curated_by = user_id
        wip_article.curated_at = datetime.utcnow()
        if category:
            wip_article.presentation_categories = categories

        # Update report curation tracking
        report.has_curation_edits = True
        report.last_curated_by = user_id
        report.last_curated_at = datetime.utcnow()

        # Import CurationEvent
        from models import CurationEvent

        # Create audit event
        event = CurationEvent(
            report_id=report_id,
            article_id=article.article_id,
            event_type='include_article',
            notes=notes,
            curator_id=user_id
        )
        self.db.add(event)

        self.db.commit()

        return {
            'article_id': article.article_id,
            'wip_article_id': wip_article_id,
            'included': True,
            'ranking': new_ranking,
            'category': category,
        }

    def update_article_in_report(
        self,
        report_id: int,
        article_id: int,
        user_id: int,
        ranking: Optional[int] = None,
        category: Optional[str] = None,
        ai_summary: Optional[str] = None,
        curation_notes: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Edit an article within the report (ranking, category, AI summary).

        Updates ReportArticleAssociation and creates CurationEvent.

        Raises:
            HTTPException: 404 if report or article not found
        """
        report, user, stream = self._get_report_for_curation(report_id, user_id)

        # Find the association
        association = self.db.query(ReportArticleAssociation).filter(
            and_(
                ReportArticleAssociation.report_id == report_id,
                ReportArticleAssociation.article_id == article_id
            )
        ).first()

        if not association:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Article not found in report"
            )

        # Import CurationEvent
        from models import CurationEvent
        import json

        changes_made = []

        if ranking is not None and ranking != association.ranking:
            old_val = association.ranking
            association.ranking = ranking
            changes_made.append(('ranking', str(old_val), str(ranking)))

        if category is not None:
            categories = [category] if category else []
            old_val = association.presentation_categories
            if categories != old_val:
                association.presentation_categories = categories
                changes_made.append(('presentation_categories', json.dumps(old_val), json.dumps(categories)))

        if ai_summary is not None and ai_summary != association.ai_summary:
            old_val = association.ai_summary
            # Preserve original if first edit
            if association.original_ai_summary is None and old_val:
                association.original_ai_summary = old_val
            association.ai_summary = ai_summary
            changes_made.append(('ai_summary', old_val[:100] if old_val else None, ai_summary[:100]))

        if curation_notes is not None:
            association.curation_notes = curation_notes

        if changes_made or curation_notes:
            association.curated_by = user_id
            association.curated_at = datetime.utcnow()

            # Update report curation tracking
            report.has_curation_edits = True
            report.last_curated_by = user_id
            report.last_curated_at = datetime.utcnow()

            # Create audit events
            for field_name, old_val, new_val in changes_made:
                event = CurationEvent(
                    report_id=report_id,
                    article_id=article_id,
                    event_type='edit_article',
                    field_name=field_name,
                    old_value=old_val,
                    new_value=new_val,
                    curator_id=user_id
                )
                self.db.add(event)

            self.db.commit()

        return {
            'article_id': article_id,
            'ranking': association.ranking,
            'presentation_categories': association.presentation_categories,
            'ai_summary': association.ai_summary,
            'curation_notes': association.curation_notes,
        }

    def approve_report(
        self,
        report_id: int,
        user_id: int,
        notes: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Approve a report for publication.

        Validates report has at least one article, then sets approval_status.

        Raises:
            HTTPException: 404 if report not found
            HTTPException: 400 if report has no articles
        """
        report, user, stream = self._get_report_for_curation(report_id, user_id)

        # Validate report has at least one article
        article_count = self.db.query(ReportArticleAssociation).filter(
            ReportArticleAssociation.report_id == report_id
        ).count()

        if article_count == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot approve report with no articles"
            )

        # Update approval status
        report.approval_status = ApprovalStatus.APPROVED
        report.approved_by = user_id
        report.approved_at = datetime.utcnow()

        # Import CurationEvent
        from models import CurationEvent

        # Create audit event
        event = CurationEvent(
            report_id=report_id,
            event_type='approve_report',
            notes=notes,
            curator_id=user_id
        )
        self.db.add(event)

        self.db.commit()

        return {
            'report_id': report_id,
            'approval_status': 'approved',
            'approved_by': user_id,
            'approved_at': report.approved_at.isoformat(),
        }

    def reject_report(
        self,
        report_id: int,
        user_id: int,
        reason: str
    ) -> Dict[str, Any]:
        """
        Reject a report with a reason.

        Raises:
            HTTPException: 404 if report not found
        """
        report, user, stream = self._get_report_for_curation(report_id, user_id)

        # Update approval status
        report.approval_status = ApprovalStatus.REJECTED
        report.rejection_reason = reason
        report.approved_by = user_id  # Track who rejected
        report.approved_at = datetime.utcnow()

        # Import CurationEvent
        from models import CurationEvent

        # Create audit event
        event = CurationEvent(
            report_id=report_id,
            event_type='reject_report',
            notes=reason,
            curator_id=user_id
        )
        self.db.add(event)

        self.db.commit()

        return {
            'report_id': report_id,
            'approval_status': 'rejected',
            'rejection_reason': reason,
            'rejected_by': user_id,
            'rejected_at': report.approved_at.isoformat(),
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
