# Content Enrichment Form - Test Section Reorganization

## Current Layout Issues

The "Test Prompt" section at the bottom of the form has a confusing layout:

1. **Data source selection is in the header row** (top right of section)
2. **Actual report selection is below** (bottom left)
3. **Model configuration is inline** with report selection (far right)
4. **Run Test button is in the header** (top right)

This creates a fragmented flow where related choices are separated spatially.

## Current Element Inventory

### Header Row (lines 854-890)
| Element | Purpose | Current Location |
|---------|---------|------------------|
| "Test Prompt" title + icon | Section header | Left |
| Data source dropdown | Choose "From Report" or "Paste JSON" | Center-right |
| "Run Test" button | Execute test | Far right |

### Data Input Area - Report Mode (lines 894-1015)
| Element | Purpose | When Visible |
|---------|---------|--------------|
| Report dropdown | Select which report to test with | Always (in report mode) |
| Category dropdown | Select category for category_summary | Only for category_summary prompt type |
| Article Index dropdown | Select which article (1-50) | Only for article_summary prompt type |
| "Use stream model" checkbox | Toggle between stream default and custom model | Always (in report mode) |
| Model dropdown | Select LLM model | When "Use stream model" unchecked |
| Temperature/Reasoning input | Model parameter | When "Use stream model" unchecked |
| Max tokens input | Model parameter | When "Use stream model" unchecked |
| Stream model indicator | Shows current stream model name | When "Use stream model" checked |

### Data Input Area - Paste Mode (lines 1016-1027)
| Element | Purpose |
|---------|---------|
| JSON textarea | Paste sample data for testing |

## Problems with Current Layout

1. **Cognitive fragmentation**: User selects "From Report" in one place, then selects the actual report in another place below
2. **Horizontal sprawl**: Everything crammed into one long horizontal line
3. **Model config hidden in corner**: Important model settings are visually de-emphasized
4. **No visual grouping**: Related inputs (report + category + article) not visually grouped together
5. **Run button disconnected**: Button is far from the inputs it acts upon

## Proposed Reorganization

### Option A: Vertical Stacked Layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│ ⚗️ Test Prompt                                                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  DATA SOURCE                                                            │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ ○ From Report    ○ Paste JSON                                   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  [If From Report selected:]                                             │
│  ┌──────────────────────────────┐  ┌──────────────────────────────┐   │
│  │ Report                       │  │ Category (if category_summary)│   │
│  │ [Dropdown_______________▼]   │  │ [Dropdown_______________▼]   │   │
│  └──────────────────────────────┘  └──────────────────────────────┘   │
│                                                                         │
│  [If article_summary:]                                                  │
│  ┌──────────────────────────────┐                                      │
│  │ Article                      │                                      │
│  │ [Dropdown_______________▼]   │                                      │
│  └──────────────────────────────┘                                      │
│                                                                         │
│  [If Paste JSON selected:]                                              │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Sample Data (JSON)                                              │   │
│  │ [Textarea                                                    ]  │   │
│  │ [                                                            ]  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  MODEL                                                                  │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ ☑ Use stream's configured model (gpt-4o)                        │   │
│  │                                                                 │   │
│  │ [If unchecked:]                                                 │   │
│  │ Model: [Dropdown▼]  Temp: [0.0]  Max tokens: [____]            │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────┐                                               │
│  │  ⚗️ Run Test        │                                               │
│  └─────────────────────┘                                               │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Option B: Two-Column Compact Layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│ ⚗️ Test Prompt                                                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────┐  ┌──────────────────────────────┐ │
│  │ DATA SOURCE                     │  │ MODEL                        │ │
│  │                                 │  │                              │ │
│  │ ○ From Report  ○ Paste JSON     │  │ ☑ Use stream model (gpt-4o)  │ │
│  │                                 │  │                              │ │
│  │ Report: [Dropdown__________▼]   │  │ [If unchecked:]              │ │
│  │                                 │  │ [Model▼] [Temp] [MaxTok]     │ │
│  │ Category: [Dropdown________▼]   │  │                              │ │
│  │ (only for category_summary)     │  │                              │ │
│  │                                 │  │                              │ │
│  │ Article: [Dropdown_________▼]   │  │                              │ │
│  │ (only for article_summary)      │  │                              │ │
│  │                                 │  │                              │ │
│  └─────────────────────────────────┘  └──────────────────────────────┘ │
│                                                                         │
│                                      ┌─────────────────────┐           │
│                                      │  ⚗️ Run Test        │           │
│                                      └─────────────────────┘           │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Option C: Inline Progressive Disclosure (Recommended)

Radio buttons control what appears below them. Everything flows top-to-bottom.

```
┌─────────────────────────────────────────────────────────────────────────┐
│ ⚗️ Test Prompt                                                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  TEST DATA                                                              │
│  ○ From Report    ○ Paste JSON                                          │
│                                                                         │
│  ┌─ Report ──────────────────────────────────────────────────────────┐ │
│  │                                                                    │ │
│  │  Report         Category              Article                      │ │
│  │  [Dropdown▼]    [Dropdown▼]           [Dropdown▼]                  │ │
│  │                 (category_summary)    (article_summary)            │ │
│  │                                                                    │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  MODEL                                                                  │
│  ○ Use stream's configured model (gpt-4o)                               │
│  ○ Custom model                                                         │
│                                                                         │
│  ┌─ Custom Model ─────────────────────────────────────────────────────┐ │
│  │  Model              Temperature / Effort     Max Tokens            │ │
│  │  [Dropdown▼]        [Input]                  [Input]               │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│                                               ┌─────────────────────┐  │
│                                               │  ⚗️ Run Test        │  │
│                                               └─────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

## Recommendation

**Option C (Progressive Disclosure)** is recommended because:

1. **Clear visual hierarchy**: Radio buttons at top level, details below
2. **Reduces cognitive load**: Only shows relevant options based on selection
3. **Grouped logically**: Test data together, model config together
4. **Button at bottom**: Natural reading flow ends with action
5. **Conditional fields are clear**: Category/Article dropdowns only appear when relevant to the prompt type being tested

## Implementation Notes

1. Replace the dropdown "Data source" with radio buttons for clearer selection
2. Replace "Use stream model" checkbox with radio buttons (Stream Model / Custom Model)
3. Move "Run Test" button to bottom right of section
4. Add subtle bordered boxes around "Report" and "Custom Model" sections when active
5. The Category and Article dropdowns should appear/disappear based on `activePromptType`, not just hide - keeps the UI clean
