#!/bin/bash
set -e

SOURCE="public/agent-scripts/cybershield-agent-linux-v3.sh"
TARGET="supabase/functions/_shared/agent-script-linux-content.ts"

if [ ! -f "$SOURCE" ]; then
  echo "[ERROR] Arquivo fonte nao encontrado: $SOURCE"
  exit 1
fi

echo "[SYNC] Sincronizando $SOURCE -> $TARGET"

# Cabecalho TS fixo
cat > "$TARGET" <<'EOF'
/* eslint-disable no-useless-escape */
/**
 * CyberShield Agent Linux Script - AUTO-GERADO
 * NAO EDITAR MANUALMENTE.
 * Fonte: public/agent-scripts/cybershield-agent-linux-v3.sh
 */

export const AGENT_SCRIPT_LINUX_SH = `
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

export function getAgentScriptLinux(): string {
  return AGENT_SCRIPT_LINUX_SH;
}
EOF

echo "[SUCCESS] Sync concluido. Tamanho: $(wc -c < "$SOURCE") bytes"
