#!/bin/sh
exec /home/clocksmith/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome \
  --no-sandbox \
  "$@"
