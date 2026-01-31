# Making Generative AI Work: Principled Orchestration

## The Gap Between Potential and Reality

Large language models demonstrate remarkable capabilities—reasoning, synthesis, language understanding that seemed impossible five years ago. They can extract key points from documents, evaluate whether content meets criteria, draft communications, synthesize information from multiple sources.

Yet most companies struggle to move from impressive demos to reliable production systems. The outputs are inconsistent. Systems work sometimes but not reliably. Edge cases proliferate. This isn't a matter of waiting for better models. The gap has a specific cause and a specific solution.

## The Memento Problem

In the film *Memento*, the protagonist can't form new memories. He's intelligent—capable of logical reasoning, solving problems, carrying on sophisticated conversations. But every few minutes, his slate is wiped clean. He has to reconstruct his understanding from notes, photographs, and tattoos he's left for himself. He can be manipulated by people who feed him misleading context, because he has no way to verify it against his own memory.

LLMs have the same condition.

Within a single interaction, they're powerful: logical, capable of sophisticated reasoning, able to synthesize information coherently. But they have no persistent memory across calls. Their context window is finite. They have no access to information unless it's explicitly provided. Every turn begins fresh with only what fits in the window.

This is architectural, not a bug the next release will fix.

The implication is profound: since you can't fit everything into the context window, you're forced to select a subset. And now you face the real challenge—how do you determine *which* subset? How do you ensure the model has exactly the context it needs for each decision, and not the wrong context, or missing context, or polluted context? Get this wrong and the model reasons brilliantly from flawed premises. The quality of the output is bounded by the quality of the context curation.

There's a deeper problem: the model doesn't know what it doesn't know. Anyone who has managed people recognizes this pattern—you see someone about to make a decision and you can tell they've sized things up wrong. They missed something in the analysis phase and don't realize it. They're confident. A good supervisor catches this before the bad decision propagates.

LLMs have this problem acutely. When an LLM decides "I have enough information" or "I don't need to search for X," it makes that judgment with no awareness of what might be missing. And here's the critical distinction:

- An atomic operation with wrong context produces bad output—catchable at quality gates.
- A strategic decision with wrong context means the wrong path is taken—the error is invisible because the right step was never executed.

The model will confidently skip the search it didn't know it needed. It won't flag uncertainty about considerations it never considered. This is where external supervision becomes essential—explicit criteria, checklists, governance that catches when the system has sized things up incorrectly, before the invisible error propagates.

## The Firehose Problem

A smart human, given a vague or complex request, pushes back. "What do you mean by 'improve this email'? Improve how—shorter? more professional? clearer structure? What matters most?" They surface the hidden intentions. They decompose the task before attempting it. They clarify scope, priorities, constraints. This is part of what makes them effective.

LLMs can do this too. They can ask clarifying questions. They can break tasks into steps. They can surface ambiguities and propose ways to resolve them. The capability exists.

But the typical usage pattern doesn't give them the opportunity. The pattern is: complex prompt in, complete answer out, all in one turn. This is the firehose—forcing everything through a single interaction.

When you do this, the model has no choice but to make all the implicit decisions immediately and silently. It won't stop to ask what you meant. It won't decompose the task into reviewable steps. It won't surface the hidden sub-decisions for your input. It will just produce something—making dozens of quick judgments you never see, can't inspect, and couldn't correct if you wanted to.

The firehose isn't a limitation of the model. It's a limitation of the usage pattern. And it's why "implicit instruction collapse" happens—not because LLMs can't clarify and decompose, but because the single-turn interaction doesn't let them.

## What We See Go Wrong

The Memento problem and the firehose problem manifest as three predictable failure modes:

**Implicit instruction collapse.** Complex tasks contain dozens of hidden sub-decisions that get collapsed into a single prompt. "Improve this email" actually means: identify what's essential, identify what's redundant, determine the right tone for this context, restructure for clarity, preserve key relationships, and so on. The model makes quick implicit judgments about all of these. Different runs produce different judgments. Outputs are inconsistent, and you can't inspect or correct the hidden decisions because they were never made visible.

**Context curation failure.** Not deliberately constructing the right context for each operation. This is the direct consequence of the Memento problem—you have to choose what goes in, and that choice determines the quality of the output. Most approaches either stuff everything in (hoping more is better) or grab whatever's nearest in vector space (hoping similarity is relevance). Neither is principled curation based on what this specific step actually needs. The model reasons brilliantly from whatever context it's given, even if that context is incomplete, irrelevant, or misleading.

**Stateless workflow delegation.** Asking a memoryless system to manage stateful processes. Loops, progress tracking, conditional branching, knowing what's been done and what remains—the model can't reliably do these because of the Memento problem. It will skip steps, reorder operations, lose track of where it is. Delegating workflow management to the model is delegating to something architecturally incapable of the task.

These aren't user errors. They're natural assumptions that don't match how the technology actually works.

## The Solution: Principled Orchestration

Orchestration is coordinating multiple prompts, models, and tools to achieve what single interactions cannot. The difference between ad-hoc prompting and principled orchestration is the difference between ignoring the Memento and Firehose problems and systematically designing around them.

### Two Roles for LLMs

In orchestrated systems, LLMs serve two fundamentally different roles:

**Worker**—executing discrete cognitive operations within a designed workflow. The system defines the steps; the LLM executes each one. This is predictable, auditable, and optimizable. The LLM applies full cognitive focus to a bounded task.

**Planner**—deciding which operations to perform based on goals and available capabilities. The system provides tools; the LLM determines the path. This is flexible and handles novel situations well. It's appropriate where the right approach depends on what you discover along the way.

### The Recursive Structure

The real insight is that these modes combine—and can nest to arbitrary depth.

**Deterministic workflows with agentic steps.** A claims processing system might have a fixed outer workflow: receive claim, validate format, assess coverage, calculate payout, generate decision letter. This sequence is locked for compliance and auditability. But "assess coverage" might require research, judgment about ambiguous policy provisions, synthesis of multiple documents. That step invokes an agent. The outer workflow knows *what* it needs; it delegates *how* to an LLM that can adapt its approach to each specific claim.

**Agentic systems with deterministic tools.** A customer service interface handles open-ended requests—it can't predict what users will ask. The entry point is necessarily flexible. But when the agent determines the user needs a policy summary, it doesn't improvise one from scratch. It calls a "generate policy summary" tool that runs a proven, optimized pipeline internally. The agent makes strategic decisions; reliable workflows handle production of specific artifacts.

The design implication: choose the top level based on the domain. Regulated processes often want deterministic tops—predictable, auditable, consistent. Customer-facing interfaces handling diverse requests often need agentic tops—flexible, adaptive. The architecture becomes a tree where each node chooses its mode based on what that layer requires.

### The Sandwich Insight

Every LLM call exists within a "sandwich" of encoded intelligence:

- **Downstream** (in the tools it can call)—algorithms and domain logic the LLM pulls when needed
- **Upstream** (in the orchestration that invoked it)—workflow design, timing, and curated context pushed to the LLM

The orchestration architecture *is* the encoded intelligence. The design of the system—what calls what, with what context, in what sequence—embeds expertise that the LLM alone doesn't possess.

### Principles That Make It Work

Four principles separate effective orchestration from ad-hoc prompting:

**Make intentions explicit.** "Improve this email" hides dozens of implicit decisions—what counts as improvement, what to preserve, what to cut. Decompose into visible, verifiable steps: extract key points, identify structural issues, propose remedies, apply changes. Each step can be inspected and corrected.

**Quality gates at critical junctions.** Verify outputs before proceeding—but also verify strategic decisions. If step two produces flawed output, every subsequent step is compromised. But if step two decides to skip a necessary search, the error is invisible. Gates must catch both: flawed outputs *and* flawed judgments about what's sufficient or unnecessary. Don't trust the model's assessment that it has enough. Check against explicit criteria.

**Sterile context per step.** Each step gets exactly the context it needs—not accumulated conversation history, not everything that might be relevant, but precisely what this operation requires. This directly addresses context curation failure.

**Externalize state and workflow.** Loops, counters, progress tracking, and conditional logic live outside the LLM. Let the model do what it's good at—reasoning about language and content. Let the orchestration layer handle what it's good at—reliable execution of defined processes.

## Example: From Simple RAG to Orchestrated Research

The context curation challenge shows up clearly in how systems handle research questions.

**Simple RAG** (what most companies build): User question goes in, gets embedded, retrieves the top chunks from a vector store, sends them to an LLM, answer comes out. The context curation is naive—grab the nearest vectors and hope they're what's needed. No concept of "completeness." No conflict detection when sources disagree. No iterative refinement based on what's missing. No way to know if the answer is actually grounded in sufficient evidence.

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

This approach solves the context curation problem systematically. Each step gets exactly the context it needs. The workflow has explicit completeness criteria, iterative gap-filling, conflict awareness, and an audit trail. Every claim traces back to a source. The design encodes how an expert researcher actually operates—not how a demo works.

## What This Enables

Principled orchestration produces systems with characteristics that enterprises require:

**Reliability.** Systems that work consistently, not occasionally. The same input produces dependably high-quality output.

**Auditability.** Clear logs of what happened at each step. For regulated industries, this isn't optional. You can demonstrate that every case went through required evaluation steps.

**Debuggability.** When something fails, you know which step broke and why. Fix that step; don't restart from scratch.

**Capability extraction.** Structured decomposition unlocks performance that single-turn interactions leave on the table. The latent capability is in the model. Orchestration extracts it.

**Appropriate trust.** Human oversight at the junctions that matter, automation where it's safe. The system makes its reasoning visible rather than operating as a black box.

---

The technology is powerful. The design choices determine whether that power translates to reliable value. Principled orchestration is how you get from impressive demos to systems that actually work.
