# Report Highlights Redesign

**Status:** Proposal  
**Date:** 2026-04-15

## Summary

Replace the current executive summary (a 200–400 word prose paragraph) with a **highlights section**: 5 curated article callouts, each consisting of a plain-English headline + one-sentence takeaway. The change requires a new article-selection step that shares inputs with the existing semantic filter, plus a new text-generation prompt for the highlight blurbs.

---

## 1. What We Have Today

### 1.1 Executive summary generation

**Pipeline stage:** `_stage_generate_executive_summary` in `pipeline_service.py:1021`  
**Service method:** `ReportSummaryService.generate_executive_summary()` in `report_summary_service.py:247`  
**Builder method:** `build_executive_summary_item()` in `report_summary_service.py:544`

The current exec summary is a single LLM call whose inputs are:

| Input | Source | How it's built |
|-------|--------|---------------|
| `stream_purpose` | `ResearchStream.purpose` | Verbatim |
| `articles_count` | Count of associations | Verbatim |
| `categories_count` | Count of category summaries | Verbatim |
| `categories_summaries` | `report.enrichments["category_summaries"]` | `**CategoryName**: summary_text` pairs, ordered by presentation config |
| `articles_summaries` | `assoc.ai_summary` for each article (max 30) | Joined with newlines |
| `articles_formatted` | Title, authors, journal, date, abstract (max 20 articles, abstracts truncated to 500 chars) | Formatted text block |

The system prompt asks for 3–5 paragraphs, 200–400 words, "executive audience" tone. The output is stored in `report.enrichments["executive_summary"]`.

**Problem:** The result is a dense paragraph that names categories and themes but never calls out specific articles. It reads like a meta-analysis summary, not like something a busy professional would scan. See the actual output:

> *"10 articles cover Genetic Predisposition & Familial Risk, Somatic Mutations & Tumor Genomics, Biomarkers & Diagnostics, Reviews, Meta-Analyses & Guidelines, and Case Reports & Small Case Series. The articles in Genetic Predisposition & Familial Risk quantify prevalence of actionable hereditary variants, expand candidate predisposition genes, and provide time-dependent modeling..."*

Nobody reads this. The SME is manually creating highlights like these instead:

> *"Better Tools to Diagnose Cancer from Small Samples — New molecular tests make cancer diagnosis more accurate with less tissue (Davidson, 2026)"*

### 1.2 Semantic filter (article scoring)

**Pipeline stage:** `_stage_semantic_filter` in `pipeline_service.py:592`  
**Core logic:** `_apply_semantic_filter()` in `pipeline_service.py:1420`  
**LLM system prompt:** Generic scoring rubric in `ai_evaluation_service.py:72` (score + confidence + reasoning)

The filter prompt is dynamically built per article:
```
## Article
Title: {title}
Abstract: {abstract}
AI Summary: {summary}
Journal: {journal}
Authors: {authors}

## Task
{filter_criteria}      ← user-defined criteria text from BroadQuery.semantic_filter.criteria

Score from 0.0 to 1.0.
```

**Outputs per article (on `wip_articles`):**
- `filter_score` (float 0.0–1.0)
- `filter_score_reason` (text — the LLM's reasoning, typically 2–4 sentences)
- `passed_semantic_filter` (bool — `filter_score >= threshold`)

**Key detail:** `filter_score` is **directly copied** to `relevance_score` on `ReportArticleAssociation` when the report is created (`pipeline_service.py:1179`). No re-evaluation happens.

### 1.3 Article ranking

Article `ranking` is assigned by enumeration order from `get_included_articles()`, which has **no ORDER BY** — ranking is effectively insertion order. Rankings are editable during curation. In practice, the produced rankings loosely follow retrieval order, not score order.

### 1.4 Other per-article data available at highlight-selection time

| Field | Table | Content |
|-------|-------|---------|
| `ai_summary` | `report_article_associations` | 2–4 sentence technical summary |
| `filter_score_reason` | `wip_articles` | Why the filter scored this article as relevant |
| `stance_analysis` | `assoc.ai_enrichments` | Litigation stance classification + analysis |
| `presentation_categories` | `report_article_associations` | Category IDs the article belongs to |
| `abstract` | `articles` | Full PubMed abstract |
| `title`, `authors`, `journal`, `pub_year/month/day` | `articles` | Metadata |

### 1.5 Category summaries

**Pipeline stage:** `_stage_generate_category_summaries` in `pipeline_service.py:952`  
**Builder:** `build_category_summary_items()` in `report_summary_service.py:469`

Each category summary is a 150–250 word prose paragraph generated from the articles in that category + their AI summaries. These run **before** the executive summary, and the exec summary uses them as input. Category summaries remain useful for context but are not the right format for scan-friendly highlights.

### 1.6 Prompt customization

All three prompt types (article, category, executive) support custom prompts via `ResearchStream.enrichment_config`, tested through the prompt testing UI. Any new "highlights" prompt type should follow this same pattern.

---

## 2. What the SME Is Actually Doing (Data Analysis)

We examined 3 weeks of approved weekly reports (reports 135, 138, 139) from the "Asbestos and Talc Litigation" stream. The SME selects exactly 5 highlights per weekly report. Here is what the prod data shows:

### 2.1 Selection patterns

**Score floor:** Every selected article has `filter_score >= 0.80`. No exceptions across 15 picks.

**Rank is not the criterion.** The SME skips rank 1 in 2 of 3 reports (when rank 1 is a broad narrative review). Picks come from ranks 1–7, with most articles in the rank 2–7 range.

**Category diversity is enforced.** Each set of 5 picks spans at least 3 distinct presentation categories. The SME never picks 3+ articles from the same category.

**What gets picked:**
- Articles with a **concrete quantified finding** (a percentage, cohort size, projection year, death count)
- **New methods** with practical application (satellite detection of asbestos roofs)
- **Novel genetic/molecular findings** (new predisposition gene, new diagnostic marker)
- **Case reports with striking demographics** (21-year-old with cancer, rare presentation)
- **Population-level burden/risk studies** with clear numbers

**What gets skipped:**
- Narrative reviews or "update on" papers with no new data
- Methodology papers (statistical modeling techniques)
- Corrections, errata, editor replies, retractions
- QoL/outcome papers without a causation angle
- Niche pathology findings that don't generalize

**Stance balance:** Not forced, but naturally varies. Week 1: all 5 pro-defense. Week 2: 3 pro-defense + 2 pro-plaintiff. The SME takes pro-plaintiff items when the finding is strong and newsworthy. Stance doesn't gate selection.

### 2.2 Blurb writing patterns

The SME rewrites each selected article into:  
**`[Plain-English Headline] — [One-sentence takeaway] (AuthorSurname, Year)`**

Consistent rules:
1. Headline is 5–9 words at ~8th-grade reading level
2. All domain jargon is replaced with plain-language equivalents
3. The headline leads with the finding, not the method
4. The takeaway includes one concrete number from the abstract when available
5. Tone is neutral/journalistic — never mentions litigation stance
6. The author suffix uses first-author surname + publication year

Examples from prod:

| Original title | SME blurb |
|---|---|
| "Recently identified diagnostic markers in effusion cytology" | **Better Tools to Diagnose Cancer from Small Samples** — New molecular tests make cancer diagnosis more accurate with less tissue (Davidson, 2026) |
| "Modelled effect on mesothelioma mortality of the asbestos ban in Italy and the subsequent phases of exposure" | **Italy's Asbestos Ban Prevented Thousands of Deaths** — National ban avoided up to 22,000 mesothelioma deaths while construction exposure patterns shifted (Marinaccio, 2026) |
| "Satellite-based detection of asbestos-cement roofs using WorldView-3 VNIR data: An affordable evaluation tool for sustainable management of hazardous building infrastructure" | **Satellite Technology Detects Asbestos Roofs in Cities** — New imaging method identifies hazardous building materials for safer urban planning (Saba, 2026) |

---

## 3. What Needs to Change

### 3.1 New pipeline output: highlights (replaces executive summary)

The `report.enrichments["executive_summary"]` field gets replaced with `report.enrichments["highlights"]` — a JSON list of 5 highlight objects:

```json
[
  {
    "article_id": 1234,
    "pmid": "41961745",
    "headline": "Better Tools to Diagnose Cancer from Small Samples",
    "takeaway": "New molecular tests make cancer diagnosis more accurate with less tissue",
    "author_surname": "Davidson",
    "pub_year": 2026,
    "filter_score": 0.80,
    "category_id": "biomarkers-diagnostics"
  },
  ...
]
```

This is structured data, not prose — the email template, reports page, and chat tool each format it for their own context.

### 3.2 New pipeline stage: highlight selection

A new stage runs after category summaries (same position as the current exec summary stage). It needs two steps:

**Step A — Score articles for "highlight-worthiness".**

Inputs available (already computed by earlier stages):
- `article.title` — from articles table
- `article.abstract` — from articles table
- `article.authors`, `journal`, `pub_year/month/day` — metadata
- `wip.filter_score` — from semantic filter stage
- `wip.filter_score_reason` — from semantic filter stage (the richest signal)
- `assoc.ai_summary` — from article summary stage
- `assoc.ai_enrichments.stance_analysis` — from stance analysis stage
- `assoc.presentation_categories` — from categorization stage

The `filter_score_reason` is the single most informative input for highlight selection because it already explains *why this article matters* in the stream's context. The filter criteria and the highlight-selection criteria share the same root question: "what makes this article worth a reader's attention in this research stream?"

**Key design question:** Can we score highlight-worthiness *during* the existing semantic filter, or does it need to be a separate pass?

Arguments for **combined** (add highlight signals to the filter prompt):
- Same LLM call, same inputs, no extra API cost
- The filter already reads title + abstract + summary and reasons about relevance
- Could add a second output field like `highlight_potential` (0/1 or 0–1 score) + `highlight_reason`
- The `filter_score_reason` text would still be available downstream

Arguments for **separate** (new stage after all enrichments):
- Highlight selection benefits from inputs the filter doesn't have: `ai_summary`, `stance_analysis`, `presentation_categories`, `category_summaries`
- Keeps the filter focused on pass/fail (one job per stage)
- Allows different model/temperature settings
- The filter runs on ALL candidate articles (including rejects); highlight scoring only needs the ~10–25 that passed

**Recommendation:** Separate stage. The additional context (categories, stance, summaries) materially improves selection quality, and the candidate pool is small (10–25 articles per report), so cost is negligible.

**Step B — Select top 5 with diversity constraints.**

After scoring, apply algorithmic selection:
1. Hard filter: `filter_score >= 0.80`, exclude corrections/errata/retractions (title regex)
2. Rank by highlight score descending
3. Greedy pick: take the top scorer, then for each subsequent candidate, apply a penalty if it shares a `presentation_category` with an already-selected article (max 2 per category)
4. Stop at 5
5. Verify the final set spans >= 3 distinct categories

This step is pure logic, no LLM call.

### 3.3 New pipeline stage: highlight blurb generation

For each of the 5 selected articles, generate the headline + takeaway. Single LLM call (batch of 5 items).

**Inputs per item:**
- `article.title`
- `article.abstract`
- `wip.filter_score_reason` — provides the "why it matters" framing
- `assoc.ai_enrichments.stance_analysis.analysis` — additional context (but the output must not mention stance)
- `article.authors[0]` → first author surname
- `article.pub_year`
- `stream.purpose` — so the blurb is stream-aware

**Jargon substitution list** (embed in system prompt or provide as reference):
- BAP1, BRCA1/2, PALB2 → "inherited genetic defect" or "gene"
- HRD → "DNA repair problems"
- Mendelian randomization → "genetic study"
- chrysotile → "asbestos" (when used as shorthand)
- salpingectomy/oophorectomy → "preventive surgery"
- germline → "inherited"
- somatic → "tumor-specific"
- cytology/pathology → "lab testing" or "tissue analysis"
- in vitro → "in lab experiments"

**Output schema:**
```json
{
  "headline": "5-9 words, plain English, finding-first",
  "takeaway": "10-20 words, one concrete number if available, neutral tone"
}
```

### 3.4 Prompt customization for highlights

Follow the existing pattern: add two new prompt types to `ReportSummaryService`:

1. **`highlight_selection`** — system + user prompt for scoring highlight-worthiness
   - Slugs: `{article.title}`, `{article.abstract}`, `{article.filter_reason}`, `{article.summary}`, `{article.stance_analysis}`, `{stream.purpose}`, `{article.categories}`

2. **`highlight_blurb`** — system + user prompt for headline + takeaway generation
   - Slugs: `{article.title}`, `{article.abstract}`, `{article.filter_reason}`, `{article.authors}`, `{article.pub_year}`, `{stream.purpose}`

Both should be customizable via `enrichment_config` on the stream, same as existing prompt types.

### 3.5 Storage and schema changes

- `report.enrichments["highlights"]` — new key, JSON list of highlight objects (structured above)
- `report.enrichments["executive_summary"]` — **keep for backward compatibility** during transition; stop generating new ones once highlights are live
- `report.original_enrichments` — already captures original for curation comparison; works as-is
- Consider adding `highlight_score` (float) and `highlight_reason` (text) to `ReportArticleAssociation` or storing on the enrichments JSON — lightweight, avoids schema migration

### 3.6 Downstream consumers that need updating

| Consumer | Current field | Change needed |
|----------|--------------|---------------|
| Reports page (frontend) | `enrichments.executive_summary` | Render highlights list instead of prose block |
| Email template | `enrichments.executive_summary` | Already has a highlights section in the template; wire to new data |
| Chat tool `get_report_summary` | `report.key_highlights` + `enrichments.executive_summary` | Return `enrichments.highlights` |
| Curation UI | Regenerate exec summary button | Regenerate highlights button (re-run selection + blurb generation) |
| Prompt testing UI | Tests exec summary prompt | Add highlight_selection + highlight_blurb prompt types |

### 3.7 What stays the same

- **Semantic filter** — no changes to the filter stage, its prompts, or its outputs. The `filter_score` and `filter_score_reason` remain the primary inputs to highlight selection, consumed downstream.
- **Category summaries** — keep generating them. They provide context for the highlight selection prompt and remain useful on the reports page.
- **Article AI summaries** — keep generating them. They feed into highlight selection scoring.
- **Stance analysis** — keep generating it. It provides context for highlight selection (but is never surfaced in the public blurb).
- **Prompt customization infrastructure** — reuse the existing `enrichment_config` pattern, slug system, and prompt testing flow.

---

## 4. Open Questions

1. **Should the highlight count (5) be configurable per stream?** The SME consistently picks 5 for weekly reports. Backfill reports (20+ articles) might warrant more. Consider making it configurable with a default of 5.

2. **Curation workflow for highlights.** Can the curator reorder, swap, or edit individual highlight blurbs? The current curation flow supports editing the exec summary as free text. Structured highlights need a different UX (drag-to-reorder, edit-in-place per blurb, swap article).

3. **Regeneration scope.** If a curator hides an article that was a highlight, should highlights auto-regenerate? Or require manual re-generation?

4. **Report.key_highlights field.** This JSON column exists on the `reports` table but is currently always empty `[]`. Should we use it instead of `enrichments["highlights"]`? Using the dedicated column is cleaner; using enrichments is more consistent with exec_summary/category_summaries.

5. **Transition plan.** Do we generate both exec summary and highlights during a transition period? Or hard-switch?
