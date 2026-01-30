# Orchestration Document Outline

**Audience:** Jeff Heaton (AI researcher, ML practitioner, actuarial background), Tim Rozar (RGA executive, FSA, innovation-focused)

**Purpose:** Demonstrate deep understanding + practical ability to extract real business value from LLMs

**Length:** 2-3 pages

---

## I. The Gap Between Potential and Reality

**Opening hook:** LLMs demonstrate remarkable capabilities - reasoning, synthesis, language understanding that seemed impossible five years ago. Yet most companies struggle to move from impressive demos to reliable production systems.

- The potential is real: these models can perform cognitive operations that previously required humans
- The struggle is also real: inconsistent outputs, hallucinations, systems that work sometimes but not reliably
- This isn't a matter of waiting for better models - the gap has a specific cause and a specific solution

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

## III. What We See Companies Get Wrong

Three common patterns that lead to failed AI initiatives:

1. **The "just ask it" approach** - Sending complex tasks to an LLM in a single prompt and hoping for the best. Works in demos, fails in production when edge cases emerge.

2. **Over-trusting agentic systems** - Giving LLMs autonomy to figure out multi-step processes. Agents are powerful but unreliable for tasks requiring consistency. Every decision point is a potential failure point.

3. **Ignoring the state problem** - Asking LLMs to remember, track progress, or loop until done. They can't. They're stateless. The Memento problem strikes again.

These aren't user errors - they're natural assumptions that don't match how the technology actually works.

## IV. The Solution: Principled Orchestration

**Orchestration** is coordinating multiple prompts, models, and tools to achieve what single interactions cannot. But not all orchestration is equal.

**Two roles for LLMs in orchestrated systems:**

1. **Worker** - Executing discrete cognitive operations within a designed workflow
   - System defines the steps; LLM executes each one
   - Predictable, auditable, optimizable
   - Example: "Extract the key claims from this document" (bounded task, clear input/output)

2. **Planner** - Deciding which operations to perform based on goals and available tools
   - System provides capabilities; LLM determines the path
   - Flexible, handles novel situations
   - Example: Open-ended research where the right approach depends on what you find

**The design insight:** Production systems layer these. Deterministic workflows provide reliability; agentic steps provide flexibility where needed. Well-designed tools encapsulate complexity so agents make fewer, better decisions.

**Principles that separate effective orchestration from ad-hoc prompting:**

- **Make intentions explicit** - "Improve this email" hides dozens of implicit decisions. Decompose into visible, verifiable steps.
- **Quality gates at critical junctions** - Verify outputs before proceeding. Catch errors before they propagate.
- **Cognitive focus** - Each step gets exactly the context it needs. Fresh, relevant context beats accumulated conversation history.
- **Externalize state and workflow** - Loops, counters, and progress tracking live outside the LLM. Let it do what it's good at.

## V. Example: Document Verification

*[Brief concrete example - could be tailored to insurance context]*

**Naive approach:** "Review this document and verify all factual claims."
- LLM attempts everything at once
- Misses claims, retrieves inconsistently, can't track what's been verified
- Results vary run to run

**Orchestrated approach:**
1. **Extract** - Identify all factual claims (focused analytical task)
2. **Classify** - Categorize each claim by type and verification needs
3. **Retrieve** - For each claim, execute targeted retrieval with defined adequacy criteria
4. **Verify** - Compare claim against retrieved sources
5. **Compile** - Aggregate results with supporting evidence

The workflow manages state. Each step has clear inputs and outputs. Quality gates catch errors early. The LLM applies full cognitive focus to each bounded task.

## VI. What This Enables

- **Reliability** - Systems that work consistently, not just occasionally
- **Auditability** - Clear logs of what happened at each step (critical for regulated industries)
- **Debuggability** - When something fails, you know which step broke
- **Capability extraction** - Structured decomposition unlocks performance that single-turn interactions leave on the table
- **Appropriate trust** - Human oversight at the junctions that matter

---

## Notes for Draft

- Tone: confident expertise, direct, not sales-y
- The "what companies get wrong" section shows battle-tested experience
- The example shows we can actually decompose tasks, not just talk about it
- Could tailor the example toward insurance (claims review, underwriting assessment) if desired
- Keep tight - these readers will appreciate density over padding
