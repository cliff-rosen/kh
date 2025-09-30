# Knowledge Horizon Services Architecture Specification

## 1. Required Services for Knowledge Horizon POC

### Core Business Services

#### 1.1 Onboarding Service
**Purpose**: Manage the AI-driven onboarding conversation and user profile extraction
```python
class OnboardingService:
    - conduct_interview(messages: List[ChatMessage]) -> UserProfile
    - extract_user_info(conversation: str) -> Dict
    - validate_profile(profile: UserProfile) -> bool
    - save_onboarding_session(user_id: int, conversation: List) -> int
```

#### 1.2 Company Research Service
**Purpose**: Automated research on companies and users
```python
class CompanyResearchService:
    - research_company(company_name: str) -> CompanyData
    - research_user_linkedin(name: str, title: str) -> UserBackground
    - research_pipeline(company: str) -> List[Product]
    - research_competitors(company: str) -> List[Company]
    - synthesize_profile(data: Dict) -> CompanyProfile
```

#### 1.3 Mandate Generation Service
**Purpose**: Generate and manage curation mandates
```python
class MandateService:
    - generate_mandate(profile: CompanyProfile) -> CurationMandate
    - update_mandate(mandate_id: int, updates: Dict) -> CurationMandate
    - validate_mandate(mandate: CurationMandate) -> bool
    - optimize_mandate(mandate: CurationMandate, feedback: List) -> CurationMandate
    - get_active_mandate(user_id: int) -> CurationMandate
```

#### 1.4 Source Management Service
**Purpose**: Manage information sources and retrieval strategies
```python
class SourceService:
    - recommend_sources(mandate: CurationMandate) -> List[Source]
    - configure_source(source: Source, strategy: RetrievalStrategy) -> Source
    - test_source(source_id: int) -> TestResult
    - activate_sources(source_ids: List[int]) -> bool
    - get_user_sources(user_id: int) -> List[Source]
```

#### 1.5 Content Retrieval Service
**Purpose**: Fetch content from various sources
```python
class RetrievalService:
    - fetch_pubmed(query: str, filters: Dict) -> List[Article]
    - fetch_clinical_trials(query: str) -> List[Trial]
    - fetch_news(sources: List[str], query: str) -> List[NewsItem]
    - fetch_regulatory(authority: str, query: str) -> List[Document]
    - fetch_patents(query: str) -> List[Patent]
    - fetch_company_updates(companies: List[str]) -> List[Update]
```

#### 1.6 Content Curation Service
**Purpose**: Score, filter, and rank content
```python
class CurationService:
    - score_relevance(article: Article, mandate: CurationMandate) -> float
    - filter_articles(articles: List[Article], threshold: float) -> List[Article]
    - rank_articles(articles: List[Article]) -> List[Article]
    - deduplicate(articles: List[Article]) -> List[Article]
    - extract_themes(articles: List[Article]) -> List[Theme]
```

#### 1.7 Report Generation Service
**Purpose**: Generate comprehensive reports
```python
class ReportService:
    - generate_report(user_id: int, articles: List[Article]) -> Report
    - synthesize_summary(articles: List[Article], mandate: CurationMandate) -> str
    - generate_highlights(articles: List[Article]) -> List[str]
    - create_thematic_analysis(themes: List[Theme]) -> str
    - format_report(report: Report, format: str) -> str
    - store_report(report: Report) -> int
```

#### 1.8 Scheduling Service
**Purpose**: Manage report generation schedules
```python
class SchedulingService:
    - create_schedule(user_id: int, config: ScheduleConfig) -> Schedule
    - update_schedule(schedule_id: int, updates: Dict) -> Schedule
    - pause_schedule(schedule_id: int) -> bool
    - get_next_run(schedule_id: int) -> datetime
    - trigger_scheduled_report(schedule_id: int) -> int
```

#### 1.9 Feedback Service
**Purpose**: Collect and process user feedback
```python
class FeedbackService:
    - record_article_feedback(article_id: int, feedback: str) -> bool
    - record_report_feedback(report_id: int, rating: int, notes: str) -> bool
    - get_feedback_trends(user_id: int) -> FeedbackAnalysis
    - apply_feedback_to_mandate(mandate_id: int) -> CurationMandate
    - generate_optimization_suggestions(user_id: int) -> List[Suggestion]
```

#### 1.10 Notification Service
**Purpose**: Handle email and in-app notifications
```python
class NotificationService:
    - send_report_email(user_id: int, report_id: int) -> bool
    - send_onboarding_complete(user_id: int) -> bool
    - send_schedule_reminder(user_id: int) -> bool
    - queue_notification(notification: Notification) -> int
    - process_notification_queue() -> int
```

### AI/LLM Services

#### 1.11 LLM Orchestration Service
**Purpose**: Central coordination of all LLM operations
```python
class LLMOrchestrationService:
    - process_onboarding_chat(messages: List) -> OnboardingResult
    - generate_research_queries(company: str) -> List[str]
    - synthesize_research(data: Dict) -> CompanyProfile
    - generate_mandate(profile: CompanyProfile) -> CurationMandate
    - score_article_relevance(article: Article, mandate: CurationMandate) -> RelevanceScore
    - generate_summary(text: str, max_length: int) -> str
    - extract_key_points(articles: List[Article]) -> List[str]
    - identify_themes(articles: List[Article]) -> List[Theme]
    - generate_executive_summary(report_data: Dict) -> str
```

#### 1.12 Prompt Management Service
**Purpose**: Manage and optimize prompts
```python
class PromptService:
    - get_prompt(task: str, version: str = "latest") -> Prompt
    - test_prompt(prompt: Prompt, test_data: Dict) -> TestResult
    - version_prompt(prompt: Prompt) -> str
    - get_prompt_metrics(prompt_id: str) -> Metrics
    - optimize_prompt(prompt_id: str, feedback: List) -> Prompt
```

### Data Services

#### 1.13 User Profile Service
**Purpose**: Manage user data and preferences
```python
class UserProfileService:
    - create_profile(user_data: Dict) -> UserProfile
    - update_profile(user_id: int, updates: Dict) -> UserProfile
    - get_profile(user_id: int) -> UserProfile
    - get_preferences(user_id: int) -> UserPreferences
    - update_preferences(user_id: int, prefs: Dict) -> UserPreferences
```

#### 1.14 Report Storage Service
**Purpose**: Store and retrieve reports
```python
class ReportStorageService:
    - store_report(report: Report) -> int
    - get_report(report_id: int) -> Report
    - list_user_reports(user_id: int, filters: Dict) -> List[Report]
    - mark_report_read(report_id: int) -> bool
    - archive_report(report_id: int) -> bool
    - search_reports(user_id: int, query: str) -> List[Report]
```

#### 1.15 Analytics Service
**Purpose**: Track usage and generate insights
```python
class AnalyticsService:
    - track_event(event: AnalyticsEvent) -> bool
    - get_user_metrics(user_id: int) -> UserMetrics
    - get_system_metrics() -> SystemMetrics
    - generate_usage_report(date_range: DateRange) -> UsageReport
    - get_popular_sources() -> List[Source]
    - get_engagement_metrics(report_id: int) -> EngagementMetrics
```

### Background Job Services

#### 1.16 Job Queue Service
**Purpose**: Manage background tasks
```python
class JobQueueService:
    - enqueue_job(job: Job) -> str
    - get_job_status(job_id: str) -> JobStatus
    - cancel_job(job_id: str) -> bool
    - retry_job(job_id: str) -> bool
    - get_job_history(filters: Dict) -> List[Job]
```

#### 1.17 Report Pipeline Service
**Purpose**: Orchestrate the report generation pipeline
```python
class ReportPipelineService:
    - run_pipeline(user_id: int) -> PipelineResult
    - run_retrieval_stage(mandate: CurationMandate) -> List[Article]
    - run_curation_stage(articles: List[Article], mandate: CurationMandate) -> List[Article]
    - run_synthesis_stage(articles: List[Article]) -> Report
    - run_delivery_stage(report: Report, user_id: int) -> bool
```

### Integration Services

#### 1.18 External API Service
**Purpose**: Manage external API integrations
```python
class ExternalAPIService:
    - call_pubmed_api(params: Dict) -> Response
    - call_clinical_trials_api(params: Dict) -> Response
    - call_news_api(params: Dict) -> Response
    - call_patent_api(params: Dict) -> Response
    - handle_rate_limiting(api: str) -> bool
    - cache_response(key: str, response: Response) -> bool
```

#### 1.19 Web Scraping Service
**Purpose**: Extract data from websites
```python
class ScrapingService:
    - scrape_company_website(url: str) -> CompanyData
    - scrape_linkedin_profile(url: str) -> ProfileData
    - scrape_news_article(url: str) -> Article
    - extract_article_content(html: str) -> str
    - detect_changes(url: str) -> List[Change]
```

### Authentication & Authorization Services

#### 1.20 Auth Service
**Purpose**: Handle authentication and authorization
```python
class AuthService:
    - authenticate_user(credentials: Dict) -> Token
    - validate_token(token: str) -> User
    - refresh_token(refresh_token: str) -> Token
    - authorize_action(user: User, action: str, resource: str) -> bool
    - create_user(user_data: Dict) -> User
    - reset_password(email: str) -> bool
```

## 2. Service Dependencies Map

```
┌─────────────────────────────────────────────────────────────┐
│                     User Interface Layer                      │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─────────────────┐  ┌─────────────────┐                  │
│  │   Onboarding    │  │   Dashboard     │                   │
│  │    Service      │  │    Service      │                   │
│  └────────┬────────┘  └────────┬────────┘                  │
│           │                     │                            │
├───────────┼─────────────────────┼────────────────────────────┤
│           ▼                     ▼                            │
│  ┌─────────────────────────────────────────┐                │
│  │       LLM Orchestration Service          │                │
│  └────────┬──────────────────┬──────────────┘               │
│           │                  │                               │
│           ▼                  ▼                               │
│  ┌──────────────┐   ┌──────────────┐                       │
│  │   Research   │   │   Curation   │                        │
│  │   Service    │   │   Service    │                        │
│  └──────┬───────┘   └──────┬───────┘                       │
│         │                   │                                │
├─────────┼───────────────────┼────────────────────────────────┤
│         ▼                   ▼                                │
│  ┌──────────────────────────────────────┐                   │
│  │        Data Storage Services          │                   │
│  │  (User, Reports, Feedback, Analytics) │                   │
│  └───────────────────────────────────────┘                  │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

## 3. Service Priority Levels

### Priority 1 - Core MVP (Weeks 1-4)
Essential for basic functionality:
- Auth Service
- Onboarding Service
- LLM Orchestration Service
- Mandate Generation Service
- User Profile Service
- Report Storage Service

### Priority 2 - Full POC (Weeks 5-8)
Required for complete POC:
- Company Research Service
- Source Management Service
- Content Retrieval Service
- Content Curation Service
- Report Generation Service
- Report Pipeline Service

### Priority 3 - Production Ready (Weeks 9-12)
Enhancement services:
- Scheduling Service
- Feedback Service
- Notification Service
- Analytics Service
- Job Queue Service
- External API Service

### Priority 4 - Future Enhancements
Nice to have:
- Web Scraping Service
- Prompt Management Service
- Advanced Analytics

## 4. Service Implementation Patterns

### Standard Service Structure
```python
from typing import Optional, List, Dict
from pydantic import BaseModel
import logging

logger = logging.getLogger(__name__)

class ServiceNameService:
    """Service description and purpose"""

    def __init__(self,
                 db_session = None,
                 llm_service: Optional[LLMOrchestrationService] = None,
                 config: Optional[Dict] = None):
        self.db = db_session
        self.llm = llm_service
        self.config = config or {}

    async def primary_operation(self, params: Dict) -> Result:
        """Main service operation"""
        try:
            # Validate inputs
            self._validate_params(params)

            # Perform operation
            result = await self._execute_operation(params)

            # Log success
            logger.info(f"Operation completed: {result.id}")

            return result

        except Exception as e:
            logger.error(f"Operation failed: {str(e)}")
            raise

    def _validate_params(self, params: Dict) -> bool:
        """Internal validation logic"""
        pass

    async def _execute_operation(self, params: Dict) -> Any:
        """Internal execution logic"""
        pass
```

### Service Communication Patterns

#### Direct Dependency Injection
```python
class ReportService:
    def __init__(self,
                 curation_service: CurationService,
                 llm_service: LLMOrchestrationService):
        self.curation = curation_service
        self.llm = llm_service
```

#### Event-Based Communication
```python
class EventBus:
    async def publish(self, event: Event):
        # Publish to subscribers

class ReportService:
    async def generate_report(self):
        # Generate report
        await self.event_bus.publish(ReportGeneratedEvent(report_id))
```

#### Service Registry Pattern
```python
class ServiceRegistry:
    services: Dict[str, Any] = {}

    def register(self, name: str, service: Any):
        self.services[name] = service

    def get(self, name: str) -> Any:
        return self.services.get(name)
```

## 5. Data Models Required

### Core Entities
```python
class UserProfile(BaseModel):
    user_id: int
    email: str
    full_name: str
    job_title: str
    company: str
    created_at: datetime

class CompanyProfile(BaseModel):
    profile_id: int
    company_name: str
    therapeutic_areas: List[str]
    pipeline_products: List[Dict]
    competitors: List[str]

class CurationMandate(BaseModel):
    mandate_id: int
    user_id: int
    primary_focus: List[str]
    secondary_interests: List[str]
    exclusions: List[str]

class Report(BaseModel):
    report_id: int
    user_id: int
    generated_at: datetime
    executive_summary: str
    articles: List[Article]
    themes: List[Theme]

class Article(BaseModel):
    article_id: int
    title: str
    url: str
    source: str
    summary: str
    relevance_score: float
    published_date: datetime
```

## 6. Service Testing Strategy

### Unit Testing
```python
# tests/test_mandate_service.py
async def test_generate_mandate():
    service = MandateService(mock_db, mock_llm)
    profile = create_test_profile()

    mandate = await service.generate_mandate(profile)

    assert mandate.primary_focus
    assert len(mandate.exclusions) >= 0
```

### Integration Testing
```python
# tests/integration/test_report_pipeline.py
async def test_full_pipeline():
    # Test complete report generation flow
    pipeline = ReportPipelineService()
    result = await pipeline.run_pipeline(test_user_id)

    assert result.status == "completed"
    assert result.report_id
```

### Service Mocking
```python
class MockLLMService:
    async def generate_summary(self, text: str) -> str:
        return "Mock summary"

    async def score_relevance(self, article, mandate) -> float:
        return 0.85
```

## 7. Configuration Management

### Service Configuration
```yaml
# config/services.yaml
services:
  llm:
    default_model: "gpt-5-mini"
    max_retries: 3
    timeout: 30

  retrieval:
    pubmed:
      rate_limit: 10
      cache_ttl: 3600
    news:
      sources: ["reuters", "bloomberg"]

  report:
    max_articles: 30
    summary_length: 500

  scheduling:
    max_concurrent_jobs: 10
    retry_failed: true
```

### Environment-Specific Settings
```python
# config/environments.py
class DevelopmentConfig:
    DEBUG = True
    LLM_MODEL = "gpt-4.1"  # Cheaper for dev
    CACHE_ENABLED = False

class ProductionConfig:
    DEBUG = False
    LLM_MODEL = "gpt-5"
    CACHE_ENABLED = True
```

## 8. Performance Considerations

### Caching Strategy
- Redis for session data
- PostgreSQL for persistent cache
- In-memory cache for hot data

### Async Operations
- All I/O operations async
- Parallel processing where possible
- Background jobs for heavy operations

### Rate Limiting
- Per-user limits
- API throttling
- Queue management

### Monitoring
- Service health checks
- Performance metrics
- Error tracking
- Usage analytics