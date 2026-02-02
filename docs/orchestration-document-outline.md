# Orchestration Document Outline (Revised)
by Cliff Rosen, Ironcliff Partners

## Intro: The Gap Between Potential and Reality
- Demos work, production doesn't
- This traces to specific architectural limitations—understanding them points to the solution
- *(2-3 sentences, sets up what follows)*

---

## Part 1: The Problem Space

*Three architectural limitations, one opportunity. This section establishes why orchestration is necessary.*

### The Memento Problem
- Movie analogy: brilliant but no persistent memory
- LLMs: powerful within interaction, but no memory across calls, finite context window
- **The context curation challenge:** You're forced to select a subset—which subset?
- **Two failure modes:**
  - Output task with wrong context → bad information asset (catchable)
  - Planning/reasoning with wrong context → wrong branch, thousand miles an hour wrong way (invisible)

### The Cognitive Allocation Problem
- Humans: fast thinking vs slow thinking, know when to shift gears
- LLMs: always fast-thinking mode, can't recognize "this needs more thought"
- Reasoning models don't fully solve it—meta-decision has same blind spots
- **Symptoms:**
  - "Do better" phenomenon (satisficing vs maximizing)
  - Hidden intentions (implicit sub-decisions made without showing work)
  - Complex tasks get shallow treatment

### The Grounding Problem
- Hallucination is the familiar symptom, but goes deeper
- No relationship to truth, only plausibility
- Can't serve as ground truth for: state tracking, branching decisions, verification
- **Symptoms:**
  - Hallucination
  - Workflow drift—plan exists as narrative, not rigorous format; no actual plan underneath
- Model produces what things *sound like*, not what they *are*

### The Expertise Opportunity
- LLMs are powerful—in many cases outperform humans
- But domain experts still have wisdom, intuition, institutional knowledge
- Risk: that expertise gets lost when you let the model freestyle
- **Opportunity:** reach for that expertise and encode it into the system itself
- *(Transition: Three problems, one opportunity—both point to the same requirement: not better prompts, but designed systems)*

---

## Part 2: The Solution

*Principled orchestration: what it is, how to structure it, and the principles that make it work.*

### What Orchestration Is
- Coordinating multiple prompts, models, and tools to achieve what single interactions cannot
- The key question: **who's orchestrating?**

### Two Ways to Orchestrate
- **LLM decides** (agentic): flexible, handles novel situations, but subject to all three problems
- **External system decides** (deterministic): predictable, auditable, enforceable—but rigid
- The LLM as **Worker**: focused cognitive operations with clear inputs/outputs

### Encoding Intelligence From Above and Below
- This is where expertise lives—not just defensive, but the source of real value
- **From above**: workflow design encodes institutional knowledge (claims processing example)
- **From below**: tool abstraction encodes best practices (customer service example)
- Choose the top level based on domain; either way, encoded intelligence guides the work

### Principles for Getting This Right
*These flow from the problems and the encoding insight:*

1. **Decompose into explicit steps** — addresses Cognitive Allocation
2. **Curate sterile context** — addresses Memento
3. **Externalize state and control flow** — addresses Grounding
4. **Bound before delegating** — contains the risks of agentic flexibility
5. **Encode expertise in tool abstraction** — captures "from below" intelligence
6. **Quality gates at critical junctions** — prevents invisible errors

---

## Part 3: Example

*A concrete illustration of how this works in practice.*

### Research Done Right
- The naive approach: give LLM a search tool and a goal, hope for the best
- Why it fails: satisficing, missing gaps, contradictions—all three problems manifest

### The Orchestrated Approach
- **Phase 1: Clarification** — quality gate with human validation
- **Phase 2: Requirements Analysis** — explicit checklist, addresses Cognitive Allocation
- **Phase 3: Iterative Retrieval** — external knowledge base (actual state, not narrative), gap analysis loop
- **Phase 4: Synthesis** — focused task with verified materials

### What This Demonstrates
- Phases are fixed = encoding expertise "from above"
- Individual operations leverage LLM capability = Worker role
- Tools encode best practices = expertise "from below"
- External state = addresses Grounding
- Explicit checklist = addresses Cognitive Allocation
- Curated context per step = addresses Memento

---

## Closing: What Changes
- Reliability, debuggability, auditability
- When something fails, you know which step broke
- Latent capability already in model—orchestration extracts it
- **Final line:** The model isn't the bottleneck—the usage pattern is

---

## Notes on This Structure

**Why this works better:**
- Part 1 is self-contained: "here's what's broken and what's at stake"
- Part 2 is self-contained: "here's the solution and how to think about it"
- Part 3 is self-contained: "here's what it looks like in practice"
- The intro is minimal—just enough to frame what follows

**Decisions made:**
- Killed "Path Forward" as a section—it was just a transition sentence
- Merged "Two Roles," "Critical Design Insight," and "Where Intelligence Lives" into a coherent flow
- Made principles explicitly connect back to the problems
- Added "What This Demonstrates" to the example so it explicitly ties back to the framework

**Open questions:**
- Is the example too long relative to the rest? Could trim phases 1-4 if needed
- Should principles be numbered or woven into prose?
- Does the closing need more weight, or is the one-liner enough?
