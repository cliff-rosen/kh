"""
Centralized configuration for archetype extraction to ensure schema and instructions stay aligned.
"""

from typing import Dict, Any, List
from schemas.entity_extraction import StudyType


# Structured archetype pattern definitions with unique IDs
ARCHETYPE_PATTERNS = [
    {
        "id": "1",
        "study_type": StudyType.INTERVENTION,
        "name": "Intervention Studies",
        "patterns": [
            {
                "id": "1a",
                "template": "Population P was treated for condition C with intervention I to study outcome O"
            },
            {
                "id": "1a-mech",
                "template": "Population P was administered intervention I to study physiological outcome O"
            },
            {
                "id": "1b", 
                "template": "Intervention I was compared to control C in population P to measure outcome O"
            },
            {
                "id": "1b-mech",
                "template": "Intervention I was compared to control C in healthy population P to measure physiological response O"
            },
            {
                "id": "1c",
                "template": "Population P received intervention I versus comparator C to assess efficacy for outcome O"
            },
            {
                "id": "1c-mech",
                "template": "Population P received intervention I versus control C to assess mechanistic outcome O"
            }
        ]
    },
    {
        "id": "2",
        "study_type": StudyType.OBSERVATIONAL,
        "name": "Observational Studies", 
        "patterns": [
            {
                "id": "2a",
                "template": "Population P with exposure E was observed for outcome O compared to unexposed controls"
            },
            {
                "id": "2b",
                "template": "Population P was followed over time T to identify factors F associated with outcome O"
            },
            {
                "id": "2c", 
                "template": "Cases with condition C were compared to controls without C to identify risk factors F"
            }
        ]
    },
    {
        "id": "3",
        "study_type": StudyType.DIAGNOSTIC_SCREENING,
        "name": "Diagnostic/Screening Studies",
        "patterns": [
            {
                "id": "3a",
                "template": "Test T was evaluated in population P to diagnose condition C compared to reference standard R"
            },
            {
                "id": "3b",
                "template": "Screening method S was assessed in population P to detect condition C"
            }
        ]
    },
    {
        "id": "4", 
        "study_type": StudyType.PROGNOSTIC,
        "name": "Prognostic Studies",
        "patterns": [
            {
                "id": "4a",
                "template": "Population P with condition C was followed to identify predictors F of outcome O"
            },
            {
                "id": "4b",
                "template": "Patients with disease D were monitored over time T to determine factors F affecting prognosis P"
            }
        ]
    },
    {
        "id": "5",
        "study_type": StudyType.CROSS_SECTIONAL, 
        "name": "Cross-sectional Studies",
        "patterns": [
            {
                "id": "5a",
                "template": "Population P was surveyed to measure prevalence of condition C and associations with factors F"
            },
            {
                "id": "5b",
                "template": "Sample S was assessed at timepoint T to examine relationship between exposure E and outcome O"
            }
        ]
    },
    {
        "id": "6",
        "study_type": StudyType.SYSTEMATIC_REVIEW_META_ANALYSIS,
        "name": "Systematic Reviews/Meta-analyses",
        "patterns": [
            {
                "id": "6a", 
                "template": "Studies examining intervention I for condition C were systematically reviewed to assess outcome O"
            },
            {
                "id": "6b",
                "template": "Data from N studies of treatment T versus control C were pooled to evaluate effect on outcome O"
            }
        ]
    }
]


def _build_pattern_instructions() -> str:
    """Build the pattern instruction section from the structured array."""
    instructions = []
    
    for category in ARCHETYPE_PATTERNS:
        instructions.append(f"**{category['name']}:**")
        for pattern in category['patterns']:
            instructions.append(f"- {pattern['id']}: {pattern['template']}")
        instructions.append("")  # Empty line between categories
    
    return "\n".join(instructions).rstrip()


def _get_all_pattern_ids() -> List[str]:
    """Get all pattern IDs for schema enum."""
    pattern_ids = []
    for category in ARCHETYPE_PATTERNS:
        for pattern in category['patterns']:
            pattern_ids.append(pattern['id'])
    return pattern_ids


def _get_study_type_options() -> str:
    """Generate study type options string from enum values."""
    return ", ".join(e.value for e in StudyType)


# Dynamic instruction template
_BASE_INSTRUCTION_TEMPLATE = """
## archetype
Generate a single natural-language sentence that captures the study's core structure by instantiating one of the canonical patterns below. Use specific terms from the article (actual population, condition, intervention, etc.) rather than placeholders.

For intervention studies, choose between:
- Clinical patterns (1a, 1b, 1c): Studies treating pathological conditions or diseases
- Mechanistic patterns (1a-mech, 1b-mech, 1c-mech): Studies investigating normal physiological processes in healthy subjects or exploring mechanisms

{pattern_instructions}

## study_type
Classify the study design as one of: {{{study_type_options}}}

## pattern_id
Identify which specific pattern template was used: {{{pattern_id_options}}}
"""


# Centralized archetype extraction configuration
ARCHETYPE_EXTRACTION_CONFIG = {
    "result_schema": {
        "type": "object",
        "properties": {
            "archetype": {
                "type": "string", 
                "description": "Plain natural language archetype of the study"
            },
            "study_type": {
                "type": "string",
                "description": "High-level study category",
                "enum": [e.value for e in StudyType]
            },
            "pattern_id": {
                "type": "string",
                "description": "ID of the specific archetype pattern used",
                "enum": _get_all_pattern_ids()
            }
        },
        "required": ["archetype", "pattern_id"]
    },
    
    "schema_key": "article_archetype_v2"
}


def get_archetype_schema() -> Dict[str, Any]:
    """Get the result schema for archetype extraction."""
    return ARCHETYPE_EXTRACTION_CONFIG["result_schema"]


def get_archetype_instructions() -> str:
    """Get the extraction instructions for archetype extraction."""
    return _BASE_INSTRUCTION_TEMPLATE.format(
        pattern_instructions=_build_pattern_instructions(),
        study_type_options=_get_study_type_options(),
        pattern_id_options=", ".join(_get_all_pattern_ids())
    )


def get_archetype_schema_key() -> str:
    """Get the schema key for caching prompt caller."""
    return ARCHETYPE_EXTRACTION_CONFIG["schema_key"]


def validate_study_type(study_type: str) -> bool:
    """Validate that study_type is one of the allowed values."""
    return study_type in [e.value for e in StudyType]