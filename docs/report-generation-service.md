# Report Generation Service (Standalone Worker)

Standalone process that coordinates pipeline execution.

---

## Interfaces

### 1. Database → Worker (Job Discovery)

**What the worker reads to know what to run:**

| Table | What it looks for |
|-------|-------------------|
| `research_streams` | Streams with `schedule_config.enabled = true` and `next_scheduled_run <= now` |
| `pipeline_executions` | Executions with `status = 'pending'` (for manually triggered runs) |

**Decision logic:**
- Scheduled: "Is this stream due to run based on its schedule?"
- Manual: "Is there a pending execution record waiting to be picked up?"

---

### 2. Worker → Pipeline Service (Job Dispatch)

**The worker calls:**
```python
pipeline_service.runPipeline(
    stream_id=...,
    run_type=...,  # 'scheduled' | 'manual' | 'test'
    # other params?
)
```

**The worker does NOT:**
- Fetch articles
- Call LLM APIs
- Write reports
- Know anything about PubMed, semantic filtering, etc.

All business logic lives in `pipeline_service`. The worker just invokes it.

---

### 3. Worker → Database (Job Lifecycle)

**What the worker writes:**

| When | What |
|------|------|
| Before dispatch | Create/update `pipeline_execution` with `status = 'running'`, `started_at = now` |
| After completion | Update `pipeline_execution` with `status = 'completed'` or `'failed'`, `completed_at`, `error` |
| After scheduled run | Update `research_stream.next_scheduled_run` to next occurrence |

*(Note: `pipeline_service` may also write to these tables during execution)*

---

### 4. Management Plane → Worker (External Control)

**API for external callers:**

| Endpoint | Purpose |
|----------|---------|
| `POST /runs` | Trigger a run for a stream |
| `GET /runs/{id}` | Get status of a run |
| `DELETE /runs/{id}` | Cancel a running job |
| `GET /health` | Health check |

**Who calls this:**
- Main API (to trigger manual runs)
- Ops tooling (health checks, monitoring)

---

## What the Worker Does NOT Interface With

- PubMed API (pipeline_service does this)
- LLM APIs (pipeline_service does this)
- Article processing logic (pipeline_service does this)
- Report generation logic (pipeline_service does this)

---

## Implementation

Located in `backend/worker/`:

| File | Purpose |
|------|---------|
| `main.py` | Entry point - runs scheduler loop + FastAPI management API |
| `scheduler.py` | Job discovery - finds pending executions and due scheduled streams |
| `dispatcher.py` | Job dispatch - calls `pipeline_service.run_pipeline()`, manages lifecycle |
| `api.py` | Management plane API endpoints |

### Running the Worker

```bash
# From backend directory
python -m worker.main

# Or with uvicorn directly
uvicorn worker.main:app --port 8001
```

### Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `POLL_INTERVAL_SECONDS` | 30 | How often to check for ready jobs |
| `MAX_CONCURRENT_JOBS` | 2 | Maximum simultaneous pipeline runs |

---

## Open Questions

1. **Retry logic**: Should failed jobs be retried? How many times?
2. **Dead letter**: Where do permanently failed jobs go?
3. **Scaling**: Multiple worker instances? Job locking?
4. **Monitoring**: Metrics, alerting on failures?
