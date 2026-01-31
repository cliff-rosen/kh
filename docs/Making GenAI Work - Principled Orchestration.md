# Making Generative AI Work: Principled Orchestration

## The Gap Between Potential and Reality

Everyone who has worked seriously with LLMs knows the pattern: stunning capability in demos, frustrating inconsistency in production. The model that brilliantly summarized a document yesterday produces something shallow today. The agent that handled ten queries flawlessly falls apart on the eleventh. Edge cases proliferate. Reliability remains elusive.

This isn't a matter of waiting for better models. The gap traces to specific architectural limitations—and understanding them points to the solution.

## The Memento Problem

In the film *Memento*, the protagonist can't form new memories. He's intelligent—capable of logical reasoning, solving problems, carrying on sophisticated conversations. But every few minutes, his slate is wiped clean. He has to reconstruct his understanding from notes, photographs, and tattoos he's left for himself. He can be manipulated by people who feed him misleading context, because he has no way to verify it against his own memory.

LLMs have the same condition.

Within a single interaction, they're powerful: logical, capable of sophisticated reasoning, able to synthesize information coherently. But they have no persistent memory across calls. Their context window is finite. They have no access to information unless it's explicitly provided. Every turn begins fresh with only what fits in the window.

This is architectural, not a bug the next release will fix.

The implication is profound: since you can't fit everything into the context window, you're forced to select a subset. And now you face the real challenge—how do you determine *which* subset? How do you ensure the model has exactly the context it needs for each decision, and not the wrong context, or missing context, or polluted context? Get this wrong and the model reasons brilliantly from flawed premises.

There's a deeper problem: the model doesn't know what it doesn't know. This matters most when LLMs are part of the decision-making process—deciding what to do next, what information to gather, whether enough research has been done. When an LLM decides "I have enough information" or "I don't need to search for X," it makes that judgment with no awareness of what might be missing.

This is where things go seriously wrong. The model confidently skips the search it didn't know it needed. It won't flag uncertainty about considerations it never considered. The error is invisible—the right step was never executed, so there's nothing to catch. You see the LLM make bad decisions: recommending the wrong approach, missing key considerations, producing outputs that don't account for critical facts. The output looks confident, but it's built on the wrong foundation.

## The Cognitive Allocation Problem

Humans have two modes of thinking: fast and slow. Fast thinking handles routine tasks automatically. Slow thinking engages when something is complex—we pause, break things into parts, allocate more mental effort. Crucially, we know when to shift gears.

LLMs don't have this switch. They're always in fast-thinking mode. No matter what's required in the moment, they generate responses at the same pace, with the same approach. They can't recognize "this needs more thought" and slow down to give it more thought.

Reasoning models attempt to address this—they generate more "thinking" tokens before answering, which means more total compute. But there's a deeper problem: the model still has to *decide* whether to reason more. And that decision is made with the same limitations. It doesn't know what it doesn't know. It might confidently assess "this is straightforward" and be wrong.

You see this as the "do better" phenomenon: ask an LLM to write something, then simply say "improve that." It produces a better response—often significantly better. This reveals that the first response didn't use all the capability available in the model. Like a human giving a quick answer, the LLM satisfices rather than maximizes. It produces something reasonable, not something optimal.

You also see it in hidden intentions. A request like "make this email more professional and concise" contains implicit sub-decisions: What counts as professional? What information is essential versus removable? What tone is appropriate for this context? The model makes quick judgments about all of these without showing its work. Errors in these implicit steps go undetected—you only see the final output, not the reasoning that produced it.

The result: complex tasks get shallow treatment. The LLM has the capability to do better work, but the conditions don't allow it. Critical sub-decisions happen in passing rather than getting dedicated attention.

## The Grounding Problem

Everyone knows LLMs "hallucinate." But most people think of this as an occasional failure—the model sometimes makes things up. The reality is more fundamental: LLMs have no relationship to truth, only to plausibility.

The model generates statistically likely text given its input. It has no world model, no way to verify claims against reality, no internal representation of what's actually true versus what sounds true. When it produces correct information, it's because correct information was statistically likely given the training data and context—not because it checked.

This matters beyond the obvious "don't trust unverified facts" warning. It means the model can't serve as a source of ground truth for anything:

- **State tracking**: It can generate text that looks like it's tracking state ("I've completed steps 1 and 2, now moving to step 3"), but this is generated narrative, not actual state.
- **Branching decisions**: When a workflow needs to branch based on whether a condition is met, the model produces a plausible response, not a verified answer.
- **Verification**: It can generate text that looks like verification ("I've confirmed that X is correct"), but it's producing what confirmation would sound like.

You see this as workflow drift. The model commits to an approach, then wanders or skips steps. Plans exist only in context; the LLM reorders, forgets, or abandons its own plan across turns. There's no actual tracking underneath—just narrative about what it's doing, which may or may not reflect reality.

This is architectural. The model produces what things *sound like*, not what they *are*.

## The Path Forward

These aren't user errors or prompting failures. They're architectural realities. You can't prompt your way around them. Better instructions don't give the model persistent memory, don't make it shift into slow thinking, don't give it a relationship to truth.

You have to design around them.

## The Solution: Principled Orchestration

Orchestration is coordinating multiple prompts, models, and tools to achieve what single interactions cannot.

### Two Roles for LLMs

In orchestrated systems, LLMs serve two fundamentally different roles:

**Worker**—executing discrete cognitive operations within a designed workflow. The system defines the steps; the LLM executes each one. This is predictable, auditable, and optimizable.

**Planner**—deciding which operations to perform based on goals and available capabilities. The system provides tools; the LLM determines the path. This is flexible and handles novel situations well.

### The Critical Design Insight

Agentic decision-making has power—reach and flexibility that rigid workflows can't match. But many systems fail because they don't realize: **sometimes you need a deterministic layer above the agentic layer.**

The real power comes from designing these layers intelligently:

**Deterministic workflows with agentic steps.** A claims processing system might have a fixed outer workflow: receive claim, validate format, assess coverage, calculate payout, generate decision letter. This sequence is locked for compliance. But "assess coverage" might require research, judgment about ambiguous situations, synthesis of multiple documents. That step invokes an agent. The outer workflow knows *what* it needs; it delegates *how* to an LLM that can adapt.

**Agentic systems with deterministic tools.** A customer service agent handles open-ended requests—it can't predict what users will ask. But when the agent determines the user needs a policy summary, it doesn't improvise one. It calls a "generate policy summary" tool that runs a proven, optimized pipeline internally. The agent makes strategic decisions; reliable workflows handle production of specific artifacts.

Choose the top level based on the domain. Regulated processes want deterministic tops for auditability. Customer-facing interfaces need agentic tops for flexibility. Then layer appropriately underneath.

### Where Intelligence Lives

This is not just defensive—working around LLM limitations. It's about **where expertise lives in the system**.

LLMs bring certain capabilities: language understanding, synthesis, reasoning within context. But humans still have domain expertise, institutional knowledge, judgment about "how we do things here," understanding of edge cases and what actually matters. For the foreseeable future, human judgment in specific domains will exceed what LLMs can provide.

The question is how to combine them. Orchestration is how you encode human intelligence into the system:

**From above**—in workflow design. The sequence of steps, the decision points, what gets checked and when. This is institutional knowledge made executable. The LLM doesn't decide the process; it operates within a process that embeds expertise.

**From below**—in tool abstraction. A well-designed tool doesn't just give the LLM a capability; it encodes "the right way to do this." Instead of letting the model freestyle with primitives like fetch and search, you give it a research tool that internally handles query formulation, result evaluation, and gap analysis. The expertise is in the tool; the LLM just invokes it.

The LLM executes; the encoded intelligence guides.

### Six Principles

**1. Decompose into explicit steps.** Don't let critical decisions happen in passing. Each important judgment gets dedicated attention with focused context.

**2. Curate sterile context.** Each step gets exactly what it needs—not accumulated conversation history, not everything that might be relevant, but precisely what this operation requires.

**3. Externalize state and control flow.** Loops, counters, progress tracking, and conditional logic live outside the LLM. Let it do what it's good at—reasoning about language and content.

**4. Bound before delegating.** Agentic freedom exists inside constrained containers. The caller limits scope before handing off. Don't give the LLM a task and expect it to freestyle correctly with primitive tools.

**5. Encode expertise in tool abstraction.** Higher-level tools encode "the right way to do this." A research tool that internally handles query formulation, result evaluation, and gap analysis reduces the LLM's decision surface and makes the happy path the default.

**6. Quality gates at critical junctions.** Verify outputs *and* strategic decisions before proceeding. Don't trust the model's self-assessment that it has enough information or made the right choice. Check against explicit criteria.

## Example: Research Done Right

Consider how most RAG systems work: question in, embed, retrieve top chunks, pass to LLM, answer out. The context curation is hope-based—grab the nearest vectors and trust they're sufficient.

Now consider what a competent human researcher actually does:

1. **Clarify**—Disambiguate the question. What specifically is needed?
2. **Plan**—Generate a checklist: what would a complete, well-supported answer require?
3. **Iterative retrieval loop:**
   - Analyze gaps: what's still missing from the checklist?
   - Generate targeted queries for specific gaps
   - Evaluate results: relevant? contradictory? merely confirmatory?
   - Integrate into a knowledge base with provenance tracking
   - Exit when requirements are met—not after a fixed number of retrievals
4. **Synthesize**—Generate the answer from accumulated knowledge, with citations

This isn't a better algorithm. It's encoding how an expert researcher actually works—into a system that executes reliably, repeatedly, at scale.

## What Changes

Systems built on principled orchestration work consistently, not occasionally. When something fails, you know which step broke and why—you fix that step, not the whole system. For regulated industries, you can demonstrate that every case went through required evaluation steps, because the path is explicit and logged.

Most importantly: the latent capability is already in the model. Orchestration is how you extract it. Structured decomposition unlocks performance that single-turn interactions leave on the table.

---

The technology is powerful. The orchestration architecture determines whether that power translates to reliable value. The model isn't the bottleneck—the usage pattern is.
