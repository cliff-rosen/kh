# Date Loophole Audit: Missed Articles in March 2026

**Date:** 2026-03-29
**Stream:** Asbestos and Talc Litigation (stream_id=10)
**Period audited:** March 1 – March 28, 2026
**Triggered by:** PMID 41849731 (mesothelioma article published March 18, not captured by any pipeline run)

---

## Summary

Our pipeline searches PubMed using the `[DP]` (Publication Date) field for weekly date windows. Due to how PubMed handles imprecise dates and indexing lag, **39 articles were missed** across the four March pipeline runs that would have been captured if we also searched by `[EDAT]` (Entry Date).

| Metric | Count |
|--------|-------|
| Articles found by `[DP]` only (current method) | 277 |
| Articles found by `[DP] OR [EDAT]` (proposed fix) | 319 |
| **Articles missed by current method** | **42** |
| Of those, already in wip_articles (caught by other means) | 3 |
| **Truly missed — never entered pipeline** | **39** |

**Impact: 13.1% of articles that should have been captured were missed.**

---

## Root Cause

Two distinct failure modes cause articles to be missed:

### Failure Mode 1: Month-Only PubDate (18 of 39 articles)

Many journals publish PubDate with only year+month (no day). PubMed treats these as the **1st of the month** for `[DP]` searches. If the article is indexed mid-month, the `[DP]` date and the actual indexing date fall in different weekly windows.

**Example:** PMID 41849731
- PubDate: `March 2026` (no day) → `[DP]` treats as March 1
- EDAT: March 18 (actual indexing)
- Pipeline March 1-7 ran on March 8 → article didn't exist yet
- Pipeline March 15-21 → `[DP]` thinks it's March 1 → not in window
- **Result: article falls through all windows**

### Failure Mode 2: Entry Date Lag (21 of 39 articles)

Articles with full PubDate precision (year/month/day) can still be missed when they have a PubDate **before** the current search window but an EDAT **within** the window. This happens when:
- Journals publish articles electronically but PubMed indexes them days or weeks later
- Articles have a PubDate in a previous month but are only added to PubMed in the current month

**Example:** PMID 41897285
- PubDate: Feb 26, 2026 (full date)
- EDAT: March 28, 2026 (indexed a month later)
- No March pipeline window covers Feb 26 via `[DP]`
- **Result: article was "published" before our March windows but only became findable in March**

---

## Per-Window Breakdown

| Window | DP only | DP + EDAT | Missed | Miss Rate |
|--------|---------|-----------|--------|-----------|
| Mar 1–7 | 152 | 168 | 16 | 9.5% |
| Mar 8–14 | 43 | 77 | 34 | 44.2% |
| Mar 15–21 | 48 | 66 | 18 | 27.3% |
| Mar 22–28 | 35 | 68 | 33 | 48.5% |

Note: Some articles appear in multiple windows (DP in one, EDAT in another), so per-window missed counts sum to more than 42 unique articles.

---

## All 39 Missed Articles

| PMID | PubDate | EDAT | Day Missing? | Title (truncated) |
|------|---------|------|--------------|--------------------|
| 41764809 | 2026/May | 2026/3/1 | YES | Adult ovarian granulosa cell tumor with high-grade hepatoid... |
| 41764946 | 2026/Apr | 2026/3/1 | YES | Family history enrichment in Non-Small cell Lung Cancer... |
| 41767375 | 2026 | 2026/3/2 | YES | MALAT1 rs619586 as a potential genetic marker of pituitary... |
| 41769559 | 2026/Jan | 2026/3/2 | YES | Linitis Plastica in a Patient With a BRCA2 Mutation... |
| 41769616 | 2026/Jan | 2026/3/2 | YES | Diagnostic Yield and Safety of Medical Thoracoscopic Biopsy... |
| 41771225 | 2026/Apr | 2026/3/2 | YES | Familial colorectal cancer: risk factors, screening strategies... |
| 41775174 | 2026/Apr | 2026/3/3 | YES | IL1B rs1143627 and IL17A rs8193036 in the risk of Acute Graft... |
| 41775254 | 2026/Feb/09 | 2026/3/3 | no | Homologous recombination deficiency in high-grade serous ovarian... |
| 41777655 | 2026 | 2026/3/4 | YES | Uterine tumors resembling ovarian sex cord tumors: rare case... |
| 41780446 | 2026/Feb/26 | 2026/3/4 | no | A multi-omics analysis integrating mendelian randomization... |
| 41785549 | 2026/Feb/23 | 2026/3/5 | no | Ten-year of French multicentric experience in the management... |
| 41797589 | 2025/Oct/01 | 2026/3/9 | no | Adult-type epithelial neoplasms in children and adolescents... |
| 41798278 | 2026 | 2026/3/9 | YES | Screening of early predictive serum biomarkers and construction... |
| 41799407 | 2026 | 2026/3/9 | YES | Cavitation and durable remission in a PD-L1-positive, TP53-mutant... |
| 41804759 | 2026 | 2026/3/10 | YES | Integrative Molecular Insights Into Epidemiological, Genetic... |
| 41805369 | 2026/Jan/10 | 2026/3/10 | no | Genetic Adaptation to Tibetan High Altitude and Hepatocellular... |
| 41808711 | 2026/Feb/28 | 2026/3/11 | no | Convex-probe endobronchial ultrasound-guided cryobiopsy... |
| 41808713 | 2026/Feb/28 | 2026/3/11 | no | Multi-omics profiling reveals CDKN2A mutant early-onset lung... |
| 41808720 | 2026/Feb/28 | 2026/3/11 | no | Pathological complete response following neoadjuvant chemoimmuno... |
| 41808749 | 2026 | 2026/3/11 | YES | Case Report: Rethinking pulmonary arterial hypertension... |
| 41809872 | 2026/Feb/28 | 2026/3/11 | no | Primary melanoma of the gastrointestinal tract |
| 41810283 | 2026 | 2026/3/11 | YES | Correction: Updates on exposure estimation for the Quebec cohort... |
| 41813530 | 2025/Nov/03 | 2026/3/11 | no | DNA-junction-based personalized liquid biopsy assays... |
| 41815121 | 2026/Feb/28 | 2026/3/12 | no | Greater susceptibility of patients with idiopathic pulmonary... |
| 41816225 | 2026 | 2026/3/12 | YES | Metastatic Pancreatic Adenocarcinoma with Germline BLM... |
| 41816400 | 2026/Feb/28 | 2026/3/12 | no | Integrating interventional pulmonology and thoracic surgery... |
| 41816417 | 2026/Feb/28 | 2026/3/12 | no | Analysis of clinicopathological characteristics in postoperative... |
| 41816443 | 2026/Feb/28 | 2026/3/12 | no | Hidden in plain sight: a narrative review on environmental... |
| 41828383 | 2026/Feb/25 | 2026/3/14 | no | TGF-beta Inhibition Through Combinatory Strategies Suppresses... |
| 41842647 | 2026/Apr/01 | 2026/3/17 | no | 50, 100 & 150 Years: A quorum of quarks; asbestos surprises |
| 41854001 | 2026 | 2026/3/19 | YES | The epidemiological surveillance in the regional public health... |
| 41855630 | 2026/Feb/28 | 2026/3/19 | no | Systematic literature review of secondary primary malignancies... |
| 41861461 | 2026/Feb/24 | 2026/3/20 | no | Coopting Germline BRCA2 Mutation With an Available PARP Inhibitor... |
| 41866693 | 2026/Apr | 2026/3/23 | YES | A two-sample Mendelian Randomization study on the causal... |
| 41891376 | 2026/Apr | 2026/3/27 | YES | Unraveling the nexus: Tumor mutational burden, PD-L1 expression... |
| 41895741 | 2026/Apr | 2026/3/27 | YES | Insights From Matrix Metalloproteinase-2 Genotypes to Decipher... |
| 41895749 | 2026/Apr | 2026/3/27 | YES | Chemosensitizing Effects of Resveratrol Derivatives on p53-dependent... |
| 41897285 | 2026/Feb/26 | 2026/3/28 | no | New 1,2,3-Triazole and Dipyridothiazine Hybrids-Synthesis... |
| 41900904 | 2026/Feb/28 | 2026/3/28 | no | Inactivation of BAP1 and the Hippo Pathway Characterizes... |

**Day missing in PubDate:** 18 of 39 (46%)
**PubDate in a prior month/year but EDAT in March:** 21 of 39 (54%)

---

## Fix

Change `_get_date_clause()` in `pubmed_service.py` to search `[DP] OR [EDAT]` when `date_type="publication"`:

```python
# Before (misses articles):
AND ("2026/03/15"[DP] : "2026/03/21"[DP])

# After (defensive):
AND (("2026/03/15"[DP] : "2026/03/21"[DP]) OR ("2026/03/15"[EDAT] : "2026/03/21"[EDAT]))
```

This catches articles by whichever date falls in the window — publication date or PubMed entry date. The trade-off is slightly more results to filter, but no missed articles.

**Status:** Fix implemented in `pubmed_service.py` (uncommitted on `main`).

---

## Methodology

1. Retrieved the stream's search query from `research_streams.retrieval_config` (stream_id=10)
2. Ran the query against PubMed E-utilities for each weekly window (Mar 1-7, 8-14, 15-21, 22-28) using:
   - `[DP]` only (current method)
   - `[DP] OR [EDAT]` (proposed fix)
3. Computed the set difference to find articles only findable via EDAT
4. Cross-referenced against `wip_articles` table (production DB, kh2) to confirm they were truly never captured
5. Fetched article metadata from PubMed to classify the failure mode
