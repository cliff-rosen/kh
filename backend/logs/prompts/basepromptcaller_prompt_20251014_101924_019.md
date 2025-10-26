# BASEPROMPTCALLER PROMPT LOG
**Timestamp:** 2025-10-14T10:19:24.019649
**Prompt Type:** basepromptcaller

## Formatted Messages
Total messages: 2

### Message 1: SYSTEM

```
You are a PubMed search query expert. Generate an optimized boolean search query for PubMed based on the provided channel information.

            REQUIREMENTS:
            1. Use PubMed boolean syntax (AND, OR, NOT with parentheses)
            2. Combine the channel keywords with OR within concept groups
            3. Use AND to connect different concept groups if applicable
            4. Keep the query focused and precise - aim for 100-2000 results
            5. Use medical/scientific terminology appropriate for PubMed

            STRUCTURE:
            - If keywords are all related to one concept: (keyword1 OR keyword2 OR keyword3)
            - If keywords span multiple concepts: (concept1_kw1 OR concept1_kw2) AND (concept2_kw1 OR concept2_kw2)

            Respond in JSON format with "query_expression" and "reasoning" fields.
```

---

### Message 2: USER

Generate a search query for the following research stream channel:

        Channel Name: Scientific Research
        Channel Focus: Track foundational research on gut-brain mechanisms and microbiome interactions
        Stream Purpose: Track comprehensive research linking gut microbiome to mental health across all sectors and applications

        Keywords: gut-brain axis, microbiome, psychobiotics, vagus nerve, neurotransmitters, GABA, serotonin, short-chain fatty acids

        Create a PubMed query that will find articles matching this channel's focus.
        The query should be precise enough to avoid overwhelming results but broad enough to capture relevant research.

---

## Summary
- Total characters: 1530
- Messages by role:
  - system: 1
  - user: 1