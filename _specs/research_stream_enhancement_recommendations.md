# Research Stream Configuration Enhancement Recommendations

**Date**: 2025-10-02
**Based on**: Analysis of Palatin Mandate 1 and Palatin Mandate 2

## Executive Summary

After analyzing the Palatin mandate documents (examples of how research streams are created outside the application), this document recommends significant enhancements to our current research stream configuration schema. The Palatin mandates reveal a much richer, more structured approach to defining research intelligence needs that goes beyond our current simple field structure.

## Current Research Stream Schema

Our existing `ResearchStream` model contains:
- `stream_name` - Name of the stream
- `description` - Optional text description
- `stream_type` - Enum: competitive, regulatory, clinical, market, scientific, mixed
- `focus_areas` - List of therapeutic areas or topics
- `competitors` - List of companies to monitor
- `report_frequency` - Enum: daily, weekly, biweekly, monthly

## Key Insights from Palatin Mandate 1

Palatin Mandate 1 is significantly more sophisticated and reveals several critical dimensions missing from our current schema:

### 1. **Goal-Oriented Structure**
The mandate explicitly defines the **purpose** and **value proposition** of the research stream:
> "The purpose of the Weekly Scientific Literature Alert is to inform company personnel of the existence of newly published scientific and medical literature that highlights opportunities and risks relevant to Palatin's Scientific Business Goals"

**Current Gap**: We don't capture the business objectives or expected outcomes of a research stream.

### 2. **Business Context Hierarchy**
The mandate establishes a clear hierarchy:
- **Scientific Business Goals** (high-level strategic objectives)
- **Ongoing Research Programs** (specific initiatives with named programs/molecules)
- **Search Keywords** (tactical search terms)

**Current Gap**: Our `focus_areas` field is a flat list without hierarchical business context.

### 3. **Explicit Search Strategy**
The mandate specifies:
- **Data sources** to be searched (PubMed, Google Scholar)
- **Keywords** to use in searches
- **Article selection process** with scoring rubrics

**Current Gap**: We have no fields capturing search methodology or data sources.

### 4. **Scoring and Relevance Criteria**
The mandate defines a sophisticated scoring system:
- Relevance to ongoing research program (1-10 scale)
- Evidence hierarchy score (1-10 scale)
- Integrated score with 50% weighting toward relevance
- Threshold criteria (score > 7 for inclusion)
- Volume guidelines (< 10 articles/week unless exceptional)

**Current Gap**: We have no mechanism for defining relevance criteria or content filtering rules.

### 5. **Molecular Pathway Focus**
The mandate centers on specific molecular mechanisms:
- Melanocortin pathway (MCR1, MCR4)
- Specific drug molecules (bremelanotide, PL7737, PL9643, etc.)
- Disease outcomes related to pathways

**Current Gap**: No structured way to capture molecular targets, pathways, or specific drug programs.

### 6. **Contextual Business Intelligence**
The mandate references supporting materials:
- Corporate presentations
- Company websites
- Historical context (e.g., Vyleesi sale to Cosette)

**Current Gap**: No way to attach context documents or track why certain areas matter to the business.

### 7. **Feedback and Iteration**
> "Perhaps develop some type of feedback mechanism that can be used to evaluate and tweak the algorithm"

**Current Gap**: No feedback loop or learning mechanism.

## Palatin Mandate 2 Insights

While shorter, Mandate 2 reveals additional dimensions:
- Multi-pathway monitoring (melanocortin **and** natriuretic pathways)
- FDA-approved drug monitoring (bremelanotide)
- Specific receptor subtypes (natriuretic peptide C pathway)
- Disease state connections (fibrosis, inflammation, ulcerative colitis, etc.)

## Recommended Schema Enhancements

### Phase 1: Essential Additions (High Priority)

#### 1. Add Purpose/Objective Fields
```python
class ResearchStream(BaseModel):
    # ... existing fields ...

    # NEW: Purpose and business context
    purpose: Optional[str] = None  # Why this stream exists
    business_goals: Optional[List[str]] = None  # Strategic objectives
    expected_outcomes: Optional[str] = None  # What decisions this will inform
```

#### 2. Add Hierarchical Program Structure
```python
class ResearchProgram(BaseModel):
    """Structured representation of an ongoing research initiative"""
    program_name: str
    program_type: str  # e.g., "Drug Development", "Pathway Research"
    molecules: Optional[List[str]] = None  # e.g., ["PL7737", "bremelanotide"]
    target_pathways: Optional[List[str]] = None  # e.g., ["melanocortin", "MCR4"]
    indications: Optional[List[str]] = None  # e.g., ["obesity", "dry eye disease"]
    stage: Optional[str] = None  # e.g., "preclinical", "phase 2", "approved"
    priority: Optional[int] = None  # 1-10 scale

class ResearchStream(BaseModel):
    # ... existing fields ...

    # NEW: Structured programs
    research_programs: Optional[List[ResearchProgram]] = None
```

#### 3. Add Search Strategy Configuration
```python
class SearchStrategy(BaseModel):
    """Configuration for how to search and filter content"""
    data_sources: List[str] = ["pubmed", "google_scholar"]  # Which sources to search
    keywords: Optional[List[str]] = None  # Explicit search terms
    exclusion_keywords: Optional[List[str]] = None  # Terms to filter out

class ResearchStream(BaseModel):
    # ... existing fields ...

    # NEW: Search configuration
    search_strategy: Optional[SearchStrategy] = None
```

#### 4. Add Relevance Scoring Configuration
```python
class ScoringConfig(BaseModel):
    """Configuration for content relevance scoring"""
    relevance_weight: float = 0.6  # Weight for relevance score (default 60%)
    evidence_weight: float = 0.4  # Weight for evidence quality (default 40%)
    inclusion_threshold: float = 7.0  # Minimum score for inclusion (1-10 scale)
    max_items_per_report: Optional[int] = 10  # Max items unless exceptional

class ResearchStream(BaseModel):
    # ... existing fields ...

    # NEW: Scoring configuration
    scoring_config: Optional[ScoringConfig] = None
```

### Phase 2: Advanced Enhancements (Medium Priority)

#### 5. Add Molecular Target Taxonomy
```python
class MolecularTarget(BaseModel):
    """Structured molecular pathway/target information"""
    target_type: str  # "pathway", "receptor", "molecule", "gene"
    target_name: str  # e.g., "melanocortin pathway", "MCR4", "bremelanotide"
    aliases: Optional[List[str]] = None  # Alternative names/codes

class ResearchStream(BaseModel):
    # ... existing fields ...

    # NEW: Molecular taxonomy
    molecular_targets: Optional[List[MolecularTarget]] = None
```

#### 6. Add Context Documents
```python
class ContextDocument(BaseModel):
    """Supporting documents that provide business context"""
    doc_type: str  # "corporate_presentation", "website", "strategic_plan"
    doc_name: str
    doc_url: Optional[str] = None
    doc_summary: Optional[str] = None

class ResearchStream(BaseModel):
    # ... existing fields ...

    # NEW: Context materials
    context_documents: Optional[List[ContextDocument]] = None
```

#### 7. Add Feedback Mechanism
```python
class StreamFeedback(BaseModel):
    """User feedback on stream content quality"""
    feedback_id: int
    stream_id: int
    report_id: Optional[int] = None
    article_id: Optional[int] = None
    rating: int  # 1-5 stars
    feedback_type: str  # "relevance", "quality", "timeliness"
    comments: Optional[str] = None
    created_at: datetime

# This would be a separate table/model for tracking feedback over time
```

### Phase 3: Advanced Intelligence Features (Lower Priority)

#### 8. Competitive Intelligence Fields
Since "competitive" is a stream type, we should have richer competitor tracking:

```python
class CompetitorProfile(BaseModel):
    """Detailed competitor tracking"""
    company_name: str
    ticker_symbol: Optional[str] = None
    focus_areas: List[str]  # Their therapeutic areas
    pipeline_molecules: Optional[List[str]] = None  # Known drugs in development
    priority: int  # 1-10 importance for monitoring

class ResearchStream(BaseModel):
    # ... existing fields ...

    # ENHANCED: Replace simple competitors list
    competitor_profiles: Optional[List[CompetitorProfile]] = None
```

#### 9. Evidence Hierarchy Preferences
```python
class EvidencePreferences(BaseModel):
    """Preferences for types of evidence to prioritize"""
    prefer_systematic_reviews: bool = True
    prefer_rcts: bool = True
    prefer_meta_analyses: bool = True
    minimum_study_size: Optional[int] = None
    require_peer_review: bool = True

class ResearchStream(BaseModel):
    # ... existing fields ...

    # NEW: Evidence quality preferences
    evidence_preferences: Optional[EvidencePreferences] = None
```

## Recommended Implementation Approach

### Immediate Changes (Sprint 1)
1. Add `purpose`, `business_goals`, and `expected_outcomes` text fields
2. Implement basic `keywords` list for explicit search terms
3. Add `scoring_config` with simple threshold configuration

### Short-term Changes (Sprint 2-3)
4. Implement `ResearchProgram` nested structure
5. Add `SearchStrategy` configuration
6. Build out `ScoringConfig` with full weighting system

### Medium-term Changes (Sprint 4-6)
7. Add `MolecularTarget` taxonomy
8. Implement `ContextDocument` attachments
9. Build feedback collection mechanism

### Long-term Enhancements (Future)
10. Develop full `CompetitorProfile` system
11. Implement `EvidencePreferences` filtering
12. Build learning/adaptation system based on feedback

## Impact on AI-Guided Stream Creation

These enhancements will significantly improve the AI-guided chat interface:

### Current Flow
1. Stream name → 2. Stream type → 3. Focus areas → 4. Competitors → 5. Frequency

### Enhanced Flow (with Phase 1 additions)
1. **Purpose/Business Goals** - "What decisions will this inform?"
2. **Stream name** - Based on stated purpose
3. **Research Programs** - "What specific initiatives are you tracking?"
   - For each program: molecules, pathways, indications, stage
4. **Stream type** - Inferred from programs or explicitly asked
5. **Focus areas** - Derived from programs or explicitly added
6. **Competitors** - Who else is working in this space?
7. **Search Strategy** - Keywords, sources, filters
8. **Scoring Config** - How to prioritize content
9. **Report Frequency** - How often to generate reports

### Benefits
- **More context** for LLM to make intelligent suggestions
- **Better relevance** through explicit scoring criteria
- **Richer suggestions** based on molecular targets and pathways
- **Clearer purpose** linking intelligence to business decisions
- **Feedback loop** enabling continuous improvement

## Migration Strategy

### Database Migration Approach
```python
# Add new fields as nullable/optional initially
# Existing streams continue working
# New streams can leverage enhanced fields
# Gradual migration of existing streams through edit UI

# Example migration:
ALTER TABLE research_streams
ADD COLUMN purpose TEXT,
ADD COLUMN business_goals JSONB,
ADD COLUMN research_programs JSONB,
ADD COLUMN search_strategy JSONB,
ADD COLUMN scoring_config JSONB;
```

### Backwards Compatibility
- All new fields are optional
- Existing streams continue to function
- UI gracefully handles missing enhanced data
- Edit interface allows adding enhanced data to existing streams

## Conclusion

The Palatin mandates reveal that real-world research stream definitions are significantly more sophisticated than our current schema. By implementing these enhancements—particularly the Phase 1 additions—we can:

1. **Better capture user intent** through purpose and business goals
2. **Provide more relevant content** through structured programs and scoring
3. **Enable smarter AI assistance** through richer context
4. **Build feedback loops** for continuous improvement
5. **Scale to enterprise needs** with hierarchical program structures

The recommended phased approach allows us to deliver value incrementally while maintaining backwards compatibility and minimizing disruption to existing functionality.

## Appendix: Example Enhanced Stream (Palatin-style)

```json
{
  "stream_name": "Palatin Melanocortin Research Intelligence",
  "purpose": "Monitor scientific literature on melanocortin pathways to identify opportunities and risks for Palatin's drug development programs",
  "business_goals": [
    "Inform design of ongoing MCR4 obesity studies",
    "Track competitive landscape in melanocortin space",
    "Identify new indications for melanocortin therapies"
  ],
  "stream_type": "scientific",
  "research_programs": [
    {
      "program_name": "MCR4 Obesity Program",
      "program_type": "Drug Development",
      "molecules": ["PL7737", "bremelanotide"],
      "target_pathways": ["melanocortin", "MCR4"],
      "indications": ["obesity", "binge eating"],
      "stage": "phase 2",
      "priority": 10
    },
    {
      "program_name": "Ocular Disease Program",
      "program_type": "Drug Development",
      "molecules": ["PL9643", "PL9588", "PL9654"],
      "target_pathways": ["MCR agonist"],
      "indications": ["dry eye disease", "glaucoma", "retinal diseases"],
      "stage": "preclinical",
      "priority": 8
    }
  ],
  "search_strategy": {
    "data_sources": ["pubmed", "google_scholar"],
    "keywords": [
      "melanocortin",
      "MCR1",
      "MCR4",
      "female sexual dysfunction",
      "obesity",
      "dry eye disease",
      "glaucoma",
      "retinal disease"
    ]
  },
  "scoring_config": {
    "relevance_weight": 0.6,
    "evidence_weight": 0.4,
    "inclusion_threshold": 7.0,
    "max_items_per_report": 10
  },
  "report_frequency": "weekly",
  "molecular_targets": [
    {
      "target_type": "receptor",
      "target_name": "MCR4",
      "aliases": ["melanocortin-4 receptor", "MC4R"]
    },
    {
      "target_type": "pathway",
      "target_name": "melanocortin pathway",
      "aliases": ["melanocortin system"]
    }
  ]
}
```
