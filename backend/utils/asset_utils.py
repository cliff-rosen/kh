from typing import Any, Dict, List, Union
from schemas.asset import Asset

def get_nested_value(obj: Any, path: str) -> Any:
    """Get a nested value from an object using a dot-notation path.
    
    Args:
        obj: The object to get the value from
        path: Dot-notation path (e.g., "content.field" or "content.array[0]")
        
    Returns:
        The value at the specified path
        
    Raises:
        ValueError: If the path is invalid or the value doesn't exist
    """
    if not path:
        return obj
        
    parts = path.split('.')
    current = obj
    
    for part in parts:
        if '[' in part:
            # Handle array access
            field, index = part.split('[')
            index = int(index.rstrip(']'))
            
            if field:
                current = current.get(field, {})
            if not isinstance(current, (list, tuple)):
                raise ValueError(f"Expected list at {field}, got {type(current)}")
            if index >= len(current):
                raise ValueError(f"Index {index} out of range for {field}")
            current = current[index]
        else:
            # Handle object access
            if not isinstance(current, dict):
                raise ValueError(f"Expected dict at {part}, got {type(current)}")
            if part not in current:
                raise ValueError(f"Field {part} not found")
            current = current[part]
    
    return current 