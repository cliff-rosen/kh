# API Pipeline Mapping

This document maps the end-to-end flow from frontend context → TypeScript API → Python router → Python service for Profile, Report, and Research Stream domains.

## Profile Domain

| Context Method | TS API Call | Endpoint | Router Handler | Service Method |
|---------------|-------------|----------|---------------|----------------|
| `loadUserProfile()` | `profileApi.getUserProfile()` | `GET /api/auth/me` | `get_current_user_profile()` | `ProfileService.get_user_profile()` |
| `updateUserProfile(updates)` | `profileApi.updateUserProfile(updates)` | `PUT /api/users/profile` | `update_user_profile()` | `ProfileService.update_user_profile()` |
| `loadCompanyProfile()` | `profileApi.getCompanyProfile()` | `GET /api/companies/profile` | `get_company_profile()` | `ProfileService.get_company_profile()` |
| `updateCompanyProfile(updates)` | `profileApi.updateCompanyProfile(updates)` | `PUT /api/companies/profile` | `update_company_profile()` | `ProfileService.update_company_profile()` |
| `checkCompleteness()` | `profileApi.checkProfileCompleteness()` | `GET /api/profiles/completeness` | `check_profile_completeness()` | `ProfileService.check_profile_completeness()` |
| `loadAllProfiles()` | `profileApi.getAllProfiles()` | `GET /api/profiles/all` | `get_all_profiles()` | `ProfileService.get_all_profiles()` |

**Request Types (in router):** `UserProfileUpdateRequest`, `CompanyProfileUpdateRequest`
**Response Types (in router):** `AllProfilesResponse`
**Domain Types (in schemas):** `UserProfile`, `CompanyProfile`, `ProfileCompletenessStatus`

---

## Research Stream Domain

| Context Method | TS API Call | Endpoint | Router Handler | Service Method |
|---------------|-------------|----------|---------------|----------------|
| `loadResearchStreams()` | `researchStreamApi.getResearchStreams()` | `GET /api/research-streams` | `get_research_streams()` | `ResearchStreamService.get_user_research_streams()` |
| `loadResearchStream(id)` | `researchStreamApi.getResearchStream(id)` | `GET /api/research-streams/{stream_id}` | `get_research_stream()` | `ResearchStreamService.get_research_stream()` |
| `createResearchStream(data)` | `researchStreamApi.createResearchStream(data)` | `POST /api/research-streams` | `create_research_stream()` | `ResearchStreamService.create_research_stream()` |
| `updateResearchStream(id, updates)` | `researchStreamApi.updateResearchStream(id, updates)` | `PUT /api/research-streams/{stream_id}` | `update_research_stream()` | `ResearchStreamService.update_research_stream()` |
| `deleteResearchStream(id)` | `researchStreamApi.deleteResearchStream(id)` | `DELETE /api/research-streams/{stream_id}` | `delete_research_stream()` | `ResearchStreamService.delete_research_stream()` |
| `toggleResearchStreamStatus(id, active)` | `researchStreamApi.toggleResearchStreamStatus(id, active)` | `PATCH /api/research-streams/{stream_id}/status` | `toggle_research_stream_status()` | `ResearchStreamService.update_research_stream()` |

**Request Types (in router):** `ResearchStreamCreateRequest`, `ResearchStreamUpdateRequest`, `ToggleStatusRequest`
**Response Types (in router):** `ResearchStreamResponse`, `ResearchStreamsListResponse` (defined but not used)
**Domain Types (in schemas):** `ResearchStream`

---

## Report Domain

| Context Method | TS API Call | Endpoint | Router Handler | Service Method |
|---------------|-------------|----------|---------------|----------------|
| N/A (called directly from page) | `reportApi.getReportsForStream(streamId)` | `GET /api/reports/stream/{stream_id}` | `get_reports_for_stream()` | `ReportService.get_reports_for_stream()` |
| N/A (called directly from page) | `reportApi.getLatestReportForStream(streamId)` | `GET /api/reports/stream/{stream_id}/latest` | `get_latest_report_for_stream()` | `ReportService.get_latest_report_for_stream()` |

**Request Types (in router):** None
**Response Types (in router):** None (returns domain type directly)
**Domain Types (in schemas):** `Report`

---

## Notes

### Profile
- Mostly returns domain types directly
- Only `AllProfilesResponse` wraps two domain objects together
- Request types live in router, not in schemas ✓

### Research Stream
- Returns domain types directly
- Has unused response wrapper types defined in both TS and Python (`ResearchStreamResponse`, `ResearchStreamsListResponse`)
- Request types properly live in router ✓

### Report
- Returns domain types directly
- No context - called directly from ReportsPage
- No request/response wrappers at all
- Cleanest implementation

### Consistency Issues
1. Research stream has defined but unused response wrappers
2. Report has no context layer (accessed directly from page)
3. Profile is the most complete with context, but could use wrappers for consistency
