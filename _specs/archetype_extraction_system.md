# Study Archetype Extraction System

## Overview

The Study Archetype Extraction System is a two-stage process for extracting structured entity-relationship information from research articles:

1. **Stage 1: Archetype Extraction** - Generates a natural language archetype sentence that captures the core study design
2. **Stage 2: ER Graph Generation** - Converts the archetype into a structured entity-relationship graph (covered separately)

This document focuses exclusively on Stage 1: the archetype extraction methodology.

## Purpose and Philosophy

The archetype extraction system aims to distill complex research studies into concise, canonical sentences that capture the essential structure of the research. These archetypes serve as:

- **Standardized representations** of diverse study designs
- **Intermediate representations** between raw text and structured data
- **Human-readable summaries** that maintain semantic clarity
- **Templates** that can be instantiated with specific study details

## Canonical Archetype Families

The system recognizes six primary study families, each with characteristic archetype patterns:

### 1. Intervention Studies
**Purpose**: Evaluate the effect of treatments or interventions

**Canonical Templates**:
- `Population P was treated for condition C with intervention I to study outcome O`
- `Intervention I was compared to control C in population P to measure outcome O`
- `Population P received intervention I versus comparator C to assess efficacy for outcome O`

**Example Instantiations**:
- "Type 2 diabetic patients were treated for hyperglycemia with metformin to study glycemic control"
- "Cognitive behavioral therapy was compared to standard care in depression patients to measure symptom reduction"
- "Elderly patients received flu vaccine versus placebo to assess efficacy for influenza prevention"

### 2. Observational Studies
**Purpose**: Observe natural relationships without intervention

**Canonical Templates**:
- `Population P with exposure E was observed for outcome O compared to unexposed controls`
- `Population P was followed over time T to identify factors F associated with outcome O`
- `Cases with condition C were compared to controls without C to identify risk factors F`

**Example Instantiations**:
- "Smokers with 20+ pack-year exposure were observed for lung cancer compared to never-smokers"
- "Framingham cohort was followed over 30 years to identify factors associated with cardiovascular disease"
- "Cases with autism spectrum disorder were compared to neurotypical controls to identify genetic risk factors"

### 3. Diagnostic/Screening Studies
**Purpose**: Evaluate test performance for detecting conditions

**Canonical Templates**:
- `Test T was evaluated in population P to diagnose condition C compared to reference standard R`
- `Screening method S was assessed in population P to detect condition C`

**Example Instantiations**:
- "MRI imaging was evaluated in stroke patients to diagnose ischemic lesions compared to CT angiography"
- "PSA screening was assessed in men over 50 to detect prostate cancer"

### 4. Prognostic Studies
**Purpose**: Predict future outcomes based on current factors

**Canonical Templates**:
- `Population P with condition C was followed to identify predictors F of outcome O`
- `Patients with disease D were monitored over time T to determine factors F affecting prognosis P`

**Example Instantiations**:
- "Breast cancer patients were followed to identify predictors of 5-year survival"
- "Heart failure patients were monitored over 2 years to determine factors affecting readmission rates"

### 5. Cross-sectional Studies
**Purpose**: Assess prevalence and associations at a single time point

**Canonical Templates**:
- `Population P was surveyed to measure prevalence of condition C and associations with factors F`
- `Sample S was assessed at timepoint T to examine relationship between exposure E and outcome O`

**Example Instantiations**:
- "US adults were surveyed to measure prevalence of obesity and associations with socioeconomic factors"
- "School children were assessed in Spring 2023 to examine relationship between screen time and academic performance"

### 6. Systematic Reviews/Meta-analyses
**Purpose**: Synthesize evidence across multiple studies

**Canonical Templates**:
- `Studies examining intervention I for condition C were systematically reviewed to assess outcome O`
- `Data from N studies of treatment T versus control C were pooled to evaluate effect on outcome O`

**Example Instantiations**:
- "Studies examining exercise therapy for chronic low back pain were systematically reviewed to assess pain reduction"
- "Data from 15 RCTs of statins versus placebo were pooled to evaluate effect on cardiovascular mortality"

## Archetype Components

Each archetype consists of key semantic roles that map to study elements:

### Core Roles
- **Population (P)**: The subjects being studied (e.g., "elderly patients", "pregnant women")
- **Condition (C)**: The disease or state of interest (e.g., "diabetes", "depression")
- **Intervention (I)**: The treatment or exposure being studied (e.g., "metformin", "exercise therapy")
- **Comparator (C)**: The control or comparison group (e.g., "placebo", "standard care")
- **Outcome (O)**: The measured effect or endpoint (e.g., "mortality", "symptom improvement")

### Additional Roles
- **Exposure (E)**: Non-intervention exposures (e.g., "smoking", "air pollution")
- **Test (T)**: Diagnostic or screening methods (e.g., "MRI", "blood test")
- **Time (T)**: Duration of follow-up (e.g., "5 years", "12 months")
- **Factors (F)**: Variables of interest (e.g., "genetic markers", "lifestyle factors")
- **Reference Standard (R)**: Gold standard for comparison (e.g., "biopsy", "clinical diagnosis")

## Extraction Process

### Input Requirements
- **Article ID**: Unique identifier for tracking
- **Title**: Article title for context
- **Abstract**: Primary source for archetype extraction
- **Full Text** (optional): Additional context if available

### Extraction Instructions

The extraction follows these steps:

1. **Identify Study Type**: Determine which of the six families best fits the research
2. **Extract Key Elements**: Identify the semantic roles (population, intervention, outcome, etc.)
3. **Select Template**: Choose the most appropriate canonical template
4. **Instantiate Template**: Fill the template with specific study details
5. **Validate Completeness**: Ensure all critical roles are represented

### Quality Criteria

A well-formed archetype should be:
- **Complete**: Contains all essential study elements
- **Concise**: One or two sentences maximum
- **Specific**: Uses actual study details, not generic terms
- **Grammatical**: Reads as natural English
- **Canonical**: Follows established template patterns

## Implementation Details

### API Endpoint
```
POST /api/extraction/extract-article-archtype
```

### Request Schema
```json
{
  "article_id": "string",
  "title": "string",
  "abstract": "string",
  "full_text": "string (optional)"
}
```

### Response Schema
```json
{
  "article_id": "string",
  "archetype": "string",
  "study_type": "string (optional)"
}
```

### Study Type Classification
The optional `study_type` field can be one of:
- `Intervention`
- `Observational`
- `Diagnostic/Screening`
- `Prognostic`
- `Cross-sectional`
- `Systematic Review/Meta-analysis`

## Storage and Persistence

Archetypes can be saved to article metadata for reuse:

### Save Archetype
```python
save_article_archetype(group_id, article_id, {
    "archetype": "Layer-type chicks received intracerebroventricular injections...",
    "study_type": "Intervention"
})
```

### Retrieve Archetype
```python
get_article_archetype(group_id, article_id)
# Returns: {"text": "...", "study_type": "...", "updated_at": "..."}
```

## Examples

### Example 1: Complex Intervention Study
**Input Abstract**: "In this randomized controlled trial, we investigated the effects of a Mediterranean diet supplemented with extra-virgin olive oil or nuts on major cardiovascular events in persons at high cardiovascular risk. A total of 7447 persons were randomly assigned to one of three diets: a Mediterranean diet supplemented with extra-virgin olive oil, a Mediterranean diet supplemented with mixed nuts, or a control diet."

**Generated Archetype**: "High cardiovascular risk persons received Mediterranean diet supplemented with olive oil or nuts versus control diet to study major cardiovascular events"

**Study Type**: "Intervention"

### Example 2: Observational Cohort Study
**Input Abstract**: "We prospectively examined the association between sugar-sweetened beverage consumption and risk of coronary heart disease in 88,520 women from the Nurses' Health Study over 24 years of follow-up."

**Generated Archetype**: "Female nurses with varying sugar-sweetened beverage consumption were followed over 24 years to identify associations with coronary heart disease"

**Study Type**: "Observational"

### Example 3: Diagnostic Accuracy Study
**Input Abstract**: "This study evaluated the diagnostic accuracy of high-resolution computed tomography (HRCT) for detecting COVID-19 pneumonia compared to RT-PCR testing in 1014 patients presenting with respiratory symptoms."

**Generated Archetype**: "HRCT was evaluated in symptomatic patients to diagnose COVID-19 pneumonia compared to RT-PCR reference standard"

**Study Type**: "Diagnostic/Screening"

## Benefits of the Archetype System

1. **Standardization**: Diverse study designs are mapped to consistent patterns
2. **Interpretability**: Archetypes are human-readable and semantically clear
3. **Flexibility**: Templates can accommodate various study designs
4. **Efficiency**: Reduces complex abstracts to essential information
5. **Interoperability**: Provides a common language for describing research

## Integration with Downstream Processing

While this document focuses on archetype extraction, these archetypes serve as input for:
- Entity-relationship graph generation
- Study comparison and clustering
- Research synthesis and meta-analysis
- Automated literature review generation

## Future Enhancements

Potential improvements to the archetype system:
- Additional study type templates (e.g., qualitative studies, economic evaluations)
- Multi-language archetype generation
- Confidence scoring for archetype quality
- Automated template learning from examples
- Integration with ontologies for semantic standardization