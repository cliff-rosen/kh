#!/usr/bin/env bash
set -u

APP_DIR=/var/app/current
UNIT_PATH=/etc/systemd/system/kh-worker.service

# Ensure the env symlink exists in the live app dir
ln -sfn "${APP_DIR}/.env.production" "${APP_DIR}/.env"

# Write/update the systemd unit against the live path
cat > "${UNIT_PATH}" <<'EOF'
[Unit]
Description=Knowledge Horizon Worker Process
After=network.target

[Service]
Type=simple
User=webapp
WorkingDirectory=/var/app/current
EnvironmentFile=/opt/elasticbeanstalk/deployment/env
ExecStart=/bin/bash -lc 'source /var/app/venv/*/bin/activate && exec python -m worker.main'
Restart=always
RestartSec=5
TimeoutStopSec=60
KillSignal=SIGTERM
StandardOutput=journal
StandardError=journal
SyslogIdentifier=kh-worker

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable kh-worker

# Start/restart, but never fail the deployment if the worker is unhappy.
systemctl restart kh-worker || true

exit 0
