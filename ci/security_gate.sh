#!/usr/bin/env bash
# =============================================================================
# SECURITY HEALTH GATE - ADR-FINAL
#
# This script runs in CI/CD to validate security invariants before deployment.
# It queries the v_security_invariants view and fails if CRITICAL issues exist.
#
# Usage:
#   DATABASE_URL="postgres://..." ./ci/security_gate.sh
#
# Exit codes:
#   0 - All security invariants OK
#   1 - CRITICAL security issues detected (blocks deployment)
#   2 - Configuration error (missing DATABASE_URL)
# =============================================================================

set -euo pipefail

echo "🔍 Security Invariants Gate - Starting validation..."
echo ""

# Check for required environment variable
if [ -z "${DATABASE_URL:-}" ]; then
  echo "❌ ERROR: DATABASE_URL environment variable is not set"
  echo ""
  echo "Set DATABASE_URL to your Supabase database connection string:"
  echo "  export DATABASE_URL=\"postgres://postgres:password@host:5432/postgres\""
  exit 2
fi

# Query the security invariants view
echo "📊 Checking security invariants..."
echo ""

# Count critical issues
CRITICAL_COUNT=$(psql "$DATABASE_URL" -t -c "
  SELECT COUNT(*) 
  FROM v_security_invariants 
  WHERE status = 'CRITICAL';
" 2>/dev/null | tr -d ' ')

# Get all issues for display
ALL_ISSUES=$(psql "$DATABASE_URL" -c "
  SELECT 
    invariant,
    violations,
    status
  FROM v_security_invariants
  ORDER BY 
    CASE status 
      WHEN 'CRITICAL' THEN 1 
      WHEN 'HIGH' THEN 2 
      WHEN 'LOW' THEN 3 
      ELSE 4 
    END,
    invariant;
" 2>/dev/null)

echo "$ALL_ISSUES"
echo ""

if [ "$CRITICAL_COUNT" -ne "0" ]; then
  echo "❌ SECURITY GATE FAILED"
  echo ""
  echo "🚨 Found $CRITICAL_COUNT CRITICAL security issue(s)"
  echo ""
  echo "The following CRITICAL issues must be resolved before deployment:"
  psql "$DATABASE_URL" -c "
    SELECT invariant, violations, status
    FROM v_security_invariants 
    WHERE status = 'CRITICAL';
  " 2>/dev/null
  echo ""
  echo "📖 Reference: docs/SECURITY_INVARIANTS.md"
  echo ""
  exit 1
fi

# Check for HIGH severity (warning but not blocking)
HIGH_COUNT=$(psql "$DATABASE_URL" -t -c "
  SELECT COUNT(*) 
  FROM v_security_invariants 
  WHERE status = 'HIGH';
" 2>/dev/null | tr -d ' ')

if [ "$HIGH_COUNT" -ne "0" ]; then
  echo "⚠️  WARNING: Found $HIGH_COUNT HIGH severity issue(s)"
  echo ""
  psql "$DATABASE_URL" -c "
    SELECT invariant, violations, status
    FROM v_security_invariants 
    WHERE status = 'HIGH';
  " 2>/dev/null
  echo ""
  echo "These issues should be addressed but will not block deployment."
fi

echo "✅ Security Gate PASSED"
echo ""
echo "All critical security invariants validated successfully."
echo ""
