#!/bin/bash

# Script de Teste Otimizado (Modo Debug)
# Executa testes prioritários com fail-fast e parsing de erros

echo "🚀 Iniciando Testes em Modo Debug (Fail-Fast)..."

# 1. Testes Prioritários (Admin & Auth)
PRIORITY_TESTS=(
  "supabase/functions/__tests__/admin/admin-create-user.test.ts"
  "supabase/functions/__tests__/auth/"
)

FAILED=0

for test_path in "${PRIORITY_TESTS[@]}"; do
  if [ -e "$test_path" ]; then
    echo "🔍 Executando Prioridade: $test_path"
    # Captura output e passa pelo parser se falhar
    OUT=$(deno test --allow-all --fail-fast "$test_path" 2>&1)
    if [ $? -ne 0 ]; then
      echo "$OUT" | bun scripts/parse-edge-errors.js
      FAILED=1
      break
    fi
  else
    echo "⚠️ Caminho não encontrado: $test_path"
  fi
done

if [ $FAILED -eq 1 ]; then
  echo "❌ Interrompendo após primeira falha nos testes prioritários."
  exit 1
fi

# 2. Restante dos testes se os prioritários passaram
echo "🏃 Executando restante dos testes..."
OUT=$(deno test --allow-all --fail-fast supabase/functions/__tests__/ 2>&1)
if [ $? -ne 0 ]; then
  echo "$OUT" | bun scripts/parse-edge-errors.js
  exit 1
fi

echo "✅ Todos os testes críticos passaram!"
