#!/bin/bash
# Verificação rápida de sincronização dos agentes
set -e

echo "🔍 Verificando sincronização dos agentes..."

SRC_DIR="supabase/functions/_shared/agent-scripts"
DST_DIR="public/agent-scripts"
EXIT_CODE=0

for FILE in cybershield-agent-windows-v5.ps1 cybershield-agent-linux-v5.sh cybershield-agent-macos-v5.sh; do
  SRC="$SRC_DIR/$FILE"
  DST="$DST_DIR/$FILE"

  if [ ! -f "$SRC" ]; then continue; fi
  if [ ! -f "$DST" ]; then
    echo "  ❌ $FILE ausente em public/"
    EXIT_CODE=1
    continue
  fi

  SRC_HASH=$(sha256sum "$SRC" | cut -d' ' -f1)
  DST_HASH=$(sha256sum "$DST" | cut -d' ' -f1)

  if [ "$SRC_HASH" = "$DST_HASH" ]; then
    echo "  ✅ $FILE sincronizado"
  else
    echo "  ❌ $FILE DESINCRONIZADO!"
    echo "     shared: $SRC_HASH"
    echo "     public: $DST_HASH"
    EXIT_CODE=1
  fi
done

exit $EXIT_CODE
