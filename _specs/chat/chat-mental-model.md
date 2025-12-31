# Mental Model: Adding Chat to a Page

A simple cheat sheet for thinking about adding the chat assistant to any page.

---

## The Three Questions

### 1. **What does the LLM need to know?** (Context)

Think about what information the LLM needs to help the user on this page:

- **Where is the user?** - Which page, which tab, what mode?
- **What are they looking at?** - List data, form values, current state
- **What can they do?** - Available actions, constraints, business rules

**Examples:**
- Edit page → current form values, validation rules, what fields mean
- List page → items in the list, filters applied, what user can create
- Dashboard → summary stats, trends, what metrics mean

### 2. **What can the LLM suggest?** (Payloads)

Think about structured responses that would actually help:

- **Proposals** - "Here's a complete setup based on what you described"
- **Suggestions** - "You might want to add these topics/entities/fields"
- **Validation** - "Here's what's good, here's what's missing"
- **Insights** - "I noticed gaps/patterns in your data"

**Rule of thumb:**
- If you'd manually copy-paste → make it a payload
- If it needs user approval → make it a payload
- If it's just conversation → regular chat response

### 3. **What happens when they click Accept?** (Handlers)

Think about the outcome:

- **Apply to form** - Update state with proposed values
- **Navigate** - Take user to creation page with pre-filled data
- **Display info** - Show insights (no action needed)
- **Trigger action** - Run validation, execute operation

---

## The Implementation Checklist

### Backend (15 min)

1. **Create payload file**: `backend/services/chat_payloads/{page_name}.py`

2. **Define what context to send:**
   ```python
   def build_context(context: Dict[str, Any]) -> str:
       # Extract what you need from context dict
       current_data = context.get("current_form", {})

       # Build a clear description for the LLM
       return """User is on X page.
       Current state:
       - Field A: {value}
       - Field B: {value}

       They can ask about...
       """
   ```

3. **Define payload types** - For each type:
   - Parser function (JSON → dict)
   - Parse marker (e.g., `"PROPOSAL:"`)
   - LLM instructions (when to use, what format)

4. **Register**: `register_page("{page_name}", PAYLOADS, build_context)`

5. **Import** in `chat_payloads/__init__.py`

### Frontend (15 min)

1. **Create card components** for each payload type:
   - Shows the data clearly
   - Accept/Reject buttons
   - Lives in `components/chat/`

2. **Add to page**:
   ```typescript
   import ChatTray from '../components/chat/ChatTray';
   import MyPayloadCard from '../components/chat/MyPayloadCard';
   ```

3. **Define handlers** (named functions):
   ```typescript
   const handleProposalAccept = (data: any) => {
       // Update state with data
       setForm({ ...form, ...data });
   };
   ```

4. **Wire up ChatTray**:
   ```typescript
   <ChatTray
       initialContext={{
           current_page: "page_name",
           entity_type: "what_type",
           // Add data the LLM needs
           current_form: form,
           items: items,
       }}
       payloadHandlers={{
           my_payload: {
               render: (payload, callbacks) => (
                   <MyPayloadCard
                       payload={payload}
                       onAccept={callbacks.onAccept}
                       onReject={callbacks.onReject}
                   />
               ),
               onAccept: handleProposalAccept,
               onReject: handleProposalReject,
               renderOptions: {
                   panelWidth: '500px',
                   headerTitle: 'Proposal',
                   headerIcon: '📋'
               }
           }
       }}
   />
   ```

---

## Context Best Practices

### ✅ Include Context That:
- Changes based on user actions (form values, filters, selections)
- Helps LLM understand current state
- Is needed to generate useful suggestions
- Defines what's possible (available options, constraints)

### ❌ Don't Include Context That:
- Never changes for this page type
- Is too large (thousands of items - summarize instead)
- Contains sensitive data not needed for suggestions
- Duplicates what page name already implies

### 📦 How to Retrieve Context

Think about **when** the data is available:

1. **Already in component state?** → Just pass it
   ```typescript
   initialContext={{ current_form: form }}
   ```

2. **From a context provider?** → Use the hook
   ```typescript
   const { items } = useMyContext();
   initialContext={{ items: items }}
   ```

3. **Needs to be fetched?** → Load it in useEffect
   ```typescript
   useEffect(() => {
       loadData();
   }, []);
   ```

4. **Changes over time?** → Context auto-updates when prop changes
   - ChatTray watches `initialContext` prop
   - When it changes, context is automatically re-sent
   - No manual updates needed!

---

## Common Patterns by Page Type

### **Edit Pages**
- **Context**: Current form values, validation rules
- **Payloads**: Schema proposals, field suggestions, validation results
- **Handlers**: Apply changes to form, show validation errors

### **List Pages**
- **Context**: Items in list (first 10-20), filters, counts
- **Payloads**: Suggestions for new items, insights about portfolio, bulk actions
- **Handlers**: Navigate to create page, apply filters, show insights

### **Create Pages**
- **Context**: Partially filled form, available options
- **Payloads**: Complete templates, field suggestions, validation
- **Handlers**: Apply template to form, add suggestions, show errors

### **Dashboard Pages**
- **Context**: Summary statistics, trends, time range
- **Payloads**: Insights, anomaly detection, recommendations
- **Handlers**: Navigate to details, apply filters, show explanations

---

## Quick Reference

**Backend:** `services/chat_payloads/{page_name}.py`
- Define context builder
- Define payload types
- Register with `register_page()`

**Frontend:** Add to page component
- Import ChatTray + card components
- Define handler functions
- Pass context as prop
- Register payloadHandlers

**The Flow:**
```
User types → Backend gets context → LLM generates response →
If payload → Shows in panel → User accepts → Handler runs → State updates
```

---

## Examples to Reference

- **Edit Page**: `EditStreamPage.tsx` + `edit_stream.py` (1 payload type)
- **List Page**: `StreamsPage.tsx` + `streams_list.py` (3 payload types)
- **Create Page**: `CreateStreamPage.tsx` + `new_stream.py` (3 payload types)
