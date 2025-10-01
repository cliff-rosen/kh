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
    """User privilege levels"""
    ADMIN = "admin"
    USER = "user"
    TESTER = "tester"

class SourceType(str, PyEnum):
    """Type of information source"""
    JOURNAL = "journal"
    NEWS = "news"
    REGULATORY = "regulatory"
    CLINICAL = "clinical"
    PATENT = "patent"
    COMPANY = "company"
    PREPRINT = "preprint"
    CONFERENCE = "conference"

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


# Core User table
class User(Base):
    """User authentication and basic information"""
    __tablename__ = "users"

    user_id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True)
    password = Column(String(255))
    full_name = Column(String(255), nullable=True)  # User's full name from onboarding
    is_active = Column(Boolean, default=True)
    role = Column(Enum(UserRole, name='userrole'), default=UserRole.USER, nullable=False)
    login_token = Column(String(255), nullable=True, index=True)  # One-time login token
    login_token_expires = Column(DateTime, nullable=True)  # Token expiration time
    registration_date = Column(DateTime, default=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Knowledge Horizon relationships only
    # (relationships added at end of file)


# Knowledge Horizon Tables
class CompanyProfile(Base):
    """Company and user profile information"""
    __tablename__ = "company_profiles"

    profile_id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.user_id"), nullable=False, unique=True)
    company_name = Column(String(255), nullable=False)
    job_title = Column(String(255), nullable=False)
    therapeutic_areas = Column(JSON, default=list)  # List of therapeutic areas
    pipeline_products = Column(JSON, default=list)  # List of products in pipeline
    competitors = Column(JSON, default=list)  # List of competitor companies
    company_metadata = Column(JSON, default=dict)  # Additional company data
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="company_profile")
    research_streams = relationship("ResearchStream", back_populates="profile")


class ResearchStream(Base):
    """Complete research monitoring setup (formerly CurationMandate)"""
    __tablename__ = "research_streams"

    stream_id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.user_id"), nullable=False)
    profile_id = Column(Integer, ForeignKey("company_profiles.profile_id"))

    # Stream configuration
    stream_name = Column(String(255), nullable=False)  # User-defined name like "Oncology Competitive Intelligence"
    description = Column(Text)  # Optional detailed description
    stream_type = Column(Enum(StreamType), nullable=False, default=StreamType.MIXED)

    # All monitoring configuration consolidated at stream level
    focus_areas = Column(JSON, default=list)  # Therapeutic areas, business functions, topics
    competitors = Column(JSON, default=list)  # Companies to monitor
    regulatory_bodies = Column(JSON, default=list)  # FDA, EMA, etc.
    scientific_domains = Column(JSON, default=list)  # Clinical, preclinical, discovery, etc.
    exclusions = Column(JSON, default=list)  # Topics to exclude
    keywords = Column(JSON, default=list)  # Additional search keywords

    # Report scheduling integrated at stream level
    report_frequency = Column(Enum(ReportFrequency), default=ReportFrequency.WEEKLY)

    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="research_streams")
    profile = relationship("CompanyProfile", back_populates="research_streams")
    sources = relationship("InformationSource", back_populates="research_stream")
    reports = relationship("Report", back_populates="research_stream")


class InformationSource(Base):
    """Sources of information for curation"""
    __tablename__ = "information_sources"

    source_id = Column(Integer, primary_key=True, index=True)
    research_stream_id = Column(Integer, ForeignKey("research_streams.stream_id"), nullable=False)
    source_type = Column(Enum(SourceType), nullable=False)
    source_name = Column(String(255), nullable=False)
    source_url = Column(String(500))
    retrieval_config = Column(JSON, default=dict)  # Configuration for data retrieval
    search_queries = Column(JSON, default=list)  # Search terms/queries
    update_frequency = Column(String(50), default="daily")
    is_active = Column(Boolean, default=True)
    last_fetched = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    research_stream = relationship("ResearchStream", back_populates="sources")
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
    source_type = Column(Enum(SourceType))
    article_metadata = Column(JSON, default=dict)  # Additional metadata
    theme_tags = Column(JSON, default=list)  # Thematic tags
    first_seen = Column(DateTime, default=datetime.utcnow)
    last_updated = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    fetch_count = Column(Integer, default=1)  # How many times we've seen this

    # Relationships
    source = relationship("InformationSource", back_populates="articles")
    report_associations = relationship("ReportArticleAssociation", back_populates="article")
    feedback = relationship("UserFeedback", back_populates="article")


class Report(Base):
    """Generated intelligence reports"""
    __tablename__ = "reports"

    report_id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.user_id"), nullable=False)
    research_stream_id = Column(Integer, ForeignKey("research_streams.stream_id"))
    report_date = Column(Date, nullable=False)
    executive_summary = Column(Text)
    key_highlights = Column(JSON, default=list)  # List of key points
    thematic_analysis = Column(Text)  # Analysis of themes
    coverage_stats = Column(JSON, default=dict)  # Statistics about coverage
    is_read = Column(Boolean, default=False)
    read_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="reports")
    research_stream = relationship("ResearchStream", back_populates="reports")
    article_associations = relationship("ReportArticleAssociation", back_populates="report")
    feedback = relationship("UserFeedback", back_populates="report")


class ReportArticleAssociation(Base):
    """Association between reports and articles with metadata"""
    __tablename__ = "report_article_associations"

    report_id = Column(Integer, ForeignKey("reports.report_id"), primary_key=True)
    article_id = Column(Integer, ForeignKey("articles.article_id"), primary_key=True)
    relevance_score = Column(Float)  # AI-calculated relevance score
    relevance_rationale = Column(Text)  # Why this article is relevant
    ranking = Column(Integer)  # Order within the report
    user_feedback = Column(Enum(FeedbackType))  # User's feedback on this article
    is_starred = Column(Boolean, default=False)
    is_read = Column(Boolean, default=False)
    notes = Column(Text)  # User's notes on this article
    added_at = Column(DateTime, default=datetime.utcnow)
    read_at = Column(DateTime)

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


class OnboardingSession(Base):
    """Onboarding conversation sessions"""
    __tablename__ = "onboarding_sessions"

    session_id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.user_id"), nullable=False)
    conversation_history = Column(JSON, default=list)  # List of messages
    extracted_data = Column(JSON, default=dict)  # Extracted profile data
    research_data = Column(JSON, default=dict)  # Company research data
    completed_steps = Column(JSON, default=list)  # List of completed steps
    is_complete = Column(Boolean, default=False)
    completed_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="onboarding_sessions")


# Add relationships to User model
User.company_profile = relationship("CompanyProfile", back_populates="user", uselist=False)
User.research_streams = relationship("ResearchStream", back_populates="user")
User.reports = relationship("Report", back_populates="user")
User.report_schedule = relationship("ReportSchedule", back_populates="user", uselist=False)
User.feedback = relationship("UserFeedback", back_populates="user")
User.onboarding_sessions = relationship("OnboardingSession", back_populates="user")