# Report Update Operations - Front-to-Back Trace

This document traces report update/write operations from frontend API calls through to database modifications.

Note: Curation operations (include/exclude, reset, curation notes, approval workflow) are tracked separately as they serve a different concern.

## Operations Table

| # | Operation | Frontend Function | HTTP Method | Endpoint | Router Function | Service Method | Table(s) | Field(s) Modified |
|---|-----------|-------------------|-------------|----------|-----------------|----------------|----------|-------------------|
| 1 | Update Article Notes | `reportApi.updateArticleNotes()` | PATCH | `/api/reports/{reportId}/articles/{articleId}/notes` | `reports.update_article_notes` | `report_service.update_article_notes()` | ReportArticleAssociation | `notes` |
| 2 | Update Article Enrichments | `reportApi.updateArticleEnrichments()` | PATCH | `/api/reports/{reportId}/articles/{articleId}/enrichments` | `reports.update_article_enrichments` | `report_service.update_article_enrichments()` | ReportArticleAssociation | `ai_enrichments` |
| 3 | Update Article in Report | `curationApi.updateArticleInReport()` | PATCH | `/api/operations/reports/{reportId}/articles/{articleId}` | `curation.update_article_in_report` | `report_service.update_article_in_report()` | ReportArticleAssociation | `ranking`, `presentation_categories`, `ai_summary` |
| 4 | Create Article Note | `notesApi.createNote()` | POST | `/api/notes/reports/{reportId}/articles/{articleId}` | `notes.create_article_note` | `notes_service.create_note()` | ReportArticleAssociation | `notes` (JSON array append) |
| 5 | Update Article Note | `notesApi.updateNote()` | PUT | `/api/notes/reports/{reportId}/articles/{articleId}/notes/{noteId}` | `notes.update_article_note` | `notes_service.update_note()` | ReportArticleAssociation | `notes` (JSON array update) |
| 6 | Delete Article Note | `notesApi.deleteNote()` | DELETE | `/api/notes/reports/{reportId}/articles/{articleId}/notes/{noteId}` | `notes.delete_article_note` | `notes_service.delete_note()` | ReportArticleAssociation | `notes` (JSON array remove) |
| 7 | Update Report Content | `curationApi.updateReportContent()` | PATCH | `/api/operations/reports/{reportId}/content` | `curation.update_report_content` | `report_service.update_report_content()` | Report | `report_name`, `enrichments.executive_summary`, `enrichments.category_summaries` |

## Identified Redundancies

### 1. Notes Field Conflict (Rows 1, 4-6)
- Row 1: `reportApi.updateArticleNotes()` writes simple string to `notes`
- Rows 4-6: `notesApi.*` manages `notes` as JSON array with visibility

**Both write to the same field with incompatible data structures.**

### 2. Article Update Split (Rows 1-3)
Three separate endpoints modify `ReportArticleAssociation`:
- Row 1: `notes` only
- Row 2: `ai_enrichments` only
- Row 3: `ranking`, `presentation_categories`, `ai_summary`

**Could be consolidated into single PATCH endpoint with optional fields.**
