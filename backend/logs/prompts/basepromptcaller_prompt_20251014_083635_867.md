# BASEPROMPTCALLER PROMPT LOG
**Timestamp:** 2025-10-14T08:36:35.867241
**Prompt Type:** basepromptcaller

## Formatted Messages
Total messages: 2

### Message 1: SYSTEM

```
You are a research article evaluator. Your task is to determine whether research articles are relevant to specific research criteria.

            Evaluate each article based on its title and abstract, and determine if it addresses or is relevant to the given research criteria.

            Respond in JSON format:
            {
            "decision": "Yes" or "No",
            "confidence": 0.0 to 1.0,
            "reasoning": "Brief explanation"
            }
```

---

### Message 2: USER

Research Criteria: Articles should present significant new findings on the biological mechanisms or biomarkers underlying the gut-brain axis as they relate to mood disorders. Relevant articles must focus on elucidating pathways, molecular interactions, or physiological processes (such as neurotransmitter modulation, immune signaling, or microbial metabolites) that directly link gut function to mood regulation or depressive symptoms. Exclude articles that only discuss general gut health, mood disorders without gut-brain context, or therapeutic interventions without mechanistic insight.

            Article to evaluate:
            Title: A Conceptual Review of Gut, Skin, and Oral Microbiota in Autoimmune Bullous Diseases: From Dysbiosis to Therapeutic Potential.
            Abstract: Autoimmune bullous diseases (AIBDs), including pemphigus and bullous pemphigoid, are chronic inflammatory skin disorders characterized by dysregulated immune responses mediated by autoantibodies that target adhesion molecules in the skin and mucous membranes. Emerging evidence highlights the pivotal role of host microbiota dysbiosis in AIBDs pathogenesis, offering novel insights into disease mechanisms and therapeutic strategies. This review systematically synthesizes the current findings on gut, skin, and oral microbiota alterations in AIBDs, emphasizing their contributions via the gut-skin axis, microbial metabolites, and pathogen-host interactions. Key innovations include uncovering how specific pathogenic and commensal microbiota influence disease progression through intriguing skin inflammation and direct barrier impairment. Notably, while some microbiota changes overlap with other dermatoses, AIBDs exhibit distinct microbial signatures associated with their unique autoimmune mechanisms targeting adhesion molecules. Furthermore, we explore microbiota-targeted therapies, such as antibiotics, probiotics, and fecal microbiota transplantation, and demonstrate their potential to restore microbial homeostasis and improve clinical outcomes. By integrating multi-omics evidence and clinical data, this review bridges mechanistic insights with translational applications, proposing microbiota modulation as a promising adjunctive therapy for AIBDs. Our analysis identifies critical research gaps, including the need for longitudinal studies and personalized microbial interventions, positioning this review at the forefront of microbiome-inflammation-autoimmunity research.

---

## Summary
- Total characters: 2948
- Messages by role:
  - system: 1
  - user: 1