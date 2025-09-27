export interface Note {
    "id": "default-01",
    "name": "Summarize AI Newsletters for April",
    "description": "Summarizes AI newsletters from the Gmail 'ai news' folder for the month of April, focusing on new model capabilities and orchestration tools/frameworks.",
    "goal": "To provide an executive summary in markdown format of relevant AI news from April based on specified topics.",
    "success_criteria": [
        "Retrieve all emails from the 'ai news' folder within April",
        "Filter stories related to new model capabilities and orchestration tools",
        "Produce an executive summary with bullet points in markdown format"
    ],
    "inputs": [
        {
            "id": "9df93662-d664-4515-b2fe-080b8441562d",
            "name": "Gmail Credentials",
            "description": "Credentials to access the Gmail account for retrieval",
            "schema_definition": {
                "type": "object",
                "description": "{\"email\":\"user@example.com\",\"api_key\":\"abc123\"}",
                "is_array": false,
                "fields": null
            },
            "value": "{\"email\":\"user@example.com\",\"api_key\":\"abc123\"}",
            "subtype": "json",
            "is_collection": false,
            "collection_type": "null",
            "asset_metadata": {
                "created_at": "2025-06-06T17:13:27.389502",
                "updated_at": "2025-06-06T17:13:27.389502",
                "creator": "mission_specialist",
                "tags": [],
                "agent_associations": [],
                "version": 1,
                "token_count": 0
            }
        },
        {
            "id": "d7649070-d5cc-40a4-9e95-895f14312032",
            "name": "AI News Emails",
            "description": "Emails from the 'ai news' label/folder in Gmail",
            "schema_definition": {
                "type": "database_entity",
                "description": "Search and retrieve emails with filtering capabilities",
                "is_array": true,
                "fields": null
            },
            "value": "{\"label\":\"ai news\",\"date_range\":\"April\"}",
            "subtype": "email_search",
            "is_collection": true,
            "collection_type": "array",
            "asset_metadata": {
                "created_at": "2025-06-06T17:13:27.389502",
                "updated_at": "2025-06-06T17:13:27.389502",
                "creator": "mission_specialist",
                "tags": [],
                "agent_associations": [],
                "version": 1,
                "token_count": 0
            }
        }
    ],
    "outputs": [
        {
            "id": "1ede5e55-47f0-40f4-9932-25cc74e2f7a9",
            "name": "AI News Summary",
            "description": "Summarized bullet points in markdown format highlighting new model capabilities and orchestration tools.",
            "schema_definition": {
                "type": "markdown",
                "description": "Markdown document with bullet points for each new model capability/tool",
                "is_array": false,
                "fields": null
            },
            "value": "- **New Model Capability A**: Details\n- **Orchestration Tool B**: Description",
            "subtype": "report",
            "is_collection": false,
            "collection_type": "null",
            "asset_metadata": {
                "created_at": "2025-06-06T17:13:27.389502",
                "updated_at": "2025-06-06T17:13:27.389502",
                "creator": "mission_specialist",
                "tags": [],
                "agent_associations": [],
                "version": 1,
                "token_count": 0
            }
        }
    ],
    "state": {
        "hop_retrieve_april_ai_newsletters_10468075_output": {
            "id": "hop_retrieve_april_ai_newsletters_10468075_output",
            "name": "April AI News Emails",
            "description": "Emails from the 'ai news' folder tagged with dates in April.",
            "schema_definition": {
                "type": "object",
                "description": "List of emails with metadata including sender, date, subject, and body content.",
                "is_array": true,
                "fields": null
            },
            "value": null,
            "subtype": "email",
            "is_collection": true,
            "collection_type": "array",
            "asset_metadata": {
                "created_at": "2025-06-06T17:13:27.389502",
                "updated_at": "2025-06-06T17:13:27.389502",
                "creator": "mission_specialist",
                "tags": [],
                "agent_associations": [],
                "version": 1,
                "token_count": 0
            }
        }
    },
    "hops": [
        {
            "id": "82bb4b85-a608-40fb-b6a9-9d94a2108d65",
            "name": "Retrieve April AI Newsletters",
            "description": "Retrieve all emails from the 'ai news' folder in Gmail for the month of April.",
            "input_mapping": {
                "gmail_credentials": "9df93662-d664-4515-b2fe-080b8441562d"
            },
            "state": {
                "gmail_credentials": {
                    "id": "9df93662-d664-4515-b2fe-080b8441562d",
                    "name": "Gmail Credentials",
                    "description": "Credentials to access the Gmail account for retrieval",
                    "schema_definition": {
                        "type": "object",
                        "description": "{\"email\":\"user@example.com\",\"api_key\":\"abc123\"}",
                        "is_array": false,
                        "fields": null
                    },
                    "value": "{\"email\":\"user@example.com\",\"api_key\":\"abc123\"}",
                    "subtype": "json",
                    "is_collection": false,
                    "collection_type": "null",
                    "asset_metadata": {
                        "created_at": "2025-06-06T17:13:27.389502",
                        "updated_at": "2025-06-06T17:13:27.389502",
                        "creator": "mission_specialist",
                        "tags": [],
                        "agent_associations": [],
                        "version": 1,
                        "token_count": 0
                    }
                },
                "April AI News Emails": {
                    "id": "hop_retrieve_april_ai_newsletters_10468075_output",
                    "name": "April AI News Emails",
                    "description": "Emails from the 'ai news' folder tagged with dates in April.",
                    "schema_definition": {
                        "type": "object",
                        "description": "List of emails with metadata including sender, date, subject, and body content.",
                        "is_array": true,
                        "fields": null
                    },
                    "value": null,
                    "subtype": "email",
                    "is_collection": true,
                    "collection_type": "array",
                    "asset_metadata": {
                        "created_at": "2025-06-06T17:13:27.389502",
                        "updated_at": "2025-06-06T17:13:27.389502",
                        "creator": "mission_specialist",
                        "tags": [],
                        "agent_associations": [],
                        "version": 1,
                        "token_count": 0
                    }
                }
            },
            "output_mapping": {
                "April AI News Emails": "hop_retrieve_april_ai_newsletters_10468075_output"
            },
            "steps": [
                {
                    "id": "step1_email_search",
                    "tool_id": "email_search",
                    "description": "Search and retrieve emails from the 'ai news' folder for April.",
                    "parameter_mapping": {
                        "query": {
                            "type": "literal",
                            "value": "after:2023/03/31 before:2023/05/01"
                        },
                        "folder": {
                            "type": "literal",
                            "value": "ai news"
                        },
                        "credentials": {
                            "type": "asset_field",
                            "state_asset": "gmail_credentials",
                            "path": null
                        },
                        "limit": {
                            "type": "literal",
                            "value": 500
                        },
                        "include_attachments": {
                            "type": "literal",
                            "value": false
                        },
                        "include_metadata": {
                            "type": "literal",
                            "value": true
                        }
                    },
                    "result_mapping": {
                        "emails": "April_AI_News_Emails",
                        "count": "April_AI_News_Email_Count"
                    },
                    "status": "pending",
                    "error": null,
                    "created_at": "2025-06-06T17:13:33.342877",
                    "updated_at": "2025-06-06T17:13:33.342877",
                    "validation_errors": null
                }
            ],
            "status": "pending",
            "is_resolved": true,
            "is_final": false,
            "error": null,
            "current_step_index": 0,
            "created_at": "2025-06-06T17:13:11.636043",
            "updated_at": "2025-06-06T17:13:33.342877"
        }
    ],
    "current_hop_index": 0,
    "mission_status": "active",
    "hop_status": "hop_ready_to_execute",
    "metadata": {},
    "created_at": "2025-06-06T17:12:57.325447",
    "updated_at": "2025-06-06T17:12:57.325447"
}