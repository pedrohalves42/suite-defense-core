#!/bin/bash
set -e

 SOURCE="public/agent-scripts/cybershield-agent-macos-v5.sh"
TARGET="supabase/functions/_shared/agent-script-macos-content.ts"

if [ ! -f "$SOURCE" ]; then
  echo "[ERROR] Arquivo fonte nao encontrado: $SOURCE"
  exit 1
fi

echo "[SYNC] Sincronizando $SOURCE -> $TARGET"

# Cabecalho TS fixo
cat > "$TARGET" <<'EOF'
/* eslint-disable no-useless-escape */
/**
 * CyberShield Agent macOS Script - AUTO-GERADO
 * NAO EDITAR MANUALMENTE.
  * Fonte: public/agent-scripts/cybershield-agent-macos-v5.sh
 */

export const AGENT_SCRIPT_MACOS_SH = `
EOF

# Corpo do script bash com escaping para template literal TS:
#  - \  -> \\
#  - `  -> \`
#  - $  -> \$
sed \
  -e 's/\\/\\\\/g' \
  -e 's/`/\\`/g' \
  -e 's/\$/\\$/g' \
  "$SOURCE" >> "$TARGET"

# Fecha o template literal e exporta helper
cat >> "$TARGET" <<'EOF'
`;

export function getAgentScriptMacos(): string {
  return AGENT_SCRIPT_MACOS_SH;
}
EOF

echo "[SUCCESS] Sync concluido. Tamanho: $(wc -c < "$SOURCE") bytes"
