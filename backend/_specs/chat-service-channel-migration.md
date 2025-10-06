# Chat Service Migration to Channel Structure

## Current State
The `research_stream_chat_service.py` has ~636 lines with:
- Detailed system prompt referencing old fields (purpose, business_goals, expected_outcomes, focus_areas, keywords, competitors, stream_type)
- Field-specific collection logic
- Parse logic for extracting old field structure

## Required Changes

### 1. System Prompt (`_build_system_prompt`)
**Old fields mentioned:** purpose, business_goals, expected_outcomes, stream_name, stream_type, focus_areas, keywords, competitors, report_frequency

**New fields:** stream_name, purpose, channels, report_frequency

**New prompt structure:**
- **EXPLORATION**: Gather context about research needs
- **STREAM_NAME**: Ask for descriptive name
- **PURPOSE**: Why this stream exists
- **CHANNELS**: Collect monitoring channels
  - For each channel: name, focus, type, keywords
  - Can collect multiple channels
  - Suggest channels based on user context
- **REPORT_FREQUENCY**: How often
- **REVIEW**: Show all channels and configuration

**Key differences:**
- Remove business_goals, expected_outcomes (merged into purpose)
- Remove focus_areas, keywords, competitors, stream_type (now part of channels)
- Add channel collection guidance
- Each channel is its own mini-collection

### 2. User Prompt (`_build_user_prompt`)
Currently shows all collected fields. Needs to:
- Show stream_name, purpose if collected
- Show channels array (each with name, focus, type, keywords)
- Show report_frequency if collected

### 3. Response Parsing (`_parse_llm_response`)
Currently extracts:
- MODE, MESSAGE, TARGET_FIELD
- EXTRACTED_DATA for individual fields
- SUGGESTIONS for single-select
- OPTIONS for multi-select

Needs to also extract:
- CHANNEL_DATA: name=X, focus=Y, type=Z, keywords=A,B,C
- Handle partial channel data (building a channel incrementally)
- Handle COMPLETE_CHANNEL signal
- Handle ADD_ANOTHER_CHANNEL signal

### 4. User Action Processing (`_process_user_action`)
Currently updates individual fields on StreamInProgress

Needs to:
- Handle channel operations:
  - Start new channel
  - Update current channel being built
  - Complete channel (add to channels array)
  - Edit existing channel

## Proposed Flow

### Channel Collection Pattern

**Step 1: Start collecting channels**
```
AI: "Now let's set up monitoring channels. Each channel focuses on a specific area.
     What's the first area you want to monitor?"
User: "Melanocortin pathways"
AI: [Creates ChannelInProgress(name="Melanocortin pathways")]
```

**Step 2: Get channel focus**
```
AI: "What specifically about melanocortin pathways do you want to track?"
User: "Competitor drug development"
AI: [Updates ChannelInProgress(name="...", focus="Competitor drug development")]
```

**Step 3: Get channel type**
```
AI: "What type of intelligence is this?"
SUGGESTIONS: competitive, regulatory, clinical, market, scientific
User: selects "competitive"
AI: [Updates ChannelInProgress(..., type="competitive")]
```

**Step 4: Get keywords**
```
AI: "What keywords should we search for in this channel?"
OPTIONS: melanocortin|MCR1|MCR4|MC4R|bremelanotide
User: selects multiple
AI: [Completes ChannelInProgress(..., keywords=[...])]
AI: [Adds to StreamInProgress.channels[]]
```

**Step 5: Ask for more channels**
```
AI: "Great! Channel 1 complete. Want to add another channel?"
SUGGESTIONS: Add another channel, No, I'm done
User: "Add another channel"
AI: [Repeats steps 1-4 for new channel]

OR

User: "No, I'm done"
AI: [Moves to REPORT_FREQUENCY step]
```

## Implementation Strategy

### Option A: Big Rewrite (Recommended)
- Rewrite system prompt from scratch for channel flow
- Simplify response parsing for channel structure
- Update workflow guidance to include channel sub-steps
- Cleaner, easier to maintain

### Option B: Incremental Update
- Modify existing prompt to mention channels
- Add channel parsing to existing parse logic
- More complex, maintains legacy patterns

**Recommendation: Option A** - The structure is different enough that a rewrite will be cleaner.

## New Response Format

```
MODE: SUGGESTION
MESSAGE: Now let's set up your first monitoring channel. What area do you want to monitor?
TARGET_FIELD: channel_name
SUGGESTIONS: Melanocortin pathways, Obesity therapeutics, Competitive landscape, Regulatory filings

MODE: SUGGESTION
MESSAGE: What specifically do you want to track about melanocortin pathways?
TARGET_FIELD: channel_focus
SUGGESTIONS: Competitor drug development, Clinical trial activity, Scientific research publications

MODE: SUGGESTION
MESSAGE: What type of intelligence is this channel?
TARGET_FIELD: channel_type
SUGGESTIONS: competitive, regulatory, clinical, market, scientific

MODE: SUGGESTION
MESSAGE: What keywords should we search for in this channel?
TARGET_FIELD: channel_keywords
OPTIONS: melanocortin|MCR1|MCR4|MC4R|bremelanotide|obesity
PROPOSED_MESSAGE: Continue with these keywords

MODE: QUESTION
MESSAGE: Channel 1 complete! Would you like to add another channel?
CHANNEL_COMPLETE: {name: "Melanocortin pathways", focus: "...", type: "competitive", keywords: [...]}
SUGGESTIONS: Add another channel, No, I'm done
```

## Estimated Effort
- System prompt rewrite: 2-3 hours
- Response parsing update: 1-2 hours
- User action processing: 1-2 hours
- Testing and refinement: 2-3 hours
**Total: 6-10 hours**
