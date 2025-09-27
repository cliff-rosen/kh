from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from sqlalchemy import text
from schemas.asset import DatabaseEntityMetadata

class DatabaseEntityService:
    """Service for handling database entity operations"""
    
    def __init__(self, db: Session):
        self.db = db

    def fetch_entities(self, metadata: DatabaseEntityMetadata) -> List[Dict[str, Any]]:
        """
        Fetch entities from the database based on the provided metadata.
        
        Args:
            metadata: DatabaseEntityMetadata containing query parameters
            
        Returns:
            List of dictionaries containing the fetched entities
            
        Raises:
            ValueError: If the table doesn't exist or query parameters are invalid

        """
        # Construct the base query
        columns = "*" if not metadata.columns else ", ".join(metadata.columns)
        query = f"SELECT {columns} FROM {metadata.table_name}"
        
        # Add WHERE clause if query_params exist
        params = {}
        if metadata.query_params:
            conditions = []
            for key, value in metadata.query_params.items():
                if key.lower() == "limit":
                    continue  # Handle limit separately
                
                param_name = f"param_{key}"
                
                # Handle complex query parameters with operators
                if isinstance(value, dict) and "operator" in value and "value" in value:
                    operator = value["operator"]
                    param_value = value["value"]
                    conditions.append(f"{key} {operator} :{param_name}")
                    params[param_name] = param_value
                else:
                    # Simple equality condition
                    conditions.append(f"{key} = :{param_name}")
                    params[param_name] = value
            
            if conditions:
                query += " WHERE " + " AND ".join(conditions)
        
        # Add LIMIT if specified
        if "limit" in metadata.query_params:
            query += f" LIMIT {metadata.query_params['limit']}"
        
        try:
            # Execute the query with proper parameter binding
            stmt = text(query).bindparams(**params)
            result = self.db.execute(stmt)
            
            # Convert result to list of dictionaries
            return [dict(zip(result.keys(), row)) for row in result]
        except Exception as e:
            raise ValueError(f"Error fetching entities from {metadata.table_name}: {str(e)}") 