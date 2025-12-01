#!/usr/bin/env node
import fs from 'fs';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ler o arquivo TypeScript que contém o script embarcado
const tsPath = path.join(__dirname, '..', 'supabase', 'functions', '_shared', 'agent-script-windows-content.ts');
const tsContent = fs.readFileSync(tsPath, 'utf8');

// Extrair o script PowerShell do template literal
// Procurar por: export const AGENT_SCRIPT_WINDOWS_CONTENT = `
// e extrair até o fechamento do template literal
const match = tsContent.match(/export const AGENT_SCRIPT_WINDOWS_CONTENT = `([\s\S]*?)`;\s*$/m);

if (!match) {
  console.error('ERRO: Nao foi possivel extrair o script do arquivo TypeScript');
  process.exit(1);
}

const scriptContent = match[1];

// Calcular SHA256 SEM BOM (padrao para v3.10.12+)
const sha256WithoutBOM = crypto.createHash('sha256').update(scriptContent, 'utf8').digest('hex');

console.log('=== SHA256 Calculation Results ===\n');
console.log('Version: v3.10.14-NO-EXIT-ON-UPDATE');
console.log('Script size:', scriptContent.length, 'caracteres\n');

console.log('SHA256 WITHOUT BOM (standard for v3.10.12+):');
console.log(sha256WithoutBOM);
console.log('\n✅ Use este SHA256 para registrar v3.10.14 no agent_releases\n');

console.log('Primeiras 200 chars do script:');
console.log(scriptContent.substring(0, 200));
