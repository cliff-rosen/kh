# Orchestration Document Outline (Current State)

**Audience:** Jeff Heaton (AI researcher, ML practitioner, actuarial background), Tim Rozar (RGA executive, FSA, innovation-focused)

**Purpose:** Demonstrate deep understanding + practical ability to extract real business value from LLMs

**Length:** 2-3 pages

---

## I. The Gap Between Potential and Reality
- Demos work, production doesn't
- This traces to specific architectural limitations—understanding them points to the solution

## II. The Memento Problem
- Movie analogy: brilliant but no persistent memory
- LLMs: powerful within interaction, but no memory across calls, finite context window
- **The context curation challenge:** You're forced to select a subset—which subset?
- **Two failure modes:**
  - Output task with wrong context → bad information asset (catchable)
  - Planning/reasoning with wrong context → wrong branch, thousand miles an hour wrong way (invisible)

## III. The Cognitive Allocation Problem
- Humans: fast thinking vs slow thinking, know when to shift gears
- LLMs: always fast-thinking mode, can't recognize "this needs more thought"
- Reasoning models don't fully solve it—meta-decision has same blind spots
- **Symptoms:**
  - "Do better" phenomenon (satisficing vs maximizing)
  - Hidden intentions (implicit sub-decisions made without showing work)
  - Complex tasks get shallow treatment

## IV. The Grounding Problem
- Hallucination is the familiar symptom, but goes deeper
- No relationship to truth, only plausibility
- Can't serve as ground truth for: state tracking, branching decisions, verification
- **Symptoms:**
  - Hallucination
  - Workflow drift—plan exists as narrative, not rigorous format; no actual plan underneath
- Model produces what things *sound like*, not what they *are*

## V. The Path Forward
- These are architectural realities requiring architectural solutions
- Not just a better prompt, but a designed system

## VI. The Solution: Principled Orchestration
- Definition: coordinating multiple prompts, models, and tools

### Two Roles for LLMs
- Setup: "There's a distinction that reveals much of the story..."
- **Worker**: executing discrete operations within designed workflow
- **Planner**: deciding which operations based on goals and capabilities

### The Critical Design Insight
- Agentic has power, but sometimes need deterministic layer above
- **Deterministic workflows with agentic steps** (claims example)
- **Agentic systems with deterministic tools** (customer service example)
- Choose top level based on domain

### Where Intelligence Lives
- Not just defensive—where expertise lives in the system
- Human judgment in specific domains exceeds LLMs for foreseeable future
- Orchestration encodes human intelligence:
  - **From above**: workflow design, institutional knowledge made executable
  - **From below**: tool abstraction, "the right way to do this"
- The LLM executes; the encoded intelligence guides

### Six Principles
1. Decompose into explicit steps
2. Curate sterile context
3. Externalize state and control flow
4. Bound before delegating
5. Encode expertise in tool abstraction
6. Quality gates at critical junctions

## VII. Example: Research Done Right
- Simple RAG: hope-based context curation
- Orchestrated: Clarify → Plan → Iterative retrieval loop → Synthesize
- Encoding how an expert researcher works

## VIII. What Changes
- Reliability, debuggability, auditability
- Latent capability already in model—orchestration extracts it
- **Closing:** The model isn't the bottleneck—the usage pattern is

---

## Critique

**What works:**
- Three problems are distinct and well-developed with symptoms integrated
- The "from above / from below" framing for encoding intelligence is strong
- Example is concrete

**Potential issues:**

1. **The Path Forward is thin.** It's just two sentences. Does it earn its own section? Could fold into either the preceding section or the solution section.

2. **Two Roles → Critical Design Insight transition is abrupt.** We describe Worker and Planner, then immediately jump to "sometimes you need deterministic above agentic." The connection isn't explicit. Why does knowing these two roles lead to the insight about layering?

3. **Where Intelligence Lives feels out of sequence.** We go: Two Roles → Layering Insight → Where Intelligence Lives → Principles. The "where intelligence lives" content is great but it's not clear why it comes after the layering discussion and before principles.

4. **Six Principles come last but feel disconnected.** We've built up this rich picture of roles, layers, encoding intelligence—then we drop into a numbered list. The principles should feel like they flow from everything we've said, but they just appear.

5. **Do we need both "Critical Design Insight" AND "Where Intelligence Lives"?** They're related—both about how to structure the system. Could they be combined?

6. **The example only illustrates some concepts.** It shows decomposition and iterative refinement, but doesn't really show the Worker/Planner distinction or the "from above/below" encoding.

**Possible restructure:**
- Merge Path Forward into the Grounding Problem conclusion or Solution intro
- After Two Roles, explicitly connect to the three problems: "When the LLM is a Worker, the Memento problem matters most. When it's a Planner, the Grounding problem becomes critical."
- Consider whether Critical Design Insight and Where Intelligence Lives should be combined or reordered
- Make the principles feel more like conclusions from the preceding discussion
