# Archetype Taxonomy Requirements

## Core Concept: Hierarchical Feature Generation

The archetype system requires a **top-level taxonomy** where each category serves as a generative root for domain-specific subfeatures. The key insight is that subsequent levels are **custom to each branch** - what matters for intervention studies is completely different from what matters for diagnostic studies.

## Why We Need the Top Level

The top-level categories serve as:
1. **Feature Generation Templates**: Each category implies a unique set of extractable subfeatures
2. **Relationship Pattern Indicators**: Each category has characteristic entity relationships  
3. **Search/Filter Contexts**: Users think in terms of "I need intervention studies" or "I need diagnostic accuracy studies"

## Current Top-Level Candidates

From our `_build_archetype_instructions()`, we have six candidates:

### 1. Intervention Studies
**Canonical Patterns**:
- "Population P was treated for condition C with intervention I to study outcome O"
- "Intervention I was compared to control C in population P to measure outcome O"
- "Population P received intervention I versus comparator C to assess efficacy for outcome O"

**Why This Is Its Own Branch**: Intervention studies generate unique subfeatures like:
- Randomization method
- Blinding level  
- Intervention delivery (dose, route, frequency, duration)
- Adherence/compliance metrics
- Control group type (placebo, active control, usual care)
- Allocation concealment

### 2. Observational Studies
**Canonical Patterns**:
- "Population P with exposure E was observed for outcome O compared to unexposed controls"
- "Population P was followed over time T to identify factors F associated with outcome O"
- "Cases with condition C were compared to controls without C to identify risk factors F"

**Why This Is Its Own Branch**: Observational studies generate different subfeatures:
- Exposure measurement (self-report, biomarker, records)
- Confounding control methods
- Selection bias mitigation
- Follow-up duration and loss rates
- Temporal relationship establishment
- Matching/adjustment strategies

### 3. Diagnostic/Screening Studies  
**Canonical Patterns**:
- "Test T was evaluated in population P to diagnose condition C compared to reference standard R"
- "Screening method S was assessed in population P to detect condition C"

**Why This Is Its Own Branch**: Diagnostic studies focus on test performance:
- Sensitivity/specificity
- Positive/negative predictive values
- Likelihood ratios
- ROC curves and AUC
- Reference standard quality
- Spectrum of disease/verification bias
- Cost per diagnosis

### 4. Prognostic Studies
**Canonical Patterns**:
- "Population P with condition C was followed to identify predictors F of outcome O"
- "Patients with disease D were monitored over time T to determine factors F affecting prognosis P"

**Why This Is Its Own Branch**: Prognostic studies emphasize prediction:
- Predictor types (clinical, laboratory, imaging, genetic)
- Model development vs validation
- Discrimination metrics (c-statistic, AUC)
- Calibration assessment
- Risk stratification performance
- Clinical decision rules
- Time-varying effects

### 5. Cross-sectional Studies
**Canonical Patterns**:
- "Population P was surveyed to measure prevalence of condition C and associations with factors F"
- "Sample S was assessed at timepoint T to examine relationship between exposure E and outcome O"

**Why This Is Its Own Branch**: Cross-sectional studies have unique considerations:
- Sampling methodology  
- Prevalence estimates with confidence intervals
- Association measures (OR, PR, correlation)
- Survey instrument validation
- Response rates
- Representativeness
- Temporal ambiguity handling

### 6. Systematic Reviews/Meta-analyses
**Canonical Patterns**:
- "Studies examining intervention I for condition C were systematically reviewed to assess outcome O"
- "Data from N studies of treatment T versus control C were pooled to evaluate effect on outcome O"

**Why This Is Its Own Branch**: Evidence synthesis has specialized features:
- Search strategy comprehensiveness
- Inclusion/exclusion criteria
- Quality assessment methods (risk of bias)
- Heterogeneity measures (I²)
- Effect size estimates (pooled OR, RR, SMD)
- Publication bias assessment
- GRADE certainty ratings

## The Key Principle

Each top-level category is not just a label - it's a **generative framework** that implies:
- What entities to look for
- How those entities relate
- What quality metrics matter
- What biases to assess
- What subfeatures are meaningful to extract

## Illustrative Example: Feature Cascade

**If archetype is classified as "Intervention Study":**
```
Intervention Study
├── Randomization → {randomized, non-randomized, quasi-randomized}
│   └── If randomized → {allocation concealment method}
├── Blinding → {open-label, single-blind, double-blind, triple-blind}
│   └── If blinded → {who was blinded}
├── Intervention Type → {pharmacological, surgical, behavioral, device}
│   └── If pharmacological → {dose, route, frequency, duration}
├── Comparator → {placebo, active control, usual care, none}
│   └── If active control → {specific comparator drug/intervention}
└── Analysis → {intention-to-treat, per-protocol, as-treated}
```

**If archetype is classified as "Diagnostic Study":**
```
Diagnostic Study  
├── Test Type → {imaging, laboratory, clinical exam, composite}
│   └── If imaging → {modality, contrast use, reader experience}
├── Reference Standard → {histopathology, clinical follow-up, composite}
│   └── Quality → {blinded interpretation, complete verification}
├── Population Spectrum → {symptomatic, screening, referral}
│   └── Prevalence → {pre-test probability}
├── Performance Metrics → {sensitivity, specificity, PPV, NPV}
│   └── By subgroup → {disease stage, demographics}
└── Clinical Impact → {change in management, patient outcomes}
```

## Why This Taxonomy Works

1. **Natural Mental Models**: Researchers already think this way - "I need RCTs" or "I need diagnostic accuracy studies"
2. **Distinct Feature Sets**: Each branch generates completely different subfeatures
3. **Clear Boundaries**: Studies clearly fit into one primary category
4. **Established Standards**: Each category has established reporting guidelines (CONSORT, STARD, STROBE, etc.) that inform what features matter