#!/bin/bash

# Script de Teste Otimizado (Modo Debug)
# Executa testes prioritários com fail-fast e parsing de erros

echo "🚀 Iniciando Testes em Modo Debug (Fail-Fast)..."

# Se um argumento for passado, usa ele como único teste
if [ ! -z "$1" ]; then
  TESTS=("$1")
  echo "🎯 Executando teste específico: $1"
else
  # 1. Testes Prioritários (Admin & Auth)
  TESTS=(
    "supabase/functions/__tests__/admin/admin-create-user.test.ts"
    "supabase/functions/__tests__/auth/"
  )
  echo "📦 Testando módulos prioritários: admin-create-user, auth..."
fi

FAILED=0

for test_path in "${TESTS[@]}"; do
  if [ -e "$test_path" ]; then
    echo "🔍 Executando: $test_path"
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
  echo "❌ Interrompendo após primeira falha."
  exit 1
fi

# Se não foi passado argumento, executa o restante
if [ -z "$1" ]; then
  echo "🏃 Executando restante dos testes..."
  OUT=$(deno test --allow-all --fail-fast supabase/functions/__tests__/ 2>&1)
  if [ $? -ne 0 ]; then
    echo "$OUT" | bun scripts/parse-edge-errors.js
    exit 1
  fi
fi

echo "✅ Testes concluídos com sucesso!"
