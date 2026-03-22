# Weekly Pipeline Operations

How Knowledge Horizon produces and delivers research digests to subscribers, week over week.

---

## The Weekly Cycle

Each research stream can be configured with its own schedule, but the canonical pattern is weekly. A stream's `schedule_config` defines:

- **When the pipeline runs** (`anchor_day` + `preferred_time`, e.g. Sunday at 3:00 AM ET)
- **When emails go out** (`send_day` + `send_time`, e.g. Monday at 8:00 AM ET)
- **How far back to look** (derived from `frequency` — weekly = 7 days)

Here's what happens each week for a stream with scheduling enabled:

### 1. Pipeline Runs Automatically

On the configured run day/time, the **worker process** picks up the stream and executes the full pipeline:

- Searches PubMed (and any other configured sources) for articles published in the lookback window
- Deduplicates results within and across query groups
- Applies semantic filters to remove irrelevant articles
- Categorizes articles into the stream's topic categories
- Generates a formatted report

The pipeline typically takes 2–10 minutes depending on source count and article volume.

**What gets created:** A `Report` record with `approval_status = awaiting_approval` and a `PipelineExecution` record tracking the run.

### 2. Admin Gets Notified

When the pipeline completes successfully, the worker automatically sends an **approval request email** to all platform admins. The email contains:

- Report name and stream name
- Article count
- A link to review and approve the report in the admin UI

If the pipeline *fails*, admins receive a **failure alert email** instead, with the error message.

### 3. Admin Reviews and Approves

The admin opens the report in the web app, reviews the articles (can hide/unhide individual articles), and either:

- **Approves** the report — triggers email queuing (step 4)
- **Rejects** the report — records the reason, no emails are sent

This is currently a manual step. The admin can take as long as needed — the email send time is calculated from the schedule config, not from when the pipeline ran.

### 4. Emails Get Queued

When the admin clicks Approve, the system atomically (in the same database transaction):

1. Sets `approval_status = approved` on the report
2. Creates an audit log entry (`CurationEvent`)
3. Calculates the **send datetime** from the stream's schedule config (e.g. next Monday at 8:00 AM ET)
4. Resolves all **subscribers** for the stream
5. Creates a `ReportEmailQueue` entry for each subscriber with `status = scheduled` and `scheduled_for = <calculated send time>`

If the admin approves *after* the scheduled send time has already passed, the emails will be picked up on the next worker poll cycle (within 30 seconds).

### 5. Emails Get Sent

The worker polls the email queue every 30 seconds. When it finds entries where `scheduled_for <= now` and `status = scheduled`:

1. Marks entries as `ready`, then `processing`
2. Generates the email HTML (once per report, cached across recipients)
3. Sends each email via SMTP
4. Marks each entry as `sent` (with timestamp) or `failed` (with error message)

Failed emails are recorded but **not automatically retried**. An admin can manually trigger reprocessing from the email queue UI.

---

## What Can Go Wrong

| Scenario | What Happens | Admin Action Needed |
|----------|-------------|-------------------|
| Pipeline fails (API error, timeout) | Failure alert email sent to admins | Investigate, fix config, trigger manual re-run |
| Pipeline produces 0 articles | Report created but can't be approved (validation) | Adjust date range or queries, re-run |
| Admin doesn't approve before send time | Emails queued with past `scheduled_for`, sent within 30s of approval | None — works correctly, just sent late |
| Email fails for one subscriber | That entry marked `failed`, others unaffected | Check error, retry manually or re-queue |
| Worker process is down | Nothing runs — pipelines don't fire, emails don't send | Restart the worker (see Technical Architecture doc) |

---

## Manual Overrides

Any step can be triggered manually from the admin UI:

- **Run pipeline manually:** Operations > trigger a run for any stream, with custom date range
- **Approve/reject:** Curation > report approval queue
- **Schedule emails manually:** Operations > email queue > schedule for specific users/dates
- **Force-send emails:** Operations > email queue > process now (bypasses time gate)
- **Re-send to specific users:** Create new queue entries for the same report

---

## Timing Example

For a stream configured as:
- Frequency: weekly
- Run day: Sunday at 3:00 AM ET
- Send day: Monday at 8:00 AM ET

| When | What |
|------|------|
| Sunday 3:00 AM | Worker picks up stream, starts pipeline |
| Sunday ~3:08 AM | Pipeline completes, approval email sent to admins |
| Sunday morning–Monday morning | Admin reviews report, hides irrelevant articles |
| Monday 7:00 AM | Admin approves report → emails queued for Monday 8:00 AM ET |
| Monday 8:00 AM | Worker picks up due emails, sends to all subscribers |
| Monday 8:01 AM | Subscribers receive their weekly digest |
