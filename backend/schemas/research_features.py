"""
Canonical Research Article Feature Extraction Schema

This module defines the unified schema for extracting research features from academic articles,
regardless of source (PubMed, Google Scholar, etc.).
"""

from pydantic import BaseModel, Field
from typing import Literal, Optional
from enum import Enum


class PoIRelevance(str, Enum):
    """Pathway of Interest relevance (melanocortin, natriuretic pathways)"""
    YES = "yes"
    NO = "no"


class DoIRelevance(str, Enum):
    """Disease of Interest relevance (dry eye, ulcerative colitis, crohn's disease, retinopathy, retinal disease)"""
    YES = "yes" 
    NO = "no"


class IsSystematic(str, Enum):
    """Whether this is a systematic study"""
    YES = "yes"
    NO = "no"


class StudyType(str, Enum):
    """Type of study conducted"""
    HUMAN_RCT = "human RCT"
    HUMAN_NON_RCT = "human non-RCT"
    NON_HUMAN_LIFE_SCIENCE = "non-human life science"
    NON_LIFE_SCIENCE = "non life science"
    NOT_A_STUDY = "not a study"


class StudyOutcome(str, Enum):
    """Primary outcome focus of the study"""
    EFFECTIVENESS = "effectiveness"
    SAFETY = "safety"
    DIAGNOSTICS = "diagnostics"
    BIOMARKER = "biomarker"
    OTHER = "other"


class ResearchArticleFeatures(BaseModel):
    """Extracted features from a research article"""
    poi_relevance: PoIRelevance = Field(..., description="Pathway of Interest relevance")
    doi_relevance: DoIRelevance = Field(..., description="Disease of Interest relevance")
    is_systematic: IsSystematic = Field(..., description="Whether this is a systematic study")
    study_type: StudyType = Field(..., description="Type of study conducted")
    study_outcome: StudyOutcome = Field(..., description="Primary outcome focus")
    confidence_score: float = Field(..., ge=0.0, le=1.0, description="Extraction confidence (0-1)")
    extraction_notes: Optional[str] = Field(None, description="Additional extraction notes")
    relevance_score: int = Field(default=0, ge=0, le=10, description="Calculated relevance score (0-10)")


# Canonical schema for the extract tool
RESEARCH_FEATURES_SCHEMA = {
    "type": "object",
    "properties": {
        "poi_relevance": {
            "type": "string", 
            "enum": ["yes", "no"],
            "description": "Pathway of Interest relevance (melanocortin, natriuretic pathways)"
        },
        "doi_relevance": {
            "type": "string", 
            "enum": ["yes", "no"],
            "description": "Disease of Interest relevance (dry eye, ulcerative colitis, crohn's disease, retinopathy, retinal disease)"
        },
        "is_systematic": {
            "type": "string",
            "enum": ["yes", "no"], 
            "description": "Whether this is a systematic study"
        },
        "study_type": {
            "type": "string",
            "enum": ["human RCT", "human non-RCT", "non-human life science", "non life science", "not a study"],
            "description": "Type of study conducted"
        },
        "study_outcome": {
            "type": "string",
            "enum": ["effectiveness", "safety", "diagnostics", "biomarker", "other"],
            "description": "Primary outcome focus of the study"
        },
        "confidence_score": {
            "type": "number",
            "minimum": 0.0,
            "maximum": 1.0,
            "description": "Confidence in feature extraction (0-1)"
        },
        "extraction_notes": {
            "type": "string",
            "description": "Additional notes about the extraction"
        }
    },
    "required": ["poi_relevance", "doi_relevance", "is_systematic", "study_type", "study_outcome", "confidence_score"]
}

# Canonical extraction instructions for the LLM
RESEARCH_FEATURES_EXTRACTION_INSTRUCTIONS = """
You are analyzing an academic research article to extract specific research features.

FEATURE DEFINITIONS:

1. **PoI Relevance** (Pathway of Interest): 
   - Does this article relate to melanocortin or natriuretic pathways?
   - Melanocortin keywords: melanocortin receptor, MC1R, MC2R, MC3R, MC4R, MC5R, ACTH, α-MSH, β-MSH, γ-MSH, melanocyte, pigmentation, appetite regulation
   - Natriuretic keywords: natriuretic peptide, ANP, BNP, CNP, NPR-A, NPR-B, NPR-C, guanylate cyclase, cardiac function
   - Answer: "yes" or "no"

2. **DoI Relevance** (Disease of Interest):
   - Does this article relate to dry eye, ulcerative colitis, crohn's disease, retinopathy, or retinal disease?
   - Dry eye keywords: dry eye syndrome, keratoconjunctivitis sicca, tear film
   - IBD keywords: inflammatory bowel disease, IBD, ulcerative colitis, Crohn's disease, colitis
   - Retinal keywords: retinopathy, retinal disease, diabetic retinopathy, macular degeneration, retinal degeneration
   - Answer: "yes" or "no"

3. **Is Systematic**:
   - Is this a systematic study? Look for: randomized controlled clinical trials (RCTs), clinical trials, epidemiological studies, cohort studies, case-control studies, open label trials, case reports
   - Systematic reviews and meta-analyses should also be marked as "yes"
   - Basic science, in vitro, and animal studies can also be systematic if they follow rigorous methodology
   - Answer: "yes" or "no"

4. **Study Type**:
   - "human RCT": randomized controlled clinical trials with humans
   - "human non-RCT": human studies that are not RCTs (observational, cohort, case-control, case series, etc.)
   - "non-human life science": animal studies, in vitro studies, cell culture, molecular biology
   - "non life science": non-biological research (rarely in biomedical databases)
   - "not a study": reviews (non-systematic), editorials, opinions, commentaries, theoretical papers

5. **Study Outcome**:
   - "effectiveness": testing if a treatment/intervention works or is effective
   - "safety": testing safety, adverse events, toxicity, side effects
   - "diagnostics": developing or testing diagnostic methods, biomarkers for diagnosis
   - "biomarker": identifying or validating biomarkers (non-diagnostic), prognostic markers
   - "other": basic science mechanisms, pathophysiology, epidemiology, other outcomes

6. **Confidence Score**: 
   - Rate your confidence in this extraction from 0.0 (very uncertain) to 1.0 (very certain)
   - Consider factors like: clarity of abstract, completeness of information, presence of methods section

7. **Extraction Notes**: 
   - Brief explanation of your reasoning, especially for borderline cases
   - Note any relevant details about the specific pathways or diseases mentioned

ANALYSIS APPROACH:
- Focus on the abstract, title, and available metadata
- Look for explicit mentions of the pathways and diseases of interest
- For study type, identify the primary research methodology
- Be conservative with "yes" answers for PoI/DoI - only mark if clearly related
- Consider the primary focus of the paper when determining relevance
"""


def calculate_relevance_score(features: dict) -> int:
    """
    Calculate relevance score for research articles based on extracted features.
    
    Args:
        features: Dictionary containing extracted features
        
    Returns:
        Relevance score (0-10)
    """
    score = 0
    
    # Pathway of Interest relevance (0-3 points)
    if features.get("poi_relevance", "").lower() == "yes":
        score += 3
    
    # Disease of Interest relevance (0-3 points)
    if features.get("doi_relevance", "").lower() == "yes":
        score += 3
    
    # Study type quality (0-2 points)
    study_type = features.get("study_type", "").lower()
    if study_type == "human rct":
        score += 2
    elif study_type == "human non-rct":
        score += 1.5
    elif study_type == "non-human life science":
        score += 1
    elif study_type == "not a study":
        # Systematic reviews can still be valuable
        if features.get("is_systematic", "").lower() == "yes":
            score += 1.5
        else:
            score += 0.5
    
    # Systematic study bonus (0-1 point)
    if features.get("is_systematic", "").lower() == "yes":
        score += 1
    
    # Study outcome relevance (0-1 point)
    study_outcome = features.get("study_outcome", "").lower()
    if study_outcome in ["effectiveness", "safety"]:
        score += 1
    elif study_outcome in ["diagnostics", "biomarker"]:
        score += 0.7
    else:
        score += 0.3
    
    return min(int(round(score)), 10)  # Cap at 10