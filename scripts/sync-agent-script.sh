#!/bin/bash
set -e

# Caminhos fonte e destino
SOURCE="public/agent-scripts/cybershield-agent-windows-v3.ps1"
TARGET="supabase/functions/_shared/agent-script-windows-content.ts"

if [ ! -f "$SOURCE" ]; then
  echo "❌ Arquivo fonte não encontrado: $SOURCE"
  exit 1
fi

echo "🔄 Sincronizando $SOURCE -> $TARGET"

# Lê conteúdo do .ps1 e escapa para template literal TS
SCRIPT_CONTENT=$(cat "$SOURCE")

# Gerar arquivo TypeScript completo
cat > "$TARGET" << 'EOFTS'
/**
 * CyberShield Agent Windows Script - AUTO-GERADO
 * NÃO EDITAR MANUALMENTE - Use: npm run sync:agent
 * Fonte: public/agent-scripts/cybershield-agent-windows-v3.ps1
 */

export const AGENT_SCRIPT_WINDOWS_CONTENT = `
EOFTS

# Append script content (sem escaping adicional, backtick template já resolve)
cat "$SOURCE" >> "$TARGET"

# Fechar template
cat >> "$TARGET" << 'EOFTS'
`;

export function getAgentScriptWindows(): string {
  return AGENT_SCRIPT_WINDOWS_CONTENT;
}

export function validateAgentScript(content: string): boolean {
  return content.length > 5000 && content.includes('CyberShield');
}

export async function calculateScriptHash(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
EOFTS

echo "✅ Sync concluído. Tamanho: $(wc -c < "$SOURCE") bytes"
