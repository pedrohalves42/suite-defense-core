#!/bin/bash
# ============================================================================
# Script de Auditoria de Edge Functions
# Identifica funções não referenciadas no código para potencial remoção
# Uso: ./tools/audit-edge-functions.sh
# ============================================================================

FUNCS_DIR="supabase/functions"
OUTPUT_FILE="tools/edge-functions-audit-$(date +%Y%m%d_%H%M%S).txt"

echo "=== AUDITORIA DE EDGE FUNCTIONS - $(date) ===" > "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

# Contadores
TOTAL=0
USED=0
SUSPICIOUS=0

echo "Analisando Edge Functions..."

# Listar todas as funções
for func_dir in "$FUNCS_DIR"/*; do
  if [ ! -d "$func_dir" ] || [ "$(basename "$func_dir")" == "_shared" ]; then
    continue
  fi
  
  FNAME=$(basename "$func_dir")
  TOTAL=$((TOTAL + 1))
  
  # Buscar referências no código (tolera aspas simples, duplas, template literals)
  REFS_FRONTEND=$(rg -l "/$FNAME['\"\`]" src/ 2>/dev/null | wc -l)
  REFS_E2E=$(rg -l "/$FNAME['\"\`]" e2e/ 2>/dev/null | wc -l)
  REFS_AGENTS=$(rg -l "/$FNAME['\"\`]" public/agent-scripts/ agent-scripts/ 2>/dev/null | wc -l)
  REFS_DOCS=$(rg -l "$FNAME" docs/ README.md TESTING_GUIDE.md 2>/dev/null | wc -l)
  
  TOTAL_REFS=$((REFS_FRONTEND + REFS_E2E + REFS_AGENTS + REFS_DOCS))
  
  if [ "$TOTAL_REFS" -eq 0 ]; then
    echo "❓ SUSPEITA: $FNAME (0 referências)" >> "$OUTPUT_FILE"
    SUSPICIOUS=$((SUSPICIOUS + 1))
  else
    echo "✅ EM USO: $FNAME ($TOTAL_REFS refs: front=$REFS_FRONTEND e2e=$REFS_E2E agents=$REFS_AGENTS docs=$REFS_DOCS)" >> "$OUTPUT_FILE"
    USED=$((USED + 1))
  fi
done

echo "" >> "$OUTPUT_FILE"
echo "=== RESUMO ===" >> "$OUTPUT_FILE"
echo "Total de funções: $TOTAL" >> "$OUTPUT_FILE"
echo "Confirmadas em uso: $USED" >> "$OUTPUT_FILE"
echo "Suspeitas (0 refs): $SUSPICIOUS" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

# Verificar se funções suspeitas são cron jobs
echo "=== VERIFICAÇÃO DE CRON JOBS ===" >> "$OUTPUT_FILE"
echo "Funções com schedule no config.toml:" >> "$OUTPUT_FILE"
if [ -f "supabase/config.toml" ]; then
  grep -A 2 "\[functions\." supabase/config.toml | grep -E "^\[|schedule" >> "$OUTPUT_FILE" 2>/dev/null
else
  echo "(config.toml não encontrado)" >> "$OUTPUT_FILE"
fi

echo "" >> "$OUTPUT_FILE"
echo "=== CRON JOBS CONHECIDOS ===" >> "$OUTPUT_FILE"
echo "Baseado no config.toml do projeto:" >> "$OUTPUT_FILE"
echo "- check-trial-expiration (daily)" >> "$OUTPUT_FILE"
echo "- cleanup-stuck-builds (hourly)" >> "$OUTPUT_FILE"
echo "- cleanup-stuck-jobs (hourly)" >> "$OUTPUT_FILE"
echo "- cleanup-old-data (daily)" >> "$OUTPUT_FILE"
echo "- cleanup-old-metrics (daily)" >> "$OUTPUT_FILE"
echo "- reset-daily-quotas (daily)" >> "$OUTPUT_FILE"

echo ""
echo "✅ Auditoria completa! Resultados em: $OUTPUT_FILE"
cat "$OUTPUT_FILE"
