# State Transitions Examples

This document provides concrete examples for each state transition, showing exactly what entities are created/updated according to the rules in documents 02 and 03.

## State Transition List

1. **PROPOSE_MISSION** - Agent completes mission planning
2. **ACCEPT_MISSION** - User clicks "Approve Mission" button  
3. **START_HOP_PLAN** - User requests hop planning via chat
4. **PROPOSE_HOP_PLAN** - Agent completes hop design
5. **ACCEPT_HOP_PLAN** - User clicks "Accept Hop Plan" button
6. **START_HOP_IMPL** - User requests implementation via chat
7. **PROPOSE_HOP_IMPL** - Agent completes implementation design
8. **ACCEPT_HOP_IMPL** - User clicks "Accept Implementation" button
9. **EXECUTE_HOP** - User clicks "Start Execution" button
10. **COMPLETE_TOOL_STEP** - Tool execution completes (or simulated)
11. **COMPLETE_HOP** - All tool steps completed
12. **COMPLETE_MISSION** - Manual mission completion

---

## 1. PROPOSE_MISSION - Complete Example

### Input Data
```python
# Example mission data from agent using MissionLite schema
mission_lite = MissionLite(
    name="Analyze Customer Feedback Trends",
    description="Analyze customer feedback data to identify trends and create actionable insights",
    goal="Generate comprehensive analysis report with recommendations",
    success_criteria=[
        "Process all customer feedback data from Q4 2024",
        "Identify top 5 trending issues and opportunities", 
        "Create executive summary with actionable recommendations"
    ],
    mission_metadata={
        "estimated_duration": "2-3 hours",
        "complexity": "medium",
        "data_sources": ["customer_feedback_db", "survey_results"]
    },
    assets=[
        AssetLite(
            name="Customer Feedback Dataset",
            description="Raw customer feedback data from Q4 2024",
            schema_definition={
                "type": "file",
                "description": "CSV file containing customer feedback data",
                "is_array": False,
                "fields": {
                    "date": {"type": "string", "description": "Feedback date"},
                    "customer_id": {"type": "string", "description": "Customer identifier"},
                    "feedback_text": {"type": "string", "description": "Customer feedback content"},
                    "rating": {"type": "number", "description": "Customer rating 1-5"},
                    "category": {"type": "string", "description": "Feedback category"}
                }
            },
            role=AssetRole.INPUT,
            content=None,  # ✅ FIXED: Empty initially
            asset_metadata={  # ✅ FIXED: Moved metadata here
                "file_path": "/data/customer_feedback_q4_2024.csv",
                "row_count": 15420,
                "size_mb": 12.3
            }
        ),
        AssetLite(
            name="Customer Feedback Analysis Report", 
            description="Comprehensive analysis report with trends and recommendations",
            schema_definition={
                "type": "markdown",
                "description": "Analysis report in markdown format",
                "is_array": False,
                "fields": {
                    "executive_summary": {"type": "string", "description": "Executive summary section"},
                    "trend_analysis": {"type": "string", "description": "Trend analysis section"},
                    "recommendations": {"type": "string", "description": "Recommendations section"}
                }
            },
            role=AssetRole.OUTPUT,
            content=None  # ✅ FIXED: Empty initially, will be populated during execution
        )
    ]
}

# Context
user_id = 123
active_session_id = "session_abc123"
```

### Database Entities Created

#### 1. Mission Entity
| id | name | status | current_hop_id |
|---|---|---|---|
| mission_def456 | Analyze Customer Feedback Trends | AWAITING_APPROVAL | null |

#### 2. Asset Entities (created from mission_lite.assets)

**Assets Table:**
| id | name | schema_definition | scope_type | scope_id | status | role |
|---|---|---|---|---|---|---|
| uuid_generated_1 | Customer Feedback Dataset | {"type": "file", ...} | mission | mission_def456 | PROPOSED | INPUT |
| uuid_generated_2 | Customer Feedback Analysis Report | {"type": "markdown", ...} | mission | mission_def456 | PROPOSED | OUTPUT |

#### 3. MissionAsset Mapping Entries

**MissionAssets Table:**
| id | mission_id | asset_id | role |
|---|---|---|---|
| mission_asset_mapping_1 | mission_def456 | uuid_generated_1 | INPUT |
| mission_asset_mapping_2 | mission_def456 | uuid_generated_2 | OUTPUT |

#### 4. UserSession Update

**UserSessions Table:**
| id | mission_id | status | updated_at |
|---|---|---|---|
| session_abc123 | mission_def456 | ACTIVE | 2024-01-15T10:30:00Z |

### Result State

After this transition completes:

- **Mission**: Created in `AWAITING_APPROVAL` status, linked to user session
- **Assets**: 2 mission-scoped assets created (1 input, 1 output) with `PROPOSED` status
- **Mappings**: 2 mission-asset mappings created to track asset roles
- **Session**: Updated to link the new mission for context preservation

The system is now ready for the user to review and approve the mission proposal via the `ACCEPT_MISSION` transition.

---

## 2. ACCEPT_MISSION - Entity Updates

### Input Data
```python
# Context - continuing from transition 1
user_id = 123
mission_id = "mission_def456"
# User clicked "Approve Mission" button
```

### Database Entities Updated

#### Mission Entity
| id | name | status | current_hop_id | updated_at |
|---|---|---|---|---|
| mission_def456 | Analyze Customer Feedback Trends | IN_PROGRESS | null | 2024-01-15T10:35:00Z |

#### Asset Entities (status updates)
| id | name | status | updated_at |
|---|---|---|---|
| uuid_generated_1 | Customer Feedback Dataset | PENDING | 2024-01-15T10:35:00Z |
| uuid_generated_2 | Customer Feedback Analysis Report | PENDING | 2024-01-15T10:35:00Z |

### Result State
- **Mission**: Status changed from `AWAITING_APPROVAL` to `IN_PROGRESS`
- **Assets**: All mission assets updated from `PROPOSED` to `PENDING` status
- **System**: Ready for user to request hop planning

---

## 3. START_HOP_PLAN - Entity Updates

### Input Data
```python
# Context - continuing from transition 2
user_id = 123
mission_id = "mission_def456"
# User requests hop planning via chat: "Let's start planning the first hop"
```

### Database Entities Created/Updated

#### New Hop Entity
| id | name | status | sequence_order | mission_id | is_final | created_at | updated_at |
|---|---|---|---|---|---|---|---|
| hop_abc123 | Hop 1 | HOP_PLAN_STARTED | 1 | mission_def456 | false | 2024-01-15T10:40:00Z | 2024-01-15T10:40:00Z |

#### Mission Entity Update
| id | name | status | current_hop_id | updated_at |
|---|---|---|---|---|
| mission_def456 | Analyze Customer Feedback Trends | IN_PROGRESS | hop_abc123 | 2024-01-15T10:40:00Z |

### Result State
- **Hop**: Created in `HOP_PLAN_STARTED` status
- **Mission**: `current_hop_id` set to link active hop
- **System**: Agent begins hop design planning

---

## 4. PROPOSE_HOP_PLAN - Entity Updates

### Input Data
```python
# Agent completes hop design using HopLite schema
hop_lite = HopLite(
    name="Data Analysis Hop",
    description="Process customer feedback data and generate analysis",
    goal="Transform raw feedback into structured insights",
    rationale="Need to clean and analyze the data before generating final report",
    success_criteria=[
        "Clean and validate customer feedback data",
        "Perform trend analysis on feedback patterns",
        "Generate intermediate analysis results"
    ],
    is_final=False,
    inputs=["uuid_generated_1"],  # Use existing input dataset asset ID
    output=NewAssetOutput(
        asset=AssetLite(
            name="Analysis Results",
            description="Structured analysis of customer feedback trends",
            schema_definition={
                "type": "object",
                "description": "Structured analysis results in JSON format",
                "is_array": False,
                "fields": {
                    "trends": {"type": "object", "description": "Trend analysis data"},
                    "insights": {"type": "object", "description": "Key insights extracted"},
                    "metrics": {"type": "object", "description": "Statistical metrics"}
                }
            },
            role=AssetRole.INTERMEDIATE,
            content=None,
            asset_metadata={}
        )
    ),
    hop_metadata={
        "estimated_duration": "45 minutes",
        "complexity": "medium"
    }
)
```

### Database Entities Created/Updated

#### Hop Entity Update
| id | name | status | description | goal | rationale | is_final | updated_at |
|---|---|---|---|---|---|---|---|
| hop_abc123 | Data Analysis Hop | HOP_PLAN_PROPOSED | Process customer feedback data and generate analysis | Transform raw feedback into structured insights | Need to clean and analyze the data before generating final report | false | 2024-01-15T10:45:00Z |

#### New Asset Entity (from hop_lite.output.asset)
| id | name | schema_definition | scope_type | scope_id | status | role | created_at | updated_at |
|---|---|---|---|---|---|---|---|---|
| uuid_generated_3 | Analysis Results | {"type": "object", ...} | mission | mission_def456 | PROPOSED | INTERMEDIATE | 2024-01-15T10:45:00Z | 2024-01-15T10:45:00Z |

#### New MissionAsset Mapping
| id | mission_id | asset_id | role | created_at | updated_at |
|---|---|---|---|---|---|
| mission_asset_mapping_3 | mission_def456 | uuid_generated_3 | INTERMEDIATE | 2024-01-15T10:45:00Z | 2024-01-15T10:45:00Z |

#### New HopAsset Mappings
| id | hop_id | asset_id | role | created_at | updated_at |
|---|---|---|---|---|---|
| hop_asset_mapping_1 | hop_abc123 | uuid_generated_1 | INPUT | 2024-01-15T10:45:00Z | 2024-01-15T10:45:00Z |
| hop_asset_mapping_2 | hop_abc123 | uuid_generated_3 | OUTPUT | 2024-01-15T10:45:00Z | 2024-01-15T10:45:00Z |

### Result State
- **Hop**: Status changed to `HOP_PLAN_PROPOSED` with full plan details
- **Assets**: New intermediate asset created for hop output
- **Mappings**: Hop linked to input (existing) and output (new) assets
- **System**: Ready for user to approve hop plan

---

## 5. ACCEPT_HOP_PLAN - Entity Updates

### Input Data
```python
# Context - continuing from transition 4
user_id = 123
hop_id = "hop_abc123"
# User clicked "Accept Hop Plan" button
```

### Database Entities Updated

#### Hop Entity
| id | name | status | description | goal | is_final | updated_at |
|---|---|---|---|---|---|---|
| hop_abc123 | Data Analysis Hop | HOP_PLAN_READY | Process customer feedback data and generate analysis | Transform raw feedback into structured insights | false | 2024-01-15T10:50:00Z |

#### Asset Entities (status updates for hop-created assets)
| id | name | status | updated_at |
|---|---|---|---|
| uuid_generated_3 | Analysis Results | PENDING | 2024-01-15T10:50:00Z |

### Result State
- **Hop**: Status changed from `HOP_PLAN_PROPOSED` to `HOP_PLAN_READY`
- **Assets**: Hop-created assets updated from `PROPOSED` to `PENDING` status
- **System**: Ready for user to request hop implementation

## 6. START_HOP_IMPL (3.1) - Entity Updates

### Input Data
```python
# Context - continuing from transition 5
user_id = 123
hop_id = "hop_abc123"
# User requests implementation via chat: "Let's start implementing this hop"
```

### Database Entities Updated

#### Hop Entity
| id | name | status | description | goal | is_final | updated_at |
|---|---|---|---|---|---|---|
| hop_abc123 | Data Analysis Hop | HOP_IMPL_STARTED | Process customer feedback data and generate analysis | Transform raw feedback into structured insights | false | 2024-01-15T10:55:00Z |

### Result State
- **Hop**: Status changed from `HOP_PLAN_READY` to `HOP_IMPL_STARTED`
- **System**: Agent begins tool step design analysis

---

## 7. PROPOSE_HOP_IMPL (3.2) - Entity Updates

### Input Data
```python
# Agent completes implementation design using ToolStepLite specifications
tool_steps = [
    ToolStepLite(
        tool_id="csv_processor",
        name="Load and Clean Customer Feedback",
        description="Load CSV data and perform initial cleaning",
        sequence_order=1,
        parameter_mapping={
            "input_file": AssetFieldMapping(
                type="asset_field",
                state_asset="uuid_generated_1"  # Customer Feedback Dataset
            ),
            "output_format": LiteralMapping(
                type="literal", 
                value="cleaned_dataframe"
            )
        },
        result_mapping={
            "cleaned_data": AssetFieldMapping(
                type="asset_field",
                state_asset="uuid_generated_3"  # Analysis Results (partial)
            )
        },
        tool_metadata={
            "estimated_runtime": "30 seconds",
            "memory_usage": "low"
        }
    ),
    ToolStepLite(
        tool_id="data_analyzer",
        name="Perform Trend Analysis",
        description="Analyze cleaned data for trends and patterns",
        sequence_order=2,
        parameter_mapping={
            "input_data": AssetFieldMapping(
                type="asset_field",
                state_asset="uuid_generated_3"  # Analysis Results (from step 1)
            ),
            "analysis_type": LiteralMapping(
                type="literal",
                value="trend_analysis"
            )
        },
        result_mapping={
            "analysis_results": AssetFieldMapping(
                type="asset_field",
                state_asset="uuid_generated_3"  # Analysis Results (complete)
            )
        },
        tool_metadata={
            "estimated_runtime": "2 minutes",
            "memory_usage": "medium"
        }
    )
]
```

### Database Entities Created/Updated

#### Hop Entity Update
| id | name | status | description | goal | is_final | updated_at |
|---|---|---|---|---|---|---|
| hop_abc123 | Data Analysis Hop | HOP_IMPL_PROPOSED | Process customer feedback data and generate analysis | Transform raw feedback into structured insights | false | 2024-01-15T11:00:00Z |

#### New Tool Step Entities
| id | hop_id | tool_id | name | sequence_order | status | created_at | updated_at |
|---|---|---|---|---|---|---|---|
| step_001 | hop_abc123 | csv_processor | Load and Clean Customer Feedback | 1 | PROPOSED | 2024-01-15T11:00:00Z | 2024-01-15T11:00:00Z |
| step_002 | hop_abc123 | data_analyzer | Perform Trend Analysis | 2 | PROPOSED | 2024-01-15T11:00:00Z | 2024-01-15T11:00:00Z |

### Result State
- **Hop**: Status changed from `HOP_IMPL_STARTED` to `HOP_IMPL_PROPOSED`
- **Tool Steps**: 2 tool steps created with `PROPOSED` status and serialized mappings
- **System**: Ready for user to approve implementation

---

## 8. ACCEPT_HOP_IMPL (3.3) - Entity Updates

### Input Data
```python
# Context - continuing from transition 7
user_id = 123
hop_id = "hop_abc123"
# User clicked "Accept Implementation" button
```

### Database Entities Updated

#### Hop Entity
| id | name | status | description | goal | is_final | updated_at |
|---|---|---|---|---|---|---|
| hop_abc123 | Data Analysis Hop | HOP_IMPL_READY | Process customer feedback data and generate analysis | Transform raw feedback into structured insights | false | 2024-01-15T11:05:00Z |

#### Tool Step Entities (status updates)
| id | hop_id | tool_id | name | sequence_order | status | updated_at |
|---|---|---|---|---|---|---|
| step_001 | hop_abc123 | csv_processor | Load and Clean Customer Feedback | 1 | READY_TO_EXECUTE | 2024-01-15T11:05:00Z |
| step_002 | hop_abc123 | data_analyzer | Perform Trend Analysis | 2 | READY_TO_EXECUTE | 2024-01-15T11:05:00Z |

### Result State
- **Hop**: Status changed from `HOP_IMPL_PROPOSED` to `HOP_IMPL_READY`
- **Tool Steps**: All tool steps updated from `PROPOSED` to `READY_TO_EXECUTE` status
- **System**: Ready for user to start hop execution

---

## 9. COMPLETE_TOOL_STEP (4.1) - Entity Updates

[Example to be added] 