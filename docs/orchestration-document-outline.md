# Orchestration Document Outline (Revised)

**Audience:** Jeff Heaton (AI researcher, ML practitioner, actuarial background), Tim Rozar (RGA executive, FSA, innovation-focused)

**Purpose:** Demonstrate deep understanding + practical ability to extract real business value from LLMs

**Length:** 2-3 pages

---

## I. The Gap Between Potential and Reality

**Opening hook:** LLMs demonstrate remarkable capabilities - reasoning, synthesis, language understanding that seemed impossible five years ago. Yet most companies struggle to move from impressive demos to reliable production systems.

- The potential is real: these models can perform cognitive operations that previously required humans
- The struggle is also real: inconsistent outputs, systems that work sometimes but not reliably
- This isn't a matter of waiting for better models - the gap has a specific cause and a specific solution

---

## II. The Memento Problem

**Core insight:** LLMs are like the protagonist in Memento - brilliant within any given moment, but starting from scratch every time with a limited aperture.

- Powerful at logic, reasoning, synthesis *within* a single interaction
- But: no persistent memory across calls, limited context window, no access to information unless explicitly provided
- Every turn begins fresh with only what fits in the window
- This is architectural, not a bug the next release will fix

**Why this breaks business applications:**
- Tasks requiring information accumulated over time
- Tasks requiring consistency across many interactions
- Tasks requiring proprietary data the model was never trained on
- Tasks exceeding what one reasoning pass can accomplish

---

## III. What We See Go Wrong

Three patterns that lead to failed AI initiatives:

**1. The "just ask it" trap**
- Complex tasks sent to an LLM in a single prompt, hoping for the best
- Works in demos; fails in production when edge cases emerge
- The model satisfices (gives "good enough") rather than maximizes

**2. The Dirty Test Tube problem**
- After several turns, context accumulates tangents, dead ends, failed attempts
- This conversational debris dilutes the signal for the current task
- The model performs worse, not better, as the conversation continues

**3. Workflow Drift**
- Asking the LLM to manage multi-step processes, track state, or loop until done
- LLMs skip steps, reorder, forget their own plans across turns
- They're stateless - the Memento problem strikes again

These aren't user errors - they're natural assumptions that don't match how the technology works.

---

## IV. The Solution: Principled Orchestration

**Orchestration** is coordinating multiple prompts, models, and tools to achieve what single interactions cannot.

### Two roles for LLMs in orchestrated systems:

**Worker** - Executing discrete cognitive operations within a designed workflow
- System defines the steps; LLM executes each one
- Predictable, auditable, optimizable
- The LLM applies full cognitive focus to a bounded task

**Planner** - Deciding which operations to perform based on goals and available tools
- System provides capabilities; LLM determines the path
- Flexible, handles novel situations
- Used where the right approach depends on what you find along the way

**The key insight:** Every LLM call exists in a "sandwich" of encoded intelligence:
- **Downstream** (in the tools it can call) - algorithms and domain logic the LLM pulls when needed
- **Upstream** (in the orchestration that invoked it) - workflow design, timing, and curated context pushed to the LLM

Production systems layer these deliberately. The orchestration architecture *is* the encoded intelligence.

### Principles that separate effective orchestration from ad-hoc prompting:

- **Make intentions explicit** - "Improve this email" hides dozens of implicit decisions. Decompose into visible, verifiable steps.
- **Quality gates at critical junctions** - Verify outputs before proceeding. Catch errors before they propagate.
- **Sterile context per step** - Each step gets exactly what it needs, not accumulated conversation history. Fresh, relevant context beats polluted context.
- **Externalize state and workflow** - Loops, counters, and progress tracking live outside the LLM. Let it do what it's good at.

---

## V. Example: From Simple RAG to Orchestrated Research

*[Demonstrates the difference between naive and principled approaches]*

**Simple RAG (what most companies build):**
1. User question → embed → retrieve top chunks → send to LLM → answer
2. No concept of "completeness" - retrieves once and hopes it's enough
3. No conflict detection, no gap filling, no iterative refinement

**Orchestrated approach:**
1. **Clarify** - Disambiguate the question (may involve the user)
2. **Plan** - Generate a checklist of what a complete answer requires
3. **Iterative retrieval loop:**
   - Analyze gaps: what's still missing?
   - Generate targeted queries for specific gaps
   - Evaluate results: relevant? contradictory? confirmatory?
   - Integrate into knowledge base with provenance
   - Check completeness against checklist
   - Exit when requirements met
4. **Synthesize** - Generate answer with citations from accumulated knowledge

**Why this matters:**
- Explicit completeness criteria - knows when it's done
- Iterative refinement - fills specific gaps, not random retrieval
- Conflict awareness - tracks contradictions with sources
- Audit trail - every claim has provenance
- The workflow encodes how an expert researcher actually operates

---

## VI. What This Enables

- **Reliability** - Systems that work consistently, not occasionally
- **Auditability** - Clear logs of what happened at each step (critical for regulated industries)
- **Debuggability** - When something fails, you know which step broke and why
- **Capability extraction** - Structured decomposition unlocks performance that single-turn interactions leave on the table
- **Appropriate trust** - Human oversight at the junctions that matter, automation where it's safe

---

## Notes for Draft

- **Tone:** Confident expertise, direct, not sales-y
- **"What goes wrong" section:** Shows battle-tested experience - we've seen what fails
- **The "sandwich" insight:** This is a distinctive framing that shows architectural thinking
- **Example:** Shows we can actually decompose tasks, not just talk about principles
- **Keep tight:** These readers will appreciate density over padding
- **Consider:** A brief note about insurance applications (claims review, underwriting research, policy analysis) as natural fits for this approach
