# BASEPROMPTCALLER PROMPT LOG
**Timestamp:** 2025-10-10T12:56:55.926086
**Prompt Type:** basepromptcaller

## Formatted Messages
Total messages: 2

### Message 1: SYSTEM

```
You are an expert at creating semantic filtering criteria for research articles.

        Your task is to generate a clear, concise filtering criteria statement that can be used by an LLM to evaluate whether a research article is relevant to a specific research stream and channel.

        The filtering criteria should:
        1. Be specific enough to exclude irrelevant articles
        2. Be broad enough to capture all relevant research
        3. Focus on the PURPOSE and FOCUS rather than just keywords
        4. Be written as evaluation criteria (what makes an article relevant?)
        5. Be 2-4 sentences long

        GOOD EXAMPLE:
        "Articles should focus on novel CRISPR-based gene editing techniques applied to cancer therapy. Relevant articles discuss mechanisms, clinical trials, or preclinical studies of CRISPR modifications targeting oncogenes or tumor suppressor genes. Exclude articles that only mention CRISPR tangentially or focus on other diseases."

        BAD EXAMPLE:
        "Articles about CRISPR and cancer." (too vague)

        Respond in JSON format with "filter_criteria" and "reasoning" fields.
```

---

### Message 2: USER

Generate semantic filtering criteria for this research stream channel:

        Stream Purpose: Monitor competitive threats across all therapeutic areas

        Channel Name: Diabetes & Metabolism
        Channel Focus: Monitor competitive threats in diabetes, obesity, and metabolic disorders
        Keywords: GLP-1, insulin, diabetes, obesity, Mounjaro, tirzepatide, semaglutide, Novo Nordisk

        Create filtering criteria that will help identify articles truly relevant to this channel's focus within the broader stream purpose.

---

## Summary
- Total characters: 1677
- Messages by role:
  - system: 1
  - user: 1