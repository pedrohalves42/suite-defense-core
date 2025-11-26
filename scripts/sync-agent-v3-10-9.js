#!/usr/bin/env node
/**
 * Sync Agent Script v3.10.9-PSCUSTOMOBJECT-FIX
 * 
 * Este script:
 * 1. Le public/agent-scripts/cybershield-agent-windows-v3.ps1
 * 2. Calcula SHA256
 * 3. Atualiza supabase/functions/_shared/agent-script-windows-content.ts
 * 4. Exibe SHA256 para registro manual em agent_releases
 */

import fs from 'fs';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths
const SOURCE_SCRIPT = path.join(__dirname, '..', 'public', 'agent-scripts', 'cybershield-agent-windows-v3.ps1');
const TARGET_FILE = path.join(__dirname, '..', 'supabase', 'functions', '_shared', 'agent-script-windows-content.ts');

console.log('=== Sync Agent Script v3.10.9-PSCUSTOMOBJECT-FIX ===\n');

// 1. Ler script fonte
console.log(`Lendo script fonte: ${SOURCE_SCRIPT}`);
const scriptContent = fs.readFileSync(SOURCE_SCRIPT, 'utf8');
console.log(`✓ Script lido: ${scriptContent.length} caracteres\n`);

// 2. Calcular SHA256
console.log('Calculando SHA256...');
const sha256 = crypto.createHash('sha256').update(scriptContent, 'utf8').digest('hex');
console.log(`✓ SHA256: ${sha256}\n`);

// 3. Escapar para TypeScript (template literal)
console.log('Preparando conteúdo para TypeScript...');
const escapedContent = scriptContent
  .replace(/\\/g, '\\\\')    // Escape backslashes
  .replace(/`/g, '\\`')      // Escape backticks
  .replace(/\$/g, '\\$');    // Escape dollar signs

// 4. Gerar arquivo TypeScript
const tsContent = `/**
 * CyberShield Agent - Windows Script Content (v3.10.9-PSCUSTOMOBJECT-FIX)
 * 
 * Este arquivo contem o script PowerShell do agente Windows embedado como string.
 * 
 * IMPORTANTE: 
 * - Este arquivo e gerado automaticamente via npm run sync:agent
 * - NAO editar manualmente - edite public/agent-scripts/cybershield-agent-windows-v3.ps1
 * - SHA256: ${sha256}
 */

export const AGENT_SCRIPT_WINDOWS_CONTENT = \`${escapedContent}\`;

export function getAgentScriptWindows(): string {
  return AGENT_SCRIPT_WINDOWS_CONTENT;
}
`;

// 5. Escrever arquivo
console.log(`Escrevendo arquivo: ${TARGET_FILE}`);
fs.writeFileSync(TARGET_FILE, tsContent, 'utf8');
console.log(`✓ Arquivo atualizado\n`);

// 6. Exibir informações para registro manual
console.log('=== PROXIMOS PASSOS ===\n');
console.log('1. Script embedado atualizado com sucesso!');
console.log(`2. SHA256 calculado: ${sha256}`);
console.log('3. Registrar nova release em agent_releases:');
console.log(`
INSERT INTO public.agent_releases (version, platform, script_content, sha256, channel, is_active, release_notes)
VALUES (
  'v3.10.9-PSCUSTOMOBJECT-FIX',
  'windows',
  '${scriptContent.substring(0, 50)}...',
  '${sha256}',
  'stable',
  true,
  'CRITICAL FIX: ContainsKey() substituido por null check em PSCustomObject handlers'
);
`);
console.log('4. Marcar v3.10.8-AGENT-ID-FIX como inativa');
console.log('\n✓ Sincronizacao completa!\n');
