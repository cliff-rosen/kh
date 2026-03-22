# Worker Process — EB Deployment Notes

Hard-won knowledge from the initial production deployment. Reference this if the worker stops working after a deploy.

## How the Worker Runs on EB

The worker is a separate Python process (`python -m worker.main`) running alongside the web process on the same EC2 instance, managed by systemd.

**Key files:**
- `.ebextensions/worker.config` — creates the systemd service file and starts the worker
- `.platform/hooks/postdeploy/start_worker.sh` — exists but doesn't work (see Gotchas)

## Things That Went Wrong

### 1. Wrong Python path

**Symptom:** `status=203/EXEC` in systemd status

**Cause:** Used `/var/app/venv/bin/python` — doesn't exist. The EB venv path has a random suffix like `/var/app/venv/staging-LQM1lest/bin/python3`.

**Fix:** Use bash with glob activation instead of a direct python path:
```
ExecStart=/bin/bash -c 'source /var/app/venv/*/bin/activate && python -m worker.main'
```

### 2. Missing Python packages

**Symptom:** `ModuleNotFoundError: No module named 'fastapi'`

**Cause:** Used system Python (`/usr/bin/python3`) which is Python 3.9 with no packages. The app's packages are in the EB venv.

**Fix:** Same as above — activate the venv first.

### 3. Missing environment variables

**Symptom:** Pydantic `ValidationError` — DB_HOST, API keys all None

**Cause:** EB injects env vars into the `web.service` it manages, but our custom `kh-worker.service` doesn't get them. The app reads config from `.env` via pydantic-settings, but the file on the server is `.env.production`, not `.env`.

**Fix:** Two things:
1. Add `EnvironmentFile=/opt/elasticbeanstalk/deployment/env` to the service (gives PATH, PYTHONPATH, ENVIRONMENT)
2. Symlink `.env.production` to `.env` so pydantic-settings finds it:
   ```
   ln -sf .env.production /var/app/staging/.env
   ```
   Must be a **relative** symlink so it survives the staging → current flip.

### 4. Postdeploy hooks not running

**Symptom:** EB logs show "The dir .platform/hooks/postdeploy/ does not exist"

**Cause:** Unknown — the files are in git, tracked, executable (755). EB just doesn't see them. Possibly an EB packaging issue with the `.platform/hooks/` directory.

**Workaround:** Use `.ebextensions` container_commands instead. These reliably execute on every deploy.

### 5. Container commands run before app flip

**Symptom:** Worker can't find code at `/var/app/current` because it hasn't been flipped from staging yet.

**Cause:** Container commands run during the staging phase, before EB renames staging to current.

**Fix:** `Restart=always` with `RestartSec=5` in the systemd service. The first start fails (no `/var/app/current`), but systemd retries every 5 seconds. Once the flip happens, the next retry succeeds.

## Working Configuration

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
  02_start_worker:
    command: "systemctl daemon-reload && systemctl enable kh-worker && systemctl restart kh-worker"
```

## EB Environment Facts

| What | Path |
|------|------|
| App code (staging) | `/var/app/staging/` |
| App code (live) | `/var/app/current/` |
| EB venv | `/var/app/venv/staging-{random}/` |
| System Python | `/usr/bin/python3` (3.9, no packages) |
| EB platform env vars | `/opt/elasticbeanstalk/deployment/env` |
| App env vars | `/var/app/current/.env.production` (symlinked to `.env`) |
| Web service file | `/etc/systemd/system/web.service` (managed by EB) |
| Worker service file | `/etc/systemd/system/kh-worker.service` (managed by us) |
| Worker logs | `sudo journalctl -u kh-worker --no-pager -n 50` |
| Web process Procfile | `/var/app/current/Procfile` |

## Manual Debugging

SSH in:
```
eb ssh
```

Check worker status:
```
sudo systemctl status kh-worker
```

View worker logs:
```
sudo journalctl -u kh-worker --no-pager -n 50
```

Restart worker:
```
sudo systemctl restart kh-worker
```

Start worker manually (for debugging — will die when you disconnect):
```
sudo bash -c 'cd /var/app/current && source /var/app/venv/*/bin/activate && python -m worker.main'
```

Compare with web service config:
```
sudo cat /etc/systemd/system/web.service
```
