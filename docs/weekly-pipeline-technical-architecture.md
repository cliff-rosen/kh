# Weekly Pipeline — Technical Architecture

How the weekly pipeline maps to code components, how they coordinate, and what remains to be built.

---

## System Components

### 1. Worker Process (`backend/worker/`)

The worker is a **standalone FastAPI application** (`worker/main.py`) that runs on port 8001, separate from the main API server (port 8000). It has two responsibilities:

- **Scheduler loop:** Polls every 30 seconds for work (pipeline jobs + email queue)
- **Management API:** HTTP endpoints for triggering runs, checking status, health checks

**Key modules:**

| File | Role |
|------|------|
| `worker/main.py` | Entry point, scheduler loop, email queue processing |
| `worker/scheduler.py` | `JobDiscovery` — queries DB for due streams and pending executions |
| `worker/dispatcher.py` | `JobDispatcher` — executes pipelines, updates `next_scheduled_run`, notifies admins |
| `worker/api.py` | Management API (trigger runs, list runs, stream status via SSE, cancel, health) |
| `worker/state.py` | Shared state: running flag, active jobs dict, wake event |
| `worker/status_broker.py` | In-memory pub/sub for real-time execution status (SSE) |

**Concurrency model:** asyncio tasks, max 2 concurrent pipeline runs. No Celery, no Redis, no external task queue.

### 2. Main API Server (`backend/`)

The main FastAPI app (port 8000) deployed via Elastic Beanstalk. Handles all user-facing API requests including the approval workflow.

**Key endpoints for this flow:**

| Endpoint | Router | Purpose |
|----------|--------|---------|
| `POST /api/reports/{id}/approve` | `curation.py` | Approve report → auto-queue emails |
| `POST /api/reports/{id}/reject` | `curation.py` | Reject report |
| `POST /api/reports/{id}/request-approval` | `curation.py` | Send approval request email |
| `POST /api/operations/email-queue/schedule` | `operations.py` | Manually schedule emails |
| `POST /api/operations/email-queue/process` | `operations.py` | Manually trigger email sending |
| `GET /api/operations/email-queue` | `operations.py` | View queue entries |
| `POST /api/operations/runs` | `operations.py` | Trigger manual pipeline run |

### 3. Database (MariaDB)

**Tables involved:**

| Table | Key Fields | Role |
|-------|-----------|------|
| `research_streams` | `schedule_config` (JSON), `next_scheduled_run` | Schedule definition, next run tracking |
| `pipeline_executions` | `status`, `run_type`, `job_config`, `report_id` | Execution tracking, config snapshot |
| `reports` | `approval_status`, `approved_by`, `approved_at` | Report + approval state |
| `report_email_queue` | `status`, `scheduled_for`, `sent_at`, `error_message` | Email delivery tracking |
| `curation_events` | `event_type`, `curator_id` | Audit log |

### 4. Email Service (`backend/services/email_service.py`)

Singleton SMTP client. Sends both operational emails (approval requests, failure alerts) and subscriber emails (report digests). In dev mode, logs to console instead of sending.

---

## Sequence of Operations

```
┌──────────────────────────────────────────────────────────────────┐
│ WORKER PROCESS (port 8001)                                       │
│                                                                  │
│  scheduler_loop() — runs continuously                            │
│    │                                                             │
│    ├─ every 30s ──► process_email_queue()                        │
│    │                  └─ ReportEmailQueueService.process_queue()  │
│    │                     find scheduled_for <= now                │
│    │                     mark ready → processing → sent/failed   │
│    │                                                             │
│    └─ every 30s ──► process_ready_jobs()                         │
│                       │                                          │
│                       ├─ JobDiscovery.find_pending_executions()   │
│                       │    (manual triggers from main API)       │
│                       │                                          │
│                       └─ JobDiscovery.find_scheduled_streams()    │
│                            where next_scheduled_run <= now       │
│                            and schedule_config.enabled = true    │
│                              │                                   │
│                              ▼                                   │
│                       JobDispatcher.execute_scheduled(stream)     │
│                         1. Create PipelineExecution (RUNNING)     │
│                         2. PipelineService.run_pipeline()         │
│                         3. Mark completed, update next_run       │
│                         4. Email admins (approval request)       │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘

              ┌──── admin receives email ────┐
              ▼                              │
┌─────────────────────────────────────┐      │
│ MAIN API (port 8000, Elastic BS)    │      │
│                                     │      │
│  POST /api/reports/{id}/approve     │      │
│    ReportService.approve_report()   │      │
│      1. Set approval_status=APPROVED│      │
│      2. Create CurationEvent       │      │
│      3. auto_queue_for_approved_    │      │
│         report()                    │      │
│           - calculate send_datetime │      │
│           - resolve subscribers     │      │
│           - INSERT into             │      │
│             report_email_queue      │      │
│             (status=scheduled)      │      │
│      4. COMMIT (atomic)             │      │
│                                     │      │
└─────────────────────────────────────┘      │
                                             │
              ┌──── worker picks up ─────────┘
              ▼
┌──────────────────────────────────────┐
│ WORKER — email queue processing      │
│                                      │
│  process_email_queue()               │
│    scheduled_for <= now?             │
│      yes → generate HTML (per report)│
│           send via SMTP (per user)   │
│           mark sent/failed           │
│                                      │
└──────────────────────────────────────┘
```

---

## Command and Control

### How the main API talks to the worker

The main API and worker are **decoupled via the database**. There is no direct HTTP call from the API to the worker (though the worker exposes a management API on port 8001, it's unused by the main API in production).

- **Manual run trigger:** Main API creates a `PipelineExecution` with `status=pending`. Worker discovers it on next poll (≤30s). If running in-process, `worker_state.wake_scheduler()` pokes the scheduler immediately.
- **Email queuing:** Main API inserts rows into `report_email_queue`. Worker discovers due entries on next poll.
- **Schedule changes:** Main API updates `schedule_config` and `next_scheduled_run` on `research_streams`. Worker reads these on next poll.

This means: **if the worker process is not running, nothing happens.** Pipelines don't run. Emails don't send. There are no alerts. The system silently accumulates overdue work.

### Worker lifecycle

- **Start:** `python -m worker.main` or `uvicorn worker.main:app --port 8001`
- **Graceful shutdown:** Sets `running=False`, cancels scheduler task, waits up to 30s for active jobs
- **Health check:** `GET /worker/health`
- **Status:** `GET /` returns running state, active job count

### Observability

- Logs to `logs/worker.log` and stdout
- Per-execution SSE streaming via `GET /worker/runs/{id}/stream`
- Active job tracking in `worker_state.active_jobs`
- No metrics, no external monitoring, no alerting beyond email

---

## Current Deployment Gap

### What's deployed

| Component | Where | How |
|-----------|-------|-----|
| Main API | AWS Elastic Beanstalk (`knowledgehorizon-env`) | `deploy.ps1` → `eb deploy` |
| Frontend | AWS S3 (`www.knowledgehorizon.ai`) | `deploy.ps1` → `aws s3 sync` |

### What's NOT deployed

| Component | Status |
|-----------|--------|
| **Worker process** | Code exists, no deployment mechanism. The Procfile only starts the web process. |

The `Procfile` contains:
```
web: gunicorn --worker-class uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000 application:application
```

There is no `worker:` entry. The worker has never run in production.

### Options for deploying the worker

**Option A: Add to Procfile (simplest, EB-native)**
```
web: gunicorn --worker-class uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000 application:application
worker: python -m worker.main
```
Note: Standard Elastic Beanstalk only runs the `web` process. To run additional processes, you need either:
- A `.ebextensions` config that starts the worker as a background process via `container_commands` or a systemd unit
- Or use EB's "Worker Environment" tier (separate EB environment with SQS, which changes the architecture)

**Option B: Background process via .ebextensions**
Add a systemd service file that starts the worker alongside the web process on the same EC2 instance:
```yaml
# .ebextensions/worker.config
files:
  "/etc/systemd/system/kh-worker.service":
    mode: "000644"
    content: |
      [Unit]
      Description=KH Worker Process
      After=network.target

      [Service]
      Type=simple
      User=webapp
      WorkingDirectory=/var/app/current/backend
      ExecStart=/var/app/current/backend/venv/bin/python -m worker.main
      Restart=always
      RestartSec=5
      Environment=PYTHONPATH=/var/app/current/backend

      [Install]
      WantedBy=multi-user.target

container_commands:
  01_start_worker:
    command: "systemctl enable kh-worker && systemctl restart kh-worker"
```

**Option C: Separate ECS/Fargate task**
Run the worker as its own container. More infrastructure to manage, but cleanly isolated from the web tier.

**Recommendation:** Option B is the pragmatic choice for now — minimal infrastructure change, runs on the same instance, and can be promoted to Option C later if the worker needs dedicated resources.

### Other gaps to close before production

1. **Worker crash recovery:** If the worker crashes, systemd (Option B) would restart it. But there's no external monitoring to verify it's actually processing jobs.

2. **No retry for failed emails:** Failed emails sit in the queue with `status=failed`. Consider adding a retry mechanism or at minimum an admin notification.

3. **No dead-letter / staleness handling:** If a pipeline takes too long or the worker restarts mid-run, executions can get stuck in `running` status. Need a stale-execution recovery mechanism.

4. **`next_scheduled_run` initialization:** When scheduling is first enabled on a stream, `next_scheduled_run` must be set. Verify this happens in the stream config update endpoint.

5. **Timezone handling:** `next_scheduled_run` is stored as naive UTC. The schedule config specifies a timezone. Verify conversions are consistent (the code appears correct but should be tested end-to-end).

6. **Monitoring:** At minimum, a health check endpoint on the worker that the EB health monitoring can ping. Ideally, a CloudWatch alarm if no pipeline has run in the expected window.
