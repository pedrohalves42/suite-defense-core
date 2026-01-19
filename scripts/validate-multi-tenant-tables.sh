#!/bin/bash
# ADR-026 P2.1: Validates that all multi-tenant tables are registered in MULTI_TENANT_TABLES
# This script is used as a CI gate to prevent cross-tenant data leakage

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

TENANT_QUERY_FILE="src/lib/tenantQuery.ts"
FAILED=0
MISSING_TABLES=()

echo "================================================"
echo "ADR-026: Multi-Tenant Table Registration Check"
echo "================================================"
echo ""

# Check if tenantQuery.ts exists
if [ ! -f "$TENANT_QUERY_FILE" ]; then
  echo -e "${RED}ERROR: $TENANT_QUERY_FILE not found${NC}"
  exit 1
fi

# Extract registered tables from tenantQuery.ts
REGISTERED_TABLES=$(grep -A 200 "MULTI_TENANT_TABLES = new Set" "$TENANT_QUERY_FILE" | \
  grep -oP "'[a-z_]+'" | tr -d "'" | sort -u)

echo "Registered tables in MULTI_TENANT_TABLES:"
echo "$REGISTERED_TABLES" | while read table; do echo "  ✓ $table"; done
echo ""

# Find files that use supabase.from() with .eq('tenant_id')
echo "Scanning for unregistered tables..."
echo ""

for file in $(find src -name "*.ts" -o -name "*.tsx" 2>/dev/null | grep -v node_modules | grep -v ".test." | grep -v ".spec."); do
  # Skip the tenantQuery.ts file itself
  if [[ "$file" == *"tenantQuery.ts"* ]]; then
    continue
  fi
  
  # Check if file uses tenant_id filtering
  if grep -q "\.eq('tenant_id'" "$file" 2>/dev/null || grep -q '\.eq("tenant_id"' "$file" 2>/dev/null; then
    # Extract table names from supabase.from() calls
    TABLES_IN_FILE=$(grep -oP "supabase\.from\(['\"]([a-z_]+)['\"]\)" "$file" 2>/dev/null | \
      sed "s/supabase\.from(['\"]//g" | sed "s/['\"])//g" | sort -u)
    
    for table in $TABLES_IN_FILE; do
      # Skip if table is registered
      if echo "$REGISTERED_TABLES" | grep -q "^${table}$"; then
        continue
      fi
      
      # Check if this specific query uses tenant_id
      # Get context around the from() call
      CONTEXT=$(grep -A 5 "from(['\"]${table}['\"])" "$file" 2>/dev/null | head -10)
      
      if echo "$CONTEXT" | grep -q "tenant_id"; then
        MISSING_TABLES+=("$table (in $file)")
        FAILED=1
      fi
    done
  fi
done

# Also check for tenantQuery() usage to ensure consistency
echo "Checking tenantQuery() usage consistency..."
for file in $(find src -name "*.ts" -o -name "*.tsx" 2>/dev/null | grep -v node_modules); do
  if grep -q "tenantQuery(" "$file" 2>/dev/null; then
    # Extract table names from tenantQuery() calls
    TABLES_FROM_HELPER=$(grep -oP "tenantQuery\(['\"]([a-z_]+)['\"]\)" "$file" 2>/dev/null | \
      sed "s/tenantQuery(['\"]//g" | sed "s/['\"])//g" | sort -u)
    
    for table in $TABLES_FROM_HELPER; do
      if ! echo "$REGISTERED_TABLES" | grep -q "^${table}$"; then
        MISSING_TABLES+=("$table via tenantQuery (in $file)")
        FAILED=1
      fi
    done
  fi
done

echo ""
echo "================================================"

if [ $FAILED -eq 1 ]; then
  echo -e "${RED}✗ FAILED: Unregistered multi-tenant tables found${NC}"
  echo ""
  echo "The following tables use tenant_id but are NOT in MULTI_TENANT_TABLES:"
  printf '%s\n' "${MISSING_TABLES[@]}" | sort -u | while read item; do
    echo -e "  ${YELLOW}⚠ $item${NC}"
  done
  echo ""
  echo "To fix: Add the missing tables to MULTI_TENANT_TABLES in src/lib/tenantQuery.ts"
  echo "See: docs/architecture/ADR-026-active-tenant-isolation.md"
  exit 1
else
  echo -e "${GREEN}✓ PASSED: All multi-tenant tables are registered${NC}"
  exit 0
fi
