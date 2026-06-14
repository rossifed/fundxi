#!/usr/bin/env bash
# Build the iOS app on EAS (cloud) and submit it to App Store Connect / TestFlight.
#
# Usage (from anywhere in the repo):
#   ./apps/mobile/scripts/testflight.sh            # production profile (→ www.fundxi.ch)
#   ./apps/mobile/scripts/testflight.sh preview    # any other eas.json build profile
#
# Or via npm:  npm run testflight --workspace @fundxi/mobile
#
# First run will prompt for: Expo login (if needed) + Apple Developer / App
# Store Connect credentials (EAS manages certs & provisioning automatically).
# The production profile bundles the PROD backend URL — deploy the Railway
# backend first, otherwise TestFlight runs against the old backend.
set -euo pipefail

PROFILE="${1:-production}"
cd "$(dirname "$0")/.."   # apps/mobile

echo "→ EAS build iOS (profile: ${PROFILE}) + auto-submit to TestFlight…"
npx eas-cli build --platform ios --profile "${PROFILE}" --auto-submit

echo "✓ Submitted. Track build & submission at https://expo.dev (your project → Builds / Submissions)."
echo "  It then appears in App Store Connect → TestFlight after Apple processing (~5–15 min)."
