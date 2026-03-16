# Weekly Pipeline — Code Reference

Step-by-step mapping of each operation in the weekly pipeline cycle to the exact code that implements it.

---

## Step 1: Configure Stream Schedule

Admin sets up the schedule (frequency, run day/time, send day/time) for a research stream.

| What | Where |
|------|-------|
| API endpoint | `routers/operations.py:225` — `PATCH /api/operations/streams/{stream_id}/schedule` |
| Service logic | `services/operations_service.py:470` — `update_stream_schedule()` |
| Calculates initial `next_scheduled_run` | `services/operations_service.py:513–519` — calls `dispatcher._calculate_next_run()` |
| Clears `next_scheduled_run` if disabled | `services/operations_service.py:520–522` |
| Schedule config stored on | `models.py:265` — `ResearchStream.schedule_config` (JSON) |
| Next run stored on | `models.py:267` — `ResearchStream.next_scheduled_run` (DateTime, indexed) |

**Note:** Line 515–517 instantiates a `JobDispatcher` just to call `_calculate_next_run()`. This is a code smell — that calculation logic should live somewhere both the operations service and the dispatcher can reach it without one importing the other.

---

## Step 2: Worker Discovers Due Stream

The worker's poll loop finds streams where `next_scheduled_run <= now` and `schedule_config.enabled = true`.

| What | Where |
|------|-------|
| Poll loop entry point | `worker/loop.py:37` — `run()` |
| Single poll cycle | `worker/loop.py:74` — `_poll()` |
| Find due streams | `worker/scheduler.py:45` — `JobDiscovery.find_scheduled_streams()` |
| Query: enabled + due | `worker/scheduler.py:57–61` — `next_scheduled_run <= now` and `schedule_config.enabled` |
| Dispatch to executor | `worker/loop.py:120–136` — creates asyncio task for `_execute_scheduled()` |
| Concurrency limit | `worker/loop.py:14` — `MAX_CONCURRENT_JOBS = 2` |
| Poll interval | `worker/loop.py:13` — `POLL_INTERVAL_SECONDS = 30` |

---

## Step 3: Pipeline Executes

The dispatcher creates an execution record and runs the full pipeline.

| What | Where |
|------|-------|
| Dispatcher entry point | `worker/dispatcher.py:99` — `execute_scheduled()` |
| Re-query stream (new session) | `worker/dispatcher.py:112` — `stream_service.get_stream_by_id()` |
| Calculate date range | `worker/dispatcher.py:116–125` — frequency → lookback days |
| Create execution (RUNNING) | `worker/dispatcher.py:128` — `execution_service.create_from_stream()` |
| **COMMIT** — execution visible | `worker/dispatcher.py:137` |
| Run pipeline | `worker/dispatcher.py:146` → `services/pipeline_service.py:413` — `run_pipeline()` |

### Pipeline stages (each commits independently):

| Stage | Code | What it commits |
|-------|------|-----------------|
| Load config | `pipeline_service.py:431` — `_load_execution_context()` | Nothing (reads only) |
| Retrieval | `pipeline_service.py:489` — `_stage_retrieval()` | WipArticle records (commit per query via `wip_article_service`) |
| Deduplication | `pipeline_service.py:665` — `_stage_deduplicate()` | Duplicate flags on WipArticles |
| Semantic filter | `pipeline_service.py:592` — `_stage_semantic_filter()` | Filter scores + included_in_report flags |
| Generate report | `pipeline_service.py:1081` — `_stage_generate_report()` | Report + Articles + Associations + `execution.report_id` (line 1186) |
| Article summaries | `pipeline_service.py:735` — `_stage_generate_article_summaries()` | `ai_summary` on associations |
| Stance analysis | (stage after summaries) | `ai_enrichments` on associations |
| Categorize | `pipeline_service.py:688` — `_stage_categorize()` | `presentation_categories` on associations |
| Category summaries | (stage after categorize) | Category summaries on report enrichments (line 1011) |
| Executive summary | `pipeline_service.py:1021` — `_stage_generate_executive_summary()` | Executive summary on report enrichments (line 1071) |

**Transaction pattern:** No long-running transaction. Each stage commits its own work. The minutes of runtime are spent on external API calls (PubMed, LLMs) which happen between commits with no open transaction.

---

## Step 4: Mark Complete + Advance Schedule

After the pipeline finishes, the dispatcher atomically marks the execution as completed and advances `next_scheduled_run`.

| What | Where |
|------|-------|
| Mark completed | `worker/dispatcher.py:151` — `execution_service.mark_completed()` |
| Advance next run | `worker/dispatcher.py:154` — `_update_next_scheduled_run()` → `stream_service.update_next_scheduled_run()` |
| Calculate next run time | `worker/dispatcher.py:268` — `_calculate_next_run()` |
| **COMMIT** — both in one transaction | `worker/dispatcher.py:156` |
| On failure: same pattern | `worker/dispatcher.py:170–177` — mark failed + advance schedule + commit |

---

## Step 5: Notify Admin

Immediately after the commit, the dispatcher emails admins. On success, it sends approval request emails. On failure, it sends failure alerts.

| What | Where |
|------|-------|
| Notification entry point | `worker/dispatcher.py:162` (success) / `181` (failure) — `_notify_admins_scheduled_complete()` |
| Find platform admins | `worker/dispatcher.py:207` — `user_service.get_admin_users_for_approval()` |
| Load report for details | `worker/dispatcher.py:221` — `report_service.get_report_by_id_internal()` |
| Send approval request email | `worker/dispatcher.py:232` — `email_service.send_approval_request_email()` |
| Send failure alert email | `worker/dispatcher.py:246` — `email_service.send_pipeline_failure_alert_email()` |
| Email service | `services/email_service.py` — SMTP singleton |

**Note:** This is a read-only operation after the commit. Email failures are caught and logged (line 256) — they never break the pipeline flow.

---

## Step 6: Admin Approves Report

Admin reviews the report in the web app, then approves it. Approval atomically queues subscriber emails.

| What | Where |
|------|-------|
| API endpoint | `routers/curation.py:984` — `POST /api/curation/{report_id}/approve` |
| Service logic | `services/report_service.py:1295` — `approve_report()` |
| Set approval status | `services/report_service.py:1326–1328` — `APPROVED`, `approved_by`, `approved_at` |
| Create audit event | `services/report_service.py:1331–1337` — `CurationEvent` |
| **Auto-queue emails** | `services/report_service.py:1340` — `email_queue_service.auto_queue_for_approved_report()` |
| Calculate send datetime | `services/report_email_queue_service.py:342` — `calculate_send_datetime()` |
| Resolve subscribers | `services/report_email_queue_service.py:438` — `get_stream_subscribers()` → `subscription_service` |
| Create queue entries | `services/report_email_queue_service.py:454–461` — `status=scheduled`, `scheduled_for=<send time>` |
| **COMMIT** — approval + queue entries atomic | `services/report_service.py:1342` |

**Key detail:** `auto_queue_for_approved_report()` does NOT commit (line 409 docstring). The caller (`approve_report`) commits everything in one transaction so approval and email queuing are atomic.

---

## Step 7: Worker Sends Emails

On the next poll cycle after `scheduled_for` time arrives, the worker picks up due queue entries and sends them.

| What | Where |
|------|-------|
| Poll cycle triggers processing | `worker/loop.py:78` — `_process_email_queue()` |
| Queue processing logic | `services/report_email_queue_service.py:469` — `process_queue()` |
| Find due entries | `services/report_email_queue_service.py:500–508` — `scheduled_for <= now AND status = scheduled` |
| Mark ready | `services/report_email_queue_service.py:528–530` — bulk mark `READY`, commit |
| Generate email HTML (once per report) | `services/report_email_queue_service.py:573` — `report_service.generate_report_email_html()` |
| Send each email | `services/report_email_queue_service.py:596` — `email_service.send_report_email()` |
| Mark sent/failed | `services/report_email_queue_service.py:606–621` — update status, commit per entry |
| Manual trigger endpoint | `routers/operations.py:800` — `POST /api/operations/email-queue/process` |

**Status flow:** `scheduled` → `ready` → `processing` → `sent` or `failed`

---

## Summary Table

| Step | Trigger | Entry Point | Key Commit |
|------|---------|-------------|------------|
| 1. Configure schedule | Admin UI | `routers/operations.py:230` | `operations_service.py:524` |
| 2. Discover due stream | Worker poll (30s) | `worker/loop.py:74` | — (read only) |
| 3. Run pipeline | Worker dispatch | `worker/dispatcher.py:99` | Multiple per-stage commits in pipeline_service |
| 4. Complete + advance | Pipeline done | `worker/dispatcher.py:151–156` | `dispatcher.py:156` (atomic) |
| 5. Notify admin | After step 4 commit | `worker/dispatcher.py:162` | — (sends email, no DB commit) |
| 6. Admin approves | Admin UI | `routers/curation.py:984` | `report_service.py:1342` (atomic w/ email queue) |
| 7. Send emails | Worker poll (30s) | `worker/loop.py:78` | Per-entry in `report_email_queue_service.py` |
