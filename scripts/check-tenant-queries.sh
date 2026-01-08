#!/usr/bin/env bash
# =============================================================================
# CI Gate: Multi-Tenant Query Isolation Check
# =============================================================================
# This script detects Supabase queries to multi-tenant tables that are missing
# tenant_id filtering, preventing cross-tenant data leakage.
#
# Run in CI to hard-fail builds with potential isolation issues.
# =============================================================================

set -e

# Multi-tenant tables that MUST have tenant_id filtering
TABLES="agents|tasks|system_alerts|jobs|ai_insights|computers|agent_web_activity"
TABLES="$TABLES|agent_system_metrics|agent_disk_metrics|agent_network_info"
TABLES="$TABLES|agent_builds|enrollment_keys|governance_reports"
# ADR-026 FASE 2 - Additional tables with active_tenant policies
TABLES="$TABLES|anomaly_events|audit_reason_trees|ai_action_validations"
TABLES="$TABLES|antivirus_status|custom_trials|policy_assignments"

FAILED=0
ISSUES_FOUND=0

echo "🔍 Verificando queries Supabase sem tenant_id..."
echo "   Tabelas monitoradas: agents, tasks, system_alerts, jobs, etc."
echo ""

# Find all TypeScript/TSX files (excluding node_modules, tests, edge functions)
while IFS= read -r file; do
  # Skip edge functions (they use service role and handle tenant differently)
  if [[ "$file" == *"supabase/functions"* ]]; then
    continue
  fi
  
  # Skip test files
  if [[ "$file" == *".test."* ]] || [[ "$file" == *".spec."* ]]; then
    continue
  fi
  
  # Skip the tenantQuery helper itself
  if [[ "$file" == *"tenantQuery.ts"* ]]; then
    continue
  fi

  # Find supabase.from() calls for multi-tenant tables
  while IFS= read -r match; do
    LINENO=$(echo "$match" | cut -d: -f1)
    
    # Get context (15 lines after the match)
    CONTEXT=$(sed -n "$LINENO,$((LINENO+15))p" "$file")
    
    # Check if tenant_id is present in the query chain OR if tenantQuery is used
    if ! echo "$CONTEXT" | grep -qE "tenant_id|tenantQuery"; then
      echo "❌ POSSÍVEL VAZAMENTO MULTI-TENANT:"
      echo "   Arquivo: $file:$LINENO"
      echo "   Query para tabela multi-tenant SEM filtro tenant_id"
      echo ""
      FAILED=1
      ((ISSUES_FOUND++))
    fi
  done < <(grep -n -E "supabase\s*\.from\(\s*['\"]($TABLES)['\"]" "$file" 2>/dev/null || true)
  
done < <(find src -type f \( -name "*.ts" -o -name "*.tsx" \) 2>/dev/null)

echo "---"

if [ "$FAILED" -eq 1 ]; then
  echo "🚨 FALHA DE ISOLAMENTO MULTI-TENANT DETECTADA!"
  echo "   Total de issues: $ISSUES_FOUND"
  echo ""
  echo "📋 Como corrigir:"
  echo "   1. Use useTenant() para obter o tenant ativo"
  echo "   2. Adicione .eq('tenant_id', tenant.id) na query"
  echo "   3. Ou use o helper tenantQuery('tabela', tenant.id)"
  echo ""
  echo "📖 Referência: docs/architecture/ADR-026-active-tenant-isolation.md"
  exit 1
fi

echo "✅ Todas as queries verificadas incluem tenant_id."
echo "   Isolamento multi-tenant OK!"
