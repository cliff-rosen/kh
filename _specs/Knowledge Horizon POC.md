# Knowledge Horizon: Proof of Concept Specification

## Overview

Knowledge Horizon is an AI-powered horizon scanning application for executives who need to stay current on industry developments. The system intelligently onboards users, automatically configures personalized information pipelines, and delivers synthesized periodic reports.

**Core Philosophy:** Selective transparency and control - users can operate on autopilot or engage at any checkpoint to provide guidance.

---

## POC Scope & Goals

### What We're Building

A functional end-to-end system demonstrating:
1. AI-driven onboarding that requires minimal user input
2. Automated research, profiling, and mandate generation
3. Intelligent source selection and retrieval strategy configuration
4. Test run validation with sample report
5. Scheduled report delivery and web-based report inbox
6. Basic feedback mechanisms

### What We're Validating

- **Can AI effectively understand user context from minimal input?**
- **Can automated curation match manual setup quality?**
- **Will executives find synthesized reports valuable?**
- **Does selective transparency resonate with users?**

### Target Users for POC

5-10 pharma/biotech executives responsible for:
- Drug development strategy
- Competitive intelligence
- Scientific and regulatory monitoring

---

## System Flow

```
AI Interview → Automated Research → Mandate Generation → 
Source Selection → Retrieval Strategy → Test Run → 
Schedule Setup → Report Delivery → User Feedback
```

---

## Detailed Specifications

### 1. AI-Enabled Interview

**Interface:** Conversational chat (web-based)

**Information Collected:**
- Full name
- Job title/position  
- Company name
- (Optional) Additional priorities user wants to specify

**User Experience:**
- Natural language interaction, not a form
- 2-3 minutes to complete
- System adapts questions based on responses

**Transparency Options:**
- **Autopilot:** Minimal questions, system handles the rest
- **Guided:** User can add specific context (competitors, therapeutic areas, concerns)

---

### 2. Automated Research & Profile Building

**Data Sources:**
- Company website and press releases
- LinkedIn profiles
- Industry databases (pipeline, clinical trials)
- Recent news coverage
- SEC filings (if applicable)
- Patent databases

**Output:** Structured profile including:
- Company focus areas (therapeutic areas, pipeline stage, key products)
- User's role and strategic responsibilities
- Competitive landscape
- Recent company developments

**User Review:**
- System presents: "Here's what I learned - is this accurate?"
- Options: Approve / Edit details / Add missing information
- 2-3 minutes for review

**Privacy:** Clear statement that only public information is accessed

---

### 3. Curation Mandate Generation

**What It Is:** A structured document describing what information to prioritize

**Mandate Components:**
- Primary focus areas (topics, therapeutic areas, technologies)
- Secondary interests
- Competitive intelligence targets
- Regulatory focus areas
- Scientific domains
- Explicit exclusions

**Example:**
```
Primary Focus: Novel immunotherapy for solid tumors (lung cancer, melanoma). 
Track CAR-T, bispecific antibodies, checkpoint inhibitor combinations.

Regulatory: FDA oncology guidance, breakthrough designations, accelerated 
approval pathways.

Competitive: Monitor Competitor A Phase III trials, Competitor B partnerships, 
emerging immuno-oncology biotechs.
```

**Transparency Options:**
- **Autopilot:** AI generates, shows summary
- **Guided:** User reviews and edits full mandate
- **Custom:** User collaborates with AI to write mandate

**Duration:** Instant generation + 3-5 minutes review

---

### 4. Source Identification

**AI selects 15-30 optimal sources across:**
- Scientific journals (specialty journals relevant to mandate)
- Preprint servers (bioRxiv, medRxiv)
- Regulatory sites (FDA, EMA, health authorities)
- Clinical trial databases (ClinicalTrials.gov)
- Industry publications (FierceBiotech, Endpoints News, BioPharma Dive)
- Company news and press releases
- Conference proceedings (ASCO, ASH, etc.)

**Selection Criteria:**
- Relevance to mandate
- Update frequency
- Content credibility
- Accessibility

**Transparency Options:**
- **Autopilot:** System selects automatically
- **Guided:** User sees proposed sources with rationale, can modify
- **Custom:** User adds/removes specific sources

---

### 5. Retrieval Strategy Configuration

**For each source, system develops:**
- **Search queries:** Keywords, Boolean operators, domain-specific terms
- **Filters:** Date ranges, article types, relevance thresholds
- **Ranking logic:** Priority rules (e.g., Phase 3 > Phase 2, high-impact journals)
- **Update frequency:** How often to check source

**Example:**
```
Source: ClinicalTrials.gov
Query: ("immunotherapy" OR "CAR-T") AND ("lung cancer" OR "melanoma") 
       AND Phase="Phase 2|Phase 3"
Filter: Updated in last [timeframe]
Ranking: Phase 3 prioritized, enrollment > 100 patients preferred
Check frequency: Daily
```

**Transparency Options:**
- **Autopilot:** System configures everything
- **Guided:** User sees high-level strategy summary
- **Custom:** User can modify queries, filters, ranking per source

---

### 6. Test Run & Sample Report

**Process:**
- System runs on previous week's data (or user-selected timeframe)
- Full pipeline execution: retrieve, filter, rank, synthesize
- Generate sample report

**Report Structure:**

1. **Executive Summary** (2-3 paragraphs)
   - High-level overview of key developments
   
2. **Key Highlights** (5-7 bullets)
   - Most important findings at a glance
   
3. **Thematic Analysis**
   - AI synthesis of trends and patterns
   - Cross-article connections
   
4. **Curated Articles** (15-30 items)
   - Title and source (clickable)
   - Publication date
   - 2-3 sentence description
   - Relevance rationale
   - Organization: By theme/priority/source type
   
5. **Coverage Statistics**
   - Sources checked
   - Articles reviewed
   - Articles selected (with reasoning)

**User Review & Iteration:**
"Here's what your report would look like. What do you think?"

**Options:**
- ✓ Approve and proceed to scheduling
- ↻ Iterate: Adjust mandate, refine sources, tighten filters
- 🔍 View filtered articles (see what was excluded and why)
- 📊 Adjust report organization

**Key Feature:** Users can iterate multiple times until satisfied

---

### 7. Schedule Configuration

**User sets:**
- Frequency (daily, weekly, bi-weekly, monthly)
- Delivery day/time ("Every Monday at 8:00 AM")
- Time zone (auto-detected, confirmable)

**Options:**
- Pause for vacation
- Skip next report
- Modify schedule anytime

**Duration:** 1-2 minutes

---

### Total Setup Time
- **Autopilot Mode:** 10-15 minutes
- **Guided Mode:** 20-30 minutes
- **Custom Mode:** 30-45 minutes

---

## Ongoing Operations

### Report Delivery

**Email:**
- Subject: "Your Knowledge Horizon Report - [Date]"
- Brief preview with top 2-3 highlights
- Primary CTA: "View Full Report" (links to dashboard)
- Lightweight, mobile-friendly

**Rationale for link vs. full email:**
- Better reading experience
- Advanced features (search, save, share)
- Track engagement
- Reduce email bloat

---

### Web Dashboard: Report Inbox

**Main View:**
- Chronological list of all reports
- Each showing: date, preview, unread status, article count
- Search and filter capabilities

**Sidebar:**
- Date range filters
- Topic/theme filters  
- Archived reports
- Settings

**Actions:**
- Mark read/unread
- Archive
- Search across reports
- Download as PDF
- Share with colleagues

---

### Individual Report View

**Layout:**

**Header:**
- Report title and date range
- Executive summary (expandable)
- Key highlights
- Quick actions: Share, Download, Archive, Provide Feedback

**Content Area:**
- Filter/sort articles (theme, priority, source, date)
- Toggle list view vs. thematic view
- Search within report

**Article Cards:**
- Title (links to original source)
- Source and publication date
- AI-generated summary
- Relevance tags
- User actions:
  - ⭐ Mark important (save to favorites)
  - 👎 Mark not relevant (trains system)
  - 📝 Add private notes
  - 🔗 Share with colleague

**Footer:**
- Coverage statistics
- "Was this helpful?" feedback
- "Adjust preferences" link

**Drill-Down:**
- Related articles from past reports
- All articles from this source
- All articles on this topic/company
- User's saved articles

---

## Learning & Feedback Loop

### Implicit Signals (Tracked Automatically)
- Article clicks
- Time spent on articles
- Articles marked important
- Articles marked not relevant
- Topics/sources consistently ignored
- Search queries within reports

### Explicit Feedback
- Thumbs up/down on articles
- Report helpfulness rating
- Specific feedback: "Too broad," "Missing X," "Too much Y"

### System Response
- Adjusts rankings weekly based on engagement
- Suggests mandate refinements monthly
- Offers quarterly "recalibration checkpoint"
- Always explains proposed changes
- User can accept, modify, or reject any optimization

---

## Key Assumptions & Constraints

### Assumptions
- Users will provide honest information during onboarding
- Public data sources provide sufficient coverage
- AI can accurately infer priorities from limited input
- Weekly cadence is appropriate for most users
- Web dashboard is acceptable (vs. full email reports)

### Constraints for POC
- Single industry focus (pharma/biotech)
- English language only
- Web-only (no mobile apps)
- Limited source types (industry news + select journals)
- No team/collaboration features
- No advanced analytics/visualizations
- Basic security (not enterprise-grade)

### Out of Scope for POC
- Multi-language support
- Mobile apps
- API access
- Enterprise integrations
- Advanced collaboration features
- Custom branding
- Multiple report schedules per user