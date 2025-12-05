#!/bin/bash
set -e

SOURCE="public/agent-scripts/cybershield-agent-windows-v3.ps1"
TARGET="supabase/functions/_shared/agent-script-windows-content.ts"

if [ ! -f "$SOURCE" ]; then
  echo "[ERROR] Arquivo fonte não encontrado: $SOURCE"
  exit 1
fi

# Extrair versão dinamicamente do arquivo fonte
VERSION=$(grep '\$AgentVersion.*=' "$SOURCE" | head -1 | sed 's/.*"\([^"]*\)".*/\1/')

if [ -z "$VERSION" ]; then
  echo "[ERROR] Não foi possível extrair a versão do arquivo fonte"
  exit 1
fi

echo "[SYNC] Sincronizando $SOURCE -> $TARGET"
echo "[INFO] Versão detectada: $VERSION"

# Cabecalho TS com versão dinâmica
cat > "$TARGET" <<EOF
/**
 * CyberShield Agent Windows Script - AUTO-GERADO
 * NAO EDITAR MANUALMENTE.
 * Fonte: public/agent-scripts/cybershield-agent-windows-v3.ps1
 * Versao: $VERSION
 */

export const AGENT_SCRIPT_WINDOWS_CONTENT = \`
EOF

# Corpo do script PowerShell com escaping para template literal TS:
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

export function getAgentScriptWindows(): string {
  return AGENT_SCRIPT_WINDOWS_CONTENT;
}
EOF

echo "[SUCCESS] Sync concluído para $VERSION"
echo "[INFO] Tamanho: $(wc -c < "$SOURCE") bytes"
echo "[INFO] Linhas: $(wc -l < "$SOURCE")"
