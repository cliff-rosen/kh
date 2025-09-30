# Knowledge Horizon POC - Implementation Plan

## 1. Current State Analysis

### Reusable Components from Existing Codebase

**Backend (FastAPI/Python)**
- Authentication system (JWT-based auth in `/routers/auth.py`)
- Database setup (SQLAlchemy models and migrations)
- API structure with routers
- Session management
- LLM integration patterns (existing in `/routers/llm.py`)
- Search infrastructure (PubMed, Google Scholar integrations)
- Web retrieval services

**Frontend (React/TypeScript/Vite)**
- Authentication context and components
- UI component library (Radix UI, Headless UI, MUI)
- API client utilities
- Theme system (dark/light mode)
- Form handling (react-hook-form)
- Markdown rendering capabilities
- Toast notification system

**Infrastructure**
- Docker/deployment configurations
- Environment variable management
- Logging system
- CORS and middleware setup

## 2. High-Level System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (React)                         │
├─────────────────────────────────────────────────────────────────┤
│  Onboarding Flow │ Dashboard │ Report Viewer │ Settings         │
└──────────────────────────┬──────────────────────────────────────┘
                           │ API
┌──────────────────────────▼──────────────────────────────────────┐
│                      Backend (FastAPI)                           │
├─────────────────────────────────────────────────────────────────┤
│  Auth │ Onboarding │ Research │ Curation │ Reports │ Scheduler │
└──────┬──────────────────┬───────────────┬──────────────────────┘
       │                  │               │
┌──────▼────────┐ ┌───────▼──────┐ ┌─────▼──────────────────────┐
│  PostgreSQL   │ │  LLM Service │ │  External Data Sources     │
│               │ │  (OpenAI/    │ │  - PubMed                  │
│  - Users      │ │   Claude)    │ │  - Clinical Trials         │
│  - Profiles   │ │              │ │  - Industry News           │
│  - Mandates   │ │              │ │  - Company Sites           │
│  - Sources    │ │              │ │  - Patent DBs              │
│  - Reports    │ │              │ │  - Regulatory Sites        │
│  - Feedback   │ │              │ │                            │
└───────────────┘ └──────────────┘ └────────────────────────────┘
```

## 3. Database Schema

### Core Tables

```sql
-- Users (extend existing)
users
  - user_id (PK)
  - email
  - full_name
  - created_at
  - last_login

-- Company Profiles
company_profiles
  - profile_id (PK)
  - user_id (FK)
  - company_name
  - job_title
  - therapeutic_areas (JSON)
  - pipeline_focus (JSON)
  - created_at
  - updated_at

-- Curation Mandates
curation_mandates
  - mandate_id (PK)
  - user_id (FK)
  - primary_focus (JSON)
  - secondary_interests (JSON)
  - competitors (JSON)
  - regulatory_focus (JSON)
  - exclusions (JSON)
  - is_active
  - created_at
  - updated_at

-- Information Sources
information_sources
  - source_id (PK)
  - mandate_id (FK)
  - source_type (journal/news/regulatory/clinical/patent)
  - source_name
  - source_url
  - retrieval_config (JSON)
  - is_active
  - created_at

-- Reports
reports
  - report_id (PK)
  - user_id (FK)
  - mandate_id (FK)
  - report_date
  - executive_summary
  - key_highlights (JSON)
  - thematic_analysis
  - coverage_stats (JSON)
  - is_read
  - created_at

-- Report Articles
report_articles
  - article_id (PK)
  - report_id (FK)
  - source_id (FK)
  - title
  - url
  - publication_date
  - summary
  - relevance_score
  - relevance_rationale
  - theme_tags (JSON)
  - user_feedback (thumbs_up/thumbs_down/null)
  - created_at

-- User Feedback
user_feedback
  - feedback_id (PK)
  - user_id (FK)
  - report_id (FK)
  - article_id (FK, nullable)
  - feedback_type (report/article)
  - feedback_value
  - notes
  - created_at

-- Report Schedules
report_schedules
  - schedule_id (PK)
  - user_id (FK)
  - frequency (daily/weekly/biweekly/monthly)
  - day_of_week
  - time_of_day
  - timezone
  - is_active
  - next_run_at
  - created_at
  - updated_at
```

## 4. API Structure

### Onboarding APIs
```
POST /api/onboarding/start-interview
POST /api/onboarding/submit-message
GET  /api/onboarding/research-profile/{user_id}
POST /api/onboarding/confirm-profile
POST /api/onboarding/generate-mandate
POST /api/onboarding/update-mandate
POST /api/onboarding/confirm-mandate
```

### Source Configuration APIs
```
GET  /api/sources/recommended/{mandate_id}
POST /api/sources/select
PUT  /api/sources/{source_id}/configure
POST /api/sources/test-retrieval
```

### Report APIs
```
POST /api/reports/generate-test
GET  /api/reports/{report_id}
GET  /api/reports/list
POST /api/reports/{report_id}/feedback
GET  /api/reports/{report_id}/articles
POST /api/reports/articles/{article_id}/feedback
```

### Schedule APIs
```
POST /api/schedule/configure
PUT  /api/schedule/{schedule_id}
GET  /api/schedule/{user_id}
POST /api/schedule/{schedule_id}/pause
POST /api/schedule/{schedule_id}/resume
```

## 5. Frontend Routes & Components

### Routes
```
/                         - Landing/redirect
/onboarding              - Onboarding flow container
/onboarding/interview    - AI chat interface
/onboarding/profile      - Profile review
/onboarding/mandate      - Mandate configuration
/onboarding/sources      - Source selection
/onboarding/test-report  - Test report review
/onboarding/schedule     - Schedule setup

/dashboard               - Main dashboard
/reports                 - Report inbox
/reports/:id             - Individual report viewer
/settings                - User settings
/settings/mandate        - Edit mandate
/settings/sources        - Edit sources
/settings/schedule       - Edit schedule
```

### Key Components

**Onboarding Components**
- `OnboardingFlow` - Stepper container
- `AIInterview` - Chat interface for onboarding
- `ProfileReview` - Display and edit research profile
- `MandateBuilder` - Interactive mandate configuration
- `SourceSelector` - Source selection with recommendations
- `TestReportViewer` - Preview of sample report
- `ScheduleConfigurator` - Set report frequency

**Dashboard Components**
- `ReportInbox` - List of reports with filters
- `ReportCard` - Report preview card
- `ReportViewer` - Full report display
- `ArticleCard` - Individual article display
- `FeedbackWidget` - Thumbs up/down interface
- `CoverageStats` - Statistics visualization

## 6. AI Integration Points

### LLM Tasks
1. **Onboarding Interview**
   - Natural language conversation
   - Information extraction from responses
   - Dynamic question generation

2. **Research Profile Building**
   - Web scraping coordination
   - Information synthesis from multiple sources
   - Profile structuring

3. **Mandate Generation**
   - Context analysis
   - Priority extraction
   - Strategic focus identification

4. **Source Selection**
   - Relevance scoring
   - Source quality assessment
   - Coverage optimization

5. **Content Curation**
   - Article relevance scoring
   - Summary generation
   - Theme extraction

6. **Report Synthesis**
   - Executive summary writing
   - Trend identification
   - Cross-article connection finding

### LLM Service Architecture
```python
class LLMService:
    - interview_agent()
    - research_agent()
    - mandate_generator()
    - content_curator()
    - report_synthesizer()
```

## 7. Data Pipeline Architecture

### Retrieval Pipeline
```
1. Schedule Trigger
   ↓
2. Load Active Mandates
   ↓
3. For Each Source:
   - Execute retrieval strategy
   - Apply filters
   - Rank results
   ↓
4. Aggregate Articles
   ↓
5. AI Curation:
   - Relevance scoring
   - Deduplication
   - Theme extraction
   ↓
6. Report Generation:
   - Executive summary
   - Thematic analysis
   - Article summaries
   ↓
7. Store Report
   ↓
8. Send Notification
```

### Background Jobs
- `ReportGenerationJob` - Main pipeline orchestrator
- `SourceRetrievalJob` - Individual source fetching
- `AIProcessingJob` - LLM tasks queue
- `EmailNotificationJob` - Report delivery

## 8. Implementation Phases

### Phase 1: Foundation (Week 1-2)
- [ ] Clean up existing codebase
- [ ] Set up new database schema
- [ ] Create base models and migrations
- [ ] Implement extended auth system
- [ ] Set up LLM service structure
- [ ] Create base UI layout

### Phase 2: Onboarding Flow (Week 3-4)
- [ ] AI interview chat interface
- [ ] Research profile builder
- [ ] Mandate generation system
- [ ] Profile/mandate review UIs
- [ ] Onboarding API endpoints

### Phase 3: Source Configuration (Week 5)
- [ ] Source recommendation engine
- [ ] Retrieval strategy builder
- [ ] Source selection UI
- [ ] Test retrieval functionality

### Phase 4: Report Generation (Week 6-7)
- [ ] Data retrieval pipeline
- [ ] AI curation service
- [ ] Report synthesis
- [ ] Report storage system
- [ ] Test report generation

### Phase 5: Dashboard & Viewer (Week 8-9)
- [ ] Report inbox UI
- [ ] Report viewer component
- [ ] Article interaction features
- [ ] Feedback system
- [ ] Search and filtering

### Phase 6: Scheduling & Automation (Week 10)
- [ ] Schedule configuration
- [ ] Background job system
- [ ] Email notifications
- [ ] Automated pipeline execution

### Phase 7: Refinement & Testing (Week 11-12)
- [ ] End-to-end testing
- [ ] Performance optimization
- [ ] UI/UX refinements
- [ ] Feedback loop implementation
- [ ] Documentation

## 9. Technical Decisions

### Technology Stack
- **Backend**: FastAPI (existing)
- **Database**: PostgreSQL with SQLAlchemy
- **Frontend**: React + TypeScript + Vite (existing)
- **UI Library**: Keep existing (Radix UI, Tailwind)
- **LLM**: OpenAI GPT-4 / Claude (configurable)
- **Job Queue**: Celery with Redis
- **Email**: SendGrid or AWS SES

### Key Libraries to Add
- **Backend**:
  - `celery` - Background jobs
  - `redis` - Job queue
  - `beautifulsoup4` - Web scraping
  - `newspaper3k` - Article extraction
  - `sendgrid` or `boto3` - Email

- **Frontend**:
  - `@tanstack/react-query` - Data fetching
  - `recharts` - Statistics visualization
  - `react-beautiful-dnd` - Drag-drop for sources

## 10. Migration Strategy

### Step 1: Preserve Existing Code
- Create `legacy/` folders in both frontend and backend
- Move non-reusable components there
- Keep for reference during development

### Step 2: Incremental Refactoring
- Start with auth system extension
- Add new models alongside existing
- Build new routes in parallel
- Gradually replace frontend pages

### Step 3: Data Migration
- Design migration scripts for any existing data
- Create seed data for testing
- Set up development fixtures

## 11. Risk Mitigation

### Technical Risks
- **LLM Quality**: Test multiple models, have fallbacks
- **Data Source Access**: Start with public APIs, add scraping carefully
- **Scale**: Design for 10 users initially, architecture for 1000+
- **Performance**: Implement caching, pagination, lazy loading

### Product Risks
- **User Adoption**: Focus on onboarding experience
- **Report Quality**: Iterate based on feedback, A/B test
- **Scheduling Reliability**: Robust job queue, monitoring

## 12. Success Metrics

### POC Success Criteria
- 5-10 executives successfully onboarded
- 80%+ satisfaction with report relevance
- <15 minute onboarding time
- 90%+ report delivery reliability
- Positive feedback on selective transparency

### Technical Metrics
- API response time <500ms
- Report generation <5 minutes
- 99% uptime for critical paths
- Zero data loss

## Next Steps

1. Review and approve this plan
2. Set up development environment
3. Create project board with tasks
4. Begin Phase 1 implementation
5. Set up weekly progress reviews