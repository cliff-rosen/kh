"""
Seed Global Feature Presets

This script populates the database with the default global (system) feature presets.
Run this after running the migration to create the tables.
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import SessionLocal
from services.feature_preset_service import FeaturePresetService


def seed_global_presets():
    """Seed the database with default global presets"""
    
    db = SessionLocal()
    service = FeaturePresetService(db)
    
    try:
        # Check if presets already exist
        existing = service.get_available_presets(user_id=None)
        if existing:
            print(f"Found {len(existing)} existing presets. Skipping seed.")
            return
        
        print("Seeding global feature presets...")
        
        # Research Features Preset
        service.create_global_preset(
            name="Research Features",
            description="Extract research features for DOI/POI analysis",
            category="Core Analysis",
            features=[
                {
                    "id": "feat_poi_relevance",
                    "name": "poi_relevance",
                    "description": "Does this article relate to melanocortin or natriuretic pathways? Melanocortin keywords: melanocortin receptor, MC1R, MC2R, MC3R, MC4R, MC5R, ACTH, α-MSH, β-MSH, γ-MSH, melanocyte, pigmentation, appetite regulation. Natriuretic keywords: natriuretic peptide, ANP, BNP, CNP, NPR-A, NPR-B, NPR-C, guanylate cyclase, cardiac function",
                    "type": "boolean"
                },
                {
                    "id": "feat_doi_relevance",
                    "name": "doi_relevance",
                    "description": "Does this article relate to dry eye, ulcerative colitis, crohn's disease, retinopathy, or retinal disease? Dry eye keywords: dry eye syndrome, keratoconjunctivitis sicca, tear film. IBD keywords: inflammatory bowel disease, IBD, ulcerative colitis, Crohn's disease, colitis. Retinal keywords: retinopathy, retinal disease, diabetic retinopathy, macular degeneration, retinal degeneration",
                    "type": "boolean"
                },
                {
                    "id": "feat_is_systematic",
                    "name": "is_systematic",
                    "description": "Is this a systematic study? Look for: randomized controlled clinical trials (RCTs), clinical trials, epidemiological studies, cohort studies, case-control studies, open label trials, case reports. Systematic reviews and meta-analyses should also be marked as 'yes'. Basic science, in vitro, and animal studies can also be systematic if they follow rigorous methodology",
                    "type": "boolean"
                },
                {
                    "id": "feat_study_type",
                    "name": "study_type",
                    "description": "Type of study: 'human RCT' (randomized controlled clinical trials with humans), 'human non-RCT' (human studies that are not RCTs - observational, cohort, case-control, case series), 'non-human life science' (animal studies, in vitro studies, cell culture, molecular biology), 'non life science' (non-biological research), 'not a study' (reviews non-systematic, editorials, opinions, commentaries, theoretical papers)",
                    "type": "text"
                },
                {
                    "id": "feat_study_outcome",
                    "name": "study_outcome",
                    "description": "Primary outcome focus: 'effectiveness' (testing if treatment/intervention works), 'safety' (testing safety, adverse events, toxicity, side effects), 'diagnostics' (developing or testing diagnostic methods), 'biomarker' (identifying or validating biomarkers non-diagnostic, prognostic markers), 'other' (basic science mechanisms, pathophysiology, epidemiology)",
                    "type": "text"
                }
            ]
        )
        
        # Clinical Trial Analysis Preset
        service.create_global_preset(
            name="Clinical Trial Analysis",
            description="Extract key information from clinical trial papers",
            category="Medical Research",
            features=[
                {
                    "id": "feat_clin_study_type",
                    "name": "Study Type",
                    "description": "What type of study is this? (e.g., RCT, observational, meta-analysis)",
                    "type": "text"
                },
                {
                    "id": "feat_clin_sample_size",
                    "name": "Sample Size",
                    "description": "What is the total sample size of the study?",
                    "type": "text"
                },
                {
                    "id": "feat_clin_blinded",
                    "name": "Blinded",
                    "description": "Is this a blinded study (single-blind, double-blind, or open-label)?",
                    "type": "text"
                },
                {
                    "id": "feat_clin_primary_outcome",
                    "name": "Primary Outcome",
                    "description": "What is the primary outcome measure?",
                    "type": "text"
                },
                {
                    "id": "feat_clin_statistical_sig",
                    "name": "Statistical Significance",
                    "description": "Was the primary outcome statistically significant?",
                    "type": "boolean"
                },
                {
                    "id": "feat_clin_adverse_events",
                    "name": "Adverse Events",
                    "description": "Were any serious adverse events reported?",
                    "type": "boolean"
                },
                {
                    "id": "feat_clin_study_quality",
                    "name": "Study Quality",
                    "description": "Rate the overall quality of the study methodology",
                    "type": "score",
                    "options": {"min": 1, "max": 10, "step": 1}
                }
            ]
        )
        
        # Systematic Review Preset
        service.create_global_preset(
            name="Systematic Review",
            description="Analyze systematic reviews and meta-analyses",
            category="Medical Research",
            features=[
                {
                    "id": "feat_sys_search_strategy",
                    "name": "Search Strategy",
                    "description": "Is the search strategy clearly described?",
                    "type": "boolean"
                },
                {
                    "id": "feat_sys_databases",
                    "name": "Databases Searched",
                    "description": "Which databases were searched? (list them)",
                    "type": "text"
                },
                {
                    "id": "feat_sys_studies_included",
                    "name": "Studies Included",
                    "description": "How many studies were included in the final analysis?",
                    "type": "text"
                },
                {
                    "id": "feat_sys_meta_analysis",
                    "name": "Meta-Analysis",
                    "description": "Was a meta-analysis conducted?",
                    "type": "boolean"
                },
                {
                    "id": "feat_sys_evidence_quality",
                    "name": "Evidence Quality",
                    "description": "Rate the overall quality of evidence presented",
                    "type": "score",
                    "options": {"min": 1, "max": 5, "step": 1}
                }
            ]
        )
        
        # Drug Discovery Preset
        service.create_global_preset(
            name="Drug Discovery",
            description="Extract drug discovery and development information",
            category="Pharmaceutical",
            features=[
                {
                    "id": "feat_drug_name",
                    "name": "Drug Name",
                    "description": "What is the name or identifier of the drug/compound?",
                    "type": "text"
                },
                {
                    "id": "feat_drug_target",
                    "name": "Target",
                    "description": "What is the molecular target?",
                    "type": "text"
                },
                {
                    "id": "feat_drug_in_vitro",
                    "name": "In Vitro",
                    "description": "Were in vitro studies performed?",
                    "type": "boolean"
                },
                {
                    "id": "feat_drug_in_vivo",
                    "name": "In Vivo",
                    "description": "Were in vivo/animal studies performed?",
                    "type": "boolean"
                },
                {
                    "id": "feat_drug_dev_stage",
                    "name": "Development Stage",
                    "description": "What stage of development? (preclinical, phase I, II, III)",
                    "type": "text"
                }
            ]
        )
        
        # Basic Science Preset
        service.create_global_preset(
            name="Basic Science",
            description="For molecular biology and basic science papers",
            category="Basic Science",
            features=[
                {
                    "id": "feat_basic_model_system",
                    "name": "Model System",
                    "description": "What model system was used? (cell line, organism)",
                    "type": "text"
                },
                {
                    "id": "feat_basic_key_finding",
                    "name": "Key Finding",
                    "description": "What is the main scientific finding?",
                    "type": "text"
                },
                {
                    "id": "feat_basic_mechanism",
                    "name": "Mechanism",
                    "description": "Is a molecular mechanism proposed?",
                    "type": "boolean"
                },
                {
                    "id": "feat_basic_novel",
                    "name": "Novel",
                    "description": "Is this finding claimed to be novel?",
                    "type": "boolean"
                },
                {
                    "id": "feat_basic_innovation_score",
                    "name": "Innovation Score",
                    "description": "Rate the innovation/novelty of the research",
                    "type": "score",
                    "options": {"min": 1, "max": 10, "step": 1}
                }
            ]
        )
        
        print("Successfully seeded 5 global feature presets!")
        
    except Exception as e:
        print(f"Error seeding presets: {e}")
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed_global_presets()