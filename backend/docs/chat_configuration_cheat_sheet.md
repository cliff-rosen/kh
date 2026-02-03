# Chat Configuration Cheat Sheet

A guide for administrators to configure, monitor, and troubleshoot the chat system.

---

## How Chat Configuration Works

The chat assistant's behavior is controlled by layered settings that combine at runtime:

```
GLOBAL PREAMBLE (platform-wide identity and rules)
    ↓
PAGE PERSONA (behavior on Reports, Streams, Tablizer, etc.)
    ↓
STREAM INSTRUCTIONS (domain-specific guidance for each research stream)
    ↓
HELP CONTENT (documentation the assistant can retrieve)
    ↓
TOOLS (what actions the assistant can perform)
```

Each layer adds context. When a user chats on the Reports page for a CAR-T stream, the assistant receives: global preamble + reports persona + CAR-T instructions + help content + report tools.

---

## Admin Panel: Chat Config Tab

Access via **Admin → Chat Config**. Six configuration tabs:

### Tab 1: System

**What you control:**
- **Global Preamble** — The foundation of all chat behavior. Defines what KH is, the assistant's role, and universal rules (tone, verbosity, etc.)
- **Max Tool Iterations** — How many tool-call loops allowed per request (default: 10, max: 20)

**When to edit the preamble:**
- Assistant is too verbose → Add "Be concise. Avoid over-explaining."
- Assistant is too complimentary → Add "Don't praise the user or KH."
- Assistant hallucinates → Add "If unsure, say so. Don't guess."
- Assistant asks too many questions → Add "Make reasonable interpretations for ambiguous requests. Don't ask for clarification unless truly necessary."

**Example preamble additions:**
```
## Response Style
- Be direct and concise
- Don't compliment the user or praise KH
- State your interpretation of ambiguous requests rather than asking
- If you can't do something reliably, say so instead of attempting it
```

### Tab 2: Pages

**What you control:**
- **Custom Persona** for each page (Reports, Streams, Tablizer, Article Viewer, etc.)

**What you can view:**
- Available tools per page/tab
- Available payloads (data types)
- Context builder status

**When to edit page personas:**
- Assistant doesn't understand what users do on this page
- Assistant offers irrelevant suggestions
- Assistant uses tools inappropriately for this page

**Example persona for Reports page:**
```
## Reports Page

Users explore research reports containing curated articles.

Your tools let you:
- Navigate reports and articles
- Get summaries and highlights
- Search within reports

Guidance:
- Always cite PMIDs so users can find articles
- If an article modal is open, focus on that article
- Don't offer to do things outside report exploration
```

### Tab 3: Streams

**What you control:**
- **Chat Instructions** for each research stream

**When to add stream instructions:**
- Stream covers a specialized domain with unique terminology
- Certain topics should be prioritized or de-prioritized
- Domain experts have specific interpretation needs

**Example stream instructions:**
```
This stream monitors CAR-T cell therapy research.

Key Topics: Manufacturing, persistence, solid tumors

Terminology:
- "Response" = clinical response (not immune response)
- "Exhaustion" = T-cell exhaustion, a key research focus

Priorities:
- Note any safety signals or adverse events
- Highlight manufacturing improvements
```

### Tab 4: Help

**What you control:**
- Help content organized by category (Getting Started, Reports, Streams, etc.)
- Topic narratives and summaries
- TOC preamble (what appears at top of help)
- Role-based visibility (member, org_admin, platform_admin)

**When to edit help:**
- Users ask questions the assistant can't answer
- Field meanings are unclear (add to Field Reference)
- Domain terms need definition (add to Glossary)
- Features have changed

**Key categories:**
| Category | Purpose |
|----------|---------|
| `field-reference` | What fields mean (dates, scores, inclusion status) |
| `glossary` | Domain terms and KH-specific concepts |
| `getting-started` | Onboarding and first steps |
| `reports` | How to use Reports page |
| `streams` | How to configure streams |

### Tab 5: Tools

**What you can view:**
- All available tools grouped by category
- Tool descriptions and parameters
- Which tools are global vs page-specific

**Note:** Tool definitions require code changes. This tab is read-only for understanding what's available.

### Tab 6: Payloads

**What you can view:**
- Data structures the assistant can send/receive
- Payload schemas and properties

**Note:** Payload definitions require code changes. This tab is read-only.

---

## Using Chat Diagnostics

### In-Chat Diagnostics (Bug Icon)

When viewing a chat conversation, messages with diagnostic data show a **bug icon**. Click it to open the diagnostics panel with three tabs:

#### Messages Tab
Shows what happened step-by-step:
- **System message** sent to the model (the full prompt)
- **Each iteration** of the conversation:
  - Messages sent to model
  - Model's response
  - Tool calls made (name, inputs, outputs, timing)

**Use this to answer:**
- What prompt did the assistant receive?
- Which tools did it call?
- What did each tool return?
- Did it misinterpret the tool output?

#### Config Tab
Shows the request settings:
- Model used (which Claude version)
- Max tokens and temperature
- Full system prompt
- Available tools and their schemas

**Use this to answer:**
- Was the right tool available?
- Was the prompt adequate?
- Were the tool descriptions clear?

#### Metrics Tab
Shows performance data:
- Total iterations used
- Token usage (input/output per iteration)
- Execution time
- Outcome (success, error, max_iterations_reached)

**Use this to answer:**
- Did it hit the iteration limit?
- Is token usage reasonable?
- How long did it take?

### Admin Conversation History

Access via **Admin → Conversations**. View all user conversations across the platform.

**Features:**
- Filter by user
- See message counts and timestamps
- Click any conversation to view full history
- Click "View Full Trace" on messages to see diagnostics

**Message badges indicate:**
| Badge | Meaning |
|-------|---------|
| `trace` / `diagnostics` (green) | Full diagnostic data available |
| `N tool calls` (purple) | Number of tools called |
| `payload` (orange) | Contains structured data |
| `N values` (cyan) | Suggested form values |
| `N actions` (pink) | Suggested UI actions |

---

## Troubleshooting Guide

When chat goes wrong, diagnose systematically:

### Problem: Wrong Tool Called

**Symptoms:** Assistant uses inappropriate tool for the task

**Diagnosis:**
1. Open diagnostics → Messages tab
2. Look at which tool was called and why
3. Check the system prompt — does it give clear guidance on when to use which tool?

**Fixes:**
- Edit **page persona** to clarify when to use which tool
- Edit **global preamble** to add general tool-selection rules
- Check **tool descriptions** (view in Tools tab) — are they clear?

### Problem: Tool Returned Wrong Data

**Symptoms:** Tool was called correctly but returned unexpected results

**Diagnosis:**
1. Open diagnostics → Messages tab
2. Find the tool call, examine inputs and outputs
3. Were the inputs reasonable? Was the output what you expected?

**Fixes:**
- This usually requires a code fix to the tool
- Document the issue with the specific inputs/outputs from diagnostics

### Problem: Assistant Misinterpreted Results

**Symptoms:** Tool worked correctly but assistant drew wrong conclusions

**Diagnosis:**
1. Open diagnostics → Messages tab
2. Check what the tool returned vs what the assistant said
3. Is there ambiguity in how the data should be interpreted?

**Fixes:**
- Add **help content** explaining how to interpret this data
- Edit **page persona** with interpretation guidance
- Add **stream instructions** for domain-specific interpretation

### Problem: Prompt Was Inadequate

**Symptoms:** Assistant didn't know something it should have

**Diagnosis:**
1. Open diagnostics → Config tab
2. Read the full system prompt
3. Is the needed information present?

**Fixes:**
- Edit **global preamble** for universal knowledge
- Edit **page persona** for page-specific knowledge
- Add **help content** for retrievable documentation
- Add **stream instructions** for domain knowledge

### Problem: Too Verbose / Too Complimentary / Too Boastful

**Symptoms:** Response style issues

**Diagnosis:**
1. Check the global preamble — are style rules present?
2. Check the page persona — any conflicting guidance?

**Fixes:**
Add explicit style rules to **global preamble**:
```
## Response Style
- Be concise. One paragraph unless more is needed.
- Don't praise the user ("Great question!")
- Don't boast about KH capabilities
- Don't over-explain your reasoning
- If uncertain, say so briefly
```

### Problem: Hallucination / Made-Up Results

**Symptoms:** Assistant claims things that aren't true

**Diagnosis:**
1. Open diagnostics → Messages tab
2. Did it call a tool? What did the tool return?
3. Did it make up data that wasn't in the tool response?

**Fixes:**
- Add to **global preamble**: "Only state facts from tool results. If you don't have data, say so."
- Add to **page persona**: Specific guidance on what can/can't be assumed
- Review **help content** — is there outdated information?

### Problem: Asks Too Many Clarifying Questions

**Symptoms:** Simple requests get met with questions instead of answers

**Diagnosis:**
1. Was the user's request actually ambiguous?
2. Check the preamble — is there guidance on ambiguity handling?

**Fixes:**
Add to **global preamble**:
```
## Handling Ambiguity
- For marginal ambiguity: Make a reasonable interpretation, state it, and answer
- Only ask for clarification when truly necessary (multiple valid interpretations with very different outcomes)
- Never ask more than one clarifying question at a time
- Max 2-3 options if you must ask
```

### Problem: Over-Eager / Doesn't Understand Task

**Symptoms:** Assistant jumps to action without understanding what's needed

**Diagnosis:**
1. Open diagnostics → Messages tab
2. Did it rush to call tools without reasoning?
3. Was the user's intent clear?

**Fixes:**
Add to **global preamble**:
```
## Before Acting
- Ensure you understand what the user wants
- If the request is complex, briefly state your plan before executing
- Don't attempt tasks you're not confident you can complete correctly
```

### Problem: Hit Max Iterations

**Symptoms:** Response ends abruptly, diagnostics show `outcome: max_iterations_reached`

**Diagnosis:**
1. Check Metrics tab — how many iterations were used?
2. Check Messages tab — what was it trying to do?
3. Was it stuck in a loop?

**Fixes:**
- Increase **max tool iterations** in System tab (if task legitimately needs more)
- If stuck in loop: likely a tool or prompt issue — check the pattern
- Add guidance to **page persona** about when to give up on complex tasks

---

## Quick Diagnosis Checklist

When investigating a chat issue:

1. **Open the conversation** in Admin → Conversations
2. **Find the problematic message** and click "View Full Trace"
3. **Check Messages tab:**
   - What prompt was sent?
   - What tools were called?
   - What did tools return?
   - Where did reasoning go wrong?
4. **Check Config tab:**
   - Were the right tools available?
   - Was the prompt complete?
5. **Check Metrics tab:**
   - Did it hit limits?
   - Performance issues?
6. **Identify the fix:**
   - Prompt issue → Edit preamble, persona, or help
   - Tool issue → Document for dev team
   - Missing knowledge → Add help content

---

## Configuration Checklist

### Before Release

- [ ] Global preamble includes style rules (concise, no flattery, no boasting)
- [ ] Global preamble includes ambiguity handling guidance
- [ ] Each page has appropriate persona
- [ ] Key streams have domain instructions
- [ ] Help content covers common questions
- [ ] Field Reference documents all user-visible fields
- [ ] Glossary defines domain terms
- [ ] Test with common user queries
- [ ] Review conversation history for issues

### When Issues Arise

- [ ] Reproduce the issue
- [ ] Open diagnostics for the problematic message
- [ ] Identify: prompt issue, tool issue, or knowledge gap
- [ ] Make targeted fix (preamble, persona, help, or stream instructions)
- [ ] Test the fix
- [ ] Monitor conversation history for recurrence
