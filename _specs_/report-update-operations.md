# Report Update Operations - Front-to-Back Trace

This document traces report update/write operations from frontend API calls through to database modifications.

Note: Curation operations (include/exclude, reset, curation notes, approval workflow) are tracked separately as they serve a different concern.

## Operations Table

| # | Operation | Frontend Function | HTTP Method | Endpoint | Router Function | Service Method | Table(s) | Field(s) Modified |
|---|-----------|-------------------|-------------|----------|-----------------|----------------|----------|-------------------|
| 1 | Update Article Enrichments | `reportApi.updateArticleEnrichments()` | PATCH | `/api/reports/{reportId}/articles/{articleId}/enrichments` | `reports.update_article_enrichments` | `report_service.update_article_enrichments()` | ReportArticleAssociation | `ai_enrichments` |
| 2 | Update Article in Report | `curationApi.updateArticleInReport()` | PATCH | `/api/operations/reports/{reportId}/articles/{articleId}` | `curation.update_article_in_report` | `report_service.update_article_in_report()` | ReportArticleAssociation | `ranking`, `presentation_categories`, `ai_summary` |
| 3 | Create Article Note | `notesApi.createNote()` | POST | `/api/notes/reports/{reportId}/articles/{articleId}` | `notes.create_article_note` | `notes_service.create_note()` | ReportArticleAssociation | `notes` (JSON array append) |
| 4 | Update Article Note | `notesApi.updateNote()` | PUT | `/api/notes/reports/{reportId}/articles/{articleId}/notes/{noteId}` | `notes.update_article_note` | `notes_service.update_note()` | ReportArticleAssociation | `notes` (JSON array update) |
| 5 | Delete Article Note | `notesApi.deleteNote()` | DELETE | `/api/notes/reports/{reportId}/articles/{articleId}/notes/{noteId}` | `notes.delete_article_note` | `notes_service.delete_note()` | ReportArticleAssociation | `notes` (JSON array remove) |
| 6 | Update Report Content | `curationApi.updateReportContent()` | PATCH | `/api/operations/reports/{reportId}/content` | `curation.update_report_content` | `report_service.update_report_content()` | Report | `report_name`, `enrichments.executive_summary`, `enrichments.category_summaries` |

## Removed Operations

| Operation | Reason |
|-----------|--------|
| `reportApi.updateArticleNotes()` | Dead code - was never called. Notes system now uses structured JSON via `notesApi`. |

## Notes

- The Notes API (`notesApi`) manages a structured notes system with visibility control (personal/shared), author tracking, and CRUD operations. The data model for notes may change in the future, so this is kept as a separate concern.
- Article metadata updates (ranking, category, summary) go through `curationApi.updateArticleInReport()`.
- AI enrichments (stance analysis, etc.) go through `reportApi.updateArticleEnrichments()`.
