#!/usr/bin/env node
/**
 * CyberShield Agent Sync Script - Cross-Platform (Windows/Linux/macOS)
 * 
 * Este script sincroniza os scripts de agentes de public/agent-scripts/
 * para supabase/functions/_shared/ com o escape correto de caracteres.
 * 
 * Uso: node scripts/sync-all-agents.js [--windows] [--linux] [--macos] [--all]
 * 
 * Se nenhum argumento for passado, sincroniza todos.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Configuração dos agentes
const AGENTS = {
  windows: {
    source: 'public/agent-scripts/cybershield-agent-windows-v3.ps1',
    target: 'supabase/functions/_shared/agent-script-windows-content.ts',
    exportName: 'AGENT_SCRIPT_WINDOWS_CONTENT',
    functionName: 'getAgentScriptWindows',
    escapeFunc: escapePowerShell
  },
  linux: {
    source: 'public/agent-scripts/cybershield-agent-linux-v3.sh',
    target: 'supabase/functions/_shared/agent-script-linux-content.ts',
    exportName: 'AGENT_SCRIPT_LINUX_SH',
    functionName: 'getAgentScriptLinux',
    escapeFunc: escapeBash
  },
  macos: {
    source: 'public/agent-scripts/cybershield-agent-macos-v3.sh',
    target: 'supabase/functions/_shared/agent-script-macos-content.ts',
    exportName: 'AGENT_SCRIPT_MACOS_SH',
    functionName: 'getAgentScriptMacos',
    escapeFunc: escapeBash
  }
};

// Escapa caracteres especiais para PowerShell em template literal
function escapePowerShell(content) {
  return content
    .replace(/\\/g, '\\\\')  // Backslash primeiro
    .replace(/`/g, '\\`')    // Backtick
    .replace(/\$/g, '\\$')   // Dollar sign
    .replace(/\${/g, '\\${'); // Template literal expressions
}

// Escapa caracteres especiais para Bash em template literal
function escapeBash(content) {
  return content
    .replace(/\\/g, '\\\\')  // Backslash primeiro
    .replace(/`/g, '\\`')    // Backtick
    .replace(/\$/g, '\\$')   // Dollar sign
    .replace(/\${/g, '\\${'); // Template literal expressions
}

// Extrai versão do script
function extractVersion(content, platform) {
  let match;
  if (platform === 'windows') {
    match = content.match(/AgentVersion\s*=\s*"([^"]+)"/);
  } else {
    match = content.match(/# Version:\s*(\S+)/);
  }
  return match ? match[1] : 'unknown';
}

// Calcula SHA256 do conteúdo
function calculateSHA256(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

// Sincroniza um agente
function syncAgent(platform) {
  const config = AGENTS[platform];
  
  console.log(`\n📦 Sincronizando ${platform.toUpperCase()}...`);
  
  // Verifica se o arquivo fonte existe
  const sourcePath = path.join(projectRoot, config.source);
  if (!fs.existsSync(sourcePath)) {
    console.error(`❌ Arquivo fonte não encontrado: ${config.source}`);
    return false;
  }
  
  // Lê o conteúdo original
  const originalContent = fs.readFileSync(sourcePath, 'utf8');
  const version = extractVersion(originalContent, platform);
  const sha256 = calculateSHA256(originalContent);
  
  console.log(`   Versão: ${version}`);
  console.log(`   Tamanho: ${(originalContent.length / 1024).toFixed(1)} KB`);
  console.log(`   SHA256: ${sha256.substring(0, 16)}...`);
  
  // Escapa o conteúdo
  const escapedContent = config.escapeFunc(originalContent);
  
  // Gera o arquivo TypeScript
  const tsContent = `/* eslint-disable no-useless-escape */
/**
 * CyberShield Agent ${platform.charAt(0).toUpperCase() + platform.slice(1)} Script - AUTO-GERADO
 * NAO EDITAR MANUALMENTE.
 * Fonte: ${config.source}
 * Versao: ${version}
 * SHA256: ${sha256}
 * Gerado em: ${new Date().toISOString()}
 */

export function ${config.functionName}(): string {
  return ${config.exportName};
}

export const ${config.exportName} = \`${escapedContent}\`;
`;
  
  // Escreve o arquivo de destino
  const targetPath = path.join(projectRoot, config.target);
  fs.writeFileSync(targetPath, tsContent, 'utf8');
  
  const targetSize = fs.statSync(targetPath).size;
  console.log(`   ✅ Gerado: ${config.target} (${(targetSize / 1024).toFixed(1)} KB)`);
  
  // Valida que o arquivo não foi truncado (deve ser maior que o original)
  if (targetSize < originalContent.length) {
    console.error(`   ⚠️  ALERTA: Arquivo de destino menor que o original! Possível truncamento.`);
    return false;
  }
  
  return true;
}

// Main
function main() {
  const args = process.argv.slice(2);
  
  console.log('🔄 CyberShield Agent Sync Script');
  console.log('================================');
  
  let platforms = [];
  
  if (args.includes('--all') || args.length === 0) {
    platforms = ['windows', 'linux', 'macos'];
  } else {
    if (args.includes('--windows')) platforms.push('windows');
    if (args.includes('--linux')) platforms.push('linux');
    if (args.includes('--macos')) platforms.push('macos');
  }
  
  if (platforms.length === 0) {
    console.log('Uso: node scripts/sync-all-agents.js [--windows] [--linux] [--macos] [--all]');
    process.exit(1);
  }
  
  console.log(`Plataformas: ${platforms.join(', ')}`);
  
  let success = true;
  for (const platform of platforms) {
    if (!syncAgent(platform)) {
      success = false;
    }
  }
  
  console.log('\n================================');
  if (success) {
    console.log('✅ Sincronização concluída com sucesso!');
    console.log('\nPróximos passos:');
    console.log('1. Deploy das Edge Functions (automático no preview)');
    console.log('2. Registrar versão em /admin/agent-releases');
  } else {
    console.log('⚠️  Sincronização concluída com avisos');
    process.exit(1);
  }
}

main();
