# Workflow Step Control Flow Redesign

## Overview

This document defines the complete workflow for AI-guided research stream creation, including workflow design, user action types, and backend handling logic.

---

## 1. Workflow Design

### Step Definitions

| Step Name | Has Data? | Data Field Name | Description |
|-----------|-----------|-----------------|-------------|
| `exploration` | No | - | Conversational hub for gathering context and asking questions |
| `purpose` | Yes | `purpose` | What's the purpose of this research stream? |
| `business_goals` | Yes | `business_goals` | Strategic objectives (list) |
| `expected_outcomes` | Yes | `expected_outcomes` | What outcomes/decisions will this drive? |
| `stream_name` | Yes | `stream_name` | Name for the research stream |
| `stream_type` | Yes | `stream_type` | Type: competitive, regulatory, clinical, market, scientific, mixed |
| `focus_areas` | Yes | `focus_areas` | Therapeutic areas or research domains (list) |
| `keywords` | Yes | `keywords` | Search terms for literature (list) |
| `competitors` | Yes | `competitors` | Companies/organizations to monitor (list, optional) |
| `report_frequency` | Yes | `report_frequency` | How often: daily, weekly, biweekly, monthly |
| `review` | No | - | Confirm configuration before creation |
| `complete` | No | - | Workflow finished |

### Step Classification

**Non-Data Steps:**
- `exploration` - Starting point and conversational fallback
- `review` - Confirmation step
- `complete` - Terminal step

**Data Steps:**
- `purpose`, `business_goals`, `expected_outcomes`, `stream_name`, `stream_type`, `focus_areas`, `keywords`, `competitors`, `report_frequency`

### Valid Transitions

The workflow engine provides valid next steps based on current step:

**From `exploration`:**
- Can stay in `exploration` (continue asking questions)
- Can transition to any uncompleted data step (when ready to suggest options)
- Can transition to `review` (when all required fields complete)

**From data steps:**
- Can transition to `exploration` (need more context)
- Can transition to any other uncompleted data step (ready to suggest options)
- Can transition to `review` (when all required fields complete)

**From `review`:**
- Can transition to `complete` (user confirms)
- Can transition to `exploration` (user wants changes)

**From `complete`:**
- No transitions (workflow ended)

**Key principle:** `exploration` is ALWAYS available as a valid transition (except from `complete`).

---

## 2. User Action Design

Frontend sends metadata about what type of action the user is taking.

### User Action Types

```typescript
interface UserAction {
  type: 'option_selected' | 'options_selected' | 'text_input' | 'skip_step';
  target_field?: string;           // Which field this relates to
  selected_value?: string;         // For single-select (SUGGESTIONS)
  selected_values?: string[];      // For multi-select (OPTIONS)
}
```

### User Action Descriptions

**`option_selected`** - User clicked a single suggestion chip
- Example: User clicks "competitive" from stream_type suggestions
- `target_field`: The field being populated (e.g., "stream_type")
- `selected_value`: The value they selected (e.g., "competitive")

**`options_selected`** - User selected multiple checkboxes and clicked continue
- Example: User checks "Oncology" and "Cardiology" for focus_areas
- `target_field`: The field being populated (e.g., "focus_areas")
- `selected_values`: Array of selections (e.g., ["Oncology", "Cardiology"])

**`text_input`** - User typed free text in chat
- Example: User types "I want to monitor Palatin Technologies"
- No target_field (LLM needs to parse and extract)
- Could be answering a question, providing context, or updating a field

**`skip_step`** - User clicked skip button for optional field
- Example: User skips competitors step
- `target_field`: The field being skipped (e.g., "competitors")

### Field Edits (No Action Type)

When user edits a field inline in the preview panel:
- Frontend updates local `current_config` state
- No API call to backend
- No user action sent
- Updated config flows through on next chat message

---

## 3. Backend Handling by Step Type and Workflow State

### 3.1 Current Step is Non-Data Type (`exploration`, `review`, `complete`)

#### Exploration Step

**Allowable User Response Types:**
- `text_input` - User responds to questions or provides information
- `option_selected` - Not typical, but could happen if LLM provided suggestions while in exploration
- `options_selected` - Not typical, but could happen if LLM provided options while in exploration

**Handling Logic:**

**BEFORE LLM Call:**

```python
if user_action.type == "option_selected":
    # User selected a suggestion - extract and populate field
    current_config[user_action.target_field] = user_action.selected_value
    workflow.update_config({user_action.target_field: user_action.selected_value})
    step_just_completed = True

elif user_action.type == "options_selected":
    # User selected multiple options - extract and populate field
    current_config[user_action.target_field] = user_action.selected_values
    workflow.update_config({user_action.target_field: user_action.selected_values})
    step_just_completed = True

elif user_action.type == "text_input":
    # User typed free text - LLM will parse
    step_just_completed = False

# Get valid next steps
valid_next_steps = workflow.get_available_next_steps()
valid_steps_list = [s.value for s in valid_next_steps]
```

**DURING LLM Call:**

Build system prompt that includes:
- Current step: `exploration`
- Valid next steps list (includes exploration + all uncompleted data steps)
- Instruction: "You are in EXPLORATION mode. Ask questions to gather context. When you have enough info to suggest options for a specific field, transition to that data step."

LLM receives:
- User's message
- Current config state
- Conversation history
- Valid transitions
- Whether a step just completed

**AFTER LLM Call:**

```python
# Parse LLM response
parsed = _parse_llm_response(collected_text)

# Update config with any extracted data (from text_input)
if parsed.extracted_data:
    for field, value in parsed.extracted_data.items():
        current_config[field] = value
        workflow.update_config({field: value})

# Validate LLM's chosen next step
if parsed.next_step:
    if parsed.next_step in valid_steps_list:
        next_step = parsed.next_step
    else:
        # Invalid transition - stay in exploration
        logger.warning(f"LLM attempted invalid transition to {parsed.next_step}")
        next_step = "exploration"
else:
    # No transition specified - stay in exploration
    next_step = "exploration"

# Return response
return {
    "message": parsed.message,
    "next_step": next_step,
    "updated_config": current_config,
    "target_field": parsed.target_field,
    "suggestions": parsed.suggestions,
    "options": parsed.options,
    "proposed_message": parsed.proposed_message
}
```

**LLM Decision Making in Exploration:**

The LLM should reason:
1. Do I have enough context to suggest options for a specific field?
   - YES → Transition to that data step with MODE: SUGGESTION
   - NO → Stay in exploration with MODE: QUESTION

2. Did the user ask about or update a specific field?
   - Extract the data with EXTRACTED_DATA
   - Reason about next step (could go to that field's step, stay in exploration, or go to another step)

3. What's the most natural next step given the conversation trajectory?
   - Consider what's been discussed
   - Consider what fields are already populated
   - Choose from valid next steps list

**Example:**

```
Current step: exploration
User message: "I want to monitor Palatin Technologies"
Valid next steps: exploration, purpose, business_goals, stream_name, stream_type, focus_areas, keywords, competitors, report_frequency

LLM reasoning: "User mentioned a company but not what they want to monitor. Need more context."

Response:
MODE: QUESTION
MESSAGE: What aspects of Palatin Technologies are you interested in monitoring? For example, their pipeline, competitive landscape, or specific therapeutic areas?
NEXT_STEP: exploration
```

#### Review Step

**Allowable User Response Types:**
- `text_input` - User confirms, asks for changes, or provides feedback

**Handling Logic:**

**BEFORE LLM Call:**
```python
# In review, text_input is primary interaction
step_just_completed = False

# Get valid next steps
valid_next_steps = workflow.get_available_next_steps()  # [exploration, complete]
valid_steps_list = [s.value for s in valid_next_steps]
```

**DURING LLM Call:**

Build system prompt that includes:
- Current step: `review`
- Valid next steps: exploration, complete
- Instruction: "User is reviewing their configuration. If they confirm, transition to COMPLETE. If they want changes, transition to EXPLORATION."

**AFTER LLM Call:**

```python
# Parse LLM response
parsed = _parse_llm_response(collected_text)

# Update config if user made changes via text
if parsed.extracted_data:
    for field, value in parsed.extracted_data.items():
        current_config[field] = value

# Validate next step
if parsed.next_step in valid_steps_list:
    next_step = parsed.next_step
else:
    next_step = "review"  # Stay in review if invalid

return response
```

#### Complete Step

**Allowable User Response Types:**
- None (workflow is finished)

**Handling Logic:**
- No further interactions
- Stream has been created
- Frontend redirects to stream detail page

---

### 3.2 Current Step is Data Type

Data steps: `purpose`, `business_goals`, `expected_outcomes`, `stream_name`, `stream_type`, `focus_areas`, `keywords`, `competitors`, `report_frequency`

**Allowable User Response Types:**
- `option_selected` - User clicked a suggestion for THIS step's field
- `options_selected` - User selected checkboxes for THIS step's field
- `text_input` - User typed free text (could be for this field or a different field)
- `skip_step` - User skipped this step (only for optional fields like competitors)

**Handling Logic:**

**BEFORE LLM Call:**

```python
step_just_completed = False
field_for_current_step = STEP_TO_FIELD_MAPPING[current_step]  # e.g., "purpose" for purpose step

if user_action.type == "option_selected":
    # Validate target_field matches current step
    if user_action.target_field == field_for_current_step:
        # User selected option for current step - mark complete
        current_config[user_action.target_field] = user_action.selected_value
        workflow.update_config({user_action.target_field: user_action.selected_value})
        step_just_completed = True
    else:
        # User selected option for a DIFFERENT field (editing previous field)
        current_config[user_action.target_field] = user_action.selected_value
        workflow.update_config({user_action.target_field: user_action.selected_value})
        # Don't mark current step complete, but field was updated

elif user_action.type == "options_selected":
    # Validate target_field matches current step
    if user_action.target_field == field_for_current_step:
        # User selected options for current step - mark complete
        current_config[user_action.target_field] = user_action.selected_values
        workflow.update_config({user_action.target_field: user_action.selected_values})
        step_just_completed = True
    else:
        # User selected options for a DIFFERENT field
        current_config[user_action.target_field] = user_action.selected_values
        workflow.update_config({user_action.target_field: user_action.selected_values})

elif user_action.type == "skip_step":
    # Verify field is optional
    if field_for_current_step in OPTIONAL_FIELDS:  # e.g., ["competitors"]
        step_just_completed = True
    else:
        # Cannot skip required field
        raise ValidationError("This field is required")

elif user_action.type == "text_input":
    # User typed free text - could be:
    # 1. Answering for current field
    # 2. Updating a different field
    # 3. Asking a question
    # LLM will parse and extract
    step_just_completed = False

# Get valid next steps
valid_next_steps = workflow.get_available_next_steps()
valid_steps_list = [s.value for s in valid_next_steps]
# Always includes: exploration, other uncompleted data steps, possibly review
```

**DURING LLM Call:**

Build system prompt that includes:
- Current step (e.g., `purpose`)
- Field being collected (e.g., `purpose`)
- Valid next steps list
- Whether step just completed
- Instruction: "You are collecting [field_name]. The user just completed this step by selecting an option. Reason about which next step makes most sense given the conversation trajectory."

LLM receives:
- User's message
- Current config state (includes any updates from option selection)
- Conversation history
- Valid transitions
- Context about step completion

**AFTER LLM Call:**

```python
# Parse LLM response
parsed = _parse_llm_response(collected_text)

# Update config with any extracted data (from text_input scenarios)
if parsed.extracted_data:
    for field, value in parsed.extracted_data.items():
        current_config[field] = value
        workflow.update_config({field: value})

        # Check if extracted data completes current step
        if field == field_for_current_step:
            step_just_completed = True

# Validate LLM's chosen next step
if parsed.next_step:
    if parsed.next_step in valid_steps_list:
        next_step = parsed.next_step
    else:
        # Invalid transition - stay on current step
        logger.warning(f"LLM attempted invalid transition to {parsed.next_step}")
        next_step = current_step
else:
    # No transition specified
    if step_just_completed:
        # Step is done but LLM didn't choose - stay on current for now
        # (LLM should always choose when step completes)
        next_step = current_step
    else:
        # Step not complete, stay here
        next_step = current_step

return {
    "message": parsed.message,
    "next_step": next_step,
    "updated_config": current_config,
    "target_field": parsed.target_field,
    "suggestions": parsed.suggestions,
    "options": parsed.options,
    "proposed_message": parsed.proposed_message
}
```

**LLM Decision Making in Data Steps:**

When step just completed (user selected an option):

The LLM should reason:
1. What has the user told me in the conversation so far?
2. What fields are already populated?
3. What would be the most natural next question?
4. Do I have enough context to suggest options for another field?
   - YES → Transition to that data step with MODE: SUGGESTION
   - NO → Transition to exploration with MODE: QUESTION
5. Are all required fields complete?
   - YES → Could transition to review
   - NO → Continue collecting fields

**Example Scenarios:**

**Scenario A: User selected option for current step, LLM has context for next field**

```
Current step: stream_type
User action: option_selected, target_field: stream_type, selected_value: "competitive"
Valid next steps: exploration, purpose, business_goals, focus_areas, keywords, competitors, report_frequency

Conversation history shows user mentioned "Palatin Technologies" earlier.

LLM reasoning: "User selected competitive and mentioned Palatin earlier. I can suggest stream names."

Response:
MODE: SUGGESTION
TARGET_FIELD: stream_name
MESSAGE: Perfect! Since you mentioned Palatin Technologies earlier, here are some stream name suggestions:
SUGGESTIONS: Palatin Competitive Intelligence, Palatin Research Monitor, Palatin Pipeline Tracker
NEXT_STEP: stream_name
```

**Scenario B: User selected option for current step, LLM needs more context**

```
Current step: stream_type
User action: option_selected, target_field: stream_type, selected_value: "competitive"
Valid next steps: exploration, purpose, business_goals, focus_areas, keywords, competitors, report_frequency

No specific context in conversation history.

LLM reasoning: "User selected competitive, but I don't know their purpose or domain yet."

Response:
MODE: QUESTION
MESSAGE: Great choice! Before we set up the rest of the stream, what business decisions will this competitive intelligence support?
NEXT_STEP: exploration
```

**Scenario C: User typed text to update a DIFFERENT field**

```
Current step: keywords
User message: "Actually, change the purpose to 'Monitor regulatory changes'"
User action: text_input
Valid next steps: exploration, competitors, report_frequency

LLM parsing: Extracts purpose update

Response:
MODE: QUESTION
MESSAGE: Got it, I've updated the purpose to "Monitor regulatory changes". Now, back to keywords - based on regulatory focus, I recommend: FDA approval, clinical trial, regulatory pathway, compliance
EXTRACTED_DATA: purpose=Monitor regulatory changes
NEXT_STEP: exploration
```

**Scenario D: User typed text answering for current field**

```
Current step: purpose
User message: "I want to track competitive landscape for strategic planning"
User action: text_input
Valid next steps: exploration, business_goals, expected_outcomes, stream_name, stream_type, focus_areas, keywords, competitors, report_frequency

Response:
MODE: SUGGESTION
TARGET_FIELD: business_goals
MESSAGE: Excellent! Now let's define what business goals this will support:
OPTIONS: Inform study design decisions|Track competitive landscape|Identify new therapeutic indications|Support partnership discussions
PROPOSED_MESSAGE: Continue with selected goals
EXTRACTED_DATA: purpose=Track competitive landscape for strategic planning
NEXT_STEP: business_goals
```

---

## 4. Complete Backend Flow

```python
async def stream_chat_message(
    message: str,
    current_config: PartialStreamConfig,
    current_step: str,
    conversation_history: List[Dict],
    user_action: UserAction
) -> AsyncGenerator[str, None]:

    workflow = ResearchStreamCreationWorkflow(current_step, current_config)
    step_just_completed = False

    # Determine if current step is data step
    is_data_step = current_step in DATA_STEPS
    field_for_current_step = STEP_TO_FIELD_MAPPING.get(current_step) if is_data_step else None

    # ========================================
    # STEP 1: Process User Action BEFORE LLM
    # ========================================

    if user_action.type == "option_selected":
        # Update config with selected value
        current_config[user_action.target_field] = user_action.selected_value
        workflow.update_config({user_action.target_field: user_action.selected_value})

        # Mark step complete if selection was for current step's field
        if is_data_step and user_action.target_field == field_for_current_step:
            step_just_completed = True

    elif user_action.type == "options_selected":
        # Update config with selected values
        current_config[user_action.target_field] = user_action.selected_values
        workflow.update_config({user_action.target_field: user_action.selected_values})

        # Mark step complete if selections were for current step's field
        if is_data_step and user_action.target_field == field_for_current_step:
            step_just_completed = True

    elif user_action.type == "skip_step":
        # Verify field is optional
        if field_for_current_step in OPTIONAL_FIELDS:
            step_just_completed = True
        else:
            yield error_response("This field is required")
            return

    elif user_action.type == "text_input":
        # User typed free text - LLM will parse
        pass

    # ========================================
    # STEP 2: Get Valid Next Steps
    # ========================================

    valid_next_steps = workflow.get_available_next_steps()
    valid_steps_list = [s.value for s in valid_next_steps]

    # ========================================
    # STEP 3: Build System Prompt
    # ========================================

    step_guidance = workflow.get_step_guidance()
    system_prompt = self._build_system_prompt(
        current_step=current_step,
        step_guidance=step_guidance,
        valid_next_steps=valid_steps_list,
        step_just_completed=step_just_completed,
        is_data_step=is_data_step,
        field_name=field_for_current_step
    )
    user_prompt = self._build_user_prompt(message, current_config, step_guidance)

    # ========================================
    # STEP 4: Call LLM (Streaming)
    # ========================================

    collected_text = ""
    async for token in call_llm(system_prompt, user_prompt, conversation_history):
        collected_text += token
        yield {"token": token, "status": "streaming"}

    # ========================================
    # STEP 5: Parse LLM Response
    # ========================================

    parsed = _parse_llm_response(collected_text)

    # Update config with any extracted data (from text_input scenarios)
    if parsed.extracted_data:
        for field, value in parsed.extracted_data.items():
            current_config[field] = value
            workflow.update_config({field: value})

            # Check if extracted data completes current step
            if is_data_step and field == field_for_current_step:
                step_just_completed = True

    # ========================================
    # STEP 6: Validate Next Step Transition
    # ========================================

    if parsed.next_step:
        if parsed.next_step in valid_steps_list:
            next_step = parsed.next_step
        else:
            # Invalid transition
            logger.warning(f"LLM attempted invalid transition to {parsed.next_step}")
            next_step = current_step
    else:
        # No transition specified - stay on current step
        next_step = current_step

    # ========================================
    # STEP 7: Return Response
    # ========================================

    yield {
        "message": parsed.message,
        "next_step": next_step,
        "updated_config": current_config,
        "target_field": parsed.target_field,
        "suggestions": parsed.suggestions,
        "options": parsed.options,
        "proposed_message": parsed.proposed_message
    }
```

---

## 5. System Prompt Template

```python
def _build_system_prompt(
    current_step: str,
    step_guidance: Dict,
    valid_next_steps: List[str],
    step_just_completed: bool,
    is_data_step: bool,
    field_name: Optional[str]
) -> str:

    valid_steps_text = ", ".join(valid_next_steps)

    if step_just_completed:
        completion_context = f"""
IMPORTANT: The user just completed the previous step by selecting an option.
The field '{field_name}' has been populated.
You now need to reason about which next step makes the most sense given the conversation trajectory.
"""
    else:
        completion_context = ""

    if current_step == "exploration":
        step_context = """
You are in EXPLORATION mode - a conversational space for gathering context.

Your role:
- Ask clarifying questions to understand the user's needs
- Gather information about their domain, companies, therapeutic areas, goals, etc.
- When you have enough context to suggest options for a specific field → transition to that data step

Decision logic:
- Do I have enough context to suggest options for a field? → YES: transition to that data step
- Do I need more information? → NO: stay in exploration and ask questions
"""
    elif current_step == "review":
        step_context = """
You are in REVIEW mode - the user is confirming their configuration.

Your role:
- Present the configuration for review
- If user confirms → transition to COMPLETE
- If user wants changes → transition to EXPLORATION
"""
    else:
        step_context = f"""
You are collecting the field: {field_name}

Your role:
- Provide SUGGESTIONS or OPTIONS for this field
- After user selects, reason about the best next step
"""

    return f"""You are an AI assistant helping users create research streams.

Current Step: {current_step}
Valid next steps you can transition to: {valid_steps_text}
{completion_context}

{step_context}

CRITICAL RULES:

1. You can ONLY transition to steps in the "Valid next steps" list above
2. EXPLORATION is your conversational hub - always available when you need to ask questions
3. Data steps require MODE: SUGGESTION with actual suggestions/options
4. When transitioning, reason about which step makes most sense given:
   - Conversation trajectory (what's been discussed)
   - What fields are already populated
   - What would be the most natural next question

TWO MODES:

**MODE: QUESTION** (use in exploration or when gathering context)
- Ask clarifying questions
- Gather information
- No suggestions provided

**MODE: SUGGESTION** (use in data steps when you can provide options)
- Provide SUGGESTIONS (comma-separated, single-select)
- OR provide OPTIONS (pipe-separated, multi-select with checkboxes)
- Must specify TARGET_FIELD

TRANSITION REASONING:

After a step completes, ask yourself:
1. What context do I have from the conversation?
2. What fields are already filled?
3. What's the most natural next question?
4. Can I suggest options for a specific field, or do I need more context?

If you can suggest → go to that data step
If you need context → go to exploration

Return format:
MODE: [QUESTION or SUGGESTION]
MESSAGE: [Your conversational message to user]
TARGET_FIELD: [field_name] (only for SUGGESTION mode)
EXTRACTED_DATA: [field_name]=[value] (if you extracted data from user's message)
SUGGESTIONS: [option1, option2, option3] (single-select)
OPTIONS: [option1|option2|option3] (multi-select)
PROPOSED_MESSAGE: [button text for continue] (only with OPTIONS)
NEXT_STEP: [step_name] (choose from valid next steps list based on reasoning)

Available fields:
- purpose (text)
- business_goals (list)
- expected_outcomes (text)
- stream_name (text)
- stream_type (single-select: competitive, regulatory, clinical, market, scientific, mixed)
- focus_areas (list)
- keywords (list)
- competitors (list, optional)
- report_frequency (single-select: daily, weekly, biweekly, monthly)
"""
```

---

## 6. Implementation Checklist

### Backend
- [ ] Update WorkflowStep enum to replace INTRO with EXPLORATION
- [ ] Implement `get_available_next_steps()` method
- [ ] Add `UserAction` model to request schema
- [ ] Update chat endpoint to accept `user_action` parameter
- [ ] Implement user action processing logic (before LLM call)
- [ ] Update system prompt builder with new template
- [ ] Add `NEXT_STEP` field to LLM response parsing
- [ ] Implement next step validation logic
- [ ] Add mapping of steps to fields (STEP_TO_FIELD_MAPPING)
- [ ] Add list of optional fields (OPTIONAL_FIELDS)

### Frontend
- [ ] Update WorkflowStep type to use EXPLORATION
- [ ] Add UserAction type definition
- [ ] Implement logic to detect user action type when sending message
- [ ] Send appropriate user_action metadata with each request
- [ ] Use next_step from response for subsequent requests
- [ ] Handle inline field edits as local state updates only
- [ ] Add skip button for optional fields (competitors)

### Testing
- [ ] Test exploration → data step transitions
- [ ] Test data step → exploration transitions
- [ ] Test data step → data step transitions
- [ ] Test user editing previous field via chat
- [ ] Test user editing previous field via inline edit
- [ ] Test skip functionality for optional fields
- [ ] Test LLM reasoning about next steps
- [ ] Test validation of invalid transitions
- [ ] Test all user action types

---

## 7. Benefits of This Design

1. **Clear separation**: EXPLORATION for questions, data steps for suggestions
2. **Natural flow**: LLM can ask questions anytime via EXPLORATION fallback
3. **Intelligent transitions**: LLM reasons about best next step based on conversation
4. **Flexible field updates**: User can update any field via chat or inline editing
5. **Workflow enforcement**: Backend validates all transitions
6. **Explicit metadata**: User action types remove ambiguity
7. **Debuggable**: Clear audit trail of actions and transitions
