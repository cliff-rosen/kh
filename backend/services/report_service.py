"""
Report Service for Knowledge Horizon

This service is the ONLY place that should write to the Report and
ReportArticleAssociation tables. All other services should use this
service for report-related operations.
"""

import logging
import time
from dataclasses import dataclass, field, asdict
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import and_, or_, func, select
from typing import List, Optional, Dict, Any, Set, Tuple
from datetime import date, datetime, timezone
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
class ReportConfigData:
    """Lightweight config data for settings modal."""
    retrieval_config: Optional[Dict[str, Any]] = None
    enrichment_config: Optional[Dict[str, Any]] = None
    llm_config: Optional[Dict[str, Any]] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    stream_name: Optional[str] = None


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

    Uses AsyncSession for all database operations.
    """

    def __init__(self, db: AsyncSession):
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

    # =========================================================================
    # ASYNC CREATE Operations
    # =========================================================================

    async def create_report(
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
        Create a new report (async).

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
            created_at=datetime.now(timezone.utc),
            approval_status=ApprovalStatus.AWAITING_APPROVAL
        )
        self.db.add(report)
        await self.db.flush()  # Get the report_id

        return report

    # =========================================================================
    # ASYNC Methods (for use with AsyncSession)
    # =========================================================================

    async def get_accessible_stream_ids(self, user: User) -> Set[int]:
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

    async def get_recent_reports(
        self,
        user: User,
        limit: int = 20,
        offset: int = 0,
        stream_id: Optional[int] = None
    ) -> List[ReportWithArticleCount]:
        """Get recent reports the user has access to (async)."""
        accessible_stream_ids = await self.get_accessible_stream_ids(user)

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

    async def get_report_with_access(
        self,
        report_id: int,
        user_id: int,
        raise_on_not_found: bool = False
    ) -> Optional[Tuple[Report, User, ResearchStream]]:
        """
        Get report with user access verification (async).

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
        stmt = select(Report).where(Report.report_id == report_id)
        result = await self.db.execute(stmt)
        report = result.scalars().first()
        if not report:
            if raise_on_not_found:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Report not found"
                )
            return None

        # Get user
        user = await self.user_service.get_user_by_id(user_id)
        if not user:
            if raise_on_not_found:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Report not found"
                )
            return None

        # Get stream
        stmt = select(ResearchStream).where(
            ResearchStream.stream_id == report.research_stream_id
        )
        result = await self.db.execute(stmt)
        stream = result.scalars().first()

        # Check access
        accessible_stream_ids = await self.get_accessible_stream_ids(user)
        if not stream or stream.stream_id not in accessible_stream_ids:
            if raise_on_not_found:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Report not found"
                )
            return None

        return (report, user, stream)

    async def get_reports_for_stream(
        self,
        user: User,
        research_stream_id: int
    ) -> List[ReportWithArticleCount]:
        """Get all reports for a specific stream (async)."""
        accessible_stream_ids = await self.get_accessible_stream_ids(user)

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

    async def get_report_with_articles(
        self,
        user: User,
        report_id: int
    ) -> Optional[ReportWithArticlesData]:
        """Get report with its articles (async)."""
        access_result = await self.get_report_with_access(report_id, user.user_id)
        if not access_result:
            return None
        report, _, stream = access_result

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

    async def get_report_articles_list(
        self,
        report_id: int,
        user_id: int,
        include_abstract: bool = False
    ) -> Optional[Dict[str, Any]]:
        """
        Get the list of articles in a report with metadata (async).

        This is optimized for LLM consumption - returns a structured list
        with category names resolved from IDs.

        Args:
            report_id: The report ID
            user_id: The user ID (for access verification)
            include_abstract: If True, include full abstracts (expanded mode)

        Returns:
            Dict with report info and articles list, or None if not found/no access
        """
        result = await self.get_report_with_access(report_id, user_id)
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
        visible_associations = await self.association_service.get_visible_for_report(report_id)

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

    async def get_wip_articles_for_report(
        self,
        report_id: int,
        user_id: int,
        included_only: bool = True
    ) -> List[WipArticle]:
        """
        Get WIP articles for a report (async).

        Args:
            report_id: The report ID
            user_id: The user ID (for access verification)
            included_only: If True, only return articles with included_in_report=True

        Returns:
            List of WipArticle objects
        """
        result = await self.get_report_with_access(report_id, user_id)
        if not result:
            return []
        report, _, stream = result

        if not report.pipeline_execution_id:
            return []

        return await self.wip_article_service.get_by_execution_id(
            report.pipeline_execution_id,
            included_only=included_only
        )

    async def delete_report(self, user: User, report_id: int) -> bool:
        """Delete a report if user has access (async)."""
        access_result = await self.get_report_with_access(report_id, user.user_id)
        if not access_result:
            return False
        report, _, _ = access_result

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

    async def get_article_association(
        self,
        user: User,
        report_id: int,
        article_id: int
    ) -> Optional[ReportArticleAssociation]:
        """Get article association if user has access (async)."""
        access_result = await self.get_report_with_access(report_id, user.user_id)
        if not access_result:
            return None

        stmt = select(ReportArticleAssociation).where(
            ReportArticleAssociation.report_id == report_id,
            ReportArticleAssociation.article_id == article_id
        )
        result = await self.db.execute(stmt)
        return result.scalars().first()

    async def update_article_notes(
        self,
        user: User,
        report_id: int,
        article_id: int,
        notes: Optional[str]
    ) -> Optional[NotesUpdateResult]:
        """Update notes on an article association (async)."""
        assoc = await self.get_article_association(user, report_id, article_id)
        if not assoc:
            return None

        assoc.notes = notes
        await self.db.commit()

        return NotesUpdateResult(
            report_id=report_id,
            article_id=article_id,
            notes=notes
        )

    async def update_article_enrichments(
        self,
        user: User,
        report_id: int,
        article_id: int,
        ai_enrichments: Dict[str, Any]
    ) -> Optional[EnrichmentsUpdateResult]:
        """Update AI enrichments on an article association (async)."""
        assoc = await self.get_article_association(user, report_id, article_id)
        if not assoc:
            return None

        assoc.ai_enrichments = ai_enrichments
        await self.db.commit()

        return EnrichmentsUpdateResult(
            report_id=report_id,
            article_id=article_id,
            ai_enrichments=ai_enrichments
        )

    async def get_article_metadata(
        self,
        user: User,
        report_id: int,
        article_id: int
    ) -> Optional[ArticleMetadataResult]:
        """Get full article metadata (async)."""
        assoc = await self.get_article_association(user, report_id, article_id)
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

    async def get_report_email_html(
        self,
        user: User,
        report_id: int
    ) -> Optional[str]:
        """Get stored email HTML for a report (async)."""
        access_result = await self.get_report_with_access(report_id, user.user_id)
        if not access_result:
            return None
        report, _, _ = access_result

        if not report.enrichments:
            return None
        return report.enrichments.get('email_html')

    async def store_report_email_html(
        self,
        user: User,
        report_id: int,
        html: str
    ) -> bool:
        """Store email HTML for a report (async)."""
        access_result = await self.get_report_with_access(report_id, user.user_id)
        if not access_result:
            return False
        report, _, _ = access_result

        enrichments = report.enrichments or {}
        enrichments['email_html'] = html
        report.enrichments = enrichments
        await self.db.commit()

        return True

    async def generate_report_email_html(
        self,
        user: User,
        report_id: int
    ) -> Optional[str]:
        """Generate HTML email content for a report (async)."""
        access_result = await self.get_report_with_access(report_id, user.user_id)
        if not access_result:
            return None
        report, _, stream = access_result

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
                    authors=article.authors[:3] if article.authors else None,
                    journal=article.journal or None,
                    publication_date=str(article.year) if article.year else None,
                    summary=assoc.ai_summary or (article.abstract[:300] + '...' if article.abstract and len(article.abstract) > 300 else article.abstract),
                    url=article.url or (f"https://pubmed.ncbi.nlm.nih.gov/{article.pmid}/" if article.pmid else None),
                    pmid=article.pmid
                ))

        email_categories = [
            EmailCategory(id=name.lower().replace(' ', '_'), name=name, articles=articles)
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
            categories=email_categories
        )

        # Generate HTML
        template_service = EmailTemplateService()
        return template_service.generate_report_email(email_data)

    async def approve_report(
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

    async def reject_report(
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

    async def get_curation_history(
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

    async def _get_report_for_curation(
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
        result = await self.get_report_with_access(report_id, user_id)
        if not result:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Report not found or access denied"
            )
        return result

    async def get_report_config(self, report_id: int, user_id: int) -> ReportConfigData:
        """
        Get lightweight config data for a report (async).

        Returns just the configuration needed for the settings modal:
        - retrieval_config, enrichment_config, llm_config from execution
        - Falls back to stream config if execution config is not available
        """
        report, user, stream = await self._get_report_for_curation(report_id, user_id)

        # Initialize with defaults
        retrieval_config = None
        enrichment_config = None
        llm_config = None
        start_date = None
        end_date = None

        # Fetch execution for config access
        if report.pipeline_execution_id:
            exec_result = await self.db.execute(
                select(PipelineExecution).where(
                    PipelineExecution.id == report.pipeline_execution_id
                )
            )
            execution = exec_result.scalars().first()

            if execution:
                retrieval_config = execution.retrieval_config
                enrichment_config = execution.enrichment_config
                llm_config = execution.llm_config
                start_date = execution.start_date
                end_date = execution.end_date

        # Fall back to stream config if execution config is not available
        if not enrichment_config and stream:
            enrichment_config = stream.enrichment_config
        if not llm_config and stream:
            llm_config = stream.llm_config

        return ReportConfigData(
            retrieval_config=retrieval_config,
            enrichment_config=enrichment_config,
            llm_config=llm_config,
            start_date=start_date,
            end_date=end_date,
            stream_name=stream.stream_name if stream else None,
        )

    async def get_curation_view(self, report_id: int, user_id: int) -> CurationViewData:
        """
        Get full curation view data for a report (async).
        """
        report, user, stream = await self._get_report_for_curation(report_id, user_id)

        # Get categories from stream config
        categories = []
        if stream and stream.presentation_config:
            categories = stream.presentation_config.get('categories', [])

        # Get VISIBLE articles (curator_excluded=False)
        visible_associations = await self.association_service.get_visible_for_report(report_id)

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

            wip_articles = await self.wip_article_service.get_by_execution_id(
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

    async def update_report_content(
        self,
        report_id: int,
        user_id: int,
        report_name: Optional[str] = None,
        executive_summary: Optional[str] = None,
        category_summaries: Optional[Dict[str, str]] = None
    ) -> ReportContentUpdateResult:
        """Update report content (name, summaries) for curation (async)."""
        report, user, stream = await self._get_report_for_curation(report_id, user_id)

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

    async def exclude_article(
        self,
        report_id: int,
        article_id: int,
        user_id: int,
        notes: Optional[str] = None
    ) -> ExcludeArticleResult:
        """Curator excludes an article from the report (async)."""
        report, user, stream = await self._get_report_for_curation(report_id, user_id)

        # Get the association
        association = await self.association_service.get(report_id, article_id)

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
            wip_article = await self.wip_article_service.get_by_execution_and_identifiers(
                report.pipeline_execution_id,
                pmid=article.pmid,
                doi=article.doi
            )

        was_curator_added = association.curator_added or False

        if was_curator_added:
            # Curator-added article: delete association entirely
            await self.association_service.delete(association)
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

    async def include_article(
        self,
        report_id: int,
        wip_article_id: int,
        user_id: int,
        category: Optional[str] = None,
        notes: Optional[str] = None
    ) -> IncludeArticleResult:
        """Curator includes a filtered article into the report (async)."""
        report, user, stream = await self._get_report_for_curation(report_id, user_id)

        # Get the WipArticle
        wip_article = await self.wip_article_service.get_by_id_or_404(wip_article_id)

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
        article = await self._find_or_create_article_from_wip(wip_article)

        # Check if association already exists
        existing_association = await self.association_service.find(report_id, article.article_id)
        if existing_association:
            self.association_service.set_hidden(existing_association, False)
            new_ranking = existing_association.ranking
        else:
            new_ranking = await self.association_service.get_next_ranking(report_id)
            categories = [category] if category else []
            await self.association_service.create(
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

    async def _find_or_create_article_from_wip(self, wip_article: WipArticle) -> Article:
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

    async def reset_curation(
        self,
        report_id: int,
        wip_article_id: int,
        user_id: int
    ) -> ResetCurationResult:
        """Reset curation for an article (async)."""
        report, user, stream = await self._get_report_for_curation(report_id, user_id)

        # Get the WipArticle
        wip_article = await self.wip_article_service.get_by_id_or_404(wip_article_id)

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
            association = await self.association_service.find(report_id, article.article_id)

            if association:
                if association.curator_added:
                    await self.association_service.delete(association)
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

    async def update_article_in_report(
        self,
        report_id: int,
        article_id: int,
        user_id: int,
        ranking: Optional[int] = None,
        category: Optional[str] = None,
        ai_summary: Optional[str] = None
    ) -> UpdateArticleResult:
        """Edit an article within the report (async)."""
        report, user, stream = await self._get_report_for_curation(report_id, user_id)

        association = await self.association_service.get(report_id, article_id)

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

    async def get_pipeline_analytics(
        self,
        report_id: int,
        user_id: int
    ) -> PipelineAnalytics:
        """Get pipeline analytics for a report (async)."""
        report, user, stream = await self._get_report_for_curation(report_id, user_id)

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
            wip_articles = await self.wip_article_service.get_by_execution_id(
                report.pipeline_execution_id
            )

            # Get associations for category info
            associations = await self.association_service.get_all_for_report(report_id)
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

async def get_report_service(
    db: AsyncSession = Depends(get_async_db)
) -> ReportService:
    """FastAPI dependency that provides a ReportService with AsyncSession."""
    return ReportService(db)
