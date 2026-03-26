#!/bin/bash
set -e

echo "🔧 Sincronizando agentes corrigidos para public/..."

PLATFORMS=(
  "cybershield-agent-windows-v5.ps1"
  "cybershield-agent-linux-v5.sh"
  "cybershield-agent-macos-v5.sh"
)

SRC_DIR="supabase/functions/_shared/agent-scripts"
DST_DIR="public/agent-scripts"

SYNCED=0
FAILED=0

for FILE in "${PLATFORMS[@]}"; do
  SRC="$SRC_DIR/$FILE"
  DST="$DST_DIR/$FILE"

  if [ ! -f "$SRC" ]; then
    echo "  ⚠️  Fonte não encontrada: $SRC"
    continue
  fi

  SRC_HASH=$(sha256sum "$SRC" | cut -d' ' -f1)
  DST_HASH=$(sha256sum "$DST" 2>/dev/null | cut -d' ' -f1)

  if [ "$SRC_HASH" = "$DST_HASH" ]; then
    echo "  ✅ $FILE já sincronizado"
    continue
  fi

  cp "$SRC" "$DST"
  NEW_HASH=$(sha256sum "$DST" | cut -d' ' -f1)

  if [ "$NEW_HASH" = "$SRC_HASH" ]; then
    echo "  ✅ $FILE sincronizado ($(wc -c < "$DST") bytes)"
    SYNCED=$((SYNCED + 1))
  else
    echo "  ❌ $FILE falha na cópia!"
    FAILED=$((FAILED + 1))
  fi
done

# Validar correções Windows
echo ""
echo "🔍 Validando correções críticas no Windows agent..."
WIN="$DST_DIR/cybershield-agent-windows-v5.ps1"
CHECKS=0
PASS=0

for PATTERN in "Self-healing" "Global:BootScriptHash" "ExportPkcs8" "ContainsKey"; do
  CHECKS=$((CHECKS + 1))
  if grep -q "$PATTERN" "$WIN" 2>/dev/null; then
    echo "  ✅ $PATTERN"
    PASS=$((PASS + 1))
  else
    echo "  ❌ $PATTERN ausente!"
  fi
done

echo ""
echo "📊 Resultado: $SYNCED sincronizado(s), $FAILED falha(s), $PASS/$CHECKS correções validadas"

if [ "$FAILED" -gt 0 ] || [ "$PASS" -lt "$CHECKS" ]; then
  exit 1
fi

echo "🚀 Agentes baixarão a versão corrigida no próximo heartbeat."
