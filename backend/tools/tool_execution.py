"""
Tool execution functionality has been moved to ToolExecutionService.

This file is deprecated. All tool execution logic is now in:
- backend/services/tool_execution_service.py

The logic was moved to maintain clean service architecture where
services call other services, not utility files.
"""

# This file is intentionally empty
# All functionality moved to ToolExecutionService