# EB Worker Deployment Problem

## Goal

Run a background Python process (`python -m worker.main`) alongside the main web process on the same Elastic Beanstalk instance. The worker polls the database for scheduled pipeline jobs and sends emails.

## Environment

- **EB Environment:** `knowledgehorizon-env`
- **Platform:** Python 3.11 on 64bit Amazon Linux 2023/4.8.0
- **Instance type:** t3.small
- **Deployment policy:** Immutable
- **Region:** us-east-1

## How the Web Process Works (for reference)

EB manages the web process automatically. The `Procfile` says:

```
web: gunicorn --worker-class uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000 application:application
```

EB generates `/etc/systemd/system/web.service` from this. Key details from that generated file:

```ini
WorkingDirectory=/var/app/current/
EnvironmentFile=/opt/elasticbeanstalk/deployment/env
ExecStart=/bin/sh -c "gunicorn --worker-class uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000 application:application"
```

EB activates the venv before running the Procfile command, so `gunicorn` resolves without a full path.

## What We're Trying to Do

Create a second systemd service (`kh-worker.service`) that runs `python -m worker.main` on port 8002. We use `.ebextensions/worker.config` to:

1. Write the service file to `/etc/systemd/system/kh-worker.service`
2. Symlink `.env.production` to `.env` (pydantic-settings expects `.env`)
3. Enable and start the service

## Current Configuration

```yaml
# .ebextensions/worker.config

files:
  "/etc/systemd/system/kh-worker.service":
    mode: "000644"
    owner: root
    group: root
    content: |
      [Unit]
      Description=Knowledge Horizon Worker Process
      After=network.target

      [Service]
      Type=simple
      User=webapp
      WorkingDirectory=/var/app/current
      ExecStart=/bin/bash -c 'source /var/app/venv/*/bin/activate && python -m worker.main'
      Restart=always
      RestartSec=5
      EnvironmentFile=/opt/elasticbeanstalk/deployment/env
      TimeoutStopSec=60
      KillSignal=SIGTERM
      StandardOutput=journal
      StandardError=journal
      SyslogIdentifier=kh-worker

      [Install]
      WantedBy=multi-user.target

container_commands:
  01_symlink_env:
    command: "ln -sf .env.production /var/app/staging/.env"
  02_enable_worker:
    command: "systemctl daemon-reload && systemctl enable kh-worker"
```

## The Problem

**Deployments fail with exit code 1** during the container_commands phase. The error from `eb-engine.log`:

```
Error occurred during build: Command 02_start_worker failed
An error occurred during execution of command [app-deploy] - [PostBuildEbExtension].
Error: container commands build failed.
```

## Why It Fails

EB's immutable deployment lifecycle works like this:

```
1. Launch new instance
2. Install packages (requirements.txt)
3. Write files from .ebextensions (our service file lands here)
4. Run container_commands (our symlink + systemctl commands run here)
   ← Code is at /var/app/staging/ at this point
   ← /var/app/current/ does NOT exist yet (or points to old code)
5. Flip: rename /var/app/staging → /var/app/current
6. Start web process
7. Run postdeploy hooks
8. Health check
9. If healthy, swap into load balancer; terminate old instance
```

Our service file says `WorkingDirectory=/var/app/current`. When `systemctl restart kh-worker` runs in step 4, `/var/app/current` doesn't exist yet → the service fails to start → the container command returns non-zero → **EB aborts the entire deployment**.

## What We've Tried

### Attempt 1: `|| true` on the command

```yaml
command: "systemctl daemon-reload && systemctl enable kh-worker && systemctl restart kh-worker || true"
```

**Result:** Still fails. cfn-init may evaluate the exit code differently, or the `||` isn't reached because `systemctl restart` succeeds (returns 0) but the service immediately crashes, and cfn-init detects that.

### Attempt 2: `ignoreErrors: true`

```yaml
02_start_worker:
    command: "systemctl daemon-reload && systemctl enable kh-worker && (systemctl restart kh-worker || true)"
    ignoreErrors: true
```

**Result:** Still fails. Possibly because `eb deploy --skip-tag` reused the previously uploaded artifact (which didn't have `ignoreErrors`), or because `ignoreErrors` doesn't apply to the PostBuildEbExtension phase.

### Attempt 3: Postdeploy hook

Created `.platform/hooks/postdeploy/start_worker.sh` (executable, 755) to run after the flip:

```bash
#!/bin/bash
systemctl daemon-reload
systemctl enable kh-worker
systemctl restart kh-worker
```

**Result:** EB logs say "The dir .platform/hooks/postdeploy/ does not exist". The file is in git, tracked, executable, but EB doesn't include it in the deployment artifact. Unknown why.

### Attempt 4: Don't restart, just enable

Only `systemctl daemon-reload && systemctl enable kh-worker` in container_commands. No restart.

**Result:** Deploy succeeds, but the worker never starts because nothing triggers the initial `systemctl start`. It would start on instance reboot, but not on deploy.

### What Actually Works (manual fix)

After SSH'ing into the instance, this works every time:

```bash
sudo ln -sf .env.production /var/app/current/.env
sudo tee /etc/systemd/system/kh-worker.service << 'EOF'
[Unit]
Description=Knowledge Horizon Worker Process
After=network.target

[Service]
Type=simple
User=webapp
WorkingDirectory=/var/app/current
ExecStart=/bin/bash -c 'source /var/app/venv/*/bin/activate && python -m worker.main'
Restart=always
RestartSec=5
EnvironmentFile=/opt/elasticbeanstalk/deployment/env
TimeoutStopSec=60
KillSignal=SIGTERM
StandardOutput=journal
StandardError=journal
SyslogIdentifier=kh-worker

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl restart kh-worker
```

This works because by the time we SSH in, the flip has already happened and `/var/app/current` exists.

## EB Environment Details

| What | Path |
|------|------|
| App code (staging, during deploy) | `/var/app/staging/` |
| App code (live, after flip) | `/var/app/current/` |
| EB venv | `/var/app/venv/staging-{random}/` (random suffix changes per deploy) |
| System Python | `/usr/bin/python3` (3.9, no app packages) |
| EB platform env vars | `/opt/elasticbeanstalk/deployment/env` (PATH, PYTHONPATH, ENVIRONMENT) |
| App env vars | `/var/app/current/.env.production` (must be symlinked to `.env`) |
| EB-managed web service | `/etc/systemd/system/web.service` |
| Our worker service | `/etc/systemd/system/kh-worker.service` |
| Worker logs | `sudo journalctl -u kh-worker --no-pager -n 50` |

## What We Need

A reliable way to start `kh-worker.service` on every deployment, that:

1. Runs **after** the app flip (`/var/app/current` exists)
2. Does **not** cause the deployment to fail if the worker has a transient startup error
3. Works with EB's immutable deployment policy
4. Survives instance replacement (new instances from scaling or config changes)
