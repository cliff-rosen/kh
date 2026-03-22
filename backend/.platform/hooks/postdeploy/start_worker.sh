#!/bin/bash
# Start the KH worker process after deployment.
# Runs after the app is flipped to /var/app/current.

systemctl daemon-reload
systemctl enable kh-worker
systemctl restart kh-worker
