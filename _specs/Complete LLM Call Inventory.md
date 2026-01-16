Complete LLM Call Inventory

OpenAI Client #1: BasePromptCaller (shared singleton)

| Service                      | Task Config Used                       | Default Model (from llm_models.py) |
|------------------------------|----------------------------------------|------------------------------------|
| DocumentAnalysisService      | document_analysis.hierarchical_summary | gpt-4.1                            |
| DocumentAnalysisService      | document_analysis.entity_extraction    | gpt-4.1                            |
| DocumentAnalysisService      | document_analysis.claim_extraction     | gpt-4.1                            |
| DocumentAnalysisService      | document_analysis.stance_analysis      | gpt-4.1                            |
| RetrievalQueryService        | smart_search.keyword_generation        | gpt-4.1                            |
| ConceptProposalService       | smart_search.keyword_generation        | gpt-4.1                            |
| BroadSearchService           | smart_search.keyword_generation        | gpt-4.1                            |
| ArticleCategorizationService | smart_search.keyword_generation        | gpt-4.1 (overridable)              |
| AIEvaluationService          | extraction.default                     | gpt-5-mini (overridable)           |

---
OpenAI Client #2: ReportSummaryService (own client)

| Method                             | Default Model | Source                 |
|------------------------------------|---------------|------------------------|
| generate_executive_summary()       | gpt-4.1       | DEFAULT_MODEL constant |
| generate_category_summary()        | gpt-4.1       | DEFAULT_MODEL constant |
| generate_article_summaries_batch() | gpt-4.1       | DEFAULT_MODEL constant |

All three methods accept model and temperature parameters for override.

---
Model Selection Patterns Found:

| Pattern                                             | Where Used                   | Config Source                     |
|-----------------------------------------------------|------------------------------|-----------------------------------|
| A. get_task_config("category", "task")["model"]     | 8 services                   | config/llm_models.py TASK_CONFIGS |
| B. model or task_config["model"] (override allowed) | ArticleCategorizationService | Mix                               |
| C. model_override or default_config["model"]        | AIEvaluationService          | config/llm_models.py              |
| D. model or self.DEFAULT_MODEL                      | ReportSummaryService         | Service constant                  |

---
Summary: What's in llm_models.py TASK_CONFIGS:

"smart_search.keyword_generation"     → model: "gpt-4.1"
"document_analysis.hierarchical_summary" → model: "gpt-4.1"
"document_analysis.entity_extraction"    → model: "gpt-4.1"
"document_analysis.claim_extraction"     → model: "gpt-4.1"
"document_analysis.stance_analysis"      → model: "gpt-4.1"
"extraction.default"                     → model: "gpt-5-mini"  ← Different!

---
The Inconsistencies:

1. Two OpenAI clients - BasePromptCaller has a shared client, ReportSummaryService creates its own
2. Different default models - Most use gpt-4.1, but extraction.default uses gpt-5-mini
3. Different config sources - Some from TASK_CONFIGS, some from service constants
4. Pipeline defaults don't match - pipeline_service.py has its own DEFAULT_MODEL_CONFIG with o4-mini for semantic_filter
5. Fictional models - gpt-5-mini in llm_models.py doesn't exist in model_data.py's catalog
