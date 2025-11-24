#!/bin/bash
# CyberShield Agent macOS - Script de Sincronizacao
# Sincroniza public/agent-scripts/cybershield-agent-macos-v3.sh -> supabase/functions/_shared/agent-script-macos-content.ts

set -e

SOURCE="public/agent-scripts/cybershield-agent-macos-v3.sh"
TARGET="supabase/functions/_shared/agent-script-macos-content.ts"

echo "=========================================="
echo "CyberShield Agent macOS - Sync Script"
echo "=========================================="
echo ""

# Validar arquivo fonte
if [ ! -f "$SOURCE" ]; then
  echo "[ERROR] Arquivo fonte nao encontrado: $SOURCE"
  exit 1
fi

echo "[INFO] Fonte: $SOURCE"
echo "[INFO] Destino: $TARGET"
echo ""

# Obter versao do agente
AGENT_VERSION=$(grep -m1 "^# Version:" "$SOURCE" | sed 's/^# Version: //' | tr -d '\r\n')
echo "[INFO] Versao detectada: $AGENT_VERSION"
echo ""

# Validar sintaxe bash
echo "[INFO] Validando sintaxe bash..."
if bash -n "$SOURCE"; then
  echo "[SUCCESS] Sintaxe bash valida"
else
  echo "[ERROR] Sintaxe bash invalida"
  exit 1
fi
echo ""

# Gerar arquivo TypeScript
echo "[INFO] Gerando $TARGET..."

cat > "$TARGET" <<'EOF'
/* eslint-disable no-useless-escape */
/**
 * CyberShield Agent macOS Script - AUTO-GERADO
 * 
 * CRITICO: NAO EDITAR MANUALMENTE ESTE ARQUIVO!
 * 
 * Este arquivo e gerado automaticamente pelo script:
 * scripts/sync-agent-macos.sh
 * 
 * Fonte: public/agent-scripts/cybershield-agent-macos-v3.sh
 * 
 * Para atualizar:
 * 1. Edite: public/agent-scripts/cybershield-agent-macos-v3.sh
 * 2. Execute: npm run sync:agent:macos
 * 3. Commit: ambos os arquivos (fonte + gerado)
 */

export const AGENT_SCRIPT_MACOS_SH = `
EOF

# Escapar caracteres especiais para TypeScript template literal
sed \
  -e 's/\\/\\\\/g' \
  -e 's/`/\\`/g' \
  -e 's/\$/\\$/g' \
  "$SOURCE" >> "$TARGET"

cat >> "$TARGET" <<'EOF'
`;

/**
 * Retorna o script do agente macOS como string
 */
export function getAgentScriptMacos(): string {
  return AGENT_SCRIPT_MACOS_SH;
}
EOF

echo "[SUCCESS] Arquivo gerado com sucesso"
echo ""

# Estatisticas
SOURCE_SIZE=$(wc -c < "$SOURCE")
TARGET_SIZE=$(wc -c < "$TARGET")
SOURCE_LINES=$(wc -l < "$SOURCE")

echo "=========================================="
echo "ESTATISTICAS"
echo "=========================================="
echo "Linhas fonte: $SOURCE_LINES"
echo "Tamanho fonte: $SOURCE_SIZE bytes"
echo "Tamanho destino: $TARGET_SIZE bytes"
echo ""
echo "[SUCCESS] Sincronizacao concluida!"
echo ""
echo "Proximos passos:"
echo "1. Revisar: $TARGET"
echo "2. Testar: npm run build"
echo "3. Commit: git add $SOURCE $TARGET"
echo "=========================================="
