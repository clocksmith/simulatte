#!/bin/sh
exec /home/clocksmith/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome \
  --no-sandbox \
  --use-angle=swiftshader \
  --enable-features=Vulkan \
  --disable-vulkan-surface \
  "$@"
