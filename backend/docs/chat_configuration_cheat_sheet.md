# Chat Configuration Cheat Sheet

A quick reference guide for configuring the chat system and avoiding common pitfalls.

---

## Configuration Hierarchy

Configuration flows from global to specific, with each level adding or overriding:

```
GLOBAL PREAMBLE (what KH is, your role)
    ↓
PAGE PERSONA (who the assistant is on this page)
    ↓
TAB CONFIG (tab-specific tools/payloads)
    ↓
STREAM INSTRUCTIONS (domain-specific guidance)
    ↓
CONTEXT (current page state, loaded data)
    ↓
CAPABILITIES (available tools)
    ↓
HELP TOC (reference documentation)
```

---

## The Five Configuration Levers

| Lever | Scope | Where to Configure | Purpose |
|-------|-------|-------------------|---------|
| **Global Preamble** | All pages | `chat_config` (scope='global') | What KH is, assistant's general role |
| **Page Persona** | Per page | `chat_page_config/<page>.py` | How assistant behaves on this page |
| **Stream Instructions** | Per stream | Stream settings UI | Domain-specific guidance |
| **Tools** | Page/tab | `chat_page_config/<page>.py` | What actions the LLM can take |
| **Help Content** | Global | `backend/help/*.yaml` | Documentation the LLM can retrieve |

---

## Quick Reference: Where Things Live

| What | Location | Format |
|------|----------|--------|
| Page configs | `backend/services/chat_page_config/<page>.py` | Python |
| Tool definitions | `backend/tools/builtin/<category>.py` | Python |
| Tool registry | `backend/tools/registry.py` | Python |
| Payload types | `backend/schemas/payloads.py` | Python |
| Help content | `backend/help/*.yaml` | YAML |
| Help registry | `backend/services/help_registry.py` | Python |
| Chat service | `backend/services/chat_stream_service.py` | Python |

---

## Page Persona Configuration

The persona defines who the assistant is and how it behaves **on a specific page**.

### Example (from `reports.py`):

```python
REPORTS_PERSONA = """## Reports Page

On this page, users explore research intelligence reports.

**Your tools let you:**
- List and navigate reports in a research stream
- Get report summaries and article details

**Page-specific guidance:**
- Be specific about article PMIDs so users can find them
- If an article modal is open, focus on that article
"""

register_page(
    page="reports",
    context_builder=build_context,
    persona=REPORTS_PERSONA,
    payloads=["report_list", "report_summary", ...],
)
```

### Persona Best Practices

1. **Start with page context** - Tell the LLM what users do on this page
2. **List available capabilities** - What tools/actions are available
3. **Give page-specific guidance** - How to handle common scenarios
4. **Keep it focused** - Don't repeat global instructions

---

## Stream Instructions Configuration

Stream instructions customize LLM behavior for a **specific research domain**.

### Where to Set

Users configure via the Stream Settings UI → Chat Instructions field.

### What to Include

```markdown
This stream monitors CAR-T cell therapy research.

## Key Topics
- Manufacturing improvements
- Persistence and exhaustion
- Solid tumor applications

## Terminology Notes
- "Response" usually means clinical response, not immune response
- Watch for industry vs academic perspective differences

## Priorities
- Highlight drug interactions and contraindications
- Note biomarker or genetic targets mentioned
```

### Stream Instructions Best Practices

1. **Domain context** - What this stream is about
2. **Key topics** - What areas matter most
3. **Terminology** - Domain-specific meanings
4. **Interpretation notes** - How to read articles in this field

---

## Tool Configuration

### Global vs Page-Specific Tools

| `is_global` | Behavior |
|-------------|----------|
| `True` | Available on ALL pages automatically |
| `False` | Only available when added to page/tab config |

### Adding Tools to a Page

```python
register_page(
    page="edit_stream",
    tools=["validate_schema"],  # Page-wide tools
    tabs={
        "semantic": TabConfig(
            tools=["run_semantic_analysis"],  # Tab-specific
        ),
    }
)
```

---

## Help Content Configuration

### YAML File Structure

```yaml
# backend/help/reports.yaml
sections:
  - category: reports
    topic: viewing
    title: Viewing Reports
    summary: How to navigate and view reports
    roles: [member, org_admin, platform_admin]
    order: 10
    content: |
      ## Viewing a Report

      Navigate to Reports page and select...
```

### Key Fields

| Field | Purpose |
|-------|---------|
| `category` | Feature area (reports, streams, tools) |
| `topic` | Specific topic within category |
| `title` | Short title for display |
| `summary` | Brief description (shown in TOC) |
| `roles` | Who can see this (member, org_admin, platform_admin) |
| `content` | Full markdown documentation |

### Help Categories (in order)

1. `general` - General app help
2. `getting-started` - Onboarding guides
3. `field-reference` - Field semantics (dates, filters, inclusion)
4. `glossary` - Term definitions
5. `reports` - Report features
6. `article-viewer` - Article viewing
7. `tablizer` - Tablizer app
8. `streams` - Stream management
9. `tools` - Tool documentation
10. `operations` - Admin operations

---

## Common Pitfalls & Anti-Patterns

### Pitfall 1: Ambiguity Handling

| Anti-Pattern | Problem | Fix |
|--------------|---------|-----|
| Always asking for clarification | Annoying, feels unhelpful | Make reasonable interpretation for marginal cases |
| Never asking for clarification | May answer wrong question | Ask when truly ambiguous |
| Guessing without stating | User doesn't know interpretation | Always state your interpretation |
| Listing too many options | Overwhelming | Max 3-4 options |

**Good pattern for marginal ambiguity:**
```
"I'm interpreting this as [X]. [Answer]. If you meant [Y], let me know."
```

**Good pattern for high ambiguity:**
```
"I can help with this a few ways:
1. [Option A]
2. [Option B]
Which would be most helpful?"
```

### Pitfall 2: Tool Misuse

| Anti-Pattern | Problem | Fix |
|--------------|---------|-----|
| Chaining 4+ tools | Fragile, error-prone | Say tools aren't adequate for task |
| Querying data for semantic questions | Slow, may be wrong | Check help documentation first |
| Using generic search for specific lookups | Inefficient | Add specific lookup tools |
| Guessing at undocumented tool behavior | May return wrong answer | Acknowledge what you don't know |

**Signs to defer (tell user tools aren't adequate):**
- Task requires >3-4 chained tool calls
- Each step depends on parsing previous results
- The "plan" feels like a Rube Goldberg machine
- You're not confident the result will be correct

**Good deferral pattern:**
```
"That's a great question, but I don't have the right tools to answer it reliably.
I can [what you CAN do], but [what you CAN'T do] would require [missing capability].
Would [simpler alternative] help?"
```

### Pitfall 3: Missing Semantic Documentation

| Gap | Consequence | Fix |
|-----|-------------|-----|
| No field reference docs | LLM can't answer "what does X mean?" | Add to `field-reference.yaml` |
| No glossary | LLM guesses at domain terms | Add to `glossary.yaml` |
| Help content outdated | LLM gives wrong guidance | Update help when features change |

**Every user-visible field must document:**
- What the field means
- Possible values and their meanings
- Edge cases and special handling
- Relationships to other fields

### Pitfall 4: Query Classification Errors

| Type | Example | Right Approach |
|------|---------|----------------|
| Navigation | "How do I create a stream?" | Use `get_help` tool |
| Analysis | "Which articles mention CRISPR?" | Use data tools |
| Ambiguous | "Tell me about the dates" | Clarify: semantics vs values |

**Navigation signals:** "how to", "what does X mean", UI questions
**Analysis signals:** article content, summarize, compare, patterns

### Pitfall 5: Response Quality

| Anti-Pattern | Problem | Fix |
|--------------|---------|-----|
| Guessing at semantics | May be wrong | Verify against help docs |
| Over-explaining implementation | User doesn't care | Focus on user-level meaning |
| Giving data without context | Numbers are meaningless | Explain what the data means |
| Verbose responses | Hard to scan | Be concise, use formatting |

---

## Configuration Checklist

### When Adding a New Page

- [ ] Create `chat_page_config/<page>.py`
- [ ] Define `build_context()` function
- [ ] Write page persona
- [ ] List page-wide payloads
- [ ] List page-wide tools (if any non-global needed)
- [ ] Define tabs with tab-specific payloads/tools
- [ ] Register with `register_page()`

### When Adding a New Tool

- [ ] Create tool in `tools/builtin/<category>.py`
- [ ] Define clear input schema with descriptions
- [ ] Write executor function
- [ ] Set `is_global` appropriately
- [ ] Define `payload_type` if returning structured data
- [ ] Add anti-patterns (when NOT to use)
- [ ] Add to page config if `is_global=False`

### When Adding Help Content

- [ ] Create/update `backend/help/<category>.yaml`
- [ ] Include category, topic, title, summary
- [ ] Set appropriate roles
- [ ] Write complete content with examples
- [ ] Document field semantics explicitly

### When Changing Features

- [ ] Update help content to match new behavior
- [ ] Update field reference if fields changed
- [ ] Update glossary if terms changed
- [ ] Update page persona if capabilities changed
- [ ] Test with navigation queries ("How do I...")

---

## Testing Chat Configuration

### Navigation Query Test Cases

```
"How do I create a new stream?"
"What does filter_score mean?"
"Are report dates inclusive or exclusive?"
"How do I add an article to a report?"
```

**Expected:** LLM uses `get_help` tool, provides accurate guidance

### Analysis Query Test Cases

```
"How many articles are in this report?"
"Which articles mention gene therapy?"
"Summarize the findings on drug resistance"
"Compare these two reports"
```

**Expected:** LLM uses data tools, provides relevant analysis

### Ambiguous Query Test Cases

```
"Tell me about the dates" → Should clarify (semantics vs values)
"Why was this article included?" → Should answer specific case, offer general
"What's wrong with this?" → Should ask what seems wrong
```

### Success Criteria

| Criterion | Measure |
|-----------|---------|
| Correct mode selection | Uses docs for navigation, tools for analysis |
| Answer accuracy | Matches ground truth |
| Ambiguity handling | Appropriate clarification or interpretation |
| Graceful degradation | Defers when tools inadequate |

---

## Related Documentation

- [Chat Architecture](../../_specs/chat/chat-architecture.md) - Full system design
- [Adding Chat to Page](../../_specs/chat/adding-chat-to-page.md) - Step-by-step guide
- [Critical Success Factors](./chat_system_critical_success_factors.md) - Detailed pitfalls
- [System Prompt Design](./system_prompt_design.md) - Prompt structure
- [Chat Improvement Plan](./chat_system_improvement_plan.md) - Known gaps
