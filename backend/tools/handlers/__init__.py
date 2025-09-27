"""
Tool handler implementations.

This package contains the implementation of handlers for various tools defined in tools.json.
Each handler is responsible for executing the actual logic of its respective tool.
"""

# Import all handler modules to register their handlers
from . import email_handlers
from . import extract_handlers
from . import map_reduce_handlers
from . import summarize_handlers
from . import web_retrieval_handlers
from . import web_search_handlers
from . import pubmed_handlers
from . import google_scholar_handlers
from . import scholar_feature_handlers 