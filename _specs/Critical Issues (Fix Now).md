  Critical Issues (Fix Now)

  1. Token Race Condition - routers/auth.py:269-272

  Two requests can validate the same login token simultaneously. Need atomic token clearing.

  2. Missing Null Checks in PubMed XML Parsing - services/pubmed_service.py:72-83

  journal_node = article_node.find('.//Journal')
  journal_issue_node = journal_node.find(".//JournalIssue")  # Crashes if journal_node is None

  3. No Timeouts on External API Calls - services/pubmed_service.py

  Requests to PubMed API have no timeout - can hang indefinitely.

  4. Bare except: Clauses - Multiple files

  - middleware/logging_middleware.py:96, 108
  - services/search_service.py:143, 270
  - services/general_chat_service.py:700

  These catch everything including SystemExit, preventing graceful shutdown.

  ---
  High Priority (This Sprint)

  5. Service Layer Violations - Direct DB in routers

  - routers/reports.py:95-116 - Direct db.query() calls
  - routers/auth.py:130, 170, 200 - Mixed service/direct DB access

  6. Print Statements in Production

  - routers/hop.py:269-270 - Debug prints
  - agents/primary_agent.py:517, 576

  7. Hardcoded Config Values - services/general_chat_service.py:29-31

  CHAT_MODEL = "claude-sonnet-4-20250514"  # Should be in config
  CHAT_MAX_TOKENS = 2000
  MAX_TOOL_ITERATIONS = 5

  ---
  Medium Priority (Next Sprint)

  8. Stale TODOs

  - schemas/canonical_types.py:55 - Legacy fields to remove
  - services/smart_search_service.py:798 - Dead code noted but not removed

  9. Duplicate Authorization Patterns - routers/research_streams.py

  Same "verify ownership" check repeated in every endpoint - should be a dependency.

  10. Inconsistent API Response Formats

  Some endpoints return dicts, others return Pydantic models. No unified envelope.
