#!/usr/bin/env node
/**
 * Script de sincronizacao para v3.10.7-FINAL-FIX
 * Le o script PowerShell e gera o arquivo TypeScript embarcado com escape correto
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SOURCE_PATH = path.join(__dirname, '../public/agent-scripts/cybershield-agent-windows-v3.ps1');
const TARGET_PATH = path.join(__dirname, '../supabase/functions/_shared/agent-script-windows-content.ts');

console.log('[SYNC] Iniciando sincronizacao v3.10.7-FINAL-FIX...');
console.log(`[SYNC] Source: ${SOURCE_PATH}`);
console.log(`[SYNC] Target: ${TARGET_PATH}`);

// Ler script fonte
if (!fs.existsSync(SOURCE_PATH)) {
  console.error(`[ERROR] Arquivo fonte nao encontrado: ${SOURCE_PATH}`);
  process.exit(1);
}

const content = fs.readFileSync(SOURCE_PATH, 'utf8');
console.log(`[INFO] Script lido: ${content.length} caracteres, ${content.split('\n').length} linhas`);

// Validar versao no source
if (!content.includes('v3.10.7-FINAL-FIX')) {
  console.error('[ERROR] Versao v3.10.7-FINAL-FIX nao encontrada no script fonte!');
  process.exit(1);
}

// Validar features criticas
const hasTlsFix = content.includes('[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12');
const hasProxyFix = content.includes('[System.Net.WebRequest]::GetSystemWebProxy()');
const hasUtf8Fix = content.includes('[System.Text.Encoding]::UTF8.GetBytes');
const hasScanFix = content.includes('-Path "/functions/v1/scan-virus"');
const hasUpdateFix = content.includes('-Path "/functions/v1/serve-agent-update"');

console.log('\n[VALIDACAO PRE-SYNC]');
console.log(`  Versao v3.10.7-FINAL-FIX: ${content.includes('v3.10.7-FINAL-FIX') ? 'OK' : 'FALHOU'}`);
console.log(`  TLS 1.2 Fix: ${hasTlsFix ? 'OK' : 'FALHOU'}`);
console.log(`  Proxy Fix: ${hasProxyFix ? 'OK' : 'FALHOU'}`);
console.log(`  UTF-8 Fix: ${hasUtf8Fix ? 'OK' : 'FALHOU'}`);
console.log(`  Scan -Path Fix: ${hasScanFix ? 'OK' : 'FALHOU'}`);
console.log(`  Update -Path Fix: ${hasUpdateFix ? 'OK' : 'FALHOU'}`);

if (!hasTlsFix || !hasProxyFix || !hasUtf8Fix || !hasScanFix || !hasUpdateFix) {
  console.error('\n[ERROR] Script fonte nao contem todos os fixes necessarios!');
  process.exit(1);
}

// Aplicar escapamento para TypeScript template literal
// 1. Backslash: \ -> \\
// 2. Backtick: ` -> \`
// 3. Dollar: $ -> \$
console.log('\n[ESCAPE] Aplicando escapamento para TypeScript template literal...');

const escaped = content
  .replace(/\\/g, '\\\\')
  .replace(/`/g, '\\`')
  .replace(/\$/g, '\\$');

console.log(`[ESCAPE] Caracteres apos escape: ${escaped.length}`);

// Gerar arquivo TypeScript
const header = `/**
 * CyberShield Agent Windows Script - AUTO-GERADO
 * NAO EDITAR MANUALMENTE.
 * Fonte: public/agent-scripts/cybershield-agent-windows-v3.ps1
 * Sincronizado em: ${new Date().toISOString()}
 * Versao: v3.10.7-FINAL-FIX
 */

export const AGENT_SCRIPT_WINDOWS_CONTENT = \``;

const footer = `\`;

export function getAgentScriptWindows(): string {
  return AGENT_SCRIPT_WINDOWS_CONTENT;
}
`;

const output = header + escaped + footer;

// Escrever arquivo destino
console.log('\n[WRITE] Escrevendo arquivo embarcado...');
fs.writeFileSync(TARGET_PATH, output, 'utf8');

const sourceSize = fs.statSync(SOURCE_PATH).size;
const targetSize = fs.statSync(TARGET_PATH).size;

console.log('\n[SUCCESS] Sincronizacao concluida!');
console.log(`  Source size: ${sourceSize} bytes`);
console.log(`  Target size: ${targetSize} bytes`);
console.log(`  Expansion: ${((targetSize / sourceSize - 1) * 100).toFixed(1)}% (devido ao escape)`);

// Validar arquivo gerado
const generated = fs.readFileSync(TARGET_PATH, 'utf8');

// Verificar se nao tem conflitos de merge (com espacos para evitar falsos positivos)
const hasConflicts = 
  generated.includes('<<<<<<< ') ||     // Inicio de conflito (com espaco)
  generated.includes('>>>>>>> ') ||     // Fim de conflito (com espaco)
  (generated.match(/^=======$/m));      // Separador de conflito (linha exata)
  
if (hasConflicts) {
  console.error('\n[ERROR] Arquivo gerado contem marcadores de conflito de merge!');
  process.exit(1);
}

// Verificar se a versao esta presente
if (!generated.includes('v3.10.7-FINAL-FIX')) {
  console.error('\n[ERROR] Versao v3.10.7-FINAL-FIX nao encontrada no arquivo gerado!');
  process.exit(1);
}

console.log('\n[VALIDACAO POS-SYNC]');
console.log(`  Sem conflitos de merge: OK`);
console.log(`  Versao presente: OK`);
console.log(`  Export function presente: ${generated.includes('export function getAgentScriptWindows') ? 'OK' : 'FALHOU'}`);

console.log('\n[INFO] Arquivo embarcado gerado com sucesso!');
console.log('[INFO] Proximo passo: Edge Functions serao redeployadas automaticamente.');
console.log('[INFO] Aguarde o deploy completar antes de testar na VM testepc2.');

console.log('\n[INSTRUCOES]');
console.log('1. Commit e push das alteracoes');
console.log('2. Aguardar deploy das Edge Functions');
console.log('3. Ir para Agent Releases e registrar v3.10.7-FINAL-FIX');
console.log('4. Executar Fase 7: Testar na VM testepc2 (ver FASE_6_7_INSTRUCOES.md)');
