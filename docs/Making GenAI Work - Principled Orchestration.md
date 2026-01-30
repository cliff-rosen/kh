# Making Generative AI Work: Principled Orchestration

## The Gap Between Potential and Reality

Large language models demonstrate remarkable capabilities—reasoning, synthesis, language understanding that seemed impossible five years ago. They can perform cognitive operations that previously required humans: extracting key points from documents, evaluating whether content meets criteria, drafting communications, synthesizing information from multiple sources.

Yet most companies struggle to move from impressive demos to reliable production systems. The outputs are inconsistent. Systems work sometimes but not reliably. Edge cases proliferate. This isn't a matter of waiting for better models. The gap has a specific cause and a specific solution.

## The Memento Problem

LLMs are like the protagonist in *Memento*—brilliant within any given moment, but starting from scratch every time with a limited aperture.

Within a single interaction, they're powerful: logical, capable of sophisticated reasoning, able to synthesize information coherently. But they have no persistent memory across calls. Their context window is finite. They have no access to information unless it's explicitly provided. Every turn begins fresh with only what fits in the window.

This is architectural, not a bug the next release will fix.

This matters for business applications because real work often requires accumulating information over time, maintaining consistency across many interactions, accessing proprietary data the model was never trained on, or reasoning that exceeds what one pass can accomplish. The Memento problem breaks all of these.

## What We See Go Wrong

Three patterns consistently lead to failed AI initiatives:

**The "just ask it" trap.** Complex tasks get sent to an LLM in a single prompt, hoping for the best. This works in demos; it fails in production when edge cases emerge. The model *satisfices*—gives "good enough" answers rather than optimal ones. Ask it to do better, and you'll often get a better response. The first answer didn't use all available capability.

**The Dirty Test Tube problem.** After several turns of conversation, the context accumulates tangents, dead ends, and failed attempts. This conversational debris dilutes the signal for the current task. The model performs *worse*, not better, as the conversation continues. Accumulated context becomes polluted context.

**Workflow Drift.** Asking the LLM to manage multi-step processes, track state, or loop until conditions are met. LLMs skip steps, reorder operations, forget their own plans across turns. They're stateless—the Memento problem strikes again. Delegating workflow management to the model is delegating to something that can't reliably do it.

These aren't user errors. They're natural assumptions that don't match how the technology actually works.

## The Solution: Principled Orchestration

Orchestration is coordinating multiple prompts, models, and tools to achieve what single interactions cannot. But not all orchestration is equal. The difference between ad-hoc prompting and principled orchestration is the difference between demos and production systems.

### Two Roles for LLMs

In orchestrated systems, LLMs serve two fundamentally different roles:

**Worker**—executing discrete cognitive operations within a designed workflow. The system defines the steps; the LLM executes each one. This is predictable, auditable, and optimizable. The LLM applies full cognitive focus to a bounded task.

**Planner**—deciding which operations to perform based on goals and available capabilities. The system provides tools; the LLM determines the path. This is flexible and handles novel situations well. It's appropriate where the right approach depends on what you discover along the way.

### The Recursive Structure

The real insight is that these modes combine—and can nest to arbitrary depth.

**Deterministic workflows with agentic steps.** A claims processing system might have a fixed outer workflow: receive claim, validate format, assess coverage, calculate payout, generate decision letter. This sequence is locked for compliance and auditability. But "assess coverage" might require research, judgment about ambiguous policy provisions, synthesis of multiple documents. That step invokes an agent. The outer workflow knows *what* it needs; it delegates *how* to an LLM that can adapt its approach to each specific claim.

**Agentic systems with deterministic tools.** A customer service interface handles open-ended requests—it can't predict what users will ask. The entry point is necessarily flexible. But when the agent determines the user needs a policy summary, it doesn't improvise one from scratch. It calls a "generate policy summary" tool that runs a proven, optimized pipeline internally. The agent makes strategic decisions; reliable workflows handle production of specific artifacts.

The design implication: choose the top level based on the domain. Regulated processes often want deterministic tops—predictable, auditable, consistent. Customer-facing interfaces handling diverse requests often need agentic tops—flexible, adaptive. Then layer appropriately underneath.

### The Sandwich Insight

Every LLM call exists within a "sandwich" of encoded intelligence:

- **Downstream** (in the tools it can call)—algorithms and domain logic the LLM pulls when needed
- **Upstream** (in the orchestration that invoked it)—workflow design, timing, and curated context pushed to the LLM

The orchestration architecture *is* the encoded intelligence. The design of the system—what calls what, with what context, in what sequence—embeds expertise that the LLM alone doesn't possess.

### Principles That Make It Work

Four principles separate effective orchestration from ad-hoc prompting:

**Make intentions explicit.** "Improve this email" hides dozens of implicit decisions—what counts as improvement, what to preserve, what to cut. Decompose into visible, verifiable steps: extract key points, identify structural issues, propose remedies, apply changes. Each step can be inspected and corrected.

**Quality gates at critical junctions.** Verify outputs before proceeding. If step two produces flawed output, every subsequent step is compromised. Gates catch errors before they propagate. Don't proceed past a checkpoint until conditions are met.

**Sterile context per step.** Each step gets exactly the context it needs—not accumulated conversation history. Fresh, relevant context beats polluted context. This directly addresses the Dirty Test Tube problem.

**Externalize state and workflow.** Loops, counters, progress tracking, and conditional logic live outside the LLM. Let the model do what it's good at—reasoning about language and content. Let the orchestration layer handle what it's good at—reliable execution of defined processes.

## Example: From Simple RAG to Orchestrated Research

The difference between naive and principled approaches is visible in how systems handle research questions.

**Simple RAG** (what most companies build): User question goes in, gets embedded, retrieves the top chunks from a vector store, sends them to an LLM, answer comes out. This has no concept of "completeness"—it retrieves once and hopes it's enough. No conflict detection when sources disagree. No iterative refinement based on what's missing. No way to know if the answer is actually grounded in sufficient evidence.

**Orchestrated approach:**

1. **Clarify**—Disambiguate the question. What specifically does the user need? This may involve the user.
2. **Plan**—Generate a checklist: what would a complete, well-supported answer require?
3. **Iterative retrieval loop:**
   - Analyze gaps: what's still missing from the checklist?
   - Generate targeted queries for specific gaps
   - Evaluate results: relevant? contradictory? merely confirmatory?
   - Integrate into a knowledge base with provenance tracking
   - Check completeness against the checklist
   - Exit when requirements are met—not after a fixed number of retrievals
4. **Synthesize**—Generate the answer from accumulated knowledge, with citations to sources

This approach has explicit completeness criteria, iterative gap-filling, conflict awareness, and an audit trail. Every claim traces back to a source. The workflow encodes how an expert researcher actually operates—not how a demo works.

## What This Enables

Principled orchestration produces systems with characteristics that enterprises require:

**Reliability.** Systems that work consistently, not occasionally. The same input produces dependably high-quality output.

**Auditability.** Clear logs of what happened at each step. For regulated industries, this isn't optional. You can demonstrate that every case went through required evaluation steps.

**Debuggability.** When something fails, you know which step broke and why. Fix that step; don't restart from scratch.

**Capability extraction.** Structured decomposition unlocks performance that single-turn interactions leave on the table. The latent capability is in the model. Orchestration extracts it.

**Appropriate trust.** Human oversight at the junctions that matter, automation where it's safe. The system makes its reasoning visible rather than operating as a black box.

---

The technology is powerful. The design choices determine whether that power translates to reliable value. Principled orchestration is how you get from impressive demos to systems that actually work.
