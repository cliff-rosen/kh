# Release Notes — v1.0.5

## Research Assistant Rebrand: Ira

The chat assistant is now named **Ira** (Intelligent Research Assistant). Updated across the entire UI:
- Chat tray header, placeholder text, tooltips, and aria labels
- System prompt identifies as Ira
- Help guide references updated

## Key Author Tracking

New feature for the Asbestos and Talc Litigation stream. 13 domain experts are designated as key authors:

- Roggli VL, Carbone M, Hassan R, Attanoos RL, Testa JR, Paustenbach D, Hammar SP, Dodson RF, Kradin RL, Brody AT, Zauderer M, Kindler HL, Bueno R

**Chat integration (Ira):**
- Ira knows who the key authors are when the user is in the asbestos/talc stream
- New `get_key_author_articles` tool searches PubMed live for key author publications with filters (author, query, date range)
- When Ira performs a PubMed search, results are cross-referenced against key authors (up to KEY_AUTHOR_CROSSREF_FETCH_LIMIT results checked, default 100) and matches are flagged
- Key author awareness is stream-scoped — other streams are unaffected

**Tools page:**
- New "Key Authors" tab on the Tools page for browsing key author publications
- Uses the standard PubMedTable component for article display
- Author filter pills loaded from the database (not hardcoded)

**Database:**
- New `key_authors` table (author_id, name, stream_id) — curated author list per stream
- New `key_author_articles` table — local cache used by the Tools page UI

## PubMed Tools: Async Conversion

All three PubMed tool executors (`search_pubmed`, `get_pubmed_article`, `get_full_text`) converted from sync functions using `asyncio.run()` to proper `async def` executors. This fixes the nested event loop bug that caused the key author cross-reference to silently fail.

## Worker Status

New `worker_status` table and `WorkerStatus` model for background worker heartbeat monitoring. Supports the worker health display in the admin/operations UI.

## Code Cleanup

- Removed `backend/schemas/article.py` and `frontend/src/types/article.ts` — unused types superseded by `CanonicalResearchArticle`
- Key authors service uses `ReportService.get_report_by_id_internal()` instead of directly querying the Report model
- Stream ID resolution extracted to `_resolve_stream_id()` helper in `ChatStreamService`

## Configuration

New setting:
- `KEY_AUTHOR_CROSSREF_FETCH_LIMIT` (env var, default 100) — how many PubMed results to check for key author overlap when performing a search

## Migration Required

Run before deploying:
```bash
ENVIRONMENT=production python migrations/v1_0_5_key_authors_and_worker.py
```

Creates tables: `worker_status`, `key_authors`, `key_author_articles`
Seeds 13 key authors for stream_id=10 (Asbestos and Talc Litigation)
