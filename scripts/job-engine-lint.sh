#!/bin/bash
# ============================================================
# Job Engine Code Lint - Static Analysis for Forbidden Patterns
# ============================================================
# This script validates that no forbidden status values are
# used in job-related code. These would cause state machine violations.
#
# Gate #3: Status proibidos no código
# - 'pending' (replaced by 'queued' in v3) — only for jobs table
# - 'done' (never valid, use 'completed') — only for jobs table
#
# Non-job tables (agents, invites, approvals, DLQ, etc.) may
# legitimately use 'pending' and are excluded from this check.
# ============================================================

set -e

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║  🔍 Job Engine Code Lint                                   ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

ERRORS=0

# ============================================================
# Check for status: 'pending' in edge functions (jobs context)
# ============================================================
echo "Checking for forbidden 'status: pending' patterns in job inserts..."

# Find status: 'pending' but exclude known non-job tables:
# - agents, invites, approval_requests, automation_approvals
# - failed_jobs_dlq, playbook_executions, action items
# Strategy: grep for the pattern, then exclude lines referencing non-job tables
PENDING_HITS=$(grep -rn "status:\s*['\"]pending['\"]" supabase/functions --include="*.ts" 2>/dev/null \
  | grep -v "from('agents')" \
  | grep -v "from('invites')" \
  | grep -v "from('approval_requests')" \
  | grep -v "from('automation_approvals')" \
  | grep -v "from('failed_jobs_dlq')" \
  | grep -v "from('playbook_executions')" \
  | grep -v "from('action_items')" \
  | grep -v "from('ai_actions')" \
  | grep -v "from('pending_actions')" \
  | grep -v "// lint-ignore-pending" \
  | grep -v "action-center-feed/" \
  | grep -v "ai-insight-dispatcher/" \
  | grep -v "ai-system-analyzer/" \
  | grep -v "auto-generate-enrollment/" \
  | grep -v "evaluate-automation-rules/" \
  | grep -v "evaluate-playbook-triggers/" \
  | grep -v "handlers/admin-auth" \
  | grep -v "handlers/playbook-automation" \
  || true)

if [ -n "$PENDING_HITS" ]; then
  echo "$PENDING_HITS"
  echo ""
  echo "❌ FAIL: Found 'status: pending' in edge functions (job context)!"
  echo "   Use 'status: queued' instead (ADR-037)"
  echo "   Add '// lint-ignore-pending' comment if this is not a jobs table insert"
  echo ""
  ERRORS=$((ERRORS + 1))
else
  echo "✅ No 'status: pending' found in job-related edge functions"
fi

# ============================================================
# Check for status: 'done' in edge functions
# ============================================================
echo ""
echo "Checking for forbidden 'status: done' patterns..."

if grep -rn "status:\s*['\"]done['\"]" supabase/functions --include="*.ts" 2>/dev/null; then
  echo ""
  echo "❌ FAIL: Found 'status: done' in edge functions!"
  echo "   Use 'status: completed' instead"
  echo ""
  ERRORS=$((ERRORS + 1))
else
  echo "✅ No 'status: done' found in edge functions"
fi

# ============================================================
# Check for status: 'pending' in React code (client-side)
# ============================================================
echo ""
echo "Checking for forbidden patterns in React code..."

if grep -rn "status:\s*['\"]pending['\"]" src --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v "node_modules" | grep -v ".test."; then
  echo ""
  echo "⚠️  WARNING: Found 'status: pending' in React code"
  echo "   Review these occurrences - they may need updating"
  echo ""
fi

# ============================================================
# Summary
# ============================================================
echo ""
if [ $ERRORS -gt 0 ]; then
  echo "╔════════════════════════════════════════════════════════════╗"
  echo "║  ❌ JOB ENGINE LINT FAILED: $ERRORS error(s) found              ║"
  echo "╚════════════════════════════════════════════════════════════╝"
  exit 1
else
  echo "╔════════════════════════════════════════════════════════════╗"
  echo "║  ✅ JOB ENGINE LINT PASSED: No forbidden patterns         ║"
  echo "╚════════════════════════════════════════════════════════════╝"
  exit 0
fi
