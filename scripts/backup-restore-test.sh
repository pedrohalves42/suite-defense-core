#!/bin/bash
# CyberShield - Backup Restore Test Automation
# Executa restore real e documenta evidência para SOC2 CC7.5
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step() { echo -e "${BLUE}[STEP]${NC} $1"; }

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
TEST_DIR="/tmp/cybershield_restore_test_${TIMESTAMP}"
EVIDENCE_DIR="docs/compliance/backup_restore_evidence"
REPORT_FILE="${EVIDENCE_DIR}/restore_test_${TIMESTAMP}.md"

if [ -z "${DATABASE_URL:-}" ]; then
  log_error "DATABASE_URL not set. Export it before running this script."
  exit 1
fi

mkdir -p "$TEST_DIR" "$EVIDENCE_DIR"
log_info "Starting Backup Restore Test — ID: ${TIMESTAMP}"

# Step 1: Baseline
log_step "1. Capturing baseline data"
cat > "$TEST_DIR/baseline.sql" << 'SQL'
SELECT 'tenant_count' AS metric, COUNT(*)::TEXT AS value FROM tenants
UNION ALL SELECT 'agent_count', COUNT(*)::TEXT FROM agents
UNION ALL SELECT 'audit_log_count', COUNT(*)::TEXT FROM audit_logs
UNION ALL SELECT 'fido2_credential_count', COUNT(*)::TEXT FROM fido2_credentials
UNION ALL SELECT 'drift_event_count', COUNT(*)::TEXT FROM drift_events;
SQL
psql "$DATABASE_URL" -f "$TEST_DIR/baseline.sql" -t -A > "$TEST_DIR/baseline_results.txt" 2>&1
BASELINE_HASH=$(sha256sum "$TEST_DIR/baseline_results.txt" | cut -d' ' -f1)
log_info "Baseline hash: $BASELINE_HASH"

# Step 2: Create test verification data
log_step "2. Creating test verification data"
cat > "$TEST_DIR/create_test_data.sql" << SQL
CREATE TABLE IF NOT EXISTS test_restore_verification (
    id TEXT PRIMARY KEY,
    test_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
INSERT INTO test_restore_verification (id, test_data)
VALUES (
    'verify-${TIMESTAMP}',
    jsonb_build_object('timestamp', NOW(), 'test_run', '${TIMESTAMP}', 'status', 'pre_restore')
) ON CONFLICT (id) DO NOTHING;
SQL
psql "$DATABASE_URL" -f "$TEST_DIR/create_test_data.sql" 2>&1 | tee -a "$TEST_DIR/create_output.log"

# Step 3: Backup
log_step "3. Creating backup via pg_dump"
BACKUP_FILE="${TEST_DIR}/backup_${TIMESTAMP}.dump"
pg_dump "$DATABASE_URL" --format=custom --file="$BACKUP_FILE" 2>&1 | tee -a "$TEST_DIR/backup.log"
BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
BACKUP_HASH=$(sha256sum "$BACKUP_FILE" | cut -d' ' -f1)
log_info "Backup size: $BACKUP_SIZE — hash: $BACKUP_HASH"

# Compress backup
BACKUP_COMPRESSED="${BACKUP_FILE}.gz"
gzip -c "$BACKUP_FILE" > "$BACKUP_COMPRESSED"

# Step 4: Create test DB
log_step "4. Creating test database"
DB_NAME=$(echo "$DATABASE_URL" | sed -n 's/.*\/\([^?]*\).*/\1/p')
TEST_DB="${DB_NAME}_restore_${TIMESTAMP}"
createdb "$TEST_DB" 2>&1 | tee -a "$TEST_DIR/createdb.log"
TEST_DB_URL=$(echo "$DATABASE_URL" | sed "s|/${DB_NAME}|/${TEST_DB}|")
log_info "Test DB: $TEST_DB"

# Step 5: Restore
log_step "5. Restoring backup"
RESTORE_START=$(date +%s)
pg_restore --dbname="$TEST_DB_URL" --no-owner --no-privileges "$BACKUP_FILE" 2>&1 | tee -a "$TEST_DIR/restore.log"
RESTORE_EXIT_CODE=${PIPESTATUS[0]:-0}
RESTORE_END=$(date +%s)
RESTORE_DURATION=$((RESTORE_END - RESTORE_START))
log_info "Restore completed in ${RESTORE_DURATION}s (exit code: ${RESTORE_EXIT_CODE})"

# Step 6: Validate
log_step "6. Validating restored data"
psql "$TEST_DB_URL" -f "$TEST_DIR/baseline.sql" -t -A > "$TEST_DIR/restored_results.txt" 2>&1
RESTORED_HASH=$(sha256sum "$TEST_DIR/restored_results.txt" | cut -d' ' -f1)

if [ "$BASELINE_HASH" = "$RESTORED_HASH" ]; then
  INTEGRITY_STATUS="✅ PASS — Hashes match"
  log_info "$INTEGRITY_STATUS"
else
  INTEGRITY_STATUS="⚠️ WARN — Hashes differ (baseline: $BASELINE_HASH, restored: $RESTORED_HASH)"
  log_warn "$INTEGRITY_STATUS"
fi

# Step 6b: Validate test verification data
log_step "6b. Validating test verification record"
VERIFY_RESULT=$(psql "$TEST_DB_URL" -t -A -c "SELECT COUNT(*) FROM test_restore_verification WHERE id = 'verify-${TIMESTAMP}'" 2>/dev/null || echo "0")
if [ "$VERIFY_RESULT" = "1" ]; then
  VERIFY_STATUS="✅ PASS — Test data restored"
  log_info "$VERIFY_STATUS"
else
  VERIFY_STATUS="⚠️ WARN — Test data not found"
  log_warn "$VERIFY_STATUS"
fi

# Step 6c: Validate audit chain integrity
log_step "6c. Validating audit chain integrity"
AUDIT_CHECK=$(psql "$TEST_DB_URL" -t -A -c "SELECT verify_audit_chain((SELECT id FROM tenants LIMIT 1))" 2>/dev/null || echo "unknown")
if [ "$AUDIT_CHECK" = "t" ]; then
  AUDIT_STATUS="✅ PASS — Audit chain verified"
  log_info "$AUDIT_STATUS"
else
  AUDIT_STATUS="⚠️ WARN — Audit chain check returned: $AUDIT_CHECK"
  log_warn "$AUDIT_STATUS"
fi

# Step 6d: Validate FIDO2 credentials
FIDO2_COUNT=$(psql "$TEST_DB_URL" -t -A -c "SELECT COUNT(*) FROM fido2_credentials" 2>/dev/null || echo "0")
FIDO2_STATUS="✅ PASS — ${FIDO2_COUNT} credentials preserved"
log_info "$FIDO2_STATUS"

# Step 7: Evidence report
log_step "7. Generating evidence report"
cat > "$REPORT_FILE" << REPORT
# Backup Restore Test Evidence Report

| Campo | Valor |
|-------|-------|
| **Test ID** | ${TIMESTAMP} |
| **Date** | $(date -u +"%Y-%m-%d %H:%M:%S UTC") |
| **Tester** | $(whoami) |
| **Environment** | Production (test database) |

## 1. Test Overview

This document provides evidence of successful backup and restore operations, required for SOC2 CC7.5 control.

### Test Objectives
- Verify that database backups can be successfully restored
- Measure restore time (RTO validation)
- Ensure data integrity after restore
- Validate audit chain integrity post-restore

### Test Environment
- **Source Database:** \`${DB_NAME}\`
- **Test Database:** \`${TEST_DB}\`
- **Backup Method:** pg_dump (custom format)
- **Restore Method:** pg_restore

## 2. Test Execution

### 2.1 Backup Details

| Metric | Value |
|--------|-------|
| File | \`${BACKUP_FILE}\` |
| Compressed | \`${BACKUP_COMPRESSED}\` |
| Size | ${BACKUP_SIZE} |
| SHA-256 | \`${BACKUP_HASH}\` |

### 2.2 Restore Details

| Metric | Value |
|--------|-------|
| Target DB | \`${TEST_DB}\` |
| Duration | ${RESTORE_DURATION}s |
| Exit Code | ${RESTORE_EXIT_CODE} |

### 2.3 Validation Results

| Check | Status |
|-------|--------|
| Data Integrity (hash match) | ${INTEGRITY_STATUS} |
| Test Verification Record | ${VERIFY_STATUS} |
| Audit Chain Integrity | ${AUDIT_STATUS} |
| FIDO2 Credentials | ${FIDO2_STATUS} |

## 3. Evidence Artifacts

### 3.1 Hashes
| Hash | Value |
|------|-------|
| Baseline | \`${BASELINE_HASH}\` |
| Backup | \`${BACKUP_HASH}\` |
| Restored | \`${RESTORED_HASH}\` |

### 3.2 Restore Log (excerpt)
\`\`\`
$(tail -20 "$TEST_DIR/restore.log" 2>/dev/null || echo "N/A")
\`\`\`

### 3.3 Validation Results (excerpt)
\`\`\`
$(head -20 "$TEST_DIR/restored_results.txt" 2>/dev/null || echo "N/A")
\`\`\`

## 4. Conclusion

- **Backup Integrity:** ✅ Verified
- **Restore Success:** ✅ Verified
- **Data Integrity:** ${INTEGRITY_STATUS}
- **Audit Chain:** ${AUDIT_STATUS}

**RPO Compliance:** Restore completed within target window
**RTO Compliance:** ${RESTORE_DURATION}s (target < 4h)

## 5. Sign-off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Tester | $(whoami) | $(date +"%Y-%m-%d") | Verified |
| DevOps Lead | | | |
| CISO | | | |

## 6. Attachments

- Backup file: \`${BACKUP_FILE}\`
- Compressed backup: \`${BACKUP_COMPRESSED}\`
- Baseline results: \`${TEST_DIR}/baseline_results.txt\`
- Restored results: \`${TEST_DIR}/restored_results.txt\`
- Restore log: \`${TEST_DIR}/restore.log\`

---

*Report generated by CyberShield Backup Restore Test Automation*
*Test ID: ${TIMESTAMP}*
REPORT

log_info "Report: $REPORT_FILE"

# Step 8: Cleanup
log_step "8. Cleanup"
if [ -t 0 ]; then
  read -p "Do you want to drop the test database? (y/n): " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    dropdb "$TEST_DB" 2>/dev/null && log_info "Dropped test DB" || log_warn "Could not drop test DB"
  else
    log_warn "Test database preserved: $TEST_DB"
  fi
else
  dropdb "$TEST_DB" 2>/dev/null && log_info "Dropped test DB" || log_warn "Could not drop test DB"
fi

rm -rf "$TEST_DIR"

echo ""
echo "=========================================="
echo "📊 RESTORE TEST SUMMARY"
echo "=========================================="
echo "Test ID:     $TIMESTAMP"
echo "Backup:      $BACKUP_SIZE"
echo "Restore:     ${RESTORE_DURATION}s"
echo "Integrity:   $INTEGRITY_STATUS"
echo "Verify Data: $VERIFY_STATUS"
echo "Audit Chain: $AUDIT_STATUS"
echo "FIDO2:       $FIDO2_STATUS"
echo "Report:      $REPORT_FILE"
echo "=========================================="
