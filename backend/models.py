from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, Date, Enum, JSON, Boolean, Float
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from datetime import datetime
from typing import Optional, Dict, Any
from sqlalchemy.sql.schema import CheckConstraint
from enum import Enum as PyEnum

Base = declarative_base()

# Enums for Knowledge Horizon
class UserRole(str, PyEnum):
    """
    User privilege levels.

    Role hierarchy and org_id relationship:
    - PLATFORM_ADMIN: org_id = NULL. Platform-level access, above all orgs.
                      Can manage any org, create global streams, assign users.
    - ORG_ADMIN: org_id = required. Manages their organization's members
                 and stream subscriptions.
    - MEMBER: org_id = required. Regular user in an organization.
              Can use streams they have access to, create personal streams.
    """
    PLATFORM_ADMIN = "platform_admin"
    ORG_ADMIN = "org_admin"
    MEMBER = "member"


class StreamScope(str, PyEnum):
    """Scope of a research stream"""
    GLOBAL = "global"  # Platform-level, created by platform admins
    ORGANIZATION = "organization"  # Org-level, visible to all org members who subscribe
    PERSONAL = "personal"  # User-level, only visible to creator

class FeedbackType(str, PyEnum):
    """Type of user feedback"""
    THUMBS_UP = "thumbs_up"
    THUMBS_DOWN = "thumbs_down"
    IRRELEVANT = "irrelevant"
    IMPORTANT = "important"

class ReportFrequency(str, PyEnum):
    """Frequency of report generation"""
    DAILY = "daily"
    WEEKLY = "weekly"
    BIWEEKLY = "biweekly"
    MONTHLY = "monthly"

class StreamType(str, PyEnum):
    """Type of research stream"""
    COMPETITIVE = "competitive"  # Competitor monitoring
    REGULATORY = "regulatory"    # Regulatory updates and changes
    CLINICAL = "clinical"        # Clinical trials and research
    MARKET = "market"           # Market analysis and trends
    SCIENTIFIC = "scientific"   # Scientific literature and discoveries
    MIXED = "mixed"             # Multi-purpose streams

class RunType(str, PyEnum):
    """Type of pipeline run"""
    TEST = "test"         # Legacy: kept for backward compatibility
    SCHEDULED = "scheduled"  # Automated scheduled run
    MANUAL = "manual"     # Manual run triggered by user


class ApprovalStatus(str, PyEnum):
    """Approval status for reports"""
    AWAITING_APPROVAL = "awaiting_approval"  # Report complete, awaiting admin review
    APPROVED = "approved"                     # Approved and visible to subscribers
    REJECTED = "rejected"                     # Rejected by admin


class ExecutionStatus(str, PyEnum):
    """Status of a pipeline execution"""
    PENDING = "pending"       # Queued, waiting to start
    RUNNING = "running"       # Currently executing
    COMPLETED = "completed"   # Finished successfully, report created
    FAILED = "failed"         # Execution failed, no report


# Organization table (multi-tenancy)
class Organization(Base):
    """Organization/tenant that users belong to"""
    __tablename__ = "organizations"

    org_id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    users = relationship("User", back_populates="organization")
    research_streams = relationship("ResearchStream", back_populates="organization", foreign_keys="ResearchStream.org_id")
    stream_subscriptions = relationship("OrgStreamSubscription", back_populates="organization")
    invitations = relationship("Invitation", back_populates="organization")


class Invitation(Base):
    """User invitation for registration"""
    __tablename__ = "invitations"

    invitation_id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), nullable=False, index=True)
    token = Column(String(255), nullable=False, unique=True, index=True)
    org_id = Column(Integer, ForeignKey("organizations.org_id", ondelete="CASCADE"), nullable=True)
    role = Column(String(50), default="member", nullable=False)
    invited_by = Column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=False)
    accepted_at = Column(DateTime, nullable=True)
    is_revoked = Column(Boolean, default=False)

    # Relationships
    organization = relationship("Organization", back_populates="invitations")
    inviter = relationship("User", foreign_keys=[invited_by])


# Core User table
class User(Base):
    """User authentication and basic information"""
    __tablename__ = "users"

    user_id = Column(Integer, primary_key=True, index=True)
    org_id = Column(Integer, ForeignKey("organizations.org_id"), nullable=True, index=True)  # Organization (nullable during migration)
    email = Column(String(255), unique=True, index=True)
    password = Column(String(255))
    full_name = Column(String(255), nullable=True)  # User's full name from onboarding
    job_title = Column(String(255), nullable=True)  # User's job title
    is_active = Column(Boolean, default=True)
    role = Column(Enum(UserRole, values_callable=lambda x: [e.value for e in x], name='userrole'), default=UserRole.MEMBER, nullable=False)
    login_token = Column(String(255), nullable=True, index=True)  # One-time login token
    login_token_expires = Column(DateTime, nullable=True)  # Token expiration time
    password_reset_token = Column(String(255), nullable=True, index=True)  # Password reset token
    password_reset_token_expires = Column(DateTime, nullable=True)  # Reset token expiration
    registration_date = Column(DateTime, default=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    organization = relationship("Organization", back_populates="users")
    stream_subscriptions = relationship("UserStreamSubscription", back_populates="user")
    # Additional relationships added at end of file


class PipelineExecution(Base):
    """
    Tracks each pipeline run attempt - the single source of truth for execution state AND configuration.

    All configuration is determined and stored at creation time (trigger time):
    - Who triggered it (user_id)
    - What to retrieve (retrieval_config snapshot)
    - How to categorize/present (presentation_config snapshot)
    - What date range to query (start_date, end_date)
    - What to name the report (report_name)

    The pipeline service reads ALL configuration from this record - it does NOT
    go back to the stream for any configuration.
    """
    __tablename__ = "pipeline_executions"

    # === IDENTITY ===
    id = Column(String(36), primary_key=True)  # UUID
    stream_id = Column(Integer, ForeignKey("research_streams.stream_id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.user_id"), nullable=False)  # Who triggered/owns this execution

    # === EXECUTION STATE ===
    status = Column(Enum(ExecutionStatus, values_callable=lambda x: [e.value for e in x], name='executionstatus'), default=ExecutionStatus.PENDING, nullable=False)
    run_type = Column(Enum(RunType, values_callable=lambda x: [e.value for e in x], name='runtype'), default=RunType.MANUAL, nullable=False)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    error = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # === EXECUTION CONFIGURATION (all determined at trigger time) ===
    start_date = Column(String(10), nullable=True)  # YYYY-MM-DD format for retrieval
    end_date = Column(String(10), nullable=True)    # YYYY-MM-DD format for retrieval
    report_name = Column(String(255), nullable=True)  # Custom report name (defaults to YYYY.MM.DD if null)
    retrieval_config = Column(JSON, nullable=True)  # Snapshot: queries, filters, sources
    presentation_config = Column(JSON, nullable=True)  # Snapshot: categories for categorization

    # === OUTPUT REFERENCE ===
    report_id = Column(Integer, ForeignKey("reports.report_id"), nullable=True)

    # Relationships
    stream = relationship("ResearchStream", back_populates="executions", foreign_keys=[stream_id])
    user = relationship("User", foreign_keys=[user_id])
    report = relationship("Report", back_populates="execution", foreign_keys=[report_id])
    wip_articles = relationship("WipArticle", back_populates="execution", primaryjoin="PipelineExecution.id == foreign(WipArticle.pipeline_execution_id)")


class ResearchStream(Base):
    """Research stream with clean three-layer architecture"""
    __tablename__ = "research_streams"

    # === CORE IDENTITY ===
    stream_id = Column(Integer, primary_key=True, index=True)

    # Scope determines visibility: global (platform-wide), organization, or personal
    scope = Column(Enum(StreamScope, values_callable=lambda x: [e.value for e in x], name='streamscope'), default=StreamScope.PERSONAL, nullable=False, index=True)

    # Organization this stream belongs to (NULL for global streams)
    org_id = Column(Integer, ForeignKey("organizations.org_id"), nullable=True, index=True)

    # Owner user for personal streams (NULL for org/global streams)
    user_id = Column(Integer, ForeignKey("users.user_id"), nullable=True, index=True)

    # Who created this stream (always set, for audit purposes)
    created_by = Column(Integer, ForeignKey("users.user_id"), nullable=True, index=True)

    stream_name = Column(String(255), nullable=False)
    purpose = Column(Text, nullable=False)  # High-level why this stream exists

    # === THREE-LAYER ARCHITECTURE ===

    # Layer 1: SEMANTIC SPACE - What information matters (source-agnostic ground truth)
    # Stores complete SemanticSpace schema as JSON
    semantic_space = Column(JSON, nullable=False)

    # Layer 2: RETRIEVAL CONFIG - How to find & filter content
    # Stores RetrievalConfig (workflow + scoring) as JSON
    # Format: {"workflow": {...}, "scoring": {...}}
    retrieval_config = Column(JSON, nullable=False)

    # Layer 3: PRESENTATION CONFIG - How to organize results for users
    # Stores PresentationConfig (categories) as JSON
    # Format: {"categories": [{...}, {...}]}
    presentation_config = Column(JSON, nullable=False)

    # Layer 4: ENRICHMENT CONFIG - Custom prompts for content generation
    # Stores EnrichmentConfig (custom prompts) as JSON
    # Format: {"prompts": {"executive_summary": {...}, "category_summary": {...}}}
    enrichment_config = Column(JSON, nullable=True)

    # === CHAT CONFIGURATION ===
    # Stream-specific instructions for the chat assistant
    # These are included in the system prompt when chatting about this stream/reports
    # Example: Classification rules, domain expertise, special terminology
    chat_instructions = Column(Text, nullable=True)

    # === METADATA ===
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # === SCHEDULING ===
    # Schedule configuration stored as JSON:
    # {
    #   "enabled": true,
    #   "frequency": "weekly",       # daily, weekly, biweekly, monthly
    #   "anchor_day": "monday",      # day of week (mon-sun) or day of month (1-31)
    #   "preferred_time": "08:00",   # HH:MM in user's timezone
    #   "timezone": "America/New_York",
    #   "lookback_days": 7           # how many days of articles to fetch
    # }
    schedule_config = Column(JSON, nullable=True)
    next_scheduled_run = Column(DateTime, nullable=True, index=True)  # When this stream should run next (pre-calculated)
    last_execution_id = Column(String(36), ForeignKey("pipeline_executions.id"), nullable=True)  # Most recent execution

    # Relationships
    organization = relationship("Organization", back_populates="research_streams", foreign_keys=[org_id])
    user = relationship("User", back_populates="research_streams", foreign_keys=[user_id])
    creator = relationship("User", foreign_keys=[created_by], overlaps="created_streams")
    reports = relationship("Report", back_populates="research_stream")
    org_subscriptions = relationship("OrgStreamSubscription", back_populates="stream")
    user_subscriptions = relationship("UserStreamSubscription", back_populates="stream")
    executions = relationship("PipelineExecution", back_populates="stream", foreign_keys="PipelineExecution.stream_id")
    last_execution = relationship("PipelineExecution", foreign_keys=[last_execution_id], uselist=False)


class InformationSource(Base):
    """Sources of information for curation - represents actual searchable sources like PubMed, Google Scholar, etc."""
    __tablename__ = "information_sources"

    source_id = Column(Integer, primary_key=True, index=True)
    source_name = Column(String(255), nullable=False, unique=True)  # e.g., "PubMed", "Google Scholar", "Semantic Scholar"
    source_url = Column(String(500))  # Base URL for the source
    description = Column(Text)  # Description of the source
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    articles = relationship("Article", back_populates="source")


class Article(Base):
    """Individual articles from information sources"""
    __tablename__ = "articles"

    article_id = Column(Integer, primary_key=True, index=True)
    source_id = Column(Integer, ForeignKey("information_sources.source_id"))
    title = Column(String(500), nullable=False)
    url = Column(String(1000))
    authors = Column(JSON, default=list)  # List of author names
    publication_date = Column(Date)
    summary = Column(Text)  # Original summary
    ai_summary = Column(Text)  # AI-generated summary
    full_text = Column(Text)  # Full article text
    article_metadata = Column(JSON, default=dict)  # Additional metadata
    theme_tags = Column(JSON, default=list)  # Thematic tags
    first_seen = Column(DateTime, default=datetime.utcnow)
    last_updated = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    fetch_count = Column(Integer, default=1)  # How many times we've seen this

    # PubMed-specific fields
    pmid = Column(String(20), index=True)  # PubMed ID
    abstract = Column(Text)  # Full abstract text
    comp_date = Column(Date)  # Completion date
    year = Column(String(4))  # Publication year
    journal = Column(String(255))  # Journal name
    volume = Column(String(50))  # Journal volume
    issue = Column(String(50))  # Journal issue
    medium = Column(String(100))  # Publication medium
    pages = Column(String(50))  # Page range
    poi = Column(String(255))  # Publication Object Identifier
    doi = Column(String(255), index=True)  # Digital Object Identifier
    is_systematic = Column(Boolean, default=False)  # Is this a systematic review

    # Relationships
    source = relationship("InformationSource", back_populates="articles")
    report_associations = relationship("ReportArticleAssociation", back_populates="article")
    feedback = relationship("UserFeedback", back_populates="article")


class Report(Base):
    """
    Generated intelligence reports - pure output from pipeline execution.

    Input configuration (run_type, dates, retrieval_config) is stored in PipelineExecution.
    Access via report.execution to get execution configuration.
    """
    __tablename__ = "reports"

    report_id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.user_id"), nullable=False)
    research_stream_id = Column(Integer, ForeignKey("research_streams.stream_id"))
    report_name = Column(String, nullable=False)  # Human-readable report name (defaults to YYYY.MM.DD)
    report_date = Column(Date, nullable=False)
    key_highlights = Column(JSON, default=list)  # List of key points
    thematic_analysis = Column(Text)  # Analysis of themes
    coverage_stats = Column(JSON, default=dict)  # Statistics about coverage
    is_read = Column(Boolean, default=False)
    read_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Pipeline output metadata
    enrichments = Column(JSON, default=dict)  # LLM-generated content: executive_summary, category_summaries
    pipeline_metrics = Column(JSON, default=dict)  # Execution metrics: counts, timing, etc.
    pipeline_execution_id = Column(String(36), ForeignKey("pipeline_executions.id"), index=True, nullable=False)

    # Approval workflow - all reports require admin approval before being visible to subscribers
    approval_status = Column(Enum(ApprovalStatus, values_callable=lambda x: [e.value for e in x], name='approvalstatus'), default=ApprovalStatus.AWAITING_APPROVAL, nullable=False, index=True)
    approved_by = Column(Integer, ForeignKey("users.user_id"), nullable=True)  # Admin who approved/rejected
    approved_at = Column(DateTime, nullable=True)
    rejection_reason = Column(Text, nullable=True)  # Reason if rejected

    # Curation tracking - original values preserved for comparison
    original_report_name = Column(String(255), nullable=True)  # What pipeline generated
    original_enrichments = Column(JSON, nullable=True)  # Original summaries before editing
    has_curation_edits = Column(Boolean, default=False)  # Quick check: was anything manually changed?
    last_curated_by = Column(Integer, ForeignKey("users.user_id"), nullable=True)
    last_curated_at = Column(DateTime, nullable=True)

    # Relationships
    user = relationship("User", back_populates="reports", foreign_keys=[user_id])
    approver = relationship("User", foreign_keys=[approved_by])
    curator = relationship("User", foreign_keys=[last_curated_by])
    research_stream = relationship("ResearchStream", back_populates="reports")
    article_associations = relationship("ReportArticleAssociation", back_populates="report")
    feedback = relationship("UserFeedback", back_populates="report")
    execution = relationship("PipelineExecution", back_populates="report", foreign_keys="PipelineExecution.report_id", uselist=False)
    curation_events = relationship("CurationEvent", back_populates="report", cascade="all, delete-orphan", passive_deletes=True)


class ReportArticleAssociation(Base):
    """
    Association between reports and articles with metadata.

    An article is visible in the report if: record exists AND curator_excluded=False.

    Curation flags:
    - curator_excluded: Article was in report but curator excluded it (preserves data for undo)
    - curator_added: Article was added by curator (not by pipeline) - delete on reset

    See docs/_specs/article-curation-flow.md for full state transition documentation.
    """
    __tablename__ = "report_article_associations"

    report_id = Column(Integer, ForeignKey("reports.report_id"), primary_key=True)
    article_id = Column(Integer, ForeignKey("articles.article_id"), primary_key=True)
    relevance_score = Column(Float)  # AI-calculated relevance score
    relevance_rationale = Column(Text)  # Why this article is relevant
    ranking = Column(Integer)  # Order within the report (current, may be edited)
    user_feedback = Column(Enum(FeedbackType))  # User's feedback on this article
    is_starred = Column(Boolean, default=False)
    is_read = Column(Boolean, default=False)
    notes = Column(Text)  # User's notes on this article
    added_at = Column(DateTime, default=datetime.utcnow)
    read_at = Column(DateTime)

    # Presentation categorization (current, may be edited)
    presentation_categories = Column(JSON, default=list)  # List of presentation category IDs

    # AI-generated enrichments (stance analysis, summaries, etc.)
    ai_enrichments = Column(JSON, nullable=True)

    # === ORIGINAL VALUES (set when added, preserved for curation comparison) ===
    original_presentation_categories = Column(JSON, nullable=True)
    original_ranking = Column(Integer, nullable=True)

    # === AI SUMMARY (can be edited by curator) ===
    ai_summary = Column(Text, nullable=True)  # Current summary (may be edited)
    original_ai_summary = Column(Text, nullable=True)  # What AI originally generated

    # === CURATION FLAGS ===
    curator_excluded = Column(Boolean, default=False, nullable=False)  # Curator excluded from report view
    curator_added = Column(Boolean, default=False, nullable=False)  # Curator added (vs pipeline added)

    # === CURATION METADATA (for retrieval improvement feedback) ===
    curation_notes = Column(Text, nullable=True)  # Curator notes about this article
    curated_by = Column(Integer, nullable=True)  # User who last modified
    curated_at = Column(DateTime, nullable=True)

    # Relationships
    report = relationship("Report", back_populates="article_associations")
    article = relationship("Article", back_populates="report_associations")


class ReportSchedule(Base):
    """Automated report generation schedule"""
    __tablename__ = "report_schedules"

    schedule_id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.user_id"), nullable=False, unique=True)
    frequency = Column(Enum(ReportFrequency), nullable=False)
    day_of_week = Column(Integer)  # 0-6 for Monday-Sunday (for weekly)
    day_of_month = Column(Integer)  # 1-31 (for monthly)
    time_of_day = Column(String(5), default="08:00")  # HH:MM format
    timezone = Column(String(50), default="UTC")
    is_active = Column(Boolean, default=True)
    is_paused = Column(Boolean, default=False)
    next_run_at = Column(DateTime)
    last_run_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="report_schedule")


class UserFeedback(Base):
    """User feedback on reports and articles"""
    __tablename__ = "user_feedback"

    feedback_id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.user_id"), nullable=False)
    report_id = Column(Integer, ForeignKey("reports.report_id"))
    article_id = Column(Integer, ForeignKey("articles.article_id"))
    feedback_type = Column(Enum(FeedbackType), nullable=False)
    feedback_value = Column(String(50))  # Additional feedback value
    notes = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="feedback")
    report = relationship("Report", back_populates="feedback")
    article = relationship("Article", back_populates="feedback")

    # Constraints
    __table_args__ = (
        CheckConstraint(
            "(report_id IS NOT NULL AND article_id IS NULL) OR (report_id IS NULL AND article_id IS NOT NULL)",
            name="feedback_target_check"
        ),
    )


class WipArticle(Base):
    """Work-in-progress articles for pipeline test execution and audit trail"""
    __tablename__ = "wip_articles"

    id = Column(Integer, primary_key=True, index=True)
    research_stream_id = Column(Integer, ForeignKey("research_streams.stream_id"), nullable=False)
    retrieval_group_id = Column(String(255), nullable=False, index=True)
    source_id = Column(Integer, ForeignKey("information_sources.source_id"), nullable=False)
    pipeline_execution_id = Column(String(36), ForeignKey("pipeline_executions.id"), nullable=False, index=True)  # UUID of pipeline run

    # Article data (mirroring articles table structure)
    title = Column(String(500), nullable=False)
    url = Column(String(1000))
    authors = Column(JSON, default=list)
    publication_date = Column(Date)
    abstract = Column(Text)
    summary = Column(Text)
    full_text = Column(Text)

    # PubMed-specific fields
    pmid = Column(String(20), index=True)
    doi = Column(String(255), index=True)
    journal = Column(String(255))
    volume = Column(String(50))
    issue = Column(String(50))
    pages = Column(String(50))
    year = Column(String(4))

    # Source-specific identifier (e.g., PubMed ID, Semantic Scholar ID, etc.)
    source_specific_id = Column(String(255), index=True)

    # Metadata
    article_metadata = Column(JSON, default=dict)

    # Processing status fields (set by pipeline)
    is_duplicate = Column(Boolean, default=False, index=True)
    duplicate_of_id = Column(Integer, ForeignKey("wip_articles.id"))
    duplicate_of_pmid = Column(String(20), nullable=True)  # PMID of article this is a duplicate of
    passed_semantic_filter = Column(Boolean, default=None, index=True)
    filter_score = Column(Float, nullable=True)  # Relevance score from semantic filter
    filter_score_reason = Column(Text)  # AI reasoning for the score (captured for all articles)
    included_in_report = Column(Boolean, default=False, index=True)  # SOURCE OF TRUTH - synced with ReportArticleAssociation existence
    presentation_categories = Column(JSON, default=list)  # List of category IDs assigned by LLM

    # Curation override fields (set by curator, audit trail for how we got to current state)
    # See docs/_specs/article-curation-flow.md for state transition documentation
    curator_included = Column(Boolean, default=False)  # Curator overrode filter to include
    curator_excluded = Column(Boolean, default=False)  # Curator overrode pipeline to exclude
    curation_notes = Column(Text, nullable=True)  # Why curator made the decision
    curated_by = Column(Integer, ForeignKey("users.user_id"), nullable=True)
    curated_at = Column(DateTime, nullable=True)

    # Timestamps
    retrieved_at = Column(DateTime, default=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    research_stream = relationship("ResearchStream")
    source = relationship("InformationSource")
    execution = relationship("PipelineExecution", back_populates="wip_articles")
    curator = relationship("User", foreign_keys=[curated_by])


# Subscription tables for stream access control
class OrgStreamSubscription(Base):
    """Organization subscription to global streams"""
    __tablename__ = "org_stream_subscriptions"

    org_id = Column(Integer, ForeignKey("organizations.org_id"), primary_key=True)
    stream_id = Column(Integer, ForeignKey("research_streams.stream_id"), primary_key=True)
    subscribed_at = Column(DateTime, default=datetime.utcnow)
    subscribed_by = Column(Integer, ForeignKey("users.user_id"), nullable=True)  # Org admin who subscribed

    # Relationships
    organization = relationship("Organization", back_populates="stream_subscriptions")
    stream = relationship("ResearchStream", back_populates="org_subscriptions")
    subscriber = relationship("User")


class UserStreamSubscription(Base):
    """User subscription to org streams / opt-out from global streams"""
    __tablename__ = "user_stream_subscriptions"

    user_id = Column(Integer, ForeignKey("users.user_id"), primary_key=True)
    stream_id = Column(Integer, ForeignKey("research_streams.stream_id"), primary_key=True)
    is_subscribed = Column(Boolean, default=True, nullable=False)  # TRUE = subscribed, FALSE = opted out
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="stream_subscriptions")
    stream = relationship("ResearchStream", back_populates="user_subscriptions")


# === USER TRACKING & CHAT PERSISTENCE ===

class EventSource(str, PyEnum):
    """Source of tracking event"""
    BACKEND = "backend"    # Auto-tracked from API endpoints
    FRONTEND = "frontend"  # Explicitly sent from UI


class Conversation(Base):
    """Chat conversation session"""
    __tablename__ = "conversations"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.user_id"), nullable=False, index=True)
    app = Column(String(50), nullable=False, default="kh", index=True)  # "kh", "tablizer", "trialscout"
    title = Column(String(255), nullable=True)  # Optional, can auto-generate from first message
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="conversations")
    messages = relationship("Message", back_populates="conversation", cascade="all, delete-orphan", order_by="Message.created_at")


class Message(Base):
    """Individual message in a conversation"""
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String(20), nullable=False)  # 'user', 'assistant', 'system'
    content = Column(Text, nullable=False)
    context = Column(JSON, nullable=True)  # {page: 'reports', report_id: 123, article_pmid: '456'}
    # Extended message data: tool_history, custom_payload, diagnostics, suggested_values, suggested_actions
    extras = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    conversation = relationship("Conversation", back_populates="messages")


class UserEvent(Base):
    """User activity tracking event"""
    __tablename__ = "user_events"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.user_id"), nullable=False, index=True)
    event_source = Column(Enum(EventSource, values_callable=lambda x: [e.value for e in x], name='eventsource'), nullable=False)
    event_type = Column(String(50), nullable=False, index=True)  # 'api_call', 'view_change', 'tab_click', etc.
    event_data = Column(JSON, nullable=True)  # {endpoint: '/api/reports/123', method: 'GET'} or {tab: 'notes'}
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    # Relationships
    user = relationship("User", back_populates="events")


# === CURATION AUDIT TRAIL ===

class CurationEvent(Base):
    """
    Audit trail for curation actions - history of how we got to current state.
    NOT used to determine current state (that's on Report/ReportArticleAssociation).
    """
    __tablename__ = "curation_events"

    id = Column(Integer, primary_key=True, index=True)
    report_id = Column(Integer, ForeignKey("reports.report_id", ondelete="CASCADE"), nullable=False, index=True)
    article_id = Column(Integer, ForeignKey("articles.article_id", ondelete="CASCADE"), nullable=True)  # NULL for report-level events

    # What happened
    event_type = Column(String(50), nullable=False)  # See event types in spec
    field_name = Column(String(100), nullable=True)  # Which field changed
    old_value = Column(Text, nullable=True)  # JSON-serialized previous value
    new_value = Column(Text, nullable=True)  # JSON-serialized new value
    notes = Column(Text, nullable=True)  # Curator's explanation

    # Who/When
    curator_id = Column(Integer, ForeignKey("users.user_id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    # Relationships
    report = relationship("Report", back_populates="curation_events")
    article = relationship("Article")
    curator = relationship("User")


# Add relationships to User model
User.research_streams = relationship("ResearchStream", back_populates="user", foreign_keys="ResearchStream.user_id")
User.created_streams = relationship("ResearchStream", foreign_keys="ResearchStream.created_by")
User.reports = relationship("Report", back_populates="user", foreign_keys="Report.user_id")
User.approved_reports = relationship("Report", foreign_keys="Report.approved_by", viewonly=True)
User.curated_reports = relationship("Report", foreign_keys="Report.last_curated_by", viewonly=True)
User.report_schedule = relationship("ReportSchedule", back_populates="user", uselist=False)
User.feedback = relationship("UserFeedback", back_populates="user")
User.conversations = relationship("Conversation", back_populates="user", cascade="all, delete-orphan")
User.events = relationship("UserEvent", back_populates="user", cascade="all, delete-orphan")
