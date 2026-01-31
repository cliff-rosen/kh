# Orchestration Document Outline (Revised)

**Audience:** Jeff Heaton (AI researcher, ML practitioner, actuarial background), Tim Rozar (RGA executive, FSA, innovation-focused)

**Purpose:** Demonstrate deep understanding + practical ability to extract real business value from LLMs

**Length:** 2-3 pages

---

## I. The Gap Between Potential and Reality

**Opening hook:** Everyone who has worked seriously with LLMs knows the pattern: stunning capability in demos, frustrating inconsistency in production.

- The potential is real
- The struggle is also real
- This isn't about waiting for better models—the gap has specific causes and a specific solution

---

## II. Three Architectural Limitations

*Present root causes only—save all solutions for Section IV*

### The Memento Problem

Like the protagonist in the film—brilliant within any moment, but starting fresh each time with limited aperture.

- No persistent memory across calls
- Finite context window forces context curation
- The real challenge: determining *which* subset of information to include
- Deeper problem: doesn't know what it doesn't know
- Key distinction: atomic errors (bad output, catchable) vs. strategic errors (wrong path taken, invisible)

### The Cognitive Allocation Problem

Fixed cognition per token—can't "think harder" on hard parts.

- Each token gets the same computational budget
- Can't pause, allocate more processing, then continue
- Reasoning models attempt this but: the meta-decision about whether to reason more has the same blind spots
- The model will confidently assess "this is straightforward" and be wrong

### The Grounding Problem

No relationship to truth, only to plausibility.

- Generates statistically likely text, not verified truth
- Can't serve as ground truth for: state tracking, branching decisions, verification
- Will confidently report progress it hasn't made, confirm conditions it hasn't checked
- This is architectural—the model produces what things *sound like*, not what they *are*

---

## III. What This Looks Like

*Observable symptoms—connect each to root cause*

**Plans drift** (from Grounding): Model commits to an approach, then wanders or skips steps. It generates narrative about what it's doing, not actual tracking of what's done.

**Complex tasks get shallow treatment** (from Cognitive Allocation): Implicit sub-decisions made silently, inconsistently. Different runs produce different judgments on the same input.

**Context goes wrong** (from Memento): Model reasons brilliantly from flawed premises—either missing critical information or polluted with irrelevant context.

---

## IV. The Solution: Principled Orchestration

**Definition:** Coordinating multiple prompts, models, and tools to achieve what single interactions cannot.

### Two Roles for LLMs

**Worker**—executing discrete cognitive operations within a designed workflow
- System defines the steps; LLM executes each one
- Predictable, auditable, optimizable

**Planner**—deciding which operations to perform based on goals and available capabilities
- System provides tools; LLM determines the path
- Flexible, handles novel situations

### The Critical Design Insight

Agentic decision-making has power—reach and flexibility. But many systems fail because they don't realize: **sometimes you need a deterministic layer above the agentic layer.**

The real power comes from designing these layers intelligently:
- **Deterministic workflows with agentic steps**: Fixed outer process for compliance/auditability, but complex judgment steps invoke agents
- **Agentic systems with deterministic tools**: Flexible entry point for diverse requests, but specific artifacts produced by proven pipelines

Choose the top level based on the domain. Regulated processes want deterministic tops. Customer-facing interfaces need agentic tops. Then layer appropriately underneath.

### Where Intelligence Lives

This is not just defensive—working around LLM limitations. It's about **where expertise lives in the system**.

LLMs bring: language understanding, synthesis, reasoning within context.

Humans still have: domain expertise, institutional knowledge, judgment about "how we do things here," understanding of edge cases.

**Orchestration is how you encode human intelligence into the system**—from above in workflow design, from below in tool abstraction. The LLM executes; the encoded intelligence guides.

### Six Principles

1. **Decompose into explicit steps** — Don't let critical decisions happen in passing. Each important judgment gets dedicated attention.

2. **Curate sterile context** — Each step gets exactly what it needs, not accumulated conversation history.

3. **Externalize state and control flow** — Loops, counters, progress tracking, branching live outside the LLM. Let it do what it's good at.

4. **Bound before delegating** — Agentic freedom exists inside constrained containers. The caller limits scope before handing off.

5. **Encode expertise in tool abstraction** — Don't make the LLM freestyle with primitives. Higher-level tools encode "the right way to do this," reducing the decision surface.

6. **Quality gates at critical junctions** — Verify outputs *and* strategic decisions before proceeding. Check against explicit criteria, not the model's self-assessment.

---

## V. Example: Research Done Right

**Simple RAG (what most companies build):**
- Question → embed → retrieve top chunks → send to LLM → answer
- Hope-based context curation
- No concept of completeness, no iteration

**Orchestrated approach:**
1. **Clarify** — Disambiguate the question
2. **Plan** — Generate checklist of what complete answer requires
3. **Iterative retrieval loop:**
   - Analyze gaps against checklist
   - Generate targeted queries
   - Evaluate results: relevant? contradictory?
   - Integrate with provenance tracking
   - Exit when requirements met
4. **Synthesize** — Generate answer with citations

This isn't a better algorithm—it's encoding how an expert researcher actually works.

---

## VI. What Changes

Connect benefits to the three limitations:

- **Reliability** (addresses all three) — Systems that work consistently, not occasionally
- **Auditability** (addresses Grounding) — Clear logs of what happened at each step; explicit rather than generated narrative
- **Debuggability** (addresses Cognitive Allocation) — When something fails, you know which step broke and why
- **Capability extraction** (addresses Memento) — Structured decomposition unlocks performance single-turn interactions leave on the table

**Closing:** The technology is powerful. The orchestration architecture determines whether that power translates to reliable value. The model isn't the bottleneck—the usage pattern is.

---

## Notes

- Keep tight—these readers appreciate density over padding
- The "where intelligence lives" framing is distinctive and important
- The tools abstraction point should land—it's non-obvious and valuable
- Consider brief insurance examples if space permits (claims, underwriting research)
