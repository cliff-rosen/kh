# Research Stream Scheduling System Design

## Overview

This document describes the architecture for automated research stream scheduling, including:
1. Schedule configuration and storage
2. Background scheduler process
3. Management/monitoring interface
4. Report approval workflow

---

## 1. Schedule Configuration

### 1.1 What We Need to Capture

When a user configures a stream's schedule, we need:

| Field | Description | Example |
|-------|-------------|---------|
| `frequency` | How often to run | `weekly`, `biweekly`, `monthly` |
| `anchor_day` | Day to run on | `monday`, `1` (1st of month) |
| `preferred_time` | Time of day (user's timezone) | `08:00` |
| `timezone` | User's timezone | `America/New_York` |
| `lookback_days` | How many days of articles to fetch | `7` for weekly |
| `schedule_enabled` | Is scheduling active | `true`/`false` |

### 1.2 Database Schema Changes

Add to `research_streams` table:

```sql
ALTER TABLE research_streams ADD COLUMN schedule_config JSON DEFAULT NULL;
-- Structure:
-- {
--   "enabled": true,
--   "frequency": "weekly",
--   "anchor_day": "monday",      -- or 1-31 for monthly
--   "preferred_time": "08:00",
--   "timezone": "America/New_York",
--   "lookback_days": 7
-- }

ALTER TABLE research_streams ADD COLUMN next_scheduled_run DATETIME DEFAULT NULL;
ALTER TABLE research_streams ADD COLUMN last_scheduled_run DATETIME DEFAULT NULL;
ALTER TABLE research_streams ADD COLUMN schedule_status VARCHAR(50) DEFAULT NULL;
-- schedule_status: 'pending', 'running', 'completed', 'failed', 'disabled'
```

### 1.3 Pydantic Schema

```python
class ScheduleConfig(BaseModel):
    """Configuration for automated stream scheduling"""
    enabled: bool = False
    frequency: Literal["daily", "weekly", "biweekly", "monthly"]
    anchor_day: Optional[Union[str, int]] = None  # "monday"-"sunday" or 1-31
    preferred_time: str = "08:00"  # HH:MM
    timezone: str = "UTC"
    lookback_days: Optional[int] = None  # Auto-calculated from frequency if not set

    @validator('lookback_days', pre=True, always=True)
    def set_default_lookback(cls, v, values):
        if v is None:
            freq = values.get('frequency')
            return {
                'daily': 1,
                'weekly': 7,
                'biweekly': 14,
                'monthly': 30
            }.get(freq, 7)
        return v
```

---

## 2. Scheduler Process Architecture

### 2.1 Why a Separate Process?

The scheduler cannot live inside FastAPI because:
- FastAPI workers restart/scale independently
- Long-running jobs would be killed on deploy
- Multiple workers would cause duplicate runs
- No persistent state across requests

### 2.2 Process Design

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        SCHEDULER PROCESS                                 │
│                                                                          │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────────────┐     │
│  │   Polling    │────▶│    Job       │────▶│   Pipeline           │     │
│  │   Loop       │     │    Queue     │     │   Executor           │     │
│  │  (5 min)     │     │  (in-memory) │     │   (async)            │     │
│  └──────────────┘     └──────────────┘     └──────────────────────┘     │
│         │                    │                       │                   │
│         │                    │                       │                   │
│         ▼                    ▼                       ▼                   │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────────────┐     │
│  │   Database   │     │   State      │     │   Report Creator     │     │
│  │   (streams)  │     │   Manager    │     │   (pending approval) │     │
│  └──────────────┘     └──────────────┘     └──────────────────────┘     │
│                              │                                           │
│                              ▼                                           │
│                       ┌──────────────┐                                   │
│                       │  Management  │◀──── CLI / API queries            │
│                       │  Interface   │                                   │
│                       └──────────────┘                                   │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.3 Implementation Options

| Option | Description | Recommendation |
|--------|-------------|----------------|
| **Custom Python daemon** | Simple asyncio loop with management socket | **Recommended** - Full control, lightweight |
| **Celery Beat + Worker** | Distributed task queue | Overkill for our scale |
| **APScheduler** | Python scheduling library | Good, but less control over management |
| **Systemd timer + script** | OS-level scheduling | Simple but no management interface |

### 2.4 Custom Daemon Design

```python
# backend/scheduler/daemon.py

class SchedulerDaemon:
    """
    Long-running scheduler process with management interface.

    Run with: python -m scheduler.daemon
    """

    def __init__(self):
        self.running_jobs: Dict[int, JobState] = {}  # stream_id -> state
        self.job_history: List[JobResult] = []       # Recent completions
        self.is_running = True
        self.poll_interval = 300  # 5 minutes

    async def start(self):
        """Main entry point - starts polling and management server"""
        await asyncio.gather(
            self.polling_loop(),
            self.management_server()
        )

    async def polling_loop(self):
        """Poll database for streams due to run"""
        while self.is_running:
            try:
                due_streams = await self.get_due_streams()
                for stream in due_streams:
                    if stream.stream_id not in self.running_jobs:
                        asyncio.create_task(self.run_stream(stream))
            except Exception as e:
                logger.error(f"Polling error: {e}")

            await asyncio.sleep(self.poll_interval)

    async def run_stream(self, stream: ResearchStream):
        """Execute pipeline for a single stream"""
        job_state = JobState(
            stream_id=stream.stream_id,
            started_at=datetime.utcnow(),
            status='running',
            current_stage='init'
        )
        self.running_jobs[stream.stream_id] = job_state

        try:
            # Mark in database
            await self.update_stream_status(stream.stream_id, 'running')

            # Run pipeline
            async with get_db_session() as db:
                pipeline = PipelineService(db)
                async for status in pipeline.run_pipeline(
                    research_stream_id=stream.stream_id,
                    user_id=stream.user_id,
                    run_type=RunType.SCHEDULED,  # <-- SCHEDULED not MANUAL
                    start_date=self.calculate_start_date(stream),
                    end_date=self.calculate_end_date()
                ):
                    job_state.current_stage = status.stage
                    job_state.last_message = status.message
                    logger.info(f"[{stream.stream_id}] {status.stage}: {status.message}")

            job_state.status = 'completed'
            job_state.completed_at = datetime.utcnow()

            # Update database
            await self.update_stream_status(stream.stream_id, 'completed')
            await self.schedule_next_run(stream)

        except Exception as e:
            job_state.status = 'failed'
            job_state.error = str(e)
            logger.error(f"[{stream.stream_id}] Failed: {e}", exc_info=True)
            await self.update_stream_status(stream.stream_id, 'failed')

        finally:
            self.job_history.append(job_state.to_result())
            del self.running_jobs[stream.stream_id]

    async def management_server(self):
        """Unix socket server for management commands"""
        socket_path = "/tmp/kh_scheduler.sock"
        server = await asyncio.start_unix_server(
            self.handle_management_client,
            path=socket_path
        )
        logger.info(f"Management interface listening on {socket_path}")
        await server.serve_forever()

    async def handle_management_client(self, reader, writer):
        """Handle management commands from CLI"""
        data = await reader.read(1024)
        command = json.loads(data.decode())

        response = await self.execute_command(command)
        writer.write(json.dumps(response).encode())
        await writer.drain()
        writer.close()

    async def execute_command(self, command: dict) -> dict:
        """Execute management command and return response"""
        cmd = command.get('cmd')

        if cmd == 'status':
            return {
                'running_jobs': [j.to_dict() for j in self.running_jobs.values()],
                'recent_history': [h.to_dict() for h in self.job_history[-20:]],
                'uptime': (datetime.utcnow() - self.started_at).total_seconds()
            }

        elif cmd == 'list_pending':
            streams = await self.get_due_streams()
            return {'pending': [s.stream_id for s in streams]}

        elif cmd == 'run_now':
            stream_id = command.get('stream_id')
            # Trigger immediate run
            stream = await self.get_stream(stream_id)
            if stream:
                asyncio.create_task(self.run_stream(stream))
                return {'status': 'started', 'stream_id': stream_id}
            return {'error': 'Stream not found'}

        elif cmd == 'cancel':
            stream_id = command.get('stream_id')
            if stream_id in self.running_jobs:
                # Cancel logic here
                return {'status': 'cancelled'}
            return {'error': 'Job not running'}

        elif cmd == 'shutdown':
            self.is_running = False
            return {'status': 'shutting_down'}

        return {'error': 'Unknown command'}
```

### 2.5 Management CLI

```python
# backend/scheduler/cli.py

import click
import socket
import json

SOCKET_PATH = "/tmp/kh_scheduler.sock"

def send_command(cmd: dict) -> dict:
    """Send command to scheduler daemon"""
    sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    sock.connect(SOCKET_PATH)
    sock.send(json.dumps(cmd).encode())
    response = sock.recv(65536)
    sock.close()
    return json.loads(response.decode())

@click.group()
def cli():
    """Knowledge Horizon Scheduler Management"""
    pass

@cli.command()
def status():
    """Show scheduler status and running jobs"""
    result = send_command({'cmd': 'status'})

    click.echo("=== Scheduler Status ===")
    click.echo(f"Uptime: {result['uptime']:.0f} seconds")

    click.echo("\n=== Running Jobs ===")
    for job in result['running_jobs']:
        click.echo(f"  Stream {job['stream_id']}: {job['current_stage']} - {job['last_message']}")

    click.echo("\n=== Recent History ===")
    for job in result['recent_history'][-10:]:
        status_icon = "✓" if job['status'] == 'completed' else "✗"
        click.echo(f"  {status_icon} Stream {job['stream_id']}: {job['status']}")

@cli.command()
@click.argument('stream_id', type=int)
def run(stream_id):
    """Trigger immediate run for a stream"""
    result = send_command({'cmd': 'run_now', 'stream_id': stream_id})
    click.echo(f"Result: {result}")

@cli.command()
def pending():
    """List streams pending execution"""
    result = send_command({'cmd': 'list_pending'})
    click.echo("Streams due for run:")
    for sid in result['pending']:
        click.echo(f"  - Stream {sid}")

@cli.command()
@click.argument('stream_id', type=int)
def cancel(stream_id):
    """Cancel a running job"""
    result = send_command({'cmd': 'cancel', 'stream_id': stream_id})
    click.echo(f"Result: {result}")

if __name__ == '__main__':
    cli()
```

Usage:
```bash
# Start daemon (in production, use systemd/supervisor)
python -m scheduler.daemon

# In another terminal:
python -m scheduler.cli status
python -m scheduler.cli pending
python -m scheduler.cli run 42
python -m scheduler.cli cancel 42
```

---

## 3. Report Approval Workflow

### 3.1 Concept

When the scheduler generates a report, it should NOT be immediately visible to subscribers. Instead:

1. Report is created with `status = 'pending_approval'`
2. Platform admin reviews the report
3. Admin approves or rejects
4. Only approved reports are visible to org/user subscribers

### 3.2 Database Changes

```sql
-- Add approval fields to reports table
ALTER TABLE reports ADD COLUMN approval_status VARCHAR(50) DEFAULT 'approved';
-- Values: 'pending_approval', 'approved', 'rejected', 'auto_approved'

ALTER TABLE reports ADD COLUMN approved_by INT DEFAULT NULL;
ALTER TABLE reports ADD COLUMN approved_at DATETIME DEFAULT NULL;
ALTER TABLE reports ADD COLUMN rejection_reason TEXT DEFAULT NULL;

-- Index for admin dashboard queries
CREATE INDEX idx_reports_approval ON reports(approval_status, created_at);
```

### 3.3 Approval Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│   SCHEDULER                           ADMIN                  USERS       │
│      │                                  │                      │         │
│      │  run_type=SCHEDULED              │                      │         │
│      ├──────────────────────────────────┤                      │         │
│      │                                  │                      │         │
│      │  Report created with             │                      │         │
│      │  approval_status='pending'       │                      │         │
│      ├──────────────────────────────────┤                      │         │
│      │                                  │                      │         │
│      │                    Admin reviews │                      │         │
│      │                    in dashboard  │                      │         │
│      │                                  │                      │         │
│      │                    ┌─────────────┴─────────────┐        │         │
│      │                    │                           │        │         │
│      │                 APPROVE                     REJECT      │         │
│      │                    │                           │        │         │
│      │                    ▼                           ▼        │         │
│      │           approval_status=          approval_status=    │         │
│      │           'approved'                'rejected'          │         │
│      │                    │                           │        │         │
│      │                    │                           │        │         │
│      │                    ▼                           │        │         │
│      │           Report visible                Not visible     │         │
│      │           to subscribers                to anyone       │         │
│      │                                                         │         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.4 When to Require Approval

| Run Type | Approval Required | Rationale |
|----------|-------------------|-----------|
| `MANUAL` | No (auto-approve) | User triggered it, they own it |
| `SCHEDULED` | Yes (pending) | Automated, needs human review |
| `TEST` | No (auto-approve) | Testing, not for production |

```python
# In pipeline_service.py, when creating report

if run_type == RunType.SCHEDULED:
    report.approval_status = 'pending_approval'
else:
    report.approval_status = 'approved'
    report.approved_at = datetime.utcnow()
```

### 3.5 Admin API Endpoints

```python
# routers/admin.py

@router.get("/reports/pending")
async def get_pending_reports(
    current_user: User = Depends(require_platform_admin)
):
    """Get all reports pending approval"""
    return db.query(Report).filter(
        Report.approval_status == 'pending_approval'
    ).order_by(Report.created_at.desc()).all()

@router.post("/reports/{report_id}/approve")
async def approve_report(
    report_id: int,
    current_user: User = Depends(require_platform_admin)
):
    """Approve a pending report"""
    report = db.query(Report).get(report_id)
    report.approval_status = 'approved'
    report.approved_by = current_user.user_id
    report.approved_at = datetime.utcnow()
    db.commit()

    # Notify subscribers
    await notify_subscribers(report)

    return {"status": "approved"}

@router.post("/reports/{report_id}/reject")
async def reject_report(
    report_id: int,
    reason: str,
    current_user: User = Depends(require_platform_admin)
):
    """Reject a pending report"""
    report = db.query(Report).get(report_id)
    report.approval_status = 'rejected'
    report.approved_by = current_user.user_id
    report.rejection_reason = reason
    db.commit()

    return {"status": "rejected"}
```

### 3.6 Query Modification for Subscribers

```python
# When fetching reports for a user/org

def get_visible_reports(user_id: int, stream_id: int):
    """Get reports visible to a user"""
    return db.query(Report).filter(
        Report.research_stream_id == stream_id,
        or_(
            # Approved reports are visible to all subscribers
            Report.approval_status == 'approved',
            # Pending/rejected visible only to stream owner
            and_(
                Report.approval_status.in_(['pending_approval', 'rejected']),
                ResearchStream.user_id == user_id
            )
        )
    ).all()
```

---

## 4. Run Type Summary

| `run_type` | Triggered By | Approval | Visible To |
|------------|--------------|----------|------------|
| `MANUAL` | User clicks "Execute" | Auto-approved | Owner immediately |
| `SCHEDULED` | Scheduler daemon | Pending admin review | Subscribers after approval |
| `TEST` | Legacy/testing | Auto-approved | Owner only |

---

## 5. File Structure

```
backend/
├── scheduler/
│   ├── __init__.py
│   ├── daemon.py           # Main scheduler process
│   ├── cli.py              # Management CLI
│   ├── job_state.py        # Job state models
│   └── utils.py            # Date calculations, etc.
├── services/
│   └── pipeline_service.py # (existing, add approval logic)
├── routers/
│   └── admin.py            # (add approval endpoints)
└── models.py               # (add new fields)
```

---

## 6. Deployment

### 6.1 Systemd Service

```ini
# /etc/systemd/system/kh-scheduler.service

[Unit]
Description=Knowledge Horizon Scheduler
After=network.target mysql.service

[Service]
Type=simple
User=kh
WorkingDirectory=/opt/kh/backend
ExecStart=/opt/kh/venv/bin/python -m scheduler.daemon
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

### 6.2 Docker Compose Addition

```yaml
scheduler:
  build: ./backend
  command: python -m scheduler.daemon
  volumes:
    - scheduler_socket:/tmp
  depends_on:
    - db
  environment:
    - DATABASE_URL=${DATABASE_URL}
```

---

## 7. Implementation Order

1. **Database migrations** - Add scheduling fields to research_streams, approval fields to reports
2. **Pydantic schemas** - ScheduleConfig schema
3. **API endpoints** - CRUD for schedule config on streams
4. **Pipeline changes** - Set approval_status based on run_type
5. **Admin endpoints** - Pending reports, approve/reject
6. **Scheduler daemon** - Core polling loop and execution
7. **Management CLI** - Status, run, cancel commands
8. **Frontend** - Schedule config UI, admin approval dashboard
9. **Deployment** - Systemd service or Docker container

---

## 8. Open Questions

1. **Notifications** - Email/Slack when reports need approval? When approved?
2. **Auto-approval rules** - Auto-approve if < N articles? If stream has been running reliably?
3. **Retry logic** - How many times to retry failed scheduled runs?
4. **Concurrency** - Max simultaneous scheduled runs? Queue priority?
5. **Time windows** - Blackout periods when scheduler shouldn't run?
