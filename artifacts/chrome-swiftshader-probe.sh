#!/bin/sh
exec /usr/bin/google-chrome \
  --use-angle=swiftshader \
  --enable-features=Vulkan \
  --disable-vulkan-surface \
  "$@"
