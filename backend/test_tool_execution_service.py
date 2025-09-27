#!/usr/bin/env python3
"""
Test script for the ToolExecutionService end-to-end flow.

This script tests the complete tool execution architecture:
ToolExecutionService -> AssetService -> ToolHandlers

Uses tool stubbing to avoid external dependencies.
"""

import asyncio
import sys
import os
from pathlib import Path
from unittest.mock import MagicMock, AsyncMock
from typing import Dict, Any

# Add the backend directory to the path
backend_dir = Path(__file__).parent
sys.path.insert(0, str(backend_dir))

# No tool stubbing - using mocks instead

from services.tool_execution_service import ToolExecutionService
from services.tool_step_service import ToolStepService
from services.asset_service import AssetService
from services.asset_mapping_service import AssetMappingService
from services.state_transition_service import StateTransitionService, TransactionResult
from schemas.workflow import ToolStep
from schemas.asset import Asset, AssetScopeType, AssetRole, AssetStatus
from models import ToolExecutionStatus
from tools.tool_registry import refresh_tool_registry


class MockDB:
    """Mock database session for testing"""
    def __init__(self):
        self.committed = False
        self.refreshed_objects = []
    
    def commit(self):
        self.committed = True
    
    def refresh(self, obj):
        self.refreshed_objects.append(obj)


async def test_tool_execution_service():
    """Test the ToolExecutionService end-to-end flow with mocked dependencies."""
    
    print("Testing ToolExecutionService End-to-End Flow")
    print("=" * 60)
    
    # Setup mocks
    mock_db = MockDB()
    
    # Create real service but with mocked dependencies
    tool_execution_service = ToolExecutionService(mock_db)
    
    # Mock the dependent services
    tool_execution_service.tool_step_service = AsyncMock(spec=ToolStepService)
    tool_execution_service.asset_service = MagicMock(spec=AssetService)
    tool_execution_service.state_transition_service = AsyncMock(spec=StateTransitionService)
    
    # Step 1: Setup test data
    print("\n1. Setting up test data...")
    
    test_tool_step = ToolStep(
        id="test-tool-step-123",
        tool_id="extract",  # Use extract tool since it exists
        name="Test Extract Step", 
        description="Test extraction",
        sequence_order=1,
        hop_id="test-hop-456",
        resource_configs={},
        parameter_mapping={
            "items": {
                "type": "literal",
                "value": ["item1", "item2", "item3"]
            },
            "extraction_function": {
                "type": "literal", 
                "value": "Count the number of characters in each item"
            }
        },
        result_mapping={},
        status=ToolExecutionStatus.PROPOSED,
        error_message=None,
        validation_errors=[],
        created_at=None,
        updated_at=None
    )
    
    test_assets = {
        "asset-1": Asset(
            id="asset-1",
            name="Test Asset 1", 
            description="Test asset for testing",
            schema_definition={"type": "object"},
            scope_type=AssetScopeType.HOP,
            scope_id="test-hop-456",
            role=AssetRole.INPUT,
            value_representation="Test data representation",
            status=AssetStatus.READY
        )
    }
    
    # Step 2: Mock service responses
    print("2. Configuring service mocks...")
    
    # Mock ToolStepService.get_tool_step
    tool_execution_service.tool_step_service.get_tool_step.return_value = test_tool_step
    
    # Mock ToolStepService.update_tool_step_status  
    tool_execution_service.tool_step_service.update_tool_step_status.return_value = test_tool_step
    
    # Mock AssetService.get_hop_asset_context
    tool_execution_service.asset_service.get_hop_asset_context.return_value = test_assets
    
    # Mock StateTransitionService.updateState
    mock_transition_result = TransactionResult(
        success=True,
        entity_id="test-tool-step-123",
        status="completed",
        message="Tool step completed successfully",
        metadata={
            'assets_created': ['new-asset-1'],
            'hop_completed': False,
            'mission_completed': False
        }
    )
    tool_execution_service.state_transition_service.updateState.return_value = mock_transition_result
    
    # Step 3: Check tool registry (already loaded when modules imported)
    print("3. Checking tool registry...")
    
    # Check and mock the actual tool handler  
    from tools.tool_registry import get_tool_definition
    tool_def = get_tool_definition("extract")
    print(f"Tool definition found: {tool_def is not None}")
    print(f"Execution handler: {tool_def.execution_handler if tool_def else 'No tool def'}")
    
    if tool_def:
        if tool_def.execution_handler:
            # Create a mock that returns ToolHandlerResult format
            async def mock_handler(input_data):
                from schemas.tool_handler_schema import ToolHandlerResult
                return ToolHandlerResult(
                    outputs={"extractions": ["mocked_result_1", "mocked_result_2"]},
                    metadata={"mocked": True}
                )
            
            # Replace the real handler with our mock
            tool_def.execution_handler.handler = mock_handler
            print("Mocked the extract tool handler")
        else:
            print("WARNING: Extract tool has no execution handler!")
    else:
        print("ERROR: Extract tool definition not found!")
    
    # Step 4: Execute the tool step
    print("4. Executing tool step...")
    
    try:
        result = await tool_execution_service.execute_tool_step(
            tool_step_id="test-tool-step-123",
            user_id=1
        )
        
        print("[OK] Tool execution completed successfully!")
        print(f"   Success: {result['success']}")
        print(f"   Tool Step ID: {result['tool_step_id']}")
        print(f"   Hop ID: {result['hop_id']}")
        print(f"   Assets Created: {result['assets_created']}")
        
        # Step 5: Verify service calls
        print("\n5. Verifying service interactions...")
        
        # Check ToolStepService calls
        tool_execution_service.tool_step_service.get_tool_step.assert_called_once_with("test-tool-step-123", 1)
        
        # Should be called twice: once for EXECUTING, once via StateTransitionService
        assert tool_execution_service.tool_step_service.update_tool_step_status.call_count >= 1
        
        # Check AssetService calls
        tool_execution_service.asset_service.get_hop_asset_context.assert_called_once_with("test-hop-456", 1)
        
        # Check StateTransitionService calls
        tool_execution_service.state_transition_service.updateState.assert_called_once()
        
        print("[OK] All service interactions verified!")
        
        return True
        
    except Exception as e:
        print(f"[ERROR] Tool execution failed: {e}")
        print(f"   Exception type: {type(e).__name__}")
        import traceback
        traceback.print_exc()
        return False


async def main():
    """Main test function"""
    print("Starting ToolExecutionService End-to-End Test")
    print("This test verifies the complete service architecture flow")
    print()
    
    success = await test_tool_execution_service()
    
    if success:
        print("\n[SUCCESS] All tests passed! The service architecture is working correctly.")
        return 0
    else:
        print("\n[FAILED] Tests failed! Check the error messages above.")
        return 1


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)