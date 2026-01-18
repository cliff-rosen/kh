"""
Report Service for Knowledge Horizon

This service is the ONLY place that should write to the Report and
ReportArticleAssociation tables. All other services should use this
service for report-related operations.
"""

import logging
import time
from dataclasses import dataclass, field, asdict
from sqlalchemy.orm import Session
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import and_, or_, func, select
from typing import List, Optional, Dict, Any, Set, Tuple
from datetime import date, datetime
from fastapi import HTTPException, status

from fastapi import Depends
from models import (
    Report, ReportArticleAssociation, Article, WipArticle,
    ResearchStream, User, UserRole, StreamScope,
    OrgStreamSubscription, UserStreamSubscription, PipelineExecution,
    ApprovalStatus
)
from config.settings import settings
from database import get_async_db
from services.user_service import UserService
from services.email_template_service import (
    EmailTemplateService, EmailReportData, EmailCategory, EmailArticle
)

logger = logging.getLogger(__name__)


# =============================================================================
# Service Dataclasses (for computed/aggregated data with no Model equivalent)
# =============================================================================

@dataclass
class WipArticleAnalytics:
    """WipArticle data for pipeline analytics."""
    id: int
    title: str
    retrieval_group_id: str
    is_duplicate: bool
    duplicate_of_id: Optional[int]
    passed_semantic_filter: Optional[bool]
    filter_score: Optional[float]
    filter_score_reason: Optional[str]
    included_in_report: bool
    presentation_categories: List[str]
    authors: List[str]
    journal: Optional[str]
    year: Optional[int]
    pmid: Optional[str]
    doi: Optional[str]
    abstract: Optional[str]


@dataclass
class GroupAnalytics:
    """Analytics for a single retrieval group."""
    group_id: str
    total: int
    duplicates: int
    filtered_out: int
    passed_filter: int
    included: int


@dataclass
class PipelineAnalyticsSummary:
    """Summary counts for pipeline analytics."""
    total_retrieved: int
    duplicates: int
    filtered_out: int
    passed_filter: int
    included_in_report: int
    # Curation stats
    curator_added: int = 0  # Articles manually added by curator
    curator_removed: int = 0  # Articles manually removed by curator


@dataclass
class PipelineAnalytics:
    """Complete pipeline analytics for a report."""
    report_id: int
    run_type: Optional[str]
    report_date: str
    pipeline_metrics: Optional[Dict[str, Any]]
    summary: PipelineAnalyticsSummary
    by_group: List[GroupAnalytics]
    filter_reasons: Dict[str, int]
    category_counts: Dict[str, int]
    wip_articles: List[WipArticleAnalytics]


# --- Service Result Dataclasses ---

@dataclass
class ReportWithArticleCount:
    """Report model with computed article count and coverage dates."""
    report: Report  # SQLAlchemy model
    article_count: int
    coverage_start_date: Optional[str] = None  # From PipelineExecution
    coverage_end_date: Optional[str] = None  # From PipelineExecution


@dataclass
class ArticleMetadataResult:
    """Article metadata (notes and enrichments)."""
    notes: Optional[str]
    ai_enrichments: Optional[Dict[str, Any]]


@dataclass
class NotesUpdateResult:
    """Result of updating notes."""
    notes: Optional[str]


@dataclass
class EnrichmentsUpdateResult:
    """Result of updating enrichments."""
    ai_enrichments: Dict[str, Any]


@dataclass
class ReportArticleInfo:
    """Article with association metadata."""
    article: Article
    association: ReportArticleAssociation


@dataclass
class ReportWithArticlesData:
    """Report with full article details."""
    report: Report
    articles: List[ReportArticleInfo]
    article_count: int


@dataclass
class CurationStats:
    """Pipeline and curation statistics."""
    pipeline_included: int
    pipeline_filtered: int
    pipeline_duplicates: int
    current_included: int
    curator_added: int
    curator_removed: int


@dataclass
class IncludedArticleData:
    """Article data for curation view."""
    article: Article
    association: ReportArticleAssociation
    wip_article_id: Optional[int] = None  # For reset curation on curator-added articles
    filter_score: Optional[float] = None  # From WipArticle
    curation_notes: Optional[str] = None  # From WipArticle (single source of truth)
    filter_score_reason: Optional[str] = None  # From WipArticle
    curated_by: Optional[int] = None  # From WipArticle (audit trail)
    curated_at: Optional[datetime] = None  # From WipArticle (audit trail)


@dataclass
class CurationViewData:
    """Full curation view data."""
    report: Report
    stream: ResearchStream
    included_articles: List[IncludedArticleData]
    filtered_articles: List[WipArticle]
    curated_articles: List[WipArticle]
    categories: List[Dict[str, Any]]
    stats: CurationStats
    execution: Optional[PipelineExecution] = None  # For retrieval config access


@dataclass
class ReportContentUpdateResult:
    """Result of updating report content."""
    report_name: str
    executive_summary: str
    category_summaries: Dict[str, str]
    has_curation_edits: bool


@dataclass
class ExcludeArticleResult:
    """Result of excluding an article."""
    article_id: int
    excluded: bool
    wip_article_updated: bool
    was_curator_added: bool = False  # True if this undid a curator add (deleted association)


@dataclass
class IncludeArticleResult:
    """Result of including an article."""
    article_id: int
    wip_article_id: int
    included: bool
    ranking: int
    category: Optional[str]


@dataclass
class ResetCurationResult:
    """Result of resetting curation."""
    wip_article_id: int
    reset: bool
    was_curator_included: Optional[bool] = None
    was_curator_excluded: Optional[bool] = None
    pipeline_decision: Optional[bool] = None
    now_in_report: Optional[bool] = None
    message: Optional[str] = None


@dataclass
class UpdateArticleResult:
    """Result of updating article in report."""
    article_id: int
    ranking: Optional[int]
    presentation_categories: List[str]
    ai_summary: Optional[str]
    # Note: curation_notes are on WipArticle, not here


@dataclass
class ApproveReportResult:
    """Result of approving a report."""
    report_id: int
    approval_status: str
    approved_by: int
    approved_at: str


@dataclass
class RejectReportResult:
    """Result of rejecting a report."""
    report_id: int
    approval_status: str
    rejection_reason: str
    rejected_by: int
    rejected_at: str


@dataclass
class CurationEventData:
    """A single curation event for history view."""
    id: int
    event_type: str
    field_name: Optional[str]
    old_value: Optional[str]
    new_value: Optional[str]
    notes: Optional[str]
    article_id: Optional[int]
    article_title: Optional[str]
    curator_name: str
    created_at: str


@dataclass
class CurationHistoryData:
    """Curation history for a report."""
    events: List[CurationEventData]
    total_count: int


class ReportService:
    """
    Service for all Report and ReportArticleAssociation operations.

    This is the single source of truth for Report table access.
    Only this service should write to the Report and ReportArticleAssociation tables.

    Supports both sync (Session) and async (AsyncSession) database access.
    Use sync methods for backwards compatibility, async methods for new code.
    """

    def __init__(self, db: Session | AsyncSession):
        self.db = db
        self._user_service: Optional[UserService] = None
        self._stream_service = None  # Lazy-loaded to avoid circular import
        self._wip_article_service = None  # Lazy-loaded
        self._association_service = None  # Lazy-loaded

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

    @property
    def wip_article_service(self):
        """Lazy-load WipArticleService."""
        if self._wip_article_service is None:
            from services.wip_article_service import WipArticleService
            self._wip_article_service = WipArticleService(self.db)
        return self._wip_article_service

    @property
    def association_service(self):
        """Lazy-load ReportArticleAssociationService."""
        if self._association_service is None:
            from services.report_article_association_service import ReportArticleAssociationService
            self._association_service = ReportArticleAssociationService(self.db)
        return self._association_service

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

    def get_report_with_access(
        self,
        report_id: int,
        user_id: int,
        raise_on_not_found: bool = False
    ) -> Optional[tuple[Report, User, ResearchStream]]:
        """
        Get report with user access verification.

        Consolidates the common pattern of:
        1. Getting a report by ID
        2. Getting the user
        3. Getting the stream
        4. Verifying user has access to the stream

        Args:
            report_id: The report ID
            user_id: The user ID
            raise_on_not_found: If True, raises HTTPException 404 on failure.
                               If False, returns None on failure.

        Returns:
            Tuple of (report, user, stream) if found and accessible, None otherwise.

        Raises:
            HTTPException: 404 if raise_on_not_found=True and report not found or no access
        """
        # Get report
        report = self.db.query(Report).filter(Report.report_id == report_id).first()
        if not report:
            if raise_on_not_found:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Report not found"
                )
            return None

        # Get user
        user = self.user_service.get_user_by_id(user_id)
        if not user:
            if raise_on_not_found:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Report not found"
                )
            return None

        # Get stream
        stream = self.db.query(ResearchStream).filter(
            ResearchStream.stream_id == report.research_stream_id
        ).first()

        # Check access
        if not stream or not self._user_has_stream_access(user, stream):
            if raise_on_not_found:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Report not found"
                )
            return None

        return report, user, stream

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

    def get_reports_for_stream(self, research_stream_id: int, user_id: int) -> List[ReportWithArticleCount]:
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

        # Return dataclass with report model and article count
        result = []
        for report in reports:
            article_count = self.association_service.count_visible(report.report_id)
            result.append(ReportWithArticleCount(report=report, article_count=article_count))

        return result

    def get_recent_reports(self, user_id: int, limit: int = 5) -> List[ReportWithArticleCount]:
        """Get the most recent reports across all accessible streams for a user."""
        t_start = time.perf_counter()

        # TODO: get_user_by_id should raise NotFoundException if not found
        user = self.user_service.get_user_by_id(user_id)
        if not user:
            return []
        t_user = time.perf_counter()

        # Get all accessible stream IDs
        accessible_stream_ids = self._get_accessible_stream_ids(user)
        t_streams = time.perf_counter()

        if not accessible_stream_ids:
            logger.info(f"get_recent_reports - user_id={user_id}, no accessible streams, total={t_streams - t_start:.3f}s")
            return []

        # Subquery for article counts (only visible articles)
        article_count_subq = (
            self.db.query(
                ReportArticleAssociation.report_id,
                func.count(ReportArticleAssociation.article_id).label('article_count')
            )
            .filter(ReportArticleAssociation.is_hidden == False)  # noqa: E712
            .group_by(ReportArticleAssociation.report_id)
            .subquery()
        )

        # Single query: Report + PipelineExecution (LEFT JOIN) + article count (LEFT JOIN)
        query = (
            self.db.query(
                Report,
                PipelineExecution.start_date,
                PipelineExecution.end_date,
                func.coalesce(article_count_subq.c.article_count, 0).label('article_count')
            )
            .outerjoin(PipelineExecution, Report.pipeline_execution_id == PipelineExecution.id)
            .outerjoin(article_count_subq, Report.report_id == article_count_subq.c.report_id)
            .filter(Report.research_stream_id.in_(accessible_stream_ids))
        )

        # Non-admins can only see approved reports
        if user.role != UserRole.PLATFORM_ADMIN:
            query = query.filter(Report.approval_status == ApprovalStatus.APPROVED)

        rows = query.order_by(Report.created_at.desc()).limit(limit).all()
        t_query = time.perf_counter()

        # Convert to result dataclass
        result = [
            ReportWithArticleCount(
                report=row[0],
                article_count=row[3],
                coverage_start_date=row[1],
                coverage_end_date=row[2],
            )
            for row in rows
        ]
        t_end = time.perf_counter()

        logger.info(
            f"get_recent_reports - user_id={user_id}, count={len(result)}, "
            f"user={t_user - t_start:.3f}s, streams={t_streams - t_user:.3f}s, "
            f"query={t_query - t_streams:.3f}s, total={t_end - t_start:.3f}s"
        )

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
        result = self.get_report_with_access(report_id, user_id)
        if not result:
            return None
        report, user, stream = result

        # Build category ID -> name mapping from stream's presentation_config
        category_map = {}
        if stream and stream.presentation_config:
            categories = stream.presentation_config.get("categories", [])
            for cat in categories:
                if isinstance(cat, dict):
                    category_map[cat.get("id", "")] = cat.get("name", cat.get("id", "Unknown"))

        # Get visible articles (excludes curator_excluded)
        visible_associations = self.association_service.get_visible_for_report(report_id)

        articles = []
        for assoc in visible_associations:
            article = assoc.article
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

    def get_report_with_articles(self, report_id: int, user_id: int) -> Optional[ReportWithArticlesData]:
        """Get a report with its visible (non-excluded) articles for a user with stream access."""
        result = self.get_report_with_access(report_id, user_id)
        if not result:
            return None
        report, user, stream = result

        # Get visible articles (excludes curator_excluded articles)
        visible_associations = self.association_service.get_visible_for_report(report_id)

        # Build list of ReportArticleInfo dataclasses
        articles = [
            ReportArticleInfo(article=assoc.article, association=assoc)
            for assoc in visible_associations
        ]

        return ReportWithArticlesData(
            report=report,
            articles=articles,
            article_count=len(articles)
        )

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
        result = self.get_report_with_access(report_id, user_id)
        if not result:
            return []
        report, user, stream = result

        if not report.pipeline_execution_id:
            return []

        return self.wip_article_service.get_by_execution_id(
            report.pipeline_execution_id,
            included_only=included_only
        )

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
            self.wip_article_service.delete_by_execution_id(report.pipeline_execution_id)

        # Delete article associations (due to foreign key constraints)
        self.association_service.delete_all_for_report(report_id)

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

        # Note: The bidirectional link (execution.report_id = report.report_id)
        # is set by PipelineService._create_report which has access to the execution context.

        return report

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
        result = self.get_report_with_access(report_id, user_id)
        if not result:
            return None
        report, user, stream = result

        # Get WIP articles if pipeline execution exists
        wip_articles = []
        if report.pipeline_execution_id:
            wip_articles = self.wip_article_service.get_by_execution_id(report.pipeline_execution_id)

        return {
            "report": report,
            "wip_articles": wip_articles
        }

    def get_report_pmids(self, report_id: int) -> Dict[str, Article]:
        """
        Get a mapping of PMIDs to Articles for visible articles in a report.

        Args:
            report_id: Report ID

        Returns:
            Dict mapping PMID -> Article (excludes curator_excluded articles)
        """
        visible_associations = self.association_service.get_visible_for_report(report_id)

        return {
            assoc.article.pmid: assoc.article
            for assoc in visible_associations
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
        result = self.get_report_with_access(report_id, user_id)
        if not result:
            return None

        # Find the association
        return self.association_service.find(report_id, article_id)

    def update_article_notes(
        self,
        report_id: int,
        article_id: int,
        user_id: int,
        notes: Optional[str]
    ) -> Optional[NotesUpdateResult]:
        """
        Update notes for an article within a report.

        Args:
            report_id: The report ID
            article_id: The article ID
            user_id: The user ID (for ownership verification)
            notes: The notes text (or None to clear)

        Returns:
            NotesUpdateResult dataclass, or None if association not found
        """
        association = self.get_article_association(report_id, article_id, user_id)
        if not association:
            return None

        association.notes = notes
        self.db.commit()

        return NotesUpdateResult(notes=association.notes)

    def update_article_enrichments(
        self,
        report_id: int,
        article_id: int,
        user_id: int,
        ai_enrichments: Dict[str, Any]
    ) -> Optional[EnrichmentsUpdateResult]:
        """
        Update AI enrichments for an article within a report.

        Args:
            report_id: The report ID
            article_id: The article ID
            user_id: The user ID (for ownership verification)
            ai_enrichments: The enrichments dict

        Returns:
            EnrichmentsUpdateResult dataclass, or None if association not found
        """
        association = self.get_article_association(report_id, article_id, user_id)
        if not association:
            return None

        association.ai_enrichments = ai_enrichments
        self.db.commit()

        return EnrichmentsUpdateResult(ai_enrichments=association.ai_enrichments)

    def get_article_metadata(
        self,
        report_id: int,
        article_id: int,
        user_id: int
    ) -> Optional[ArticleMetadataResult]:
        """
        Get notes and AI enrichments for an article within a report.

        Args:
            report_id: The report ID
            article_id: The article ID
            user_id: The user ID (for ownership verification)

        Returns:
            ArticleMetadataResult dataclass, or None if not found
        """
        association = self.get_article_association(report_id, article_id, user_id)
        if not association:
            return None

        return ArticleMetadataResult(
            notes=association.notes,
            ai_enrichments=association.ai_enrichments
        )

    # =========================================================================
    # Pipeline Analytics
    # =========================================================================

    def get_pipeline_analytics(
        self,
        report_id: int,
        user_id: int
    ) -> Optional[PipelineAnalytics]:
        """
        Get pipeline execution analytics for a report.

        Args:
            report_id: The report ID
            user_id: The user ID (for access verification)

        Returns:
            PipelineAnalytics dataclass, or None if report not found.
            Raises ValueError if report has no pipeline execution data.
        """
        result = self.get_report_with_access(report_id, user_id)
        if not result:
            return None
        report, user, stream = result

        # Check for pipeline execution ID
        if not report.pipeline_execution_id:
            raise ValueError("This report does not have pipeline execution data (legacy report)")

        # Get the pipeline execution record (source of truth for run_type and config)
        execution = self.db.query(PipelineExecution).filter(
            PipelineExecution.id == report.pipeline_execution_id
        ).first()

        # Get all wip_articles for this execution
        wip_articles = self.wip_article_service.get_by_execution_id(report.pipeline_execution_id)

        # Calculate analytics
        total_retrieved = len(wip_articles)
        duplicates = sum(1 for a in wip_articles if a.is_duplicate)
        filtered_out = sum(1 for a in wip_articles if a.passed_semantic_filter == False)
        passed_filter = sum(1 for a in wip_articles if a.passed_semantic_filter == True)
        included_count = sum(1 for a in wip_articles if a.included_in_report)

        # Curation stats
        curator_added = sum(1 for a in wip_articles if a.curator_included)
        curator_removed = sum(1 for a in wip_articles if a.curator_excluded)

        # Group by retrieval group
        groups_dict: Dict[str, GroupAnalytics] = {}
        for article in wip_articles:
            if article.retrieval_group_id not in groups_dict:
                groups_dict[article.retrieval_group_id] = GroupAnalytics(
                    group_id=article.retrieval_group_id,
                    total=0,
                    duplicates=0,
                    filtered_out=0,
                    passed_filter=0,
                    included=0
                )
            g = groups_dict[article.retrieval_group_id]
            g.total += 1
            if article.is_duplicate:
                g.duplicates += 1
            if article.passed_semantic_filter == False:
                g.filtered_out += 1
            if article.passed_semantic_filter == True:
                g.passed_filter += 1
            if article.included_in_report:
                g.included += 1

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

        # Build wip_articles list
        wip_articles_data = [
            WipArticleAnalytics(
                id=article.id,
                title=article.title,
                retrieval_group_id=article.retrieval_group_id,
                is_duplicate=article.is_duplicate,
                duplicate_of_id=article.duplicate_of_id,
                passed_semantic_filter=article.passed_semantic_filter,
                filter_score=article.filter_score,
                filter_score_reason=article.filter_score_reason,
                included_in_report=article.included_in_report,
                presentation_categories=article.presentation_categories or [],
                authors=article.authors or [],
                journal=article.journal,
                year=article.year,
                pmid=article.pmid,
                doi=article.doi,
                abstract=article.abstract
            )
            for article in wip_articles
        ]

        return PipelineAnalytics(
            report_id=report_id,
            run_type=execution.run_type.value if execution and execution.run_type else None,
            report_date=report.report_date.isoformat(),
            pipeline_metrics=report.pipeline_metrics,
            summary=PipelineAnalyticsSummary(
                total_retrieved=total_retrieved,
                duplicates=duplicates,
                filtered_out=filtered_out,
                passed_filter=passed_filter,
                included_in_report=included_count,
                curator_added=curator_added,
                curator_removed=curator_removed
            ),
            by_group=list(groups_dict.values()),
            filter_reasons=filter_reasons,
            category_counts=category_counts,
            wip_articles=wip_articles_data
        )

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
        result = self.get_report_with_access(report_id, user_id)
        if not result:
            return None
        report, user, stream = result

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
        result = self.get_report_with_access(report_id, user_id)
        if not result:
            return False
        report, user, stream = result

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
        result = self.get_report_with_access(report_id, user_id)
        if not result:
            return None
        report, user, stream = result

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

        # Get visible articles (excludes curator_excluded)
        visible_associations = self.association_service.get_visible_for_report(report.report_id)

        # Group articles by category
        articles_by_category: Dict[str, List[EmailArticle]] = {}
        uncategorized: List[EmailArticle] = []

        for assoc in visible_associations:
            article = assoc.article
            email_article = EmailArticle(
                title=article.title,
                article_id=article.article_id,
                url=article.url,
                doi=article.doi,
                pmid=article.pmid,
                authors=article.authors if isinstance(article.authors, list) else [],
                journal=article.journal,
                publication_date=article.publication_date.strftime('%Y-%m-%d') if article.publication_date else article.year,
                summary=assoc.ai_summary or article.ai_summary or article.abstract or article.summary
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

        # Build report URL
        base_url = settings.FRONTEND_URL or 'http://localhost:5173'
        report_url = f"{base_url}/reports?stream={report.research_stream_id}&report={report.report_id}"

        # Build final data
        return EmailReportData(
            report_name=report.report_name,
            stream_name=stream.stream_name if stream else "Research Report",
            report_date=report.report_date.strftime('%B %d, %Y') if report.report_date else '',
            executive_summary=executive_summary,
            categories=email_categories,
            uncategorized_articles=uncategorized,
            report_url=report_url
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
        result = self.get_report_with_access(report_id, user_id, raise_on_not_found=True)
        # result is guaranteed non-None when raise_on_not_found=True
        return result

    def get_curation_view(self, report_id: int, user_id: int) -> CurationViewData:
        """
        Get full curation view data for a report.

        Returns:
            CurationViewData dataclass with:
            - report: Report model
            - stream: ResearchStream model
            - included_articles: Visible articles in the report (curator_excluded=False)
            - filtered_articles: WipArticle models available for inclusion
            - curated_articles: WipArticle models with curator overrides
            - categories: Stream's presentation categories
            - stats: CurationStats dataclass

        Raises:
            HTTPException: 404 if report not found or user doesn't have access
        """
        report, user, stream = self._get_report_for_curation(report_id, user_id)

        # Get categories from stream config
        categories = []
        if stream and stream.presentation_config:
            categories = stream.presentation_config.get('categories', [])

        # Get VISIBLE articles (curator_excluded=False)
        visible_associations = self.association_service.get_visible_for_report(report_id)

        # Get WIP articles for this execution and compute stats
        filtered_articles: List[WipArticle] = []
        curated_articles: List[WipArticle] = []

        # Pipeline stats (what pipeline originally decided)
        pipeline_included_count = 0  # passed_filter AND NOT duplicate
        pipeline_filtered_count = 0  # NOT passed_filter AND NOT duplicate
        pipeline_duplicate_count = 0  # is_duplicate

        # Curator stats
        curator_added_count = 0   # curator manually added
        curator_removed_count = 0  # curator manually excluded

        # Build lookup map for WipArticle IDs and objects by PMID/DOI
        wip_by_pmid: Dict[str, int] = {}
        wip_by_doi: Dict[str, int] = {}
        wip_objects_by_pmid: Dict[str, WipArticle] = {}
        wip_objects_by_doi: Dict[str, WipArticle] = {}

        # Fetch execution for retrieval config access
        execution: Optional[PipelineExecution] = None
        if report.pipeline_execution_id:
            execution = self.db.query(PipelineExecution).filter(
                PipelineExecution.id == report.pipeline_execution_id
            ).first()

        if report.pipeline_execution_id:
            wip_articles = self.wip_article_service.get_by_execution_id(report.pipeline_execution_id)

            for wip in wip_articles:
                # Build lookup maps
                if wip.pmid:
                    wip_by_pmid[wip.pmid] = wip.id
                    wip_objects_by_pmid[wip.pmid] = wip
                if wip.doi:
                    wip_by_doi[wip.doi] = wip.id
                    wip_objects_by_doi[wip.doi] = wip

            for wip in wip_articles:
                # Count pipeline decisions
                if wip.is_duplicate:
                    pipeline_duplicate_count += 1
                    continue  # Duplicates not actionable
                elif wip.passed_semantic_filter:
                    pipeline_included_count += 1
                else:
                    pipeline_filtered_count += 1

                # Count curator overrides
                if wip.curator_included:
                    curator_added_count += 1
                if wip.curator_excluded:
                    curator_removed_count += 1

                # Filtered = not currently visible in report
                if not wip.included_in_report:
                    filtered_articles.append(wip)

                # Curated = has curator override
                if wip.curator_included or wip.curator_excluded:
                    curated_articles.append(wip)

        # Build included articles with WipArticle data lookup
        # Now that associations have wip_article_id, prefer direct lookup over PMID/DOI
        def get_wip_for_association(assoc: ReportArticleAssociation) -> Optional[WipArticle]:
            """Get WipArticle for an association, using direct ID or PMID/DOI fallback."""
            # Prefer direct wip_article_id link (new schema)
            if assoc.wip_article_id:
                for wip in wip_articles:
                    if wip.id == assoc.wip_article_id:
                        return wip
            # Fallback to PMID/DOI lookup (for legacy data)
            article = assoc.article
            if article.pmid and article.pmid in wip_objects_by_pmid:
                return wip_objects_by_pmid[article.pmid]
            elif article.doi and article.doi in wip_objects_by_doi:
                return wip_objects_by_doi[article.doi]
            return None

        included_articles = []
        for assoc in visible_associations:
            wip = get_wip_for_association(assoc)
            included_articles.append(IncludedArticleData(
                article=assoc.article,
                association=assoc,
                wip_article_id=wip.id if wip else None,
                filter_score=wip.filter_score if wip else None,
                filter_score_reason=wip.filter_score_reason if wip else None,
                curation_notes=wip.curation_notes if wip else None,
                curated_by=wip.curated_by if wip else None,
                curated_at=wip.curated_at if wip else None,
            ))

        # Current count = pipeline_included - curator_removed + curator_added
        current_included_count = len(included_articles)

        stats = CurationStats(
            pipeline_included=pipeline_included_count,
            pipeline_filtered=pipeline_filtered_count,
            pipeline_duplicates=pipeline_duplicate_count,
            current_included=current_included_count,
            curator_added=curator_added_count,
            curator_removed=curator_removed_count,
        )

        return CurationViewData(
            report=report,
            stream=stream,
            included_articles=included_articles,
            filtered_articles=filtered_articles,
            curated_articles=curated_articles,
            categories=categories,
            stats=stats,
            execution=execution,
        )

    def update_report_content(
        self,
        report_id: int,
        user_id: int,
        report_name: Optional[str] = None,
        executive_summary: Optional[str] = None,
        category_summaries: Optional[Dict[str, str]] = None
    ) -> ReportContentUpdateResult:
        """
        Update report content (name, summaries) for curation.

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

        # Update report_name if provided
        if report_name is not None and report_name != report.report_name:
            old_value = report.report_name
            report.report_name = report_name
            changes_made.append(('report_name', old_value, report_name))

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

        return ReportContentUpdateResult(
            report_name=report.report_name,
            executive_summary=enrichments.get('executive_summary', ''),
            category_summaries=enrichments.get('category_summaries', {}),
            has_curation_edits=report.has_curation_edits,
        )

    def exclude_article(
        self,
        report_id: int,
        article_id: int,
        user_id: int,
        notes: Optional[str] = None
    ) -> ExcludeArticleResult:
        """
        Curator excludes an article from the report.

        For pipeline-included articles: Sets curator_excluded=True (preserves data for undo).
        For curator-added articles: Deletes the association entirely (undoes the add).

        Updates WipArticle flags for consistency.

        Raises:
            HTTPException: 404 if report or article not found, or user doesn't have access
        """
        report, user, stream = self._get_report_for_curation(report_id, user_id)

        # Get the association
        association = self.association_service.get(report_id, article_id)

        # Already hidden?
        if association.is_hidden:
            return ExcludeArticleResult(
                article_id=article_id,
                excluded=True,
                wip_article_updated=False,
            )

        # Get the Article for WipArticle lookup
        article = self.db.query(Article).filter(Article.article_id == article_id).first()
        wip_article = None
        if report.pipeline_execution_id and article:
            wip_article = self.wip_article_service.get_by_execution_and_identifiers(
                report.pipeline_execution_id,
                pmid=article.pmid,
                doi=article.doi
            )

        # Handle based on whether this was curator-added or pipeline-included
        was_curator_added = association.curator_added or False

        if was_curator_added:
            # Curator-added article: delete association entirely (undo the add)
            self.association_service.delete(association)

            # Clear WipArticle curator_included flag
            if wip_article:
                self.wip_article_service.clear_curator_included(wip_article)

            event_type = 'undo_include_article'
        else:
            # Pipeline-included article: soft hide (preserve for undo)
            self.association_service.set_hidden(association, True)

            # Set WipArticle curator_excluded flag (audit trail)
            if wip_article:
                self.wip_article_service.set_curator_excluded(wip_article, user_id, notes)

            event_type = 'exclude_article'

        # Update report curation tracking
        report.has_curation_edits = True
        report.last_curated_by = user_id
        report.last_curated_at = datetime.utcnow()

        # Create audit event
        from models import CurationEvent
        event = CurationEvent(
            report_id=report_id,
            article_id=article_id,
            event_type=event_type,
            notes=notes,
            curator_id=user_id
        )
        self.db.add(event)

        self.db.commit()

        return ExcludeArticleResult(
            article_id=article_id,
            excluded=True,
            wip_article_updated=wip_article is not None,
            was_curator_added=was_curator_added,
        )

    def include_article(
        self,
        report_id: int,
        wip_article_id: int,
        user_id: int,
        category: Optional[str] = None,
        notes: Optional[str] = None
    ) -> IncludeArticleResult:
        """
        Curator includes a filtered article into the report.

        Creates Article record if needed, creates association with curator_added=True.
        Updates WipArticle flags for consistency.

        Raises:
            HTTPException: 404 if report or WIP article not found
            HTTPException: 400 if article is already in the report
        """
        report, user, stream = self._get_report_for_curation(report_id, user_id)

        # Get the WipArticle
        wip_article = self.wip_article_service.get_by_id_or_404(wip_article_id)

        # Verify it belongs to this report's pipeline execution
        if wip_article.pipeline_execution_id != report.pipeline_execution_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="WIP article not found for this report"
            )

        # Check if already included (visible in report)
        if wip_article.included_in_report:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Article is already in the report"
            )

        # Find or create Article record
        article = self._find_or_create_article_from_wip(wip_article)

        # Check if association already exists (e.g., was hidden)
        existing_association = self.association_service.find(report_id, article.article_id)
        if existing_association:
            # Re-include a previously hidden article
            self.association_service.set_hidden(existing_association, False)
            new_ranking = existing_association.ranking
        else:
            # Create new association (curator-added)
            new_ranking = self.association_service.get_next_ranking(report_id)
            categories = [category] if category else []
            self.association_service.create(
                report_id=report_id,
                article_id=article.article_id,
                wip_article_id=wip_article.id,  # Link back to pipeline data
                ranking=new_ranking,
                presentation_categories=categories,
                curator_added=True
            )

        # Update WipArticle
        self.wip_article_service.set_curator_included(wip_article, user_id, notes)

        # Update report curation tracking
        report.has_curation_edits = True
        report.last_curated_by = user_id
        report.last_curated_at = datetime.utcnow()

        # Create audit event
        from models import CurationEvent
        event = CurationEvent(
            report_id=report_id,
            article_id=article.article_id,
            event_type='include_article',
            notes=notes,
            curator_id=user_id
        )
        self.db.add(event)

        self.db.commit()

        return IncludeArticleResult(
            article_id=article.article_id,
            wip_article_id=wip_article_id,
            included=True,
            ranking=new_ranking,
            category=category,
        )

    def _find_or_create_article_from_wip(self, wip_article: WipArticle) -> Article:
        """
        Find existing Article by PMID/DOI or create new one from WipArticle.

        Args:
            wip_article: Source WipArticle

        Returns:
            Article instance (existing or newly created)
        """
        article = None
        if wip_article.pmid:
            article = self.db.query(Article).filter(Article.pmid == wip_article.pmid).first()
        if not article and wip_article.doi:
            article = self.db.query(Article).filter(Article.doi == wip_article.doi).first()

        if not article:
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
            self.db.flush()

        return article

    def reset_curation(
        self,
        report_id: int,
        wip_article_id: int,
        user_id: int
    ) -> ResetCurationResult:
        """
        Reset curation for an article, restoring it to the pipeline's original decision.

        This is the "undo" operation for curator include/exclude actions:
        - If curator_added: delete the association entirely
        - If curator_excluded: clear the flag to restore visibility
        - Clear WipArticle curation flags

        Raises:
            HTTPException: 404 if report or WIP article not found
        """
        report, user, stream = self._get_report_for_curation(report_id, user_id)

        # Get the WipArticle
        wip_article = self.wip_article_service.get_by_id_or_404(wip_article_id)

        # Verify it belongs to this report's pipeline execution
        if wip_article.pipeline_execution_id != report.pipeline_execution_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="WIP article not found for this report"
            )

        # Track what we're undoing
        was_curator_included = wip_article.curator_included
        was_curator_excluded = wip_article.curator_excluded

        if not was_curator_included and not was_curator_excluded:
            return ResetCurationResult(
                wip_article_id=wip_article_id,
                reset=False,
                message='Article has no curation overrides to reset'
            )

        # Find the Article record
        article = None
        if wip_article.pmid:
            article = self.db.query(Article).filter(Article.pmid == wip_article.pmid).first()
        if not article and wip_article.doi:
            article = self.db.query(Article).filter(Article.doi == wip_article.doi).first()

        # Handle the ReportArticleAssociation
        article_id = None
        if article:
            article_id = article.article_id
            association = self.association_service.find(report_id, article.article_id)

            if association:
                if association.curator_added:
                    # Curator added this - delete entirely
                    self.association_service.delete(association)
                elif association.is_hidden:
                    # Curator hid this - restore visibility
                    self.association_service.set_hidden(association, False)

        # Clear WipArticle curation flags, restore pipeline decision
        pipeline_would_include = self.wip_article_service.clear_curation_flags(wip_article, user_id)

        # Update report curation tracking
        report.last_curated_by = user_id
        report.last_curated_at = datetime.utcnow()

        # Create audit event
        from models import CurationEvent
        event = CurationEvent(
            report_id=report_id,
            article_id=article_id,
            event_type='reset_curation',
            notes=f"Reset from {'curator_included' if was_curator_included else 'curator_excluded'} to pipeline decision",
            curator_id=user_id
        )
        self.db.add(event)

        self.db.commit()

        return ResetCurationResult(
            wip_article_id=wip_article_id,
            reset=True,
            was_curator_included=was_curator_included,
            was_curator_excluded=was_curator_excluded,
            pipeline_decision=pipeline_would_include,
            now_in_report=pipeline_would_include,
        )

    def update_article_in_report(
        self,
        report_id: int,
        article_id: int,
        user_id: int,
        ranking: Optional[int] = None,
        category: Optional[str] = None,
        ai_summary: Optional[str] = None
    ) -> UpdateArticleResult:
        """
        Edit an article within the report (ranking, category, AI summary).

        Updates ReportArticleAssociation and creates CurationEvent.
        Note: curation_notes are stored on WipArticle, use WipArticleService.update_curation_notes()

        Raises:
            HTTPException: 404 if report or article not found
        """
        report, user, stream = self._get_report_for_curation(report_id, user_id)

        # Get the association
        association = self.association_service.get(report_id, article_id)

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

        if changes_made:
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

        return UpdateArticleResult(
            article_id=article_id,
            ranking=association.ranking,
            presentation_categories=association.presentation_categories or [],
            ai_summary=association.ai_summary,
        )

    def approve_report(
        self,
        report_id: int,
        user_id: int,
        notes: Optional[str] = None
    ) -> ApproveReportResult:
        """
        Approve a report for publication.

        Validates report has at least one article, then sets approval_status.

        Raises:
            HTTPException: 404 if report not found
            HTTPException: 400 if report has no articles
        """
        report, user, stream = self._get_report_for_curation(report_id, user_id)

        # Validate report has at least one visible article
        article_count = self.association_service.count_visible(report_id)

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

        return ApproveReportResult(
            report_id=report_id,
            approval_status='approved',
            approved_by=user_id,
            approved_at=report.approved_at.isoformat(),
        )

    def reject_report(
        self,
        report_id: int,
        user_id: int,
        reason: str
    ) -> RejectReportResult:
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

        return RejectReportResult(
            report_id=report_id,
            approval_status='rejected',
            rejection_reason=reason,
            rejected_by=user_id,
            rejected_at=report.approved_at.isoformat(),
        )

    def get_curation_history(
        self,
        report_id: int,
        user_id: int
    ) -> CurationHistoryData:
        """
        Get curation history (audit trail) for a report.

        Returns all curation events in reverse chronological order.

        Raises:
            HTTPException: 404 if report not found or user doesn't have access
        """
        # Verify access
        report, user, stream = self._get_report_for_curation(report_id, user_id)

        from models import CurationEvent

        # Get all curation events for this report
        events = self.db.query(CurationEvent).filter(
            CurationEvent.report_id == report_id
        ).order_by(CurationEvent.created_at.desc()).all()

        # Build event data list
        event_data_list = []
        for event in events:
            # Get article title if this is an article-level event
            article_title = None
            if event.article_id:
                article = self.db.query(Article).filter(
                    Article.article_id == event.article_id
                ).first()
                if article:
                    article_title = article.title

            # Get curator name
            curator_name = "Unknown"
            if event.curator:
                curator_name = event.curator.full_name or event.curator.email

            event_data_list.append(CurationEventData(
                id=event.id,
                event_type=event.event_type,
                field_name=event.field_name,
                old_value=event.old_value,
                new_value=event.new_value,
                notes=event.notes,
                article_id=event.article_id,
                article_title=article_title,
                curator_name=curator_name,
                created_at=event.created_at.isoformat() if event.created_at else "",
            ))

        return CurationHistoryData(
            events=event_data_list,
            total_count=len(event_data_list),
        )

    # =========================================================================
    # COMMIT Operations
    # =========================================================================

    def commit(self) -> None:
        """Commit pending changes to the database."""
        self.db.commit()

    def flush(self) -> None:
        """Flush pending changes without committing."""
        self.db.flush()

    # =========================================================================
    # ASYNC Methods (for use with AsyncSession)
    # =========================================================================

    async def async_get_accessible_stream_ids(self, user: User) -> Set[int]:
        """Get all stream IDs the user can access reports for (async)."""
        accessible_ids = set()

        # Personal streams created by user
        result = await self.db.execute(
            select(ResearchStream.stream_id).where(
                and_(
                    ResearchStream.scope == StreamScope.PERSONAL,
                    ResearchStream.user_id == user.user_id
                )
            )
        )
        accessible_ids.update(r[0] for r in result.all())

        # Organization streams user is subscribed to
        if user.org_id:
            result = await self.db.execute(
                select(ResearchStream.stream_id).where(
                    and_(
                        ResearchStream.scope == StreamScope.ORGANIZATION,
                        ResearchStream.org_id == user.org_id
                    )
                )
            )
            accessible_ids.update(r[0] for r in result.all())

        # Global streams
        result = await self.db.execute(
            select(ResearchStream.stream_id).where(
                ResearchStream.scope == StreamScope.GLOBAL
            )
        )
        accessible_ids.update(r[0] for r in result.all())

        # User subscriptions
        result = await self.db.execute(
            select(UserStreamSubscription.stream_id).where(
                UserStreamSubscription.user_id == user.user_id
            )
        )
        accessible_ids.update(r[0] for r in result.all())

        # Org subscriptions
        if user.org_id:
            result = await self.db.execute(
                select(OrgStreamSubscription.stream_id).where(
                    OrgStreamSubscription.org_id == user.org_id
                )
            )
            accessible_ids.update(r[0] for r in result.all())

        return accessible_ids

    async def async_get_recent_reports(
        self,
        user: User,
        limit: int = 20,
        offset: int = 0,
        stream_id: Optional[int] = None
    ) -> List[ReportWithArticleCount]:
        """Get recent reports the user has access to (async)."""
        accessible_stream_ids = await self.async_get_accessible_stream_ids(user)

        if not accessible_stream_ids:
            return []

        # Build query
        filters = [Report.research_stream_id.in_(accessible_stream_ids)]
        if stream_id:
            filters.append(Report.research_stream_id == stream_id)

        stmt = (
            select(Report, ResearchStream)
            .join(ResearchStream, Report.research_stream_id == ResearchStream.stream_id)
            .where(and_(*filters))
            .order_by(Report.report_date.desc())
            .offset(offset)
            .limit(limit)
        )

        result = await self.db.execute(stmt)
        rows = result.all()

        reports = []
        for report, stream in rows:
            # Count articles
            count_result = await self.db.execute(
                select(func.count(ReportArticleAssociation.article_id)).where(
                    ReportArticleAssociation.report_id == report.report_id
                )
            )
            article_count = count_result.scalar() or 0

            reports.append(ReportWithArticleCount(
                report=report,
                article_count=article_count
            ))

        return reports

    async def async_get_report_with_access(
        self,
        report_id: int,
        user: User
    ) -> Optional[Tuple[Report, ResearchStream]]:
        """Get report if user has access, with stream info (async)."""
        accessible_stream_ids = await self.async_get_accessible_stream_ids(user)

        stmt = (
            select(Report, ResearchStream)
            .join(ResearchStream, Report.research_stream_id == ResearchStream.stream_id)
            .where(
                Report.report_id == report_id,
                Report.research_stream_id.in_(accessible_stream_ids)
            )
        )
        result = await self.db.execute(stmt)
        row = result.first()

        if not row:
            return None
        return (row[0], row[1])

    async def async_get_reports_for_stream(
        self,
        user: User,
        research_stream_id: int
    ) -> List[ReportWithArticleCount]:
        """Get all reports for a specific stream (async)."""
        accessible_stream_ids = await self.async_get_accessible_stream_ids(user)

        if research_stream_id not in accessible_stream_ids:
            return []

        stmt = (
            select(Report, ResearchStream)
            .join(ResearchStream, Report.research_stream_id == ResearchStream.stream_id)
            .where(Report.research_stream_id == research_stream_id)
            .order_by(Report.report_date.desc())
        )

        result = await self.db.execute(stmt)
        rows = result.all()

        reports = []
        for report, stream in rows:
            count_result = await self.db.execute(
                select(func.count(ReportArticleAssociation.article_id)).where(
                    ReportArticleAssociation.report_id == report.report_id
                )
            )
            article_count = count_result.scalar() or 0

            reports.append(ReportWithArticleCount(
                report=report,
                article_count=article_count
            ))

        return reports

    async def async_get_report_with_articles(
        self,
        user: User,
        report_id: int
    ) -> Optional[ReportWithArticlesData]:
        """Get report with its articles (async)."""
        access_result = await self.async_get_report_with_access(report_id, user)
        if not access_result:
            return None
        report, stream = access_result

        # Get articles with associations
        stmt = (
            select(ReportArticleAssociation, Article)
            .join(Article, ReportArticleAssociation.article_id == Article.article_id)
            .where(ReportArticleAssociation.report_id == report_id)
            .order_by(ReportArticleAssociation.ranking)
        )
        result = await self.db.execute(stmt)
        rows = result.all()

        articles = [
            ReportArticleInfo(article=article, association=assoc)
            for assoc, article in rows
        ]

        return ReportWithArticlesData(
            report=report,
            articles=articles,
            article_count=len(articles)
        )

    async def async_delete_report(self, user: User, report_id: int) -> bool:
        """Delete a report if user has access (async)."""
        access_result = await self.async_get_report_with_access(report_id, user)
        if not access_result:
            return False
        report, _ = access_result

        # Delete associations first
        await self.db.execute(
            ReportArticleAssociation.__table__.delete().where(
                ReportArticleAssociation.report_id == report_id
            )
        )

        # Delete WIP articles if any
        if report.pipeline_execution_id:
            await self.db.execute(
                WipArticle.__table__.delete().where(
                    WipArticle.pipeline_execution_id == report.pipeline_execution_id
                )
            )

        # Delete report
        await self.db.execute(
            Report.__table__.delete().where(Report.report_id == report_id)
        )

        await self.db.commit()
        return True

    async def async_get_article_association(
        self,
        user: User,
        report_id: int,
        article_id: int
    ) -> Optional[ReportArticleAssociation]:
        """Get article association if user has access (async)."""
        access_result = await self.async_get_report_with_access(report_id, user)
        if not access_result:
            return None

        stmt = select(ReportArticleAssociation).where(
            ReportArticleAssociation.report_id == report_id,
            ReportArticleAssociation.article_id == article_id
        )
        result = await self.db.execute(stmt)
        return result.scalars().first()

    async def async_update_article_notes(
        self,
        user: User,
        report_id: int,
        article_id: int,
        notes: Optional[str]
    ) -> Optional[NotesUpdateResult]:
        """Update notes on an article association (async)."""
        assoc = await self.async_get_article_association(user, report_id, article_id)
        if not assoc:
            return None

        assoc.notes = notes
        await self.db.commit()

        return NotesUpdateResult(
            report_id=report_id,
            article_id=article_id,
            notes=notes
        )

    async def async_update_article_enrichments(
        self,
        user: User,
        report_id: int,
        article_id: int,
        ai_enrichments: Dict[str, Any]
    ) -> Optional[EnrichmentsUpdateResult]:
        """Update AI enrichments on an article association (async)."""
        assoc = await self.async_get_article_association(user, report_id, article_id)
        if not assoc:
            return None

        assoc.ai_enrichments = ai_enrichments
        await self.db.commit()

        return EnrichmentsUpdateResult(
            report_id=report_id,
            article_id=article_id,
            ai_enrichments=ai_enrichments
        )

    async def async_get_article_metadata(
        self,
        user: User,
        report_id: int,
        article_id: int
    ) -> Optional[ArticleMetadataResult]:
        """Get full article metadata (async)."""
        assoc = await self.async_get_article_association(user, report_id, article_id)
        if not assoc:
            return None

        stmt = select(Article).where(Article.article_id == article_id)
        result = await self.db.execute(stmt)
        article = result.scalars().first()

        if not article:
            return None

        return ArticleMetadataResult(
            article=article,
            association=assoc
        )

    async def async_get_report_email_html(
        self,
        user: User,
        report_id: int
    ) -> Optional[str]:
        """Get stored email HTML for a report (async)."""
        access_result = await self.async_get_report_with_access(report_id, user)
        if not access_result:
            return None
        report, _ = access_result

        if not report.enrichments:
            return None
        return report.enrichments.get('email_html')

    async def async_store_report_email_html(
        self,
        user: User,
        report_id: int,
        html: str
    ) -> bool:
        """Store email HTML for a report (async)."""
        access_result = await self.async_get_report_with_access(report_id, user)
        if not access_result:
            return False
        report, _ = access_result

        enrichments = report.enrichments or {}
        enrichments['email_html'] = html
        report.enrichments = enrichments
        await self.db.commit()

        return True

    async def async_generate_report_email_html(
        self,
        user: User,
        report_id: int
    ) -> Optional[str]:
        """Generate HTML email content for a report (async)."""
        access_result = await self.async_get_report_with_access(report_id, user)
        if not access_result:
            return None
        report, stream = access_result

        # Get visible articles for the email
        stmt = (
            select(ReportArticleAssociation, Article)
            .join(Article, ReportArticleAssociation.article_id == Article.article_id)
            .where(
                ReportArticleAssociation.report_id == report_id,
                ReportArticleAssociation.is_hidden == False
            )
            .order_by(ReportArticleAssociation.ranking)
        )
        result = await self.db.execute(stmt)
        rows = result.all()

        # Build email data
        categories_dict: Dict[str, List[EmailArticle]] = {}
        for assoc, article in rows:
            cats = assoc.presentation_categories or ['Uncategorized']
            for cat in cats:
                if cat not in categories_dict:
                    categories_dict[cat] = []
                categories_dict[cat].append(EmailArticle(
                    title=article.title or 'Untitled',
                    authors=', '.join(article.authors[:3]) + ('...' if len(article.authors or []) > 3 else '') if article.authors else '',
                    journal=article.journal or '',
                    year=str(article.year) if article.year else '',
                    summary=assoc.ai_summary or article.abstract[:300] + '...' if article.abstract and len(article.abstract) > 300 else (article.abstract or ''),
                    url=article.url or f"https://pubmed.ncbi.nlm.nih.gov/{article.pmid}/" if article.pmid else '',
                    relevance_rationale=assoc.relevance_rationale or ''
                ))

        email_categories = [
            EmailCategory(name=name, articles=articles)
            for name, articles in categories_dict.items()
        ]

        executive_summary = ''
        if report.enrichments:
            executive_summary = report.enrichments.get('executive_summary', '')

        email_data = EmailReportData(
            report_name=report.report_name,
            stream_name=stream.stream_name,
            report_date=report.report_date.strftime('%B %d, %Y') if report.report_date else '',
            executive_summary=executive_summary,
            categories=email_categories,
            total_articles=len(rows)
        )

        # Generate HTML
        template_service = EmailTemplateService()
        return template_service.generate_report_email(email_data)

    async def async_approve_report(
        self,
        report_id: int,
        user_id: int,
        notes: Optional[str] = None
    ) -> ApproveReportResult:
        """Approve a report for publication (async)."""
        from models import CurationEvent

        # Get report
        result = await self.db.execute(
            select(Report).where(Report.report_id == report_id)
        )
        report = result.scalars().first()

        if not report:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Report not found"
            )

        # Count visible articles
        count_result = await self.db.execute(
            select(func.count(ReportArticleAssociation.article_id)).where(
                ReportArticleAssociation.report_id == report_id,
                ReportArticleAssociation.is_hidden == False
            )
        )
        article_count = count_result.scalar() or 0

        if article_count == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot approve report with no articles"
            )

        # Update approval status
        report.approval_status = ApprovalStatus.APPROVED
        report.approved_by = user_id
        report.approved_at = datetime.utcnow()

        # Create audit event
        event = CurationEvent(
            report_id=report_id,
            event_type='approve_report',
            notes=notes,
            curator_id=user_id
        )
        self.db.add(event)

        await self.db.commit()

        return ApproveReportResult(
            report_id=report_id,
            approval_status='approved',
            approved_by=user_id,
            approved_at=report.approved_at.isoformat(),
        )

    async def async_reject_report(
        self,
        report_id: int,
        user_id: int,
        reason: str
    ) -> RejectReportResult:
        """Reject a report with a reason (async)."""
        from models import CurationEvent

        # Get report
        result = await self.db.execute(
            select(Report).where(Report.report_id == report_id)
        )
        report = result.scalars().first()

        if not report:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Report not found"
            )

        # Update approval status
        report.approval_status = ApprovalStatus.REJECTED
        report.rejection_reason = reason
        report.approved_by = user_id
        report.approved_at = datetime.utcnow()

        # Create audit event
        event = CurationEvent(
            report_id=report_id,
            event_type='reject_report',
            notes=reason,
            curator_id=user_id
        )
        self.db.add(event)

        await self.db.commit()

        return RejectReportResult(
            report_id=report_id,
            approval_status='rejected',
            rejection_reason=reason,
            rejected_by=user_id,
            rejected_at=report.approved_at.isoformat(),
        )

    async def async_get_curation_history(
        self,
        report_id: int,
        user_id: int
    ) -> CurationHistoryData:
        """Get curation history for a report (async)."""
        from models import CurationEvent

        # Verify report exists
        result = await self.db.execute(
            select(Report).where(Report.report_id == report_id)
        )
        report = result.scalars().first()

        if not report:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Report not found"
            )

        # Get curation events
        events_result = await self.db.execute(
            select(CurationEvent, User)
            .outerjoin(User, CurationEvent.curator_id == User.user_id)
            .where(CurationEvent.report_id == report_id)
            .order_by(CurationEvent.created_at.desc())
        )
        rows = events_result.all()

        events = []
        for event, curator in rows:
            # Get article title if applicable
            article_title = None
            if event.article_id:
                article_result = await self.db.execute(
                    select(Article.title).where(Article.article_id == event.article_id)
                )
                article_title = article_result.scalar()

            events.append(CurationEventData(
                id=event.id,
                event_type=event.event_type,
                field_name=event.field_name,
                old_value=event.old_value,
                new_value=event.new_value,
                notes=event.notes,
                article_id=event.article_id,
                article_title=article_title,
                curator_name=curator.full_name or curator.email if curator else "Unknown",
                created_at=event.created_at.isoformat(),
            ))

        return CurationHistoryData(
            events=events,
            total_count=len(events),
        )

    async def _async_get_report_for_curation(
        self,
        report_id: int,
        user_id: int
    ) -> tuple[Report, User, ResearchStream]:
        """
        Get report with access verification for curation operations (async).

        Returns:
            Tuple of (report, user, stream)

        Raises:
            HTTPException: 404 if report not found or user doesn't have access
        """
        result = await self.async_get_report_with_access(report_id, user_id)
        if not result:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Report not found or access denied"
            )
        return result

    async def async_get_curation_view(self, report_id: int, user_id: int) -> CurationViewData:
        """
        Get full curation view data for a report (async).
        """
        report, user, stream = await self._async_get_report_for_curation(report_id, user_id)

        # Get categories from stream config
        categories = []
        if stream and stream.presentation_config:
            categories = stream.presentation_config.get('categories', [])

        # Get VISIBLE articles (curator_excluded=False)
        visible_associations = await self.association_service.async_get_visible_for_report(report_id)

        # Get WIP articles for this execution and compute stats
        filtered_articles: List[WipArticle] = []
        curated_articles: List[WipArticle] = []

        # Pipeline stats (what pipeline originally decided)
        pipeline_included_count = 0
        pipeline_filtered_count = 0
        pipeline_duplicate_count = 0

        # Curator stats
        curator_added_count = 0
        curator_removed_count = 0

        # Build lookup map for WipArticle IDs and objects by PMID/DOI
        wip_by_pmid: Dict[str, int] = {}
        wip_by_doi: Dict[str, int] = {}
        wip_objects_by_pmid: Dict[str, WipArticle] = {}
        wip_objects_by_doi: Dict[str, WipArticle] = {}

        # Fetch execution for retrieval config access
        execution: Optional[PipelineExecution] = None
        wip_articles: List[WipArticle] = []

        if report.pipeline_execution_id:
            exec_result = await self.db.execute(
                select(PipelineExecution).where(
                    PipelineExecution.id == report.pipeline_execution_id
                )
            )
            execution = exec_result.scalars().first()

            wip_articles = await self.wip_article_service.async_get_by_execution_id(
                report.pipeline_execution_id
            )

            for wip in wip_articles:
                # Build lookup maps
                if wip.pmid:
                    wip_by_pmid[wip.pmid] = wip.id
                    wip_objects_by_pmid[wip.pmid] = wip
                if wip.doi:
                    wip_by_doi[wip.doi] = wip.id
                    wip_objects_by_doi[wip.doi] = wip

            for wip in wip_articles:
                # Count pipeline decisions
                if wip.is_duplicate:
                    pipeline_duplicate_count += 1
                    continue
                elif wip.passed_semantic_filter:
                    pipeline_included_count += 1
                else:
                    pipeline_filtered_count += 1

                # Count curator overrides
                if wip.curator_included:
                    curator_added_count += 1
                if wip.curator_excluded:
                    curator_removed_count += 1

                # Filtered = not currently visible in report
                if not wip.included_in_report:
                    filtered_articles.append(wip)

                # Curated = has curator override
                if wip.curator_included or wip.curator_excluded:
                    curated_articles.append(wip)

        # Build included articles with WipArticle data lookup
        def get_wip_for_association(assoc: ReportArticleAssociation) -> Optional[WipArticle]:
            """Get WipArticle for an association, using direct ID or PMID/DOI fallback."""
            if assoc.wip_article_id:
                for wip in wip_articles:
                    if wip.id == assoc.wip_article_id:
                        return wip
            article = assoc.article
            if article.pmid and article.pmid in wip_objects_by_pmid:
                return wip_objects_by_pmid[article.pmid]
            elif article.doi and article.doi in wip_objects_by_doi:
                return wip_objects_by_doi[article.doi]
            return None

        included_articles = []
        for assoc in visible_associations:
            wip = get_wip_for_association(assoc)
            included_articles.append(IncludedArticleData(
                article=assoc.article,
                association=assoc,
                wip_article_id=wip.id if wip else None,
                filter_score=wip.filter_score if wip else None,
                filter_score_reason=wip.filter_score_reason if wip else None,
                curation_notes=wip.curation_notes if wip else None,
                curated_by=wip.curated_by if wip else None,
                curated_at=wip.curated_at if wip else None,
            ))

        current_included_count = len(included_articles)

        stats = CurationStats(
            pipeline_included=pipeline_included_count,
            pipeline_filtered=pipeline_filtered_count,
            pipeline_duplicates=pipeline_duplicate_count,
            current_included=current_included_count,
            curator_added=curator_added_count,
            curator_removed=curator_removed_count,
        )

        return CurationViewData(
            report=report,
            stream=stream,
            included_articles=included_articles,
            filtered_articles=filtered_articles,
            curated_articles=curated_articles,
            categories=categories,
            stats=stats,
            execution=execution,
        )

    async def async_update_report_content(
        self,
        report_id: int,
        user_id: int,
        report_name: Optional[str] = None,
        executive_summary: Optional[str] = None,
        category_summaries: Optional[Dict[str, str]] = None
    ) -> ReportContentUpdateResult:
        """Update report content (name, summaries) for curation (async)."""
        report, user, stream = await self._async_get_report_for_curation(report_id, user_id)

        from models import CurationEvent
        import json

        changes_made = []

        if report_name is not None and report_name != report.report_name:
            old_value = report.report_name
            report.report_name = report_name
            changes_made.append(('report_name', old_value, report_name))

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

            await self.db.commit()

        return ReportContentUpdateResult(
            report_name=report.report_name,
            executive_summary=enrichments.get('executive_summary', ''),
            category_summaries=enrichments.get('category_summaries', {}),
            has_curation_edits=report.has_curation_edits,
        )

    async def async_exclude_article(
        self,
        report_id: int,
        article_id: int,
        user_id: int,
        notes: Optional[str] = None
    ) -> ExcludeArticleResult:
        """Curator excludes an article from the report (async)."""
        report, user, stream = await self._async_get_report_for_curation(report_id, user_id)

        # Get the association
        association = await self.association_service.async_get(report_id, article_id)

        # Already hidden?
        if association.is_hidden:
            return ExcludeArticleResult(
                article_id=article_id,
                excluded=True,
                wip_article_updated=False,
            )

        # Get the Article for WipArticle lookup
        article_result = await self.db.execute(
            select(Article).where(Article.article_id == article_id)
        )
        article = article_result.scalars().first()

        wip_article = None
        if report.pipeline_execution_id and article:
            wip_article = await self.wip_article_service.async_get_by_execution_and_identifiers(
                report.pipeline_execution_id,
                pmid=article.pmid,
                doi=article.doi
            )

        was_curator_added = association.curator_added or False

        if was_curator_added:
            # Curator-added article: delete association entirely
            await self.association_service.async_delete(association)
            if wip_article:
                self.wip_article_service.clear_curator_included(wip_article)
            event_type = 'undo_include_article'
        else:
            # Pipeline-included article: soft hide
            self.association_service.set_hidden(association, True)
            if wip_article:
                self.wip_article_service.set_curator_excluded(wip_article, user_id, notes)
            event_type = 'exclude_article'

        report.has_curation_edits = True
        report.last_curated_by = user_id
        report.last_curated_at = datetime.utcnow()

        from models import CurationEvent
        event = CurationEvent(
            report_id=report_id,
            article_id=article_id,
            event_type=event_type,
            notes=notes,
            curator_id=user_id
        )
        self.db.add(event)

        await self.db.commit()

        return ExcludeArticleResult(
            article_id=article_id,
            excluded=True,
            wip_article_updated=wip_article is not None,
            was_curator_added=was_curator_added,
        )

    async def async_include_article(
        self,
        report_id: int,
        wip_article_id: int,
        user_id: int,
        category: Optional[str] = None,
        notes: Optional[str] = None
    ) -> IncludeArticleResult:
        """Curator includes a filtered article into the report (async)."""
        report, user, stream = await self._async_get_report_for_curation(report_id, user_id)

        # Get the WipArticle
        wip_article = await self.wip_article_service.async_get_by_id_or_404(wip_article_id)

        if wip_article.pipeline_execution_id != report.pipeline_execution_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="WIP article not found for this report"
            )

        if wip_article.included_in_report:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Article is already in the report"
            )

        # Find or create Article record
        article = await self._async_find_or_create_article_from_wip(wip_article)

        # Check if association already exists
        existing_association = await self.association_service.async_find(report_id, article.article_id)
        if existing_association:
            self.association_service.set_hidden(existing_association, False)
            new_ranking = existing_association.ranking
        else:
            new_ranking = await self.association_service.async_get_next_ranking(report_id)
            categories = [category] if category else []
            await self.association_service.async_create(
                report_id=report_id,
                article_id=article.article_id,
                wip_article_id=wip_article.id,
                ranking=new_ranking,
                presentation_categories=categories,
                curator_added=True
            )

        # Update WipArticle
        self.wip_article_service.set_curator_included(wip_article, user_id, notes)

        report.has_curation_edits = True
        report.last_curated_by = user_id
        report.last_curated_at = datetime.utcnow()

        from models import CurationEvent
        event = CurationEvent(
            report_id=report_id,
            article_id=article.article_id,
            event_type='include_article',
            notes=notes,
            curator_id=user_id
        )
        self.db.add(event)

        await self.db.commit()

        return IncludeArticleResult(
            article_id=article.article_id,
            wip_article_id=wip_article_id,
            included=True,
            ranking=new_ranking,
            category=category,
        )

    async def _async_find_or_create_article_from_wip(self, wip_article: WipArticle) -> Article:
        """Find existing Article by PMID/DOI or create new one from WipArticle (async)."""
        article = None
        if wip_article.pmid:
            result = await self.db.execute(
                select(Article).where(Article.pmid == wip_article.pmid)
            )
            article = result.scalars().first()
        if not article and wip_article.doi:
            result = await self.db.execute(
                select(Article).where(Article.doi == wip_article.doi)
            )
            article = result.scalars().first()

        if not article:
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
            await self.db.flush()

        return article

    async def async_reset_curation(
        self,
        report_id: int,
        wip_article_id: int,
        user_id: int
    ) -> ResetCurationResult:
        """Reset curation for an article (async)."""
        report, user, stream = await self._async_get_report_for_curation(report_id, user_id)

        # Get the WipArticle
        wip_article = await self.wip_article_service.async_get_by_id_or_404(wip_article_id)

        if wip_article.pipeline_execution_id != report.pipeline_execution_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="WIP article not found for this report"
            )

        was_curator_included = wip_article.curator_included
        was_curator_excluded = wip_article.curator_excluded

        if not was_curator_included and not was_curator_excluded:
            return ResetCurationResult(
                wip_article_id=wip_article_id,
                reset=False,
                message='Article has no curation overrides to reset'
            )

        # Find the Article record
        article = None
        if wip_article.pmid:
            result = await self.db.execute(
                select(Article).where(Article.pmid == wip_article.pmid)
            )
            article = result.scalars().first()
        if not article and wip_article.doi:
            result = await self.db.execute(
                select(Article).where(Article.doi == wip_article.doi)
            )
            article = result.scalars().first()

        article_id = None
        if article:
            article_id = article.article_id
            association = await self.association_service.async_find(report_id, article.article_id)

            if association:
                if association.curator_added:
                    await self.association_service.async_delete(association)
                elif association.is_hidden:
                    self.association_service.set_hidden(association, False)

        # Clear WipArticle curation flags
        pipeline_would_include = self.wip_article_service.clear_curation_flags(wip_article, user_id)

        report.last_curated_by = user_id
        report.last_curated_at = datetime.utcnow()

        from models import CurationEvent
        event = CurationEvent(
            report_id=report_id,
            article_id=article_id,
            event_type='reset_curation',
            notes=f"Reset from {'curator_included' if was_curator_included else 'curator_excluded'} to pipeline decision",
            curator_id=user_id
        )
        self.db.add(event)

        await self.db.commit()

        return ResetCurationResult(
            wip_article_id=wip_article_id,
            reset=True,
            was_curator_included=was_curator_included,
            was_curator_excluded=was_curator_excluded,
            pipeline_decision=pipeline_would_include,
            now_in_report=pipeline_would_include,
        )

    async def async_update_article_in_report(
        self,
        report_id: int,
        article_id: int,
        user_id: int,
        ranking: Optional[int] = None,
        category: Optional[str] = None,
        ai_summary: Optional[str] = None
    ) -> UpdateArticleResult:
        """Edit an article within the report (async)."""
        report, user, stream = await self._async_get_report_for_curation(report_id, user_id)

        association = await self.association_service.async_get(report_id, article_id)

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
            if association.original_ai_summary is None and old_val:
                association.original_ai_summary = old_val
            association.ai_summary = ai_summary
            changes_made.append(('ai_summary', old_val[:100] if old_val else None, ai_summary[:100]))

        if changes_made:
            report.has_curation_edits = True
            report.last_curated_by = user_id
            report.last_curated_at = datetime.utcnow()

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

            await self.db.commit()

        return UpdateArticleResult(
            article_id=article_id,
            ranking=association.ranking,
            presentation_categories=association.presentation_categories or [],
            ai_summary=association.ai_summary,
        )

    async def async_get_pipeline_analytics(
        self,
        report_id: int,
        user_id: int
    ) -> PipelineAnalytics:
        """Get pipeline analytics for a report (async)."""
        report, user, stream = await self._async_get_report_for_curation(report_id, user_id)

        # Initialize empty analytics
        summary = PipelineAnalyticsSummary(
            total_retrieved=0,
            duplicates=0,
            filtered_out=0,
            passed_filter=0,
            included_in_report=0,
        )

        by_group: List[GroupAnalytics] = []
        filter_reasons: Dict[str, int] = {}
        category_counts: Dict[str, int] = {}
        wip_articles_data: List[WipArticleAnalytics] = []

        if report.pipeline_execution_id:
            wip_articles = await self.wip_article_service.async_get_by_execution_id(
                report.pipeline_execution_id
            )

            # Get associations for category info
            associations = await self.association_service.async_get_all_for_report(report_id)
            article_categories: Dict[int, List[str]] = {}
            for assoc in associations:
                article_categories[assoc.article_id] = assoc.presentation_categories or []

            # Group stats
            group_stats: Dict[str, Dict[str, int]] = {}

            for wip in wip_articles:
                summary.total_retrieved += 1
                group_id = wip.retrieval_group_id or "unknown"

                if group_id not in group_stats:
                    group_stats[group_id] = {
                        'total': 0, 'duplicates': 0, 'filtered_out': 0,
                        'passed_filter': 0, 'included': 0
                    }
                group_stats[group_id]['total'] += 1

                if wip.is_duplicate:
                    summary.duplicates += 1
                    group_stats[group_id]['duplicates'] += 1
                elif not wip.passed_semantic_filter:
                    summary.filtered_out += 1
                    group_stats[group_id]['filtered_out'] += 1
                    if wip.filter_score_reason:
                        reason = wip.filter_score_reason[:50]
                        filter_reasons[reason] = filter_reasons.get(reason, 0) + 1
                else:
                    summary.passed_filter += 1
                    group_stats[group_id]['passed_filter'] += 1

                if wip.included_in_report:
                    summary.included_in_report += 1
                    group_stats[group_id]['included'] += 1

                # Find categories via Article lookup
                article_result = await self.db.execute(
                    select(Article.article_id).where(
                        or_(
                            and_(Article.pmid.isnot(None), Article.pmid == wip.pmid),
                            and_(Article.doi.isnot(None), Article.doi == wip.doi)
                        )
                    )
                )
                article_id = article_result.scalar()
                cats = article_categories.get(article_id, []) if article_id else []

                for cat in cats:
                    category_counts[cat] = category_counts.get(cat, 0) + 1

                wip_articles_data.append(WipArticleAnalytics(
                    id=wip.id,
                    title=wip.title,
                    retrieval_group_id=wip.retrieval_group_id or "unknown",
                    is_duplicate=wip.is_duplicate or False,
                    duplicate_of_id=wip.duplicate_of_id,
                    passed_semantic_filter=wip.passed_semantic_filter,
                    filter_score=wip.filter_score,
                    filter_score_reason=wip.filter_score_reason,
                    included_in_report=wip.included_in_report or False,
                    presentation_categories=cats,
                    authors=wip.authors or [],
                    journal=wip.journal,
                    year=wip.year,
                    pmid=wip.pmid,
                    doi=wip.doi,
                    abstract=wip.abstract,
                ))

            by_group = [
                GroupAnalytics(
                    group_id=gid,
                    total=stats['total'],
                    duplicates=stats['duplicates'],
                    filtered_out=stats['filtered_out'],
                    passed_filter=stats['passed_filter'],
                    included=stats['included'],
                )
                for gid, stats in group_stats.items()
            ]

        # Get execution for pipeline_metrics
        exec_result = await self.db.execute(
            select(PipelineExecution).where(
                PipelineExecution.id == report.pipeline_execution_id
            )
        ) if report.pipeline_execution_id else None
        execution = exec_result.scalars().first() if exec_result else None

        return PipelineAnalytics(
            report_id=report_id,
            run_type=execution.run_type if execution else None,
            report_date=report.report_date.isoformat() if report.report_date else "",
            pipeline_metrics=execution.pipeline_metrics if execution else None,
            summary=summary,
            by_group=by_group,
            filter_reasons=filter_reasons,
            category_counts=category_counts,
            wip_articles=wip_articles_data,
        )


# =============================================================================
# Dependency Injection Provider
# =============================================================================

async def get_async_report_service(
    db: AsyncSession = Depends(get_async_db)
) -> ReportService:
    """FastAPI dependency that provides a ReportService with AsyncSession."""
    return ReportService(db)
