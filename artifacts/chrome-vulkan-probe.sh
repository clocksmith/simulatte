#!/bin/sh
exec /usr/bin/google-chrome \
  --use-angle=vulkan \
  --enable-features=Vulkan \
  --disable-vulkan-surface \
  "$@"
