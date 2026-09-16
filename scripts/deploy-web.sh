#!/usr/bin/env bash
# Deploy the Nexgig web build to EAS Hosting (nexgig.expo.app).
#
# Why this script exists: `expo export` for web emits a bundle that uses
# `import.meta` (dragged in by Zustand's devtools code). Loaded as a classic
# script it throws "Cannot use 'import.meta' outside a module" — a PARSE error
# that blanks the whole page. Metro/Babel transforms don't reach it (lean
# node_modules transform), so we neutralise it post-export with sed. Skipping
# this step ships a blank white/black page. Run THIS instead of raw `eas deploy`.
#
# Usage:  bash scripts/deploy-web.sh
set -euo pipefail
cd "$(dirname "$0")/.."

echo "▸ Exporting web bundle…"
npx expo export --platform web

echo "▸ Applying import.meta band-aid (prevents the blank-page crash)…"
sed -i '' 's/import\.meta/({})/g' dist/_expo/static/js/web/*.js

echo "▸ Deploying to production (nexgig.expo.app)…"
eas deploy --prod

echo "✓ Done. Verify at https://nexgig.expo.app (hard refresh / incognito)."
