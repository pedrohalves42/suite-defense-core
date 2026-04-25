#!/bin/bash

# Script de Teste Otimizado (Modo Debug)
# Executa testes seletivos com fail-fast

echo "🚀 Iniciando Testes em Modo Debug (Fail-Fast)..."

# Prioridade 1: Admin Create User & Auth
echo "📦 Testando módulos prioritários: admin-create-user, auth..."

# Supabase Edge Functions tests are usually in __tests__
PRIORITY_TESTS=(
  "supabase/functions/__tests__/admin/admin-create-user.test.ts"
  "supabase/functions/__tests__/auth/"
)

for test_path in "${PRIORITY_TESTS[@]}"; do
  if [ -e "$test_path" ]; then
    echo "🔍 Executando: $test_path"
    deno test --allow-all --fail-fast "$test_path" || { echo "❌ Falha crítica em $test_path. Interrompendo."; exit 1; }
  else
    echo "⚠️ Caminho não encontrado: $test_path"
  fi
done

# Restante dos testes
echo "🏃 Executando restante dos testes..."
deno test --allow-all --fail-fast supabase/functions/__tests__/ || { echo "❌ Falha no restante dos testes."; exit 1; }

echo "✅ Todos os testes críticos passaram!"
