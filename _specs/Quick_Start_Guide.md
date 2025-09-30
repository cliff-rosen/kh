# Knowledge Horizon POC - Quick Start Guide

## Immediate Actions to Begin Transformation

### 1. Database Schema Setup

Create new migration file:
```bash
cd backend
alembic revision -m "Add Knowledge Horizon tables"
```

Key tables to add:
- company_profiles
- curation_mandates
- information_sources
- reports
- report_articles
- report_schedules
- user_feedback

### 2. Backend API Structure

Create new routers in `backend/routers/`:
- `onboarding.py` - Handles AI interview and profile building
- `mandate.py` - Manages curation mandates
- `sources.py` - Information source configuration
- `reports.py` - Report generation and viewing
- `schedule.py` - Report scheduling

### 3. Frontend Routes Setup

Update `frontend/src/App.tsx` to add:
```tsx
// New imports
import OnboardingFlow from './pages/Onboarding';
import Dashboard from './pages/Dashboard';
import Reports from './pages/Reports';
import ReportViewer from './pages/ReportViewer';

// Add routes
<Route path="/onboarding" element={<OnboardingFlow />} />
<Route path="/dashboard" element={<Dashboard />} />
<Route path="/reports" element={<Reports />} />
<Route path="/reports/:id" element={<ReportViewer />} />
```

### 4. Create Core Service Classes

`backend/services/`:
- `llm_service.py` - Centralized LLM interactions
- `research_service.py` - Company/user research
- `curation_service.py` - Content curation logic
- `report_service.py` - Report generation
- `retrieval_service.py` - Source data fetching

### 5. Set Up Onboarding Flow Components

`frontend/src/pages/Onboarding/`:
- `index.tsx` - Main container with stepper
- `Interview.tsx` - Chat interface
- `ProfileReview.tsx` - Research results
- `MandateBuilder.tsx` - Focus configuration
- `SourceSelector.tsx` - Source selection
- `TestReport.tsx` - Sample report
- `Schedule.tsx` - Delivery setup

### 6. Configure Background Jobs

Install Celery and Redis:
```bash
pip install celery redis
```

Create `backend/tasks.py`:
```python
from celery import Celery

app = Celery('kh_tasks')
app.config_from_object('config.celery_config')

@app.task
def generate_report(user_id, mandate_id):
    # Report generation logic
    pass

@app.task
def fetch_source_data(source_id):
    # Data retrieval logic
    pass
```

### 7. Update Environment Variables

Add to `.env`:
```
# LLM Configuration
OPENAI_API_KEY=your-key
ANTHROPIC_API_KEY=your-key

# Email Service
SENDGRID_API_KEY=your-key

# Redis for Celery
REDIS_URL=redis://localhost:6379

# Scheduling
REPORT_GENERATION_ENABLED=true
```

### 8. Create Initial UI Components

Key components to build first:
- `ChatInterface` - Reusable chat UI for onboarding
- `ReportCard` - Display report summaries
- `ArticleCard` - Show individual articles
- `FeedbackButtons` - Thumbs up/down
- `OnboardingProgress` - Step indicator

### 9. Repurpose Existing Features

Transform existing features:
- Smart Search → Source recommendation engine
- Article Chat → Report synthesis explainer
- PubMed/Scholar search → Retrieval strategies
- Workbench → Admin dashboard for monitoring

### 10. Clean Up Navigation

Update `frontend/src/components/TopBar.tsx`:
- Remove old menu items (Lab, Smart Search, etc.)
- Add new items (Dashboard, Reports, Settings)
- Update branding to "Knowledge Horizon"

## Development Workflow

### Day 1-2: Foundation
1. Update database schema
2. Create basic models
3. Set up new route structure
4. Clean navigation

### Day 3-5: Onboarding Backend
1. Create onboarding router
2. Implement LLM interview logic
3. Build research service
4. Generate test mandates

### Day 6-8: Onboarding Frontend
1. Build chat interface
2. Create profile review
3. Design mandate builder
4. Implement source selector

### Day 9-11: Report Generation
1. Create retrieval pipeline
2. Implement curation logic
3. Build report synthesis
4. Design report storage

### Day 12-14: Dashboard & Viewer
1. Create report inbox
2. Build report viewer
3. Add feedback system
4. Implement filtering

### Day 15-16: Scheduling
1. Set up Celery tasks
2. Configure schedules
3. Add email notifications
4. Test automation

### Day 17-20: Testing & Polish
1. End-to-end testing
2. UI refinements
3. Performance optimization
4. Documentation

## Testing the Transformation

### Quick Validation Tests
1. Can create a user profile through chat?
2. Does mandate generation work?
3. Can retrieve articles from sources?
4. Does report generation complete?
5. Can view and interact with reports?

### Sample Test Data
Create `backend/scripts/seed_kh_data.py`:
```python
# Seed test users
# Create sample mandates
# Generate test reports
# Add sample feedback
```

## Important Files to Modify First

1. `backend/models.py` - Add new KH models
2. `backend/main.py` - Register new routers
3. `frontend/src/App.tsx` - Update routes
4. `frontend/src/components/TopBar.tsx` - Update navigation
5. `backend/config/__init__.py` - Add KH configuration

## Keeping Existing Functionality

While transforming, keep these working:
- Authentication system
- User management
- API infrastructure
- UI component library
- Database connections

## Gradual Migration Path

Week 1: Parallel development
- Keep existing features working
- Build KH features alongside

Week 2: Feature parity
- Ensure KH covers core use cases
- Begin hiding old features

Week 3: Full transition
- Make KH the default
- Archive old code
- Update documentation

## Commands to Run

```bash
# Backend setup
cd backend
pip install -r requirements.txt
alembic upgrade head
python seed_kh_data.py

# Frontend setup
cd frontend
npm install
npm run dev

# Start services
# Terminal 1: Backend
cd backend
uvicorn main:app --reload

# Terminal 2: Frontend
cd frontend
npm run dev

# Terminal 3: Celery (for background jobs)
cd backend
celery -A tasks worker --loglevel=info

# Terminal 4: Celery Beat (for scheduling)
cd backend
celery -A tasks beat --loglevel=info
```

## Success Checkpoints

- [ ] Onboarding flow works end-to-end
- [ ] Can generate a test report
- [ ] Report displays correctly
- [ ] Feedback saves to database
- [ ] Schedule creates recurring jobs
- [ ] Email notifications sent
- [ ] Dashboard shows all reports
- [ ] Search and filtering work
- [ ] Performance acceptable (<3s load)
- [ ] Mobile responsive

This guide provides a practical roadmap to begin transforming the codebase immediately!