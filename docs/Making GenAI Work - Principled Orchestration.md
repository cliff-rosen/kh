# Making Generative AI Work: Principled Orchestration

## The Gap Between Potential and Reality

Everyone who has worked seriously with LLMs knows the pattern: stunning capability in demos, frustrating inconsistency in production. The model that brilliantly summarized a document yesterday produces something shallow today. The agent that handled ten queries flawlessly falls apart on the eleventh. Edge cases proliferate. Reliability remains elusive.

This isn't a matter of waiting for better models. The gap has a specific cause and a specific solution.

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

## The Cognitive Allocation Problem

LLMs have a fixed amount of cognition per token. Each token gets the same computational budget, whether it's a filler word or a critical judgment. The model can't "think harder" on the hard parts. It can't pause, allocate more processing to a complex decision, and then continue. It generates at constant cognitive intensity regardless of what's actually being decided.

Humans don't work this way. When something is complex, we slow down. We allocate more mental effort. We pause before answering. We break things into parts. We realize "this needs more thought" and give it more thought. We dynamically allocate cognitive resources based on difficulty.

Reasoning models attempt to address this—they generate more "thinking" tokens before answering, which means more total compute. But there's a deeper problem: the model still has to *decide* whether to reason more. And that decision is made with the same limitations. It doesn't know what it doesn't know. It might confidently assess "this is straightforward" and be wrong. The meta-decision about cognitive allocation has the same blind spots as everything else.

You could try to solve this by tuning the model to always go deep—run everything to ground. But that creates massive inefficiency on trivial tasks, and still doesn't guarantee it goes deep on the *right* things. It's still making judgments about completeness with the same limited self-awareness.

The solution is decomposition. If the model has fixed cognition per token, don't ask it to make critical judgments in passing while generating a larger response. Make those judgments explicit steps. Break complex tasks into bounded operations where the model applies its full cognitive capacity to one thing at a time. A decision that might get a few tokens of implicit processing in a monolithic response gets a dedicated step with focused context.

You can't rely on the model to decompose for itself—that decision has the same blind spots. This is the management problem again: you don't ask the employee "do you think this needs to be broken into steps?" You structure the work so critical decisions get dedicated attention by design.

## What We See Go Wrong

The Memento problem and the cognitive allocation problem manifest as predictable failure modes:

**Implicit instruction collapse** (from cognitive allocation): Hidden sub-decisions get made silently. Different runs produce different judgments. Outputs are inconsistent, and you can't inspect or correct decisions that were never made visible.

**Context curation failure** (from Memento): Not deliberately constructing the right context for each operation. This is the direct consequence of the Memento problem—you have to choose what goes in, and that choice determines the quality of the output. Most approaches either stuff everything in (hoping more is better) or grab whatever's nearest in vector space (hoping similarity is relevance). Neither is principled curation based on what this specific step actually needs. The model reasons brilliantly from whatever context it's given, even if that context is incomplete, irrelevant, or misleading.

**Stateless workflow delegation.** Asking a memoryless system to manage stateful processes. Loops, progress tracking, conditional branching, knowing what's been done and what remains—the model can't reliably do these because of the Memento problem. It will skip steps, reorder operations, lose track of where it is. Delegating workflow management to the model is delegating to something architecturally incapable of the task.

These aren't user errors. They're natural assumptions that don't match how the technology actually works.

## The Solution: Principled Orchestration

Orchestration is coordinating multiple prompts, models, and tools to achieve what single interactions cannot. The difference between ad-hoc prompting and principled orchestration is the difference between ignoring these constraints and systematically designing around them.

### Two Roles for LLMs

In orchestrated systems, LLMs serve two fundamentally different roles:

**Worker**—executing discrete cognitive operations within a designed workflow. The system defines the steps; the LLM executes each one. This is predictable, auditable, and optimizable. The LLM applies full cognitive focus to a bounded task.

**Planner**—deciding which operations to perform based on goals and available capabilities. The system provides tools; the LLM determines the path. This is flexible and handles novel situations well. It's appropriate where the right approach depends on what you discover along the way.

### The Recursive Structure

The real insight is that these modes combine—and can nest to arbitrary depth.

**Deterministic workflows with agentic steps.** A claims processing system might have a fixed outer workflow: receive claim, validate format, assess coverage, calculate payout, generate decision letter. This sequence is locked for compliance and auditability. But "assess coverage" might require research, judgment about ambiguous policy provisions, synthesis of multiple documents. That step invokes an agent. The outer workflow knows *what* it needs; it delegates *how* to an LLM that can adapt its approach to each specific claim.

**Agentic systems with deterministic tools.** A customer service interface handles open-ended requests—it can't predict what users will ask. The entry point is necessarily flexible. But when the agent determines the user needs a policy summary, it doesn't improvise one from scratch. It calls a "generate policy summary" tool that runs a proven, optimized pipeline internally. The agent makes strategic decisions; reliable workflows handle production of specific artifacts.

The design implication: choose the top level based on the domain. Regulated processes often want deterministic tops—predictable, auditable, consistent. Customer-facing interfaces handling diverse requests often need agentic tops—flexible, adaptive. The architecture becomes a tree where each node chooses its mode based on what that layer requires.

This means every LLM call exists within layers of encoded intelligence—downstream in the tools it can call, upstream in the orchestration that invoked it. The orchestration architecture *is* the intelligence. The design of the system—what calls what, with what context, in what sequence—embeds expertise that the LLM alone doesn't possess.

### Principles That Make It Work

Four principles separate effective orchestration from ad-hoc prompting:

**Make intentions explicit.** "Improve this email" hides dozens of implicit decisions—what counts as improvement, what to preserve, what to cut. Decompose into visible, verifiable steps: extract key points, identify structural issues, propose remedies, apply changes. Each step can be inspected and corrected.

**Quality gates at critical junctions.** Verify outputs before proceeding—but also verify strategic decisions. If step two produces flawed output, every subsequent step is compromised. But if step two decides to skip a necessary search, the error is invisible. Gates must catch both: flawed outputs *and* flawed judgments about what's sufficient or unnecessary. Don't trust the model's assessment that it has enough. Check against explicit criteria.

**Sterile context per step.** Each step gets exactly the context it needs—not accumulated conversation history, not everything that might be relevant, but precisely what this operation requires. This directly addresses context curation failure.

**Externalize state and workflow.** Loops, counters, progress tracking, and conditional logic live outside the LLM. Let the model do what it's good at—reasoning about language and content. Let the orchestration layer handle what it's good at—reliable execution of defined processes.

## Example: Research Done Right

Consider how most RAG systems work: question in, embed, retrieve top chunks, pass to LLM, answer out. The context curation is hope-based—grab the nearest vectors and trust they're sufficient. No concept of completeness. No conflict detection. No iteration. No way to know if the answer is grounded in adequate evidence.

Now consider what a competent human researcher actually does:

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

This isn't a better algorithm. It's encoding how an expert actually works—into a system that can execute it reliably, repeatedly, at scale.

## What Changes

The difference isn't subtle. Systems built on principled orchestration work consistently, not occasionally. When something fails, you know which step broke and why—you fix that step, not the whole system. For regulated industries, you can demonstrate that every case went through required evaluation steps, because the path is explicit and logged.

Most importantly: the latent capability is already in the model. Orchestration is how you extract it. Structured decomposition unlocks performance that single-turn interactions leave on the table. The model isn't the bottleneck. The usage pattern is.

---

The technology is powerful. The design choices determine whether that power translates to reliable value. Principled orchestration is how you get from impressive demos to systems that actually work.
