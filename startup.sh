#!/bin/sh
# Revive the Aahar preview. Idempotent: exit if the app is already answering.
if curl -sf -o /dev/null --max-time 1 http://127.0.0.1:8080/; then
  exit 0
fi
cd /workspace
nohup npm run dev > /tmp/aahar-dev.log 2>&1 &
exit 0
