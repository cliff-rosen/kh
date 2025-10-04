# Workflow Step Control Flow Redesign

## Problem Statement

The current chat workflow has a fundamental flaw in how it manages step transitions. The `current_step` comes into the chat endpoint, the LLM responds, but the step never gets properly updated. This creates ambiguity about which step we're actually on and when to advance.

### Current (Broken) Flow

1. Frontend sends: `current_step: "purpose"` + user message
2. Backend calls LLM (while still thinking we're on "purpose" step)
3. LLM responds with extracted data and moves conversation forward
4. Backend extracts data, updates config
5. **But `current_step` is still "purpose"** - never gets updated!
6. Next request comes in with... what step? Frontend doesn't know!

### Root Cause

The system lacks **explicit metadata** about user actions. We can't distinguish between:
- User selecting a proposed option (step complete, should advance)
- User typing free text (step incomplete, LLM needs to parse)
- User skipping an optional field (step complete, should advance)
- User editing a previous field (no step change)

## Proposed Solution

### 1. User Action Metadata

Frontend sends structured metadata about what the user is doing:

```typescript
interface UserAction {
  type: 'option_selected' | 'options_selected' | 'text_input' | 'skip_step';
  target_field?: string;           // Which field this relates to
  selected_value?: string;         // For single-select (SUGGESTIONS)
  selected_values?: string[];      // For multi-select (OPTIONS)
}

interface ChatRequest {
  message: string;
  current_step: string;
  current_config: PartialStreamConfig;
  conversation_history: ChatMessage[];
  user_action: UserAction;  // NEW
}
```

### 2. All User Interaction Scenarios

#### Scenario 1: User Clicks Single-Select Suggestion
**Context**: LLM shows `SUGGESTIONS: competitive, regulatory, clinical` for `stream_type`

**User action**: Clicks "competitive"

**Frontend sends**:
```json
{
  "message": "competitive",
  "current_step": "stream_type",
  "user_action": {
    "type": "option_selected",
    "target_field": "stream_type",
    "selected_value": "competitive"
  }
}
```

**Backend logic**:
1. Validate `target_field` matches current step
2. Update `config.stream_type = "competitive"`
3. Mark step as complete
4. Advance to next step (e.g., `focus_areas`)
5. Call LLM with NEW step context
6. Return response with `next_step: "focus_areas"`

---

#### Scenario 2: User Selects Multiple Checkboxes
**Context**: LLM shows `OPTIONS: Oncology|Cardiology|Immunology` for `focus_areas`

**User action**: Checks Oncology, Cardiology, clicks "Continue with selected areas"

**Frontend sends**:
```json
{
  "message": "Continue with selected areas",
  "current_step": "focus_areas",
  "user_action": {
    "type": "options_selected",
    "target_field": "focus_areas",
    "selected_values": ["Oncology", "Cardiology"]
  }
}
```

**Backend logic**:
1. Validate `target_field` matches current step
2. Update `config.focus_areas = ["Oncology", "Cardiology"]`
3. Validate list is not empty (required field)
4. Mark step as complete
5. Advance to next step
6. Call LLM with NEW step context

---

#### Scenario 3: User Types Free Text
**Context**: LLM asks "What's the purpose of this stream?"

**User action**: Types "Monitor competitive landscape for strategic planning"

**Frontend sends**:
```json
{
  "message": "Monitor competitive landscape for strategic planning",
  "current_step": "purpose",
  "user_action": {
    "type": "text_input"
  }
}
```

**Backend logic**:
1. Call LLM with CURRENT step (no advancement yet)
2. LLM attempts to extract data: `EXTRACTED_DATA: purpose=Monitor competitive landscape for strategic planning`
3. Parse LLM response
4. IF LLM extracted data that completes step:
   - Update config
   - Validate
   - Advance to next step
   - LLM response acknowledges and introduces next step
5. ELSE:
   - LLM continues conversation for current step (asks clarifying questions)
6. Return response with appropriate `next_step`

---

#### Scenario 4: User Edits Field Inline
**Context**: User clicks pencil icon next to "purpose" in config preview and changes it

**This is NOT a chat operation - it's pure frontend state management**

**Frontend action**:
1. User edits field in preview panel
2. Frontend updates `current_config` state locally
3. No API call needed
4. Next chat message will include the updated config
5. No LLM call, no step change

**Field edits are just local state updates. The updated config gets sent with the next chat message.**

---

#### Scenario 5: User Skips Optional Field
**Context**: Competitors step (optional), user doesn't want to add any

**User action**: Clicks "Skip this" or "Continue without competitors"

**Frontend sends**:
```json
{
  "message": "Skip",
  "current_step": "competitors",
  "user_action": {
    "type": "skip_step",
    "target_field": "competitors"
  }
}
```

**Backend logic**:
1. Verify current step is optional (check `STEP_REQUIREMENTS`)
2. Leave field empty/default
3. Mark step as complete (skipped)
4. Advance to next step
5. Call LLM with NEW step context

---

#### Scenario 6: User Types When Options Are Shown
**Context**: LLM shows checkbox options, but user types in chat instead

**User action**: Types "I also want to include neurology"

**Frontend sends**:
```json
{
  "message": "I also want to include neurology",
  "current_step": "focus_areas",
  "user_action": {
    "type": "text_input"
  }
}
```

**Backend logic**:
1. Call LLM with current step
2. LLM understands user wants to ADD to the list
3. LLM extracts: `EXTRACTED_DATA: focus_areas=Oncology, Cardiology, Neurology`
4. Update config
5. If complete, advance; otherwise continue conversation

---

### 3. Complete Backend Flow

```python
async def stream_chat_message(
    message: str,
    current_config: PartialStreamConfig,
    current_step: str,
    conversation_history: List[Dict],
    user_action: UserAction  # NEW
) -> AsyncGenerator[str, None]:

    workflow = ResearchStreamCreationWorkflow(current_step, current_config)

    # STEP 1: Process user action BEFORE calling LLM

    if user_action.type == "option_selected":
        # User clicked a single suggestion - step is COMPLETE
        if not _validate_field_matches_step(user_action.target_field, current_step):
            # Error: mismatch
            yield error_response("Invalid selection for current step")
            return

        # Update config
        current_config[user_action.target_field] = user_action.selected_value

        # Validate
        if not _validate_field_value(user_action.target_field, user_action.selected_value):
            yield error_response("Invalid value")
            return

        # Advance step
        next_step = workflow.get_next_step()
        current_step = next_step

        # Call LLM with NEW step context
        # LLM will acknowledge selection and ask about next field

    elif user_action.type == "options_selected":
        # User selected multiple checkboxes - step is COMPLETE
        current_config[user_action.target_field] = user_action.selected_values

        # Validate (e.g., required fields can't be empty list)
        if not user_action.selected_values and _is_field_required(user_action.target_field):
            yield error_response("At least one selection required")
            return

        # Advance step
        next_step = workflow.get_next_step()
        current_step = next_step

    elif user_action.type == "skip_step":
        # User wants to skip optional field
        if not _is_step_optional(current_step):
            yield error_response("This field is required")
            return

        # Leave field empty/default
        # Advance step
        next_step = workflow.get_next_step()
        current_step = next_step

    elif user_action.type == "text_input":
        # User typed free text - LLM needs to parse
        # Don't advance step yet - let LLM handle it
        pass

    # STEP 2: Call LLM with correct step context

    step_guidance = workflow.get_step_guidance()
    system_prompt = _build_system_prompt(step_guidance)
    user_prompt = _build_user_prompt(message, current_config, step_guidance)

    # Stream LLM response
    collected_text = ""
    async for token in call_llm(system_prompt, user_prompt, conversation_history):
        collected_text += token
        yield {"token": token, "status": "streaming"}

    # STEP 3: Parse LLM response and check if step is now complete

    parsed = _parse_llm_response(collected_text)

    # Update config with extracted data
    if parsed.extracted_data:
        for field, value in parsed.extracted_data.items():
            current_config[field] = value

    # Check if current step is now complete
    if workflow.is_step_completed(current_step):
        # Advance to next step for next request
        next_step = workflow.get_next_step()
    else:
        # Stay on current step
        next_step = current_step

    # STEP 4: Return complete response

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

### 4. Edge Cases and Validation

#### Edge Case 1: User Goes Off-Topic
**User types**: "What's the weather like?"

**Backend**:
- LLM recognizes off-topic input
- Gently redirects: "Let's focus on creating your research stream. What's the purpose of this stream?"
- Stay on current step

#### Edge Case 2: LLM Fails to Extract Data
**User types**: "uh, I'm not sure"

**Backend**:
- LLM can't extract meaningful data
- Asks clarifying question: "No problem! Let me help. Are you trying to monitor competitors, regulatory changes, or scientific research?"
- Stay on current step

#### Edge Case 3: Validation Fails
**User selects**: Empty business_goals list

**Backend**:
- Validation catches: business_goals is required, can't be empty
- Don't advance step
- Return error to LLM context
- LLM responds: "Please select at least one business goal"

#### Edge Case 4: Field Mismatch
**Current step**: "purpose"
**User action**: `target_field: "stream_type"`

**Backend**:
- Validation rejects: target_field doesn't match current step
- Log warning
- Ignore action or return error

#### Edge Case 5: Browser Refresh / Lost State
**User refreshes browser mid-flow**

**Frontend**:
- Config is persisted
- But `current_step` might be lost

**Backend**:
- Has method to determine correct step from config completeness:
  ```python
  def infer_current_step(config):
      if not config.purpose:
          return "purpose"
      elif not config.business_goals:
          return "business_goals"
      # ... etc
  ```

#### Edge Case 6: User Wants to Go Back
**User**: "Actually, I want to change the purpose"

**Options**:
1. Use `field_edit` action to directly update
2. Add explicit `go_to_step` action type
3. LLM recognizes intent, suggests using edit button

---

### 5. Frontend Changes Needed

#### Update Request Type
```typescript
// Add to existing StreamChatRequest
interface StreamChatRequest {
  message: string;
  current_config: PartialStreamConfig;
  current_step: string;
  conversation_history: ChatMessage[];
  user_action: UserAction;  // NEW
}

interface UserAction {
  type: 'option_selected' | 'options_selected' | 'text_input' | 'skip_step' | 'field_edit';
  target_field?: string;
  selected_value?: string;
  selected_values?: string[];
}
```

#### Update Response Type
```typescript
interface ChatResponse {
  message?: string;              // LLM's conversational message
  next_step: string;            // Step to use for next request
  updated_config: PartialStreamConfig;
  target_field?: string;        // Which field LLM is asking about
  suggestions?: string[];       // Single-select options
  options?: CheckboxOption[];   // Multi-select options
  proposed_message?: string;    // Text for "Continue" button
  error?: string;               // Validation or other errors
}
```

#### Frontend Behavior
1. When user clicks suggestion chip:
   - Send `{type: "option_selected", target_field: "...", selected_value: "..."}`
   - Use `next_step` from response for next request

2. When user clicks "Continue" with checkboxes:
   - Send `{type: "options_selected", target_field: "...", selected_values: [...]}`
   - Use `next_step` from response

3. When user types in chat:
   - Send `{type: "text_input"}`
   - Let backend/LLM handle parsing

4. When user edits field in preview:
   - Update `current_config` state locally (pure frontend)
   - No API call
   - No step change
   - Next chat message will include the updated config

---

### 6. Open Questions

1. **Should frontend or backend generate the options UI?**
   - Currently: LLM returns `OPTIONS: A|B|C`, frontend parses and renders checkboxes
   - Problem: Frontend has to parse LLM output
   - Alternative: Backend parses LLM output, returns structured `{options: [{label, value, checked}]}`
   - **Recommendation**: Backend parses, returns structured data

2. **How to handle "Continue" button text?**
   - LLM provides `PROPOSED_MESSAGE: "Continue with these selections"`
   - Frontend shows this as button text
   - **Recommendation**: Keep this - it's flexible and LLM can customize

3. **What if user types when options are shown?**
   - Options visible, but user types in chat box instead of clicking
   - **Recommendation**: Allow it - send as `text_input`, LLM can handle additive input

4. **Review step behavior**:
   - REVIEW doesn't collect a field - just confirms
   - What action types?
   - **Recommendation**: Add `confirm` action type for review step

5. **Should we allow editing completed steps?**
   - User on KEYWORDS step, wants to change PURPOSE
   - **Recommendation**: Yes - just update local config state (stays on KEYWORDS, keeps conversation flowing)

---

### 7. Implementation Checklist

#### Backend
- [ ] Add `UserAction` model to request schema
- [ ] Update `ChatRequest` to include `user_action`
- [ ] Add action processing logic before LLM call
- [ ] Add step validation helper functions
- [ ] Update response to include `next_step`
- [ ] Add structured options parsing (OPTIONS → list of objects)
- [ ] Add edge case handling (validation, field mismatch, etc.)

#### Frontend
- [ ] Update `StreamChatRequest` type
- [ ] Add logic to detect user action type when sending message
- [ ] Send appropriate `user_action` metadata with each request
- [ ] Use `next_step` from response for subsequent requests
- [ ] Handle inline field edits as local state updates only
- [ ] Update UI to show structured options from backend
- [ ] Add skip button for optional fields

#### Testing
- [ ] Test each user action scenario
- [ ] Test step transitions
- [ ] Test validation failures
- [ ] Test edge cases (off-topic, unclear input, etc.)
- [ ] Test browser refresh recovery
- [ ] Test inline editing

---

### 8. Benefits of This Approach

1. **Clear step ownership**: Backend is source of truth for current step
2. **Explicit state transitions**: No ambiguity about when to advance
3. **Better validation**: Can validate before advancing step
4. **Simpler frontend**: Just sends action metadata, backend decides
5. **Recoverable**: Can infer step from config if state lost
6. **Flexible**: Handles multiple interaction patterns
7. **Debuggable**: Action metadata makes it clear what user did

---

### 9. LLM-Driven State Transitions with EXPLORATION Step

#### The New Workflow Structure

The workflow now has a conversational hub that the LLM can always return to:

1. **EXPLORATION** (replaces INTRO) - Conversational context gathering
   - Starting point of the workflow
   - Always available as a transition target
   - LLM asks questions and gathers information
   - When LLM has enough context → transitions to specific data step

2. **Data Steps** - Collect specific fields with suggestions
   - `PURPOSE` → collects `purpose` field
   - `BUSINESS_GOALS` → collects `business_goals` field
   - `EXPECTED_OUTCOMES` → collects `expected_outcomes` field
   - `STREAM_NAME` → collects `stream_name` field
   - `STREAM_TYPE` → collects `stream_type` field
   - `FOCUS_AREAS` → collects `focus_areas` field
   - `KEYWORDS` → collects `keywords` field
   - `COMPETITORS` → collects `competitors` field (optional)
   - `REPORT_FREQUENCY` → collects `report_frequency` field

3. **REVIEW** - Confirms configuration before creation
4. **COMPLETE** - Workflow finishes

#### The Core Problem: When to Ask vs When to Suggest

The fundamental challenge is knowing when the LLM should:
- **Ask questions** (gather more context)
- **Provide suggestions** (move to collecting a field)

Static step progression forces the LLM to ask about fields in a predetermined order, even when the conversation doesn't support it.

#### Solution: EXPLORATION as a Conversational Hub

**EXPLORATION is always a valid transition target.** This gives the LLM two clear modes:

**Mode 1: EXPLORATION (asking questions)**
- LLM doesn't have enough context yet
- Asks clarifying questions
- Gathers information about user's needs
- When ready → transitions to a specific data step

**Mode 2: Data Step (providing suggestions)**
- LLM has enough context to suggest options for a field
- Provides SUGGESTIONS or OPTIONS
- User selects → step completes
- LLM reasons about next step OR returns to EXPLORATION if more context needed

#### How It Works

When a step completes (user selects an option):

1. **Backend marks the step complete** and updates config
2. **Backend gets valid next steps** from workflow engine (always includes EXPLORATION)
3. **Backend gives LLM the valid options** and asks it to reason about the best next step
4. **LLM decides:**
   - If it has enough context for a specific field → transition to that data step with suggestions
   - If it needs more context → transition to EXPLORATION and ask questions
5. **Backend validates** the choice is in the valid list

The workflow engine controls **what's possible**, the LLM **reasons about the best option** from the valid set, and the backend **validates** the LLM's choice.

#### Implementation

**1. Workflow Engine Method**

```python
def get_available_next_steps(self) -> List[WorkflowStep]:
    """
    Returns list of valid steps the workflow can transition to from current step.

    Rules:
    - EXPLORATION is ALWAYS available (except from COMPLETE)
    - From EXPLORATION: Can jump to any uncompleted data step
    - From data steps: Can go to other uncompleted data steps OR back to EXPLORATION
    - REVIEW available when all required fields complete
    - COMPLETE only from REVIEW
    """
    current = self.current_step
    available = []

    if current == WorkflowStep.COMPLETE:
        # Workflow is done
        return available

    # EXPLORATION is always available (as a fallback for asking questions)
    if current != WorkflowStep.EXPLORATION:
        available.append(WorkflowStep.EXPLORATION)

    if current == WorkflowStep.EXPLORATION:
        # From EXPLORATION: Can jump to any uncompleted data step
        available.append(WorkflowStep.EXPLORATION)  # Can stay in exploration

        for step in [WorkflowStep.PURPOSE, WorkflowStep.BUSINESS_GOALS,
                     WorkflowStep.EXPECTED_OUTCOMES, WorkflowStep.STREAM_NAME,
                     WorkflowStep.STREAM_TYPE, WorkflowStep.FOCUS_AREAS,
                     WorkflowStep.KEYWORDS, WorkflowStep.COMPETITORS,
                     WorkflowStep.REPORT_FREQUENCY]:
            # Add if not yet completed
            if not self._is_step_completed(step):
                available.append(step)

    elif current == WorkflowStep.REVIEW:
        # From REVIEW can go to COMPLETE or back to EXPLORATION
        available.append(WorkflowStep.COMPLETE)

    else:
        # From data steps: can go to other uncompleted data steps
        # EXPLORATION already added above
        for step in [WorkflowStep.PURPOSE, WorkflowStep.BUSINESS_GOALS,
                     WorkflowStep.EXPECTED_OUTCOMES, WorkflowStep.STREAM_NAME,
                     WorkflowStep.STREAM_TYPE, WorkflowStep.FOCUS_AREAS,
                     WorkflowStep.KEYWORDS, WorkflowStep.COMPETITORS,
                     WorkflowStep.REPORT_FREQUENCY]:
            if step != current and not self._is_step_completed(step):
                available.append(step)

    # Add REVIEW if all required fields are complete
    if self._all_required_fields_complete() and current != WorkflowStep.REVIEW:
        available.append(WorkflowStep.REVIEW)

    return available
```

**2. System Prompt with Valid Transitions**

```python
def _build_system_prompt(self, step_guidance: Dict[str, Any],
                         valid_next_steps: List[str],
                         step_just_completed: bool = False) -> str:

    valid_steps_text = ", ".join(valid_next_steps)

    completion_context = ""
    if step_just_completed:
        completion_context = """
    IMPORTANT: The user just completed the previous step by selecting an option.
    You now need to reason about which next step makes the most sense given the conversation trajectory so far.
    """

    return f"""You are an AI assistant helping users create research streams.

    Current Step: {self.current_step}
    Valid next steps you can transition to: {valid_steps_text}
    {completion_context}

    Current Step Objective: {step_guidance.get('objective', 'Collect information')}

    CRITICAL RULES FOR STEP TRANSITIONS:

    1. You can ONLY transition to steps in the "Valid next steps" list above
    2. EXPLORATION is your conversational hub - use it when you need to ask questions
    3. Data steps require SUGGESTIONS - only transition to them when you can provide options
    4. When transitioning, reason about which step makes most sense given conversation trajectory

    TWO MODES OF OPERATION:

    **EXPLORATION Mode** (asking questions):
    - Use when you need more context from the user
    - Ask clarifying questions to understand their needs
    - Gather information about domain, companies, therapeutic areas, etc.
    - When you have enough context → transition to a data step with suggestions

    **Data Step Mode** (providing suggestions):
    - Use when you have enough context to suggest options for a specific field
    - MUST provide SUGGESTIONS (single-select) or OPTIONS (multi-select)
    - User selects → field is populated → you reason about next step

    DECISION LOGIC:

    Do I have enough context to suggest options for a specific field?
    → YES: Transition to that data step with MODE: SUGGESTION
    → NO: Transition to EXPLORATION with MODE: QUESTION

    Example Flow:

    1. Start in EXPLORATION:
       User: "I want to monitor Palatin Technologies"
       Valid next steps: exploration, purpose, business_goals, stream_name, stream_type, focus_areas, keywords, competitors, report_frequency

       LLM reasons: "They mentioned a company, but I don't know what they want to monitor or why"
       MODE: QUESTION
       MESSAGE: What aspects of Palatin Technologies are you interested in monitoring? For example, their pipeline, competitive landscape, or specific therapeutic areas?
       NEXT_STEP: exploration

    2. User provides context, LLM has enough info:
       User: "Their melanocortin receptor pipeline and competitive landscape"
       Valid next steps: exploration, purpose, business_goals, stream_name, stream_type, focus_areas, keywords, competitors, report_frequency

       LLM reasons: "Now I know company + focus. I can suggest stream names."
       MODE: SUGGESTION
       TARGET_FIELD: stream_name
       MESSAGE: Based on your interest in Palatin's melanocortin pipeline, here are some stream name suggestions:
       SUGGESTIONS: Palatin Melanocortin Intelligence, Palatin Competitive Landscape Monitor, Palatin Pipeline Tracker
       NEXT_STEP: stream_name

    3. User selects stream name, step complete:
       Valid next steps: exploration, purpose, business_goals, stream_type, focus_areas, keywords, competitors, report_frequency

       LLM reasons: "They mentioned competitive landscape earlier, so stream_type makes sense"
       MODE: SUGGESTION
       TARGET_FIELD: stream_type
       MESSAGE: Perfect! Now let's define what type of intelligence this stream will focus on:
       SUGGESTIONS: competitive, regulatory, clinical, market, scientific, mixed
       NEXT_STEP: stream_type

    4. User selects stream_type, but LLM needs more context:
       Valid next steps: exploration, purpose, business_goals, focus_areas, keywords, competitors, report_frequency

       LLM reasons: "I should understand their purpose before suggesting focus areas"
       MODE: QUESTION
       MESSAGE: Great! Before we set up the focus areas, can you tell me what business decisions this intelligence will support?
       NEXT_STEP: exploration

    Return format:
    MODE: [QUESTION or SUGGESTION]
    MESSAGE: [Your conversational message]
    TARGET_FIELD: [field_name] (only for SUGGESTION mode)
    EXTRACTED_DATA: [field_name]=[value] (if extracted from user input)
    SUGGESTIONS: [comma-separated] (only for SUGGESTION mode - single-select)
    OPTIONS: [opt1|opt2|opt3] (only for SUGGESTION mode - multi-select)
    PROPOSED_MESSAGE: [button text] (only for OPTIONS mode)
    NEXT_STEP: [step_name] (from valid next steps list - reason about best choice)
    """
```

**3. Backend Flow with LLM Reasoning**

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

    # STEP 1: Process user action BEFORE calling LLM

    if user_action.type == "option_selected":
        # User clicked a single suggestion - step is COMPLETE
        current_config[user_action.target_field] = user_action.selected_value
        workflow.update_config({user_action.target_field: user_action.selected_value})
        step_just_completed = True

    elif user_action.type == "options_selected":
        # User selected multiple checkboxes - step is COMPLETE
        current_config[user_action.target_field] = user_action.selected_values
        workflow.update_config({user_action.target_field: user_action.selected_values})
        step_just_completed = True

    elif user_action.type == "skip_step":
        # User skipped optional field - step is COMPLETE
        step_just_completed = True

    # STEP 2: Get valid next steps from workflow engine
    valid_next_steps = workflow.get_available_next_steps()
    valid_steps_list = [s.value for s in valid_next_steps]

    # STEP 3: Build prompts with valid transitions for LLM to reason about
    step_guidance = workflow.get_step_guidance()
    system_prompt = self._build_system_prompt(
        step_guidance,
        valid_steps_list,
        step_just_completed  # Tell LLM if we just completed a step
    )
    user_prompt = self._build_user_prompt(message, current_config, step_guidance)

    # STEP 4: Call LLM - it will reason about which next step makes sense
    collected_text = ""
    async for token in call_llm(system_prompt, user_prompt, conversation_history):
        collected_text += token
        yield {"token": token, "status": "streaming"}

    # STEP 5: Parse LLM response
    parsed = _parse_llm_response(collected_text)

    # Update config with any extracted data (for text_input scenarios)
    if parsed.extracted_data:
        for field, value in parsed.extracted_data.items():
            current_config[field] = value

    # STEP 6: Validate LLM's chosen next step
    if parsed.next_step:
        if parsed.next_step in valid_steps_list:
            next_step = parsed.next_step
        else:
            # LLM tried to transition to invalid step - reject and stay
            logger.warning(f"LLM attempted invalid transition to {parsed.next_step}")
            next_step = current_step
    else:
        # No transition specified - stay on current step
        next_step = current_step

    # STEP 7: Return response
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

**4. LLM Response Parsing Update**

```python
def _parse_llm_response(self, assistant_message: str) -> Dict[str, Any]:
    """Parse LLM response including NEXT_STEP field"""

    # ... existing parsing logic ...

    next_step = None

    for line in assistant_message.split('\n'):
        stripped = line.strip()

        # ... existing field parsing ...

        elif stripped.startswith("NEXT_STEP:"):
            next_step = stripped.replace("NEXT_STEP:", "").strip()

    return {
        "message": response_message,
        "mode": mode,
        "target_field": target_field,
        "proposed_message": proposed_message,
        "updates": updates,
        "suggestions": suggestions,
        "options": options,
        "next_step": next_step  # NEW
    }
```

#### Workflow Transition Rules

**From EXPLORATION**:
- Can stay in: EXPLORATION (keep asking questions)
- Can jump to: any uncompleted data step (when ready to suggest options)
- Can go to: REVIEW (when all required fields complete)

**From Data Steps** (PURPOSE, BUSINESS_GOALS, etc.):
- Can go to: EXPLORATION (need more context before suggesting next field)
- Can go to: another uncompleted data step (ready to suggest options for that field)
- Can go to: REVIEW (when all required fields complete)

**From REVIEW**:
- Can go to: COMPLETE (user confirms)
- Can go to: EXPLORATION (user wants to make changes)

**From COMPLETE**:
- Workflow ends

**Key principle**: EXPLORATION is always available as a fallback. LLM decides:
- "Do I have enough context to suggest options?" → Go to data step
- "Do I need more info?" → Go to/stay in EXPLORATION

#### Benefits

1. **Clear separation of concerns**: EXPLORATION for questions, data steps for suggestions
2. **Natural conversation flow**: LLM can ask questions when needed instead of forcing suggestions
3. **Always has a fallback**: EXPLORATION is always available when LLM needs more context
4. **Intelligent transitions**: LLM reasons about best next step based on conversation trajectory
5. **Workflow engine controls structure**: Enforces what transitions are valid
6. **Backend validates choices**: Prevents invalid transitions
7. **Debuggable**: Clear audit trail of why transitions happen (LLM reasoning + validation)

---

### 10. Migration Path

1. **Phase 1**: Add `user_action` to backend (optional, backward compatible)
   - If `user_action` present, use new logic
   - If absent, fall back to old behavior

2. **Phase 2**: Update frontend to send `user_action`
   - Start with simplest cases (`option_selected`)
   - Gradually add other action types

3. **Phase 3**: Remove old logic once all action types supported
   - Make `user_action` required
   - Remove fallback code

4. **Phase 4**: Add advanced features
   - Skip buttons
   - Go back functionality
   - Better validation messages

5. **Phase 5**: Implement LLM-driven transitions
   - Add `get_available_next_steps()` to workflow engine
   - Update system prompt with valid transitions
   - Add `NEXT_STEP` parsing
   - Add transition validation
