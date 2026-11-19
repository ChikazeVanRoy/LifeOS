#!/bin/bash
# Builds the static site for Firebase Hosting into ./out. API routes need a server, so they are
# set aside during the build and always put back, even if the build fails.
set -euo pipefail
cd "$(dirname "$0")/.."
ASIDE="$(mktemp -d)"
restore() { [ -d "$ASIDE/api" ] && mv "$ASIDE/api" src/app/api; rmdir "$ASIDE" 2>/dev/null || true; }
trap restore EXIT
mv src/app/api "$ASIDE/api"
rm -rf out
LIFEOS_STATIC=1 npx next build
