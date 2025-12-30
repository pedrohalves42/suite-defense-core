#!/bin/bash
# CI Guard: Fail if ALL tests were skipped (indicates misconfiguration)

REPORT_FILE="${1:-playwright-report/index.html}"

if [ ! -f "$REPORT_FILE" ]; then
  echo "⚠️  Report file not found: $REPORT_FILE"
  exit 0
fi

# Count test results
PASSED=$(grep -oP 'passed.*?(\d+)' "$REPORT_FILE" | grep -oP '\d+' | head -1 || echo "0")
FAILED=$(grep -oP 'failed.*?(\d+)' "$REPORT_FILE" | grep -oP '\d+' | head -1 || echo "0")
SKIPPED=$(grep -oP 'skipped.*?(\d+)' "$REPORT_FILE" | grep -oP '\d+' | head -1 || echo "0")

echo "📊 Test Results: $PASSED passed, $FAILED failed, $SKIPPED skipped"

# If ALL tests were skipped, something is wrong
if [ "${PASSED:-0}" -eq "0" ] && [ "${FAILED:-0}" -eq "0" ] && [ "${SKIPPED:-0}" -gt "0" ]; then
  echo "❌ ERROR: All tests were skipped! Check environment variables."
  echo "   Likely missing: VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY"
  exit 1
fi

# If no tests ran at all
if [ "${PASSED:-0}" -eq "0" ] && [ "${FAILED:-0}" -eq "0" ] && [ "${SKIPPED:-0}" -eq "0" ]; then
  echo "❌ ERROR: No tests were found or executed!"
  exit 1
fi

echo "✅ Skip guard passed"
exit 0
