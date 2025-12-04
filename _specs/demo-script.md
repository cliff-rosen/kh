# Knowledge Horizon Demo Script

## Overview
**Duration:** [TBD]
**Audience:** [TBD]
**Key Message:** Knowledge Horizon transforms ad-hoc research into systematic, continuous intelligence with week-to-week continuity.

---

## Step 1: Multiple Streams

**Show:** Research Streams list page

**Talking Points:**
- Each stream represents an ongoing research mandate
- Streams run continuously (weekly, biweekly, etc.)
- Different streams for different strategic needs (competitive intelligence, clinical developments, regulatory updates)

**Action:** Point out 2-3 example streams and their purposes

---

> **Transition:** *"Let me show you what one of these streams actually produces - the end result that stakeholders see each week."*

---

## Step 2: Final Report Output

**Show:** A completed report in the Reports page

**Talking Points:**
- This is the end product - what stakeholders receive each week
- Executive summary synthesizes key findings
- Articles organized by category for easy navigation
- Each article scored for relevance with rationale

**Action:** Scroll through report structure, highlight key sections

---

> **Transition:** *"This looks polished, but how did we get here? Let me take you behind the scenes to show how this report was configured. It starts with capturing the research mandate."*

---

## Step 3: Mandate as Semantic Space

**Show:** Edit Stream → Layer 1: Semantic Space tab

**Talking Points:**
- This defines *what information matters* - the research mandate
- Domain, topics, entities, and their relationships
- **Key point:** This was not created by a human manually
- Our AI-enabled process extracted this from a conversation/brief
- The semantic space becomes the "ground truth" that drives everything downstream

**Action:** Walk through topics and entities, show how they capture the research intent

---

> **Transition:** *"So we've captured what we're looking for. But how do we actually find it? That's where the retrieval layer comes in."*

---

## Step 4: Retrieval and Filtering Workflow

**Show:** Edit Stream → Layer 2: Retrieval Config tab

**Talking Points:**
- **The typical approach** - whether it's a human or a chatbot doing research - is basically ad hoc:
  - Come up with a query, see what you get
  - Come up with another query, see what you get
  - Rinse and repeat
- **The right way** is how systematic literature reviews (SLRs) work:
  1. You have a rich mandate, but you have to translate it into keywords - and you lose semantics in that translation
  2. So you cast a broad net with keyword searches to capture everything potentially relevant
  3. Then you scrutinize the results to figure out what's actually in and what's out
- **That's exactly what we model here:**
  - Broad queries derived from the semantic space
  - Semantic filtering to recover the meaning we lost in keyword translation

**Action:** Show the query structure and explain the two-phase approach (broad retrieval → semantic filtering)

---

> **Transition:** *"Now we're finding relevant articles. But raw search results aren't useful to stakeholders - they need structure. That's what the presentation layer provides."*

---

## Step 5: Presentation Categories

**Show:** Edit Stream → Layer 3: Presentation tab

**Talking Points:**
- Defines how results are organized in reports
- Categories group topics for stakeholder consumption
- **Contrast with Deep Research:**
  - Deep Research creates ad-hoc report formats
  - Format could change week to week with no consistency
  - Stakeholders can't build mental models
- **Our approach:**
  - We designed this basic structure upfront
  - Just like the mandate, the AI-enabled process produces the categories
  - Consistent format builds institutional knowledge

**Action:** Show category structure and how topics map to categories

---

> **Transition:** *"So that's the three-layer architecture: what to find, how to find it, and how to present it. Now let's see how this all comes together in an actual weekly report."*

---

## Step 6: The Current Week's Report

**Show:** Reports page → select current week's report

**Talking Points:**
- Walk through actual output structure:
  - Executive summary (AI-generated synthesis)
  - Category summaries (per-section insights)
  - Individual articles with relevance scores
- Show article details: title, authors, journal, abstract, relevance rationale

**Action:** Also show the actual email report (if available)

---

> **Transition:** *"This is powerful for a single week. But the real value emerges over time. Let me show you how reports build on each other week after week."*

---

## Step 7: Week-to-Week Continuity

**Show:** Reports page → compare multiple weeks

**Talking Points:**
- Reports build on prior weeks - not starting from scratch
- **Archival integration:** Previously seen articles are tracked
- **Mandate adjustment:** Can refine the semantic space over time
  - Add new topics as field evolves
  - Adjust entity definitions
  - Modify retrieval strategies
- **Contrast with ChatGPT/Deep Research:**
  - "With ChatGPT, you start fresh every week"
  - "Adjusting your approach is painful - you lose all context"
  - "No memory of what you've already seen"

**Action:** Show how a topic was refined or added based on previous weeks' findings

---

> **Transition:** *"And finally, what if you want to dig deeper into something you see in a report? You don't have to leave the platform or start a new session."*

---

## Step 8: Conversational Quality

**Show:** Chat panel on Reports page

**Talking Points:**
- Drill down into any aspect of the report conversationally
- Chat has full context of the report contents
- Can ask about specific articles, compare findings, explore themes
- Tools available: PubMed search, article retrieval, full-text access

**Action:**
- Ask a question about the report ("What are the key findings about [topic]?")
- Show drilling down into a specific article
- Demonstrate follow-up questions

---

> **Transition:** *"Let me bring this all together..."*

---

## Closing Summary

**Key Takeaways:**
1. **Systematic, not ad-hoc:** Research mandate captured as semantic space
2. **Methodological rigor:** SLR-informed retrieval, not one-shot searches
3. **Consistent presentation:** Stable categories, not weekly format changes
4. **Continuous intelligence:** Week-to-week continuity, not starting fresh
5. **Conversational depth:** Drill into findings without losing context

**Call to Action:** [TBD]

---

## Backup/Deep-Dive Sections

### If asked about the AI process for mandate extraction
- Show onboarding flow or explain the conversation-to-semantic-space process

### If asked about customization
- Show Layer 4: Content Enrichment (prompt customization)
- Demonstrate how prompts can be tailored per stream

### If asked about sources
- Currently PubMed-focused
- Architecture supports multiple sources
- Semantic filtering ensures relevance regardless of source

---

## Technical Requirements
- [ ] Ensure demo streams have recent reports
- [ ] Prepare email report example
- [ ] Test chat functionality with report context
- [ ] Have backup screenshots in case of connectivity issues
