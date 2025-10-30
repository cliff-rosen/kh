# Knowledge Horizons Workflow: A Detailed Walkthrough

This system represents an AI-orchestrated approach to automated horizon scanning for pharmaceutical and biotech executives. Let me walk you through how it works.

## The Conversational Onboarding Phase

The process begins with a **User Interview** - a conversational interaction where the system learns what matters to the executive. Rather than asking them to fill out forms or configure complex settings, the system has a natural dialogue to understand their information needs, strategic priorities, and areas of focus.

From this conversation, we extract the essential structure through an **Onboarding Interview Strengths but Strengths but rawGlass** step. This converts the natural language discussion into structured representations - the topics they care about, the competitive landscape they're monitoring, the therapeutic areas that matter to their business. This isn't just keyword extraction; it's building a rich semantic model of their information needs.

## Building the Intelligence Layer

The conversation flows into the **Semantic Sphere Generator**, which creates what I call "semantic spheres" - multidimensional representations of topics that capture not just keywords, but concepts, relationships, and contextual boundaries. This is crucial for avoiding the "garbage in, garbage out" problem that plagues most automated research systems.

These spheres then get refined through the **Structured Semantic Sphere** phase, where we apply rigor and structure. This is where we're solving what I call the "Dirty Test Tube Problem" - making sure our research containers are clean before we start filling them with information.

## Creating the Search Strategy

The **Retrieval Taxonomy Generator** takes these structured spheres and develops sophisticated search strategies. This isn't simple keyword searching - it's creating taxonomies that understand the difference between, say, "CAR-T therapy clinical trials" and "CAR-T manufacturing challenges." It knows how to search across different types of sources with different query strategies.

This taxonomy feeds two parallel paths:

On the left, it informs the **Presentation Taxonomy Generator**, which creates the structure for how information will eventually be presented back to the executive. This is thinking ahead about the end deliverable from the very beginning.

On the right, it drives the **Filter Rules Generator**, which creates intelligent filtering criteria. These rules understand context - they know that an article about a competitor's Phase III trial failure is more relevant than their quarterly earnings report, even if both mention the company name.

## The Research Engine

At the heart of the system sits the **Retrieval** process, which queries multiple **Sources** - scientific databases, news feeds, regulatory filings, conference proceedings, and more. But here's the key: it's not just dumping search results into a pile.

The **Candidate Articles** stage represents raw results, but they're immediately processed through the **Filter** using those intelligent rules we generated earlier. This is a quality gate - we're applying context-aware filtering that understands relevance in a way that simple keyword matching never could.

What emerges are **Filtered Articles** - a curated set of information that's actually worth an executive's attention.

## Report Generation with Intelligence

The **Report Generator** takes these filtered articles and synthesizes them into coherent reports. This isn't just concatenation - it's understanding themes, identifying patterns, recognizing what's strategically significant versus merely interesting.

The final **Report** artifact goes back to inform the **Presentation Taxonomy**, creating a feedback loop. The system learns from what it generates, refining its understanding of how to structure and present information for this particular executive's needs.

## Why This Architecture Matters

Notice what's happening here: we're systematically decomposing the problem of "keep me informed about what matters" into discrete, manageable steps. Each step has clear inputs, clear outputs, and clear quality criteria.

The workflow separates concerns - retrieval is separate from filtering, filtering is separate from synthesis, synthesis is separate from presentation. This means each component can be optimized independently, tested independently, and improved independently.

The color coding reveals the architecture: blue represents intermediate representations (things that exist to support the process but aren't end deliverables), tan represents generative processes (where we're creating new representations), green represents processes that use existing representations (retrieval and filtering operations), and pink represents final artifacts.

This is AI orchestration in practice - not asking an LLM to "research this topic for me" in a single turn, but creating a systematic workflow where each AI interaction has a specific job, clear constraints, and measurable quality criteria. It's the difference between hoping the AI gets it right and engineering a system that reliably produces quality results.