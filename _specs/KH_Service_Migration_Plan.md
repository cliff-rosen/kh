# Knowledge Horizon Service Migration Plan

## Executive Summary

This document compares the required Knowledge Horizon services with existing services in the codebase and provides a detailed migration strategy to transform the current system into the KH POC.

## 1. Service Comparison Matrix

| Required KH Service | Existing Service | Reusability | Action Required |
|-------------------|-----------------|-------------|-----------------|
| **Core Business Services** |
| OnboardingService | chat_service.py | Partial | Extend for structured onboarding |
| CompanyResearchService | - | None | Build new |
| MandateService | - | None | Build new |
| SourceService | search_providers/* | High | Adapt and extend |
| RetrievalService | pubmed_service.py, google_scholar_service.py, web_retrieval_service.py | High | Consolidate and extend |
| CurationService | smart_search_service.py (partial) | Medium | Extract and refactor |
| ReportService | article_group_service.py (partial) | Low | Build new with some reuse |
| SchedulingService | - | None | Build new |
| FeedbackService | - | None | Build new |
| NotificationService | login_email_service.py | Partial | Extend for reports |
| **AI/LLM Services** |
| LLMOrchestrationService | llm/* + base_prompt_caller.py | Very High | Reorganize and extend |
| PromptService | agents/prompts/* | High | Formalize management |
| **Data Services** |
| UserProfileService | auth_service.py (partial) | Medium | Extend significantly |
| ReportStorageService | - | None | Build new |
| AnalyticsService | event_tracking.py | Medium | Extend for KH metrics |
| **Background Services** |
| JobQueueService | - | None | Build new (Celery) |
| ReportPipelineService | hop_service.py (workflow concepts) | Low | Build new, learn from existing |
| **Integration Services** |
| ExternalAPIService | Distributed across services | High | Consolidate |
| ScrapingService | web_retrieval_service.py | Medium | Enhance |
| **Auth Services** |
| AuthService | auth_service.py | Very High | Keep as-is |

## 2. Existing Services Analysis

### 2.1 Highly Reusable Services

#### Authentication System (`auth_service.py`)
- **Current**: Full JWT auth with user management
- **Reuse**: 95% - Works perfectly for KH
- **Changes**: Add role-based access for POC users

#### LLM Infrastructure (`llm/*`, `base_prompt_caller.py`)
- **Current**: Sophisticated multi-provider LLM system
- **Reuse**: 90% - Core infrastructure perfect
- **Changes**: Add KH-specific prompt callers

#### Search Providers (`search_providers/*`)
- **Current**: Modular search with PubMed, Scholar adapters
- **Reuse**: 85% - Architecture is excellent
- **Changes**: Add more sources (clinical trials, news, patents)

#### Retrieval Services (`pubmed_service.py`, `google_scholar_service.py`)
- **Current**: Robust API integrations with error handling
- **Reuse**: 80% - Core logic solid
- **Changes**: Unify under single RetrievalService

### 2.2 Partially Reusable Services

#### Smart Search Service (`smart_search_service.py`)
- **Current**: 86KB of sophisticated search logic
- **Extract**: Evidence extraction, keyword optimization, discriminator
- **Repurpose for**: Article relevance scoring, content filtering

#### Chat Service (`chat_service.py`)
- **Current**: Basic chat functionality
- **Extend for**: Onboarding conversations
- **Add**: Structured data extraction, conversation flow

#### Article Group Services (`article_group_service.py`)
- **Current**: Article grouping and management
- **Repurpose for**: Report organization, theme extraction
- **Add**: Executive summary generation

#### Event Tracking (`event_tracking.py`)
- **Current**: Basic event logging
- **Extend for**: KH analytics, usage metrics
- **Add**: Report engagement, source effectiveness

### 2.3 Services to Build from Scratch

#### Company Research Service
- No existing equivalent
- Requires: Web scraping, API calls, data synthesis
- Priority: High (Week 2-3)

#### Mandate Generation Service
- No existing equivalent
- Requires: LLM integration, profile analysis
- Priority: High (Week 3)

#### Report Generation Service
- Minimal existing support
- Requires: Synthesis, formatting, storage
- Priority: High (Week 4-5)

#### Scheduling Service
- No existing infrastructure
- Requires: Celery, Redis, cron-like scheduling
- Priority: Medium (Week 6)

## 3. Migration Strategy

### Phase 1: Foundation (Week 1-2)
**Keep As-Is:**
- All authentication (`auth_service.py`)
- LLM infrastructure (`llm/*`, `base_prompt_caller.py`)
- Database models and migrations

**Quick Wins:**
1. Create `services/kh/` directory for new services
2. Set up service base classes
3. Configure dependency injection

**Action Items:**
```python
# backend/services/kh/__init__.py
from .onboarding import OnboardingService
from .research import CompanyResearchService
from .mandate import MandateService
# ... etc
```

### Phase 2: Service Consolidation (Week 2-3)

#### Consolidate Retrieval Services
**Current State**: Separate files for each source
```
pubmed_service.py
google_scholar_service.py
web_retrieval_service.py
```

**Target State**: Unified retrieval service
```python
# backend/services/kh/retrieval.py
class RetrievalService:
    def __init__(self):
        self.pubmed = PubMedAdapter()
        self.scholar = ScholarAdapter()
        self.web = WebRetrievalAdapter()
        self.clinical_trials = ClinicalTrialsAdapter()  # New
        self.news = NewsAPIAdapter()  # New

    async def fetch_all_sources(self, query: Query) -> List[Article]:
        results = await asyncio.gather(
            self.pubmed.search(query),
            self.scholar.search(query),
            self.clinical_trials.search(query),
            self.news.search(query)
        )
        return self.merge_results(results)
```

#### Extract Curation Logic
**From**: `smart_search_service.py`
**To**: `services/kh/curation.py`

```python
# Extract these components:
- discriminator logic → relevance_scorer
- feature extraction → article_analyzer
- keyword optimization → query_optimizer
```

### Phase 3: Build New Services (Week 3-5)

#### Priority Order:
1. **OnboardingService** (Week 3)
   - Extend chat_service.py
   - Add conversation flow management
   - Integrate with LLM for extraction

2. **CompanyResearchService** (Week 3)
   - New service
   - Use web_retrieval_service as base
   - Add LinkedIn, company website scraping

3. **MandateService** (Week 4)
   - New service
   - Heavy LLM integration
   - Profile analysis logic

4. **ReportService** (Week 4-5)
   - New service
   - Reuse article grouping concepts
   - Add synthesis and formatting

### Phase 4: Infrastructure Services (Week 6-7)

#### Add Background Job Processing
```bash
pip install celery redis celery-beat
```

```python
# backend/services/kh/jobs.py
from celery import Celery

app = Celery('kh_jobs')

@app.task
def generate_scheduled_report(user_id: int):
    pipeline = ReportPipelineService()
    return pipeline.run(user_id)
```

#### Add Scheduling
```python
# backend/services/kh/scheduling.py
from celery.schedules import crontab

class SchedulingService:
    def create_schedule(self, user_id: int, config: ScheduleConfig):
        schedule = {
            'task': 'generate_report',
            'schedule': crontab(
                hour=config.hour,
                minute=config.minute,
                day_of_week=config.day_of_week
            ),
            'args': [user_id]
        }
        return self.scheduler.add_periodic_task(schedule)
```

## 4. Service Refactoring Plan

### 4.1 Directory Structure
```
backend/
├── services/
│   ├── kh/                    # New KH services
│   │   ├── __init__.py
│   │   ├── onboarding.py
│   │   ├── research.py
│   │   ├── mandate.py
│   │   ├── sources.py
│   │   ├── retrieval.py
│   │   ├── curation.py
│   │   ├── reports.py
│   │   ├── scheduling.py
│   │   ├── feedback.py
│   │   └── pipeline.py
│   ├── legacy/                # Move old services here
│   │   ├── smart_search_service.py
│   │   ├── hop_service.py
│   │   └── article_group_service.py
│   ├── shared/                # Shared services
│   │   ├── auth_service.py
│   │   ├── llm/
│   │   ├── search_providers/
│   │   └── event_tracking.py
```

### 4.2 Dependency Management

#### Service Registry Pattern
```python
# backend/services/kh/registry.py
class ServiceRegistry:
    _instance = None
    _services = {}

    def __new__(cls):
        if not cls._instance:
            cls._instance = super().__new__(cls)
        return cls._instance

    def register(self, name: str, service: Any):
        self._services[name] = service

    def get(self, name: str) -> Any:
        return self._services.get(name)

# Usage in main.py
registry = ServiceRegistry()
registry.register('llm', LLMOrchestrationService())
registry.register('retrieval', RetrievalService())
registry.register('curation', CurationService())
```

### 4.3 Configuration Migration

#### Current Configuration
```python
# config/settings.py
class Settings:
    OPENAI_API_KEY: str
    DATABASE_URL: str
    # ... existing settings
```

#### Extended Configuration
```python
# config/kh_settings.py
class KHSettings(Settings):
    # Onboarding
    ONBOARDING_TIMEOUT: int = 1800  # 30 minutes
    ONBOARDING_MAX_TURNS: int = 20

    # Research
    RESEARCH_SOURCES: List[str] = ["linkedin", "crunchbase", "company_website"]
    RESEARCH_TIMEOUT: int = 60

    # Curation
    RELEVANCE_THRESHOLD: float = 0.7
    MAX_ARTICLES_PER_REPORT: int = 30

    # Scheduling
    REPORT_GENERATION_ENABLED: bool = True
    MAX_CONCURRENT_REPORTS: int = 5

    # Models
    ONBOARDING_MODEL: str = "gpt-5-mini"
    RESEARCH_MODEL: str = "gpt-5"
    CURATION_MODEL: str = "gpt-4.1"
    SYNTHESIS_MODEL: str = "gpt-5"
```

## 5. Testing During Migration

### 5.1 Service Integration Tests
```python
# tests/test_kh_services.py
async def test_service_communication():
    """Test that KH services can communicate"""
    onboarding = OnboardingService()
    research = CompanyResearchService()
    mandate = MandateService()

    # Test onboarding → research flow
    profile = await onboarding.extract_profile(test_conversation)
    company_data = await research.research_company(profile.company)
    mandate_result = await mandate.generate(profile, company_data)

    assert mandate_result.primary_focus
```

### 5.2 Legacy Compatibility Tests
```python
async def test_legacy_service_still_works():
    """Ensure legacy services remain functional"""
    from services.shared.auth_service import AuthService

    auth = AuthService()
    token = await auth.create_token(test_user)
    assert token
```

## 6. Data Migration Requirements

### 6.1 New Tables Needed
```sql
-- Add to existing database
CREATE TABLE company_profiles (...);
CREATE TABLE curation_mandates (...);
CREATE TABLE information_sources (...);
CREATE TABLE reports (...);
CREATE TABLE report_articles (...);
CREATE TABLE report_schedules (...);
CREATE TABLE user_feedback (...);
```

### 6.2 Model Extensions
```python
# Extend existing User model
class User(Base):
    # ... existing fields

    # Add KH relationships
    company_profile = relationship("CompanyProfile", back_populates="user")
    mandates = relationship("CurationMandate", back_populates="user")
    reports = relationship("Report", back_populates="user")
    schedule = relationship("ReportSchedule", back_populates="user")
```

## 7. Risk Mitigation

### 7.1 Parallel Development
- Keep existing services operational
- Develop KH services in isolation
- Use feature flags for gradual rollout

### 7.2 Rollback Strategy
```python
# Feature flag implementation
if settings.USE_KH_SERVICES:
    from services.kh import OnboardingService
    service = OnboardingService()
else:
    from services.legacy import ChatService
    service = ChatService()
```

### 7.3 Performance Monitoring
```python
# Add metrics to new services
from services.shared.event_tracking import track_event

class OnboardingService:
    async def conduct_interview(self, messages):
        start_time = time.time()

        result = await self._process_interview(messages)

        track_event({
            'service': 'onboarding',
            'operation': 'interview',
            'duration': time.time() - start_time,
            'success': True
        })

        return result
```

## 8. Timeline Summary

| Week | Focus | Services | Status |
|------|-------|----------|--------|
| 1-2 | Foundation | Auth, LLM, Base Classes | Reuse existing |
| 3 | Onboarding | OnboardingService, CompanyResearchService | Build new |
| 4 | Core Logic | MandateService, CurationService | Build new |
| 5 | Reports | ReportService, RetrievalService consolidation | Build/Refactor |
| 6 | Background | SchedulingService, JobQueueService | Build new |
| 7 | Polish | FeedbackService, NotificationService | Build new |
| 8+ | Testing | All services | Integration |

## 9. Success Metrics

### Migration Success Criteria
- [ ] All existing auth continues working
- [ ] LLM infrastructure successfully extended
- [ ] Search providers integrated into unified service
- [ ] New KH services communicate effectively
- [ ] Background jobs process reliably
- [ ] Test coverage > 80% for new services
- [ ] Performance benchmarks met (< 3s response times)
- [ ] Zero downtime during migration

## 10. Next Steps

### Immediate Actions (Day 1)
1. Create `backend/services/kh/` directory
2. Set up service base classes
3. Create service registry
4. Write first integration test

### Week 1 Deliverables
1. OnboardingService skeleton
2. CompanyResearchService skeleton
3. Unified RetrievalService
4. Extended configuration

### Critical Path
1. LLM integration (already done ✓)
2. Onboarding flow (Week 3)
3. Report generation (Week 5)
4. Scheduling (Week 6)

This migration plan ensures we maximize reuse of the excellent existing infrastructure while building the new Knowledge Horizon functionality in a clean, maintainable way.