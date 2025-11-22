# Concept Proposal Specification

## Overview

This document specifies how to generate **concepts** from a **semantic space** for research article retrieval. A concept is a searchable entity-relationship pattern that retrieves articles covering specific topics.

---

## 1. Data Model

### 1.1 Semantic Space Components

A semantic space consists of:

#### **Topics**
Research areas the user cares about.

```typescript
{
  topic_id: "t1",
  name: "Mesothelioma early detection",
  description: "Methods and biomarkers for detecting mesothelioma at early stages",
  importance: "critical",
  rationale: "Early detection significantly improves survival rates"
}
```

#### **Entities**
Named things in the domain (diseases, substances, methods, etc.)

```typescript
{
  entity_id: "e1",
  entity_type: "disease",
  name: "Mesothelioma",
  canonical_forms: ["mesothelioma", "malignant mesothelioma", "pleural mesothelioma"],
  context: "Primary disease of interest"
}

{
  entity_id: "e2",
  entity_type: "biomarker",
  name: "Mesothelin",
  canonical_forms: ["mesothelin", "MSLN", "soluble mesothelin"],
  context: "Potential early detection biomarker"
}
```

#### **Relationships** (optional)
Explicit relationships between entities or topics.

```typescript
{
  relationship_id: "r1",
  type: "methodological",
  subject: "e2", // mesothelin
  object: "e1",  // mesothelioma
  description: "Mesothelin can be measured to detect mesothelioma",
  strength: "strong"
}
```

---

## 2. What is a Concept?

### 2.1 Definition

A **concept** is a searchable pattern consisting of:
1. **Entity Pattern**: A list of 1-3 entities that appear together
2. **Relationship Pattern**: How those entities relate (optional but recommended)
3. **Covered Topics**: Which topic(s) this pattern retrieves articles for
4. **Vocabulary Terms**: Synonyms/variants for each entity (for query expansion)

### 2.2 Schema

```typescript
{
  concept_id: "c1",
  name: "Mesothelin-based mesothelioma detection",

  // Core pattern
  entity_pattern: ["e2", "e1"],  // [mesothelin, mesothelioma]
  relationship_pattern: "detects",

  // Coverage
  covered_topics: ["t1"],  // covers "Mesothelioma early detection"

  // Vocabulary expansion
  vocabulary_terms: {
    "e2": ["mesothelin", "MSLN", "soluble mesothelin"],
    "e1": ["mesothelioma", "malignant mesothelioma"]
  },

  rationale: "This pattern retrieves articles about using mesothelin as a biomarker for detecting mesothelioma, directly addressing early detection methods."
}
```

---

## 3. Framework Principles

### 3.1 Single Inclusion Pattern

❌ **WRONG** - Multiple OR'd patterns:
```
(lung cancer AND screening) OR (lung cancer AND diagnosis) OR (lung cancer AND biomarkers)
```

✅ **RIGHT** - Single focused pattern per concept:
```
Concept 1: lung cancer AND screening
Concept 2: lung cancer AND biomarkers
```

**Rationale**: Separate concepts allow independent volume control, query refinement, and filtering.

### 3.2 Vocabulary Expansion Within Entities

Synonyms expand **within** each entity using OR clauses, not across the pattern.

✅ **Correct expansion**:
```
(mesothelioma OR "malignant mesothelioma" OR "pleural mesothelioma")
AND
(mesothelin OR MSLN OR "soluble mesothelin")
```

❌ **Wrong** - expanding across entities:
```
mesothelioma OR mesothelin OR asbestos OR biomarker
```

### 3.3 Many-to-Many Coverage

**One concept can cover multiple topics:**
```typescript
{
  concept_id: "c1",
  entity_pattern: ["asbestos", "mesothelioma"],
  relationship_pattern: "causes",
  covered_topics: ["t1", "t3", "t5"],  // covers multiple related topics
  rationale: "Asbestos exposure as a causal factor is relevant to etiology, risk factors, and prevention"
}
```

**One topic can be covered by multiple concepts:**
```typescript
// Topic: "Mesothelioma early detection"
// Can be covered by:
Concept 1: [mesothelin, mesothelioma] - detects
Concept 2: [fibulin-3, mesothelioma] - detects
Concept 3: [CT imaging, mesothelioma] - detects
```

### 3.4 Volume-Driven Design

Target: **10-1000 articles per week** per concept.
- Too narrow (< 10/week): Combine with related concepts
- Too broad (> 1000/week): Split into more specific concepts

### 3.5 Minimal Exclusions

Default to **no exclusions**. Only add if absolutely necessary:
```typescript
exclusions: ["in vitro", "animal model"],  // Only if user explicitly needs clinical-only
exclusion_rationale: "User only interested in human clinical studies"
```

---

## 4. Relationship Between Components

### 4.1 The Hierarchy

```
Semantic Space
├── Topics (what we care about finding)
│   └── t1: Mesothelioma early detection
│   └── t2: Asbestos exposure risks
│   └── t3: Treatment options
│
├── Entities (what we search for)
│   └── e1: Mesothelioma
│   └── e2: Mesothelin
│   └── e3: Asbestos
│   └── e4: Chemotherapy
│
└── Relationships (how entities relate)
    └── r1: mesothelin -> detects -> mesothelioma
    └── r2: asbestos -> causes -> mesothelioma
    └── r3: chemotherapy -> treats -> mesothelioma

Concepts (search patterns that retrieve articles about topics)
├── c1: [mesothelin, mesothelioma] "detects" → covers t1
├── c2: [asbestos, mesothelioma] "causes" → covers t2
└── c3: [chemotherapy, mesothelioma] "treats" → covers t3
```

### 4.2 From Semantic Space to Concepts: The Process

#### Step 1: Identify entities relevant to each topic
```
Topic t1 (Early detection):
- Relevant entities: mesothelin (e2), mesothelioma (e1), biomarker screening, CT scan

Topic t2 (Asbestos risks):
- Relevant entities: asbestos (e3), mesothelioma (e1), occupational exposure
```

#### Step 2: Identify relationship patterns
```
For t1 (Early detection):
- Pattern: [biomarker] DETECTS [disease]
- Instances: mesothelin detects mesothelioma, fibulin-3 detects mesothelioma

For t2 (Risks):
- Pattern: [substance] CAUSES [disease]
- Instances: asbestos causes mesothelioma
```

#### Step 3: Create concepts
```typescript
[
  {
    concept_id: "c1",
    name: "Mesothelin-based detection",
    entity_pattern: ["e2", "e1"],  // mesothelin, mesothelioma
    relationship_pattern: "detects",
    covered_topics: ["t1"],
    rationale: "Mesothelin is a key biomarker for early mesothelioma detection"
  },
  {
    concept_id: "c2",
    name: "Asbestos-mesothelioma causation",
    entity_pattern: ["e3", "e1"],  // asbestos, mesothelioma
    relationship_pattern: "causes",
    covered_topics: ["t2"],
    rationale: "Asbestos exposure is the primary causal factor for mesothelioma"
  }
]
```

---

## 5. Complete Examples

### Example 1: Cancer Biomarker Research

**Semantic Space:**
```typescript
topics: [
  {
    topic_id: "t1",
    name: "Lung cancer early detection",
    description: "Biomarkers and screening methods for early-stage lung cancer",
    importance: "critical"
  },
  {
    topic_id: "t2",
    name: "Lung cancer treatment response",
    description: "Predicting and monitoring treatment efficacy",
    importance: "important"
  }
],
entities: [
  { entity_id: "e1", type: "disease", name: "Lung cancer", canonical_forms: ["lung cancer", "NSCLC", "small cell lung cancer"] },
  { entity_id: "e2", type: "biomarker", name: "Circulating tumor DNA", canonical_forms: ["ctDNA", "circulating tumor DNA", "cell-free DNA"] },
  { entity_id: "e3", type: "methodology", name: "Liquid biopsy", canonical_forms: ["liquid biopsy", "blood biopsy", "plasma testing"] },
  { entity_id: "e4", type: "drug", name: "Immunotherapy", canonical_forms: ["immunotherapy", "checkpoint inhibitor", "PD-1 inhibitor"] }
]
```

**Generated Concepts:**
```typescript
[
  {
    concept_id: "c1",
    name: "ctDNA-based lung cancer screening",
    entity_pattern: ["e2", "e1", "e3"],  // ctDNA, lung cancer, liquid biopsy
    relationship_pattern: "detects via",
    covered_topics: ["t1"],
    vocabulary_terms: {
      "e2": ["ctDNA", "circulating tumor DNA", "cell-free DNA"],
      "e1": ["lung cancer", "NSCLC"],
      "e3": ["liquid biopsy", "blood biopsy"]
    },
    rationale: "This pattern captures articles about detecting lung cancer through ctDNA analysis via liquid biopsy methods, directly addressing early detection topic."
  },
  {
    concept_id: "c2",
    name: "ctDNA immunotherapy response monitoring",
    entity_pattern: ["e2", "e4", "e1"],  // ctDNA, immunotherapy, lung cancer
    relationship_pattern: "monitors",
    covered_topics: ["t2"],
    vocabulary_terms: {
      "e2": ["ctDNA", "circulating tumor DNA"],
      "e4": ["immunotherapy", "checkpoint inhibitor", "PD-1 inhibitor"],
      "e1": ["lung cancer", "NSCLC"]
    },
    rationale: "This pattern retrieves articles about using ctDNA to monitor immunotherapy response in lung cancer patients."
  }
]
```

**Query Translation (PubMed):**
```
Concept c1:
(ctDNA OR "circulating tumor DNA" OR "cell-free DNA")
AND
(lung cancer OR NSCLC)
AND
("liquid biopsy" OR "blood biopsy")

Concept c2:
(ctDNA OR "circulating tumor DNA")
AND
(immunotherapy OR "checkpoint inhibitor" OR "PD-1 inhibitor")
AND
(lung cancer OR NSCLC)
```

---

### Example 2: Environmental Health

**Semantic Space:**
```typescript
topics: [
  {
    topic_id: "t1",
    name: "Microplastic health effects",
    description: "Impact of microplastic exposure on human health",
    importance: "critical"
  },
  {
    topic_id: "t2",
    name: "Microplastic detection methods",
    description: "Analytical techniques for measuring microplastics in biological samples",
    importance: "important"
  }
],
entities: [
  { entity_id: "e1", type: "substance", name: "Microplastics", canonical_forms: ["microplastics", "microplastic particles", "plastic microparticles"] },
  { entity_id: "e2", type: "population", name: "Human exposure", canonical_forms: ["human exposure", "human ingestion", "dietary exposure"] },
  { entity_id: "e3", type: "biomarker", name: "Inflammatory markers", canonical_forms: ["inflammatory markers", "cytokines", "inflammation"] },
  { entity_id: "e4", type: "methodology", name: "Mass spectrometry", canonical_forms: ["mass spectrometry", "LC-MS", "MS analysis"] }
]
```

**Generated Concepts:**
```typescript
[
  {
    concept_id: "c1",
    name: "Microplastic exposure and inflammation",
    entity_pattern: ["e1", "e2", "e3"],  // microplastics, human exposure, inflammatory markers
    relationship_pattern: "induces",
    covered_topics: ["t1"],
    vocabulary_terms: {
      "e1": ["microplastics", "microplastic particles"],
      "e2": ["human exposure", "human ingestion", "dietary exposure"],
      "e3": ["inflammatory markers", "cytokines", "inflammation"]
    },
    rationale: "Captures health impact studies examining inflammatory responses to microplastic exposure in humans."
  },
  {
    concept_id: "c2",
    name: "Microplastic detection in biological samples",
    entity_pattern: ["e1", "e4"],  // microplastics, mass spectrometry
    relationship_pattern: "detected by",
    covered_topics: ["t2"],
    vocabulary_terms: {
      "e1": ["microplastics", "plastic microparticles"],
      "e4": ["mass spectrometry", "LC-MS", "MS analysis"]
    },
    rationale: "Covers analytical methods for measuring microplastics in tissue/blood samples using mass spec."
  }
]
```

---

### Example 3: Many-to-Many Coverage

**Scenario:** A topic can be covered by multiple concepts with different entity patterns.

**Semantic Space:**
```typescript
topics: [
  {
    topic_id: "t1",
    name: "Alzheimer's disease prevention",
    description: "Interventions and factors that may prevent or delay Alzheimer's",
    importance: "critical"
  }
],
entities: [
  { entity_id: "e1", type: "disease", name: "Alzheimer's disease", canonical_forms: ["Alzheimer's", "Alzheimer's disease", "AD"] },
  { entity_id: "e2", type: "therapy", name: "Physical exercise", canonical_forms: ["physical exercise", "aerobic exercise", "physical activity"] },
  { entity_id: "e3", type: "substance", name: "Mediterranean diet", canonical_forms: ["Mediterranean diet", "MIND diet"] },
  { entity_id: "e4", type: "drug", name: "Statins", canonical_forms: ["statins", "statin therapy", "HMG-CoA reductase inhibitors"] },
  { entity_id: "e5", type: "population", name: "Cognitive reserve", canonical_forms: ["cognitive reserve", "education", "mental stimulation"] }
]
```

**Generated Concepts (Multiple patterns for ONE topic):**
```typescript
[
  {
    concept_id: "c1",
    name: "Exercise-based Alzheimer's prevention",
    entity_pattern: ["e2", "e1"],
    relationship_pattern: "prevents",
    covered_topics: ["t1"],
    rationale: "Physical exercise as a preventive intervention for Alzheimer's"
  },
  {
    concept_id: "c2",
    name: "Dietary prevention of Alzheimer's",
    entity_pattern: ["e3", "e1"],
    relationship_pattern: "prevents",
    covered_topics: ["t1"],
    rationale: "Mediterranean/MIND diet as preventive approach"
  },
  {
    concept_id: "c3",
    name: "Statin-based Alzheimer's prevention",
    entity_pattern: ["e4", "e1"],
    relationship_pattern: "prevents",
    covered_topics: ["t1"],
    rationale: "Statin therapy as potential preventive treatment"
  },
  {
    concept_id: "c4",
    name: "Cognitive reserve and Alzheimer's risk",
    entity_pattern: ["e5", "e1"],
    relationship_pattern: "protects against",
    covered_topics: ["t1"],
    rationale: "Education and mental stimulation building protective cognitive reserve"
  }
]
```

**Why separate concepts?**
- Each has different literature volume
- Each may need different filters or query refinement
- Each represents a distinct intervention type
- User may want to track/categorize them separately

---

## 6. Anti-Patterns (What NOT to Do)

### ❌ Anti-Pattern 1: Multiple OR'd Patterns

**WRONG:**
```typescript
{
  name: "Lung cancer detection and treatment",
  entity_pattern: ["lung cancer"],
  relationship_pattern: "screening OR treatment OR biomarkers OR diagnosis",
  // This is actually 4+ different concepts crammed together
}
```

**RIGHT:**
```typescript
[
  {
    name: "Lung cancer screening",
    entity_pattern: ["lung cancer", "screening"],
    relationship_pattern: "screened with"
  },
  {
    name: "Lung cancer treatment",
    entity_pattern: ["lung cancer", "chemotherapy"],
    relationship_pattern: "treated with"
  }
]
```

### ❌ Anti-Pattern 2: Entities Not in Semantic Space

**WRONG:**
```typescript
{
  entity_pattern: ["covid-19", "vaccine"],  // "covid-19" not in semantic space entities!
  // LLM hallucinated these entities
}
```

**RIGHT:**
```typescript
{
  entity_pattern: ["e5", "e12"],  // Use actual entity_ids from semantic space
  vocabulary_terms: {
    "e5": ["SARS-CoV-2", "COVID-19"],  // Get terms from entity.canonical_forms
    "e12": ["vaccine", "vaccination", "immunization"]
  }
}
```

### ❌ Anti-Pattern 3: Topics Not Covered

**WRONG:**
```typescript
// Semantic space has topics t1, t2, t3
// Concepts only cover t1 and t2
// Topic t3 is orphaned!
```

**RIGHT:**
Every topic must be covered by at least one concept.

### ❌ Anti-Pattern 4: Vague Relationship Patterns

**WRONG:**
```typescript
{
  relationship_pattern: "related to"  // Too vague!
}
```

**RIGHT:**
```typescript
{
  relationship_pattern: "detects"  // Specific action
}
// or
{
  relationship_pattern: "causes"
}
// or
{
  relationship_pattern: "treats"
}
```

---

## 7. Concept Generation Process (LLM Task)

### Phase 1: Analysis

**Input:** Semantic space with topics, entities, relationships

**Output:**
```typescript
{
  key_entities: ["e1", "e2", "e5", "e7"],  // Most relevant entities
  relationship_patterns: [
    "e2 detects e1",
    "e3 causes e1",
    "e7 treats e1"
  ],
  entity_groupings: {
    "detection": ["e2", "e8"],  // Entities involved in detection
    "causation": ["e3", "e4"],  // Causal factors
    "treatment": ["e7", "e9"]   // Treatment entities
  }
}
```

### Phase 2-3: Concept Creation

For each topic or cluster of related topics:

1. **Identify core pattern**: What entities + relationship captures this topic?
2. **Check coverage**: Does this pattern retrieve articles about the topic?
3. **Create concept**:
   ```typescript
   {
     concept_id: "c{n}",
     name: "{Clear descriptive name}",
     entity_pattern: ["{entity_id1}", "{entity_id2}", ...],  // 1-3 entities
     relationship_pattern: "{specific relationship}",
     covered_topics: ["{topic_id1}", ...],
     vocabulary_terms: { /* from entity.canonical_forms */ },
     rationale: "{Why this pattern covers these topics}"
   }
   ```

### Guidelines

- **3-7 concepts total** (balance coverage vs. manageability)
- **Every topic must be covered** by at least one concept
- **Use actual entity_ids** from the semantic space
- **Be specific** about relationships (avoid "related to")
- **Provide clear rationale** explaining coverage

---

## 8. Validation

### Coverage Check

```typescript
covered_topics = union of all concept.covered_topics
all_topics = semantic_space.topics.map(t => t.topic_id)

✅ is_complete = (covered_topics ⊇ all_topics)
```

### Entity Validation

```typescript
for each concept:
  for each entity_id in concept.entity_pattern:
    ✅ entity_id must exist in semantic_space.entities
```

### Topic Validation

```typescript
for each concept:
  for each topic_id in concept.covered_topics:
    ✅ topic_id must exist in semantic_space.topics
```

---

## 9. Expected Output Format

```json
{
  "phase1_analysis": {
    "key_entities": ["e1", "e2", "e3"],
    "relationship_patterns": [
      "e2 detects e1",
      "e3 causes e1"
    ],
    "entity_groupings": {
      "biomarkers": ["e2", "e5"],
      "risk_factors": ["e3", "e4"]
    }
  },
  "concepts": [
    {
      "concept_id": "c1",
      "name": "Biomarker-based disease detection",
      "entity_pattern": ["e2", "e1"],
      "relationship_pattern": "detects",
      "covered_topics": ["t1", "t2"],
      "rationale": "This pattern retrieves articles about using biomarker e2 to detect disease e1, covering both early detection (t1) and diagnostic methods (t2)."
    }
  ],
  "overall_reasoning": "Created 4 concepts covering all 6 topics with clear entity-relationship patterns. Each concept focuses on a specific searchable pattern to enable targeted retrieval and volume control."
}
```

---

## Summary

**A Concept is:**
- A searchable **entity-relationship pattern**
- Maps to **1+ topics** (many-to-many)
- Has **vocabulary expansion** per entity (OR clauses)
- Generates a **single focused query** (not multiple OR'd patterns)
- Enables **independent volume control** and refinement

**The Process:**
1. Analyze semantic space → extract entities, relationships
2. For each topic → identify entity-relationship pattern(s)
3. Create concepts → with clear rationale for coverage
4. Validate → all topics covered, all entities exist

**Key Insight:**
Concepts are the **bridge** between what we care about (topics) and what we search for (entity patterns). They translate domain knowledge into executable search strategies.
