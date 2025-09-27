#!/usr/bin/env python3
"""
Test script to validate the canonical schema system.

This script tests that:
1. Canonical types can be retrieved correctly
2. Schema resolution works properly
3. Data validation works with canonical models
4. Tool definitions reference canonical types correctly
"""

import sys
import json
from datetime import datetime
from typing import Dict, Any

# Add the backend directory to the path
sys.path.insert(0, '.')

from schemas.canonical_types import (
    get_canonical_schema,
    get_canonical_model,
    list_canonical_types,
    validate_canonical_data,
    CanonicalEmail,
    CanonicalSearchResult
)
from schemas.base import resolve_canonical_schema, SchemaType

def test_canonical_types():
    """Test that all canonical types can be retrieved."""
    print("Testing canonical types...")
    
    types = list_canonical_types()
    print(f"Available canonical types: {types}")
    
    for type_name in types:
        try:
            # Test that we can get the model class
            model = get_canonical_model(type_name)
            print(f"✓ {type_name}: model class retrieved - {model.__name__}")
            
            # Test that we can dynamically generate schema from model
            schema = get_canonical_schema(type_name)
            field_count = len(schema.fields) if schema.fields else 0
            print(f"✓ {type_name}: schema generated dynamically with {field_count} fields")
            
        except Exception as e:
            print(f"✗ {type_name}: error - {e}")
    
    print()

def test_email_validation():
    """Test email validation with canonical schema."""
    print("Testing email validation...")
    
    # Valid email data
    valid_email = {
        "id": "test-123",
        "subject": "Test Email",
        "body": "This is a test email",
        "sender": "test@example.com",
        "recipients": ["recipient@example.com"],
        "timestamp": datetime.now(),
        "labels": ["INBOX"],
        "thread_id": "thread-456",
        "snippet": "Test email snippet",
        "attachments": [],
        "metadata": {"priority": "normal"}
    }
    
    try:
        # Test Pydantic model validation
        email_model = CanonicalEmail(**valid_email)
        print(f"✓ Email model validation successful: {email_model.subject}")
        
        # Test canonical validation function
        validated_data = validate_canonical_data('email', valid_email)
        print(f"✓ Canonical validation successful: {validated_data['subject']}")
        
    except Exception as e:
        print(f"✗ Email validation failed: {e}")
    
    print()

def test_search_result_validation():
    """Test search result validation with canonical schema."""
    print("Testing search result validation...")
    
    # Valid search result data
    valid_result = {
        "title": "Test Search Result",
        "url": "https://example.com/test",
        "snippet": "This is a test search result",
        "published_date": "2024-01-15T10:30:00Z",
        "source": "example.com",
        "rank": 1,
        "relevance_score": 0.95,
        "metadata": {"category": "test"}
    }
    
    try:
        # Test Pydantic model validation
        result_model = CanonicalSearchResult(**valid_result)
        print(f"✓ Search result model validation successful: {result_model.title}")
        
        # Test canonical validation function
        validated_data = validate_canonical_data('search_result', valid_result)
        print(f"✓ Canonical validation successful: {validated_data['title']}")
        
    except Exception as e:
        print(f"✗ Search result validation failed: {e}")
    
    print()

def test_schema_resolution():
    """Test that schema resolution works correctly."""
    print("Testing schema resolution...")
    
    # Create a schema that references a canonical type
    email_schema = SchemaType(
        type='email',
        description='An email message',
        is_array=False
    )
    
    try:
        resolved_schema = resolve_canonical_schema(email_schema)
        print(f"✓ Schema resolution successful: {resolved_schema.type}")
        print(f"  Fields: {list(resolved_schema.fields.keys()) if resolved_schema.fields else 'None'}")
        
        # Test array version
        email_array_schema = SchemaType(
            type='email',
            description='List of email messages',
            is_array=True
        )
        
        resolved_array_schema = resolve_canonical_schema(email_array_schema)
        print(f"✓ Array schema resolution successful: {resolved_array_schema.type} (array: {resolved_array_schema.is_array})")
        
    except Exception as e:
        print(f"✗ Schema resolution failed: {e}")
    
    print()

def test_tools_reference_canonical_types():
    """Test that tools.json correctly references canonical types."""
    print("Testing tools.json canonical type references...")
    
    try:
        with open('tools/tools.json', 'r') as f:
            tools_data = json.load(f)
        
        email_tool = None
        web_search_tool = None
        
        for tool in tools_data.get('tools', []):
            if tool['id'] == 'email_search':
                email_tool = tool
            elif tool['id'] == 'web_search':
                web_search_tool = tool
        
        # Check email_search tool
        if email_tool:
            email_output = email_tool['outputs'][0]
            if email_output['schema_definition']['type'] == 'email':
                print("✓ email_search tool correctly references canonical email type")
            else:
                print(f"✗ email_search tool uses wrong type: {email_output['schema_definition']['type']}")
        else:
            print("✗ email_search tool not found")
        
        # Check web_search tool  
        if web_search_tool:
            search_output = web_search_tool['outputs'][0]
            if search_output['schema_definition']['type'] == 'search_result':
                print("✓ web_search tool correctly references canonical search_result type")
            else:
                print(f"✗ web_search tool uses wrong type: {search_output['schema_definition']['type']}")
        else:
            print("✗ web_search tool not found")
            
    except Exception as e:
        print(f"✗ Tools validation failed: {e}")
    
    print()

if __name__ == "__main__":
    print("Canonical Schema System Test")
    print("=" * 50)
    
    test_canonical_types()
    test_email_validation()
    test_search_result_validation()
    test_schema_resolution()
    test_tools_reference_canonical_types()
    
    print("Test completed!") 