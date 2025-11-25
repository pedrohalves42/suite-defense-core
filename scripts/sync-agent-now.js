#!/usr/bin/env node
/**
 * Script para sincronizar agent PowerShell para TypeScript embarcado
 * Aplica escapamento correto para template literals
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SOURCE_PATH = path.join(__dirname, '../public/agent-scripts/cybershield-agent-windows-v3.ps1');
const TARGET_PATH = path.join(__dirname, '../supabase/functions/_shared/agent-script-windows-content.ts');

console.log('[SYNC] Iniciando sincronizacao...');

// Ler script fonte
if (!fs.existsSync(SOURCE_PATH)) {
  console.error(`[ERROR] Arquivo fonte nao encontrado: ${SOURCE_PATH}`);
  process.exit(1);
}

const content = fs.readFileSync(SOURCE_PATH, 'utf8');

// Aplicar escapamento para TypeScript template literal
// 1. Backslash: \ -> \\
// 2. Backtick: ` -> \`
// 3. Dollar: $ -> \$
const escaped = content
  .replace(/\\/g, '\\\\')
  .replace(/`/g, '\\`')
  .replace(/\$/g, '\\$');

// Gerar arquivo TypeScript
const header = `/**
 * CyberShield Agent Windows Script - AUTO-GERADO
 * NAO EDITAR MANUALMENTE.
 * Fonte: ${SOURCE_PATH}
 * Sincronizado em: ${new Date().toISOString()}
 */

export const AGENT_SCRIPT_WINDOWS_CONTENT = \`
`;

const footer = `\`;

export function getAgentScriptWindows(): string {
  return AGENT_SCRIPT_WINDOWS_CONTENT;
}
`;

const output = header + escaped + footer;

// Escrever arquivo destino
fs.writeFileSync(TARGET_PATH, output, 'utf8');

const sourceSize = fs.statSync(SOURCE_PATH).size;
const targetSize = fs.statSync(TARGET_PATH).size;

console.log('[SUCCESS] Sync concluido');
console.log(`  Source: ${sourceSize} bytes`);
console.log(`  Target: ${targetSize} bytes`);

// Validar se TLS e Proxy fixes estao presentes
const hasTlsFix = content.includes('[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12');
const hasProxyFix = content.includes('[System.Net.WebRequest]::GetSystemWebProxy()');
const hasVersion = content.includes('v3.10.2-TLS-FIX');

console.log('\n[VALIDACAO]');
console.log(`  Versao v3.10.2-TLS-FIX: ${hasVersion ? 'OK' : 'FALHOU'}`);
console.log(`  TLS 1.2 Fix: ${hasTlsFix ? 'PRESENTE' : 'AUSENTE'}`);
console.log(`  Proxy Fix: ${hasProxyFix ? 'PRESENTE' : 'AUSENTE'}`);

if (!hasVersion || !hasTlsFix || !hasProxyFix) {
  console.error('\n[ERROR] Script fonte nao contem todos os fixes necessarios!');
  process.exit(1);
}

console.log('\n[INFO] Edge Functions serao redeployadas automaticamente.');
console.log('[INFO] Aguarde o deploy completar, depois clique em "Registrar v3.10.2-TLS-FIX".');
