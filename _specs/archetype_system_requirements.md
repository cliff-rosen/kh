# Archetype System Requirements

## Purpose Statement

Build a system that transforms research abstracts into canonical archetype representations that:
1. Enable rapid understanding of study structure ("grokking")
2. Power semantic search and filtering via structured roles
3. Generate meaningful subfeatures based on study patterns

## Core Requirements

### 1. Rapid Comprehension ("Grokking")
- **Requirement**: A researcher should understand a study's core structure in <5 seconds
- **Solution**: Canonical sentence patterns that highlight key relationships
- **Example**: Instead of reading a 300-word abstract, see:
  - "Elderly diabetic patients were treated for hyperglycemia with metformin to study glycemic control"
  - Instantly know: who (elderly diabetics), what (metformin), why (hyperglycemia), outcome (glycemic control)

### 2. Semantic Search/Filter Capabilities
- **Requirement**: Enable precise queries on study components
- **Solution**: Structured extraction of semantic roles from archetypes
- **Query Examples**:
  - "Find all studies where [POPULATION = elderly] received [INTERVENTION = any] for [CONDITION = diabetes]"
  - "Show studies comparing [INTERVENTION = drug therapy] vs [COMPARATOR = placebo]"
  - "Filter to studies with [OUTCOME = mortality] in [POPULATION = cancer patients]"

### 3. Feature Generation Hierarchy
- **Requirement**: Study categorization should naturally suggest extractable subfeatures
- **Solution**: Design study types that are "generative" - each type implies specific features to extract
- **Example**: 
  - If study type = "Intervention" → Extract: randomization, blinding, dose, duration, adherence
  - If study type = "Diagnostic" → Extract: sensitivity, specificity, PPV, NPV, reference standard

## Design Constraints

### Must Handle All Study Types
- Common: RCTs, cohorts, case-control, cross-sectional
- Less common: Case reports, case series, mechanistic studies
- Meta-research: Systematic reviews, meta-analyses
- Emerging: Real-world evidence, pragmatic trials

### Relationship Patterns Must Be Explicit
The archetype must clearly express:
- What acts on what (intervention → outcome)
- What is compared to what (exposed vs unexposed)
- What predicts what (risk factors → disease)
- What is associated with what (correlation studies)

### Attributes Must Be Preserved
- "Elderly diabetic patients" must preserve both "elderly" and "diabetic" as attributes of "patients"
- "High-dose intravenous metformin" must preserve "high-dose" and "intravenous" as attributes
- These attributes enable refined search/filtering

## Technical Requirements

### Archetype Structure
```json
{
  "archetype": "Natural language canonical sentence",
  "study_type": "Category that implies feature set",
  "structured": {
    "entities": {
      "role_name": {
        "core": "main entity",
        "attributes": ["modifier1", "modifier2"]
      }
    },
    "relationships": [
      ["entity1_role", "relationship_type", "entity2_role"]
    ]
  }
}
```

### Study Type Selection Criteria
A good study type taxonomy should:
1. **Be Generative**: Each type naturally suggests 5-15 extractable subfeatures
2. **Be Distinctive**: Different types have different relationship patterns
3. **Be Complete**: Every possible study fits into exactly one type
4. **Be Actionable**: Type determines what extraction rules to apply

### Semantic Roles
Core roles that appear across study types:
- **population**: Who/what is being studied
- **condition**: Disease/state of interest  
- **intervention**: Treatment/exposure applied
- **comparator**: Control/comparison group
- **outcome**: What is measured
- **predictor**: Variables used for prediction
- **test**: Diagnostic method evaluated
- **time**: Duration/follow-up period

## Success Metrics

### 1. Comprehension Speed
- Measure: Time to understand study design from archetype vs abstract
- Target: <5 seconds for archetype vs 30-60 seconds for abstract

### 2. Search Precision
- Measure: Relevance of results when querying by semantic roles
- Target: >90% precision when filtering by specific population/intervention/outcome

### 3. Feature Extraction Coverage
- Measure: % of relevant subfeatures successfully extracted based on study type
- Target: >80% of type-specific features extracted accurately

### 4. User Satisfaction
- Measure: Researcher rating of archetype usefulness
- Target: >4/5 rating for "helps me quickly understand studies"

## Open Questions

1. **Granularity**: How detailed should archetypes be?
   - Too simple: Loses important nuance
   - Too complex: Defeats rapid comprehension goal

2. **Multiple Patterns**: What if a study fits multiple patterns?
   - Example: RCT with nested case-control analysis
   - Solution: Primary vs secondary archetypes?

3. **Evolution**: How do we handle new study designs?
   - New trial designs emerge regularly
   - Need extensible system

4. **Confidence**: Should we score archetype quality/confidence?
   - Some abstracts are vague or poorly written
   - May need "uncertain" markers

## Next Steps

1. **Define Study Type Taxonomy**: Based on generative power for features
2. **Create Relationship Ontology**: Standardize relationship types between entities  
3. **Build Extraction Rules**: Type-specific patterns for identifying subfeatures
4. **Design Evaluation Framework**: Test comprehension, search, and extraction performance