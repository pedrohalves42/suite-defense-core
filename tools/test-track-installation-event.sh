#!/usr/bin/env bash
set -euo pipefail

# ============================================
# 🧪 TEST: track-installation-event
# ============================================
# Valida que a edge function aceita:
# - event_type: post_installation, post_installation_unverified
# - platform: macos, windows, linux
# E rejeita event_types inválidos

SUPABASE_URL="${SUPABASE_URL:?❌ ERRO: Defina SUPABASE_URL no ambiente}"
ACCESS_TOKEN="${ACCESS_TOKEN:?❌ ERRO: Defina ACCESS_TOKEN (JWT de usuário autenticado)}"

echo "🔧 Configuração:"
echo "   URL: $SUPABASE_URL"
echo "   Token: ${ACCESS_TOKEN:0:20}..."
echo ""

call() {
  local name="$1"
  local body="$2"
  local expected_success="$3"

  echo "===> 🧪 $name"
  http_code=$(curl -s -o /tmp/resp.json -w "%{http_code}" \
    -X POST "$SUPABASE_URL/functions/v1/track-installation-event" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$body")

  echo "📡 HTTP $http_code"
  cat /tmp/resp.json 2>/dev/null || echo "(sem resposta)"
  echo ""

  if [ "$expected_success" = "true" ]; then
    if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 300 ]; then
      echo "✅ $name OK"
    else
      echo "❌ $name FALHOU (esperado 2xx, recebido $http_code)"
      exit 1
    fi
  else
    if [ "$http_code" -ge 400 ]; then
      echo "✅ $name corretamente rejeitado (HTTP $http_code)"
    else
      echo "❌ $name deveria falhar mas retornou $http_code"
      exit 1
    fi
  fi
  echo "-------------------------------------"
  echo ""
}

# ============================================
# TESTES DE SUCESSO
# ============================================

# 1) macOS + post_installation (CRÍTICO)
call "macOS post_installation" '{
  "agent_name": "test-macos-01",
  "event_type": "post_installation",
  "platform": "macos",
  "success": true,
  "installation_method": "one_click",
  "agent_version": "3.0.0",
  "metadata": { "test_case": "macos_success", "os_version": "14.2" }
}' "true"

# 2) Windows + post_installation
call "Windows post_installation" '{
  "agent_name": "test-windows-01",
  "event_type": "post_installation",
  "platform": "windows",
  "success": true,
  "installation_method": "one_click",
  "agent_version": "3.0.0",
  "metadata": { "test_case": "windows_success" }
}' "true"

# 3) Linux + post_installation
call "Linux post_installation" '{
  "agent_name": "test-linux-01",
  "event_type": "post_installation",
  "platform": "linux",
  "success": true,
  "installation_method": "script",
  "agent_version": "3.0.0"
}' "true"

# 4) post_installation_unverified (falha)
call "Windows post_installation_unverified (failed)" '{
  "agent_name": "test-windows-failed",
  "event_type": "post_installation_unverified",
  "platform": "windows",
  "success": false,
  "installation_method": "one_click",
  "metadata": { "error": "HMAC verification failed" }
}' "true"

# ============================================
# TESTES DE REJEIÇÃO
# ============================================

# 5) event_type inválido (deve falhar)
call "Invalid event_type (should reject)" '{
  "agent_name": "test-invalid",
  "event_type": "invalid_type",
  "platform": "windows"
}' "false"

# 6) platform inválido (deve falhar)
call "Invalid platform (should reject)" '{
  "agent_name": "test-invalid-platform",
  "event_type": "post_installation",
  "platform": "invalid_os"
}' "false"

# ============================================
# RESULTADO FINAL
# ============================================

echo ""
echo "╔════════════════════════════════════════╗"
echo "║  🎉 TODOS OS TESTES PASSARAM!          ║"
echo "╚════════════════════════════════════════╝"
echo ""
echo "✅ track-installation-event aceita:"
echo "   - post_installation / post_installation_unverified"
echo "   - platform: macos, windows, linux"
echo ""
echo "✅ Validação de schema funciona:"
echo "   - Event types inválidos são rejeitados"
echo "   - Platforms inválidos são rejeitados"
echo ""
