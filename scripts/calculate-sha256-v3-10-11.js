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

// UTF-8 BOM: EF BB BF (3 bytes)
const BOM = Buffer.from([0xEF, 0xBB, 0xBF]);

// Calcular SHA256 SEM BOM (para referencia)
const sha256WithoutBOM = crypto.createHash('sha256').update(scriptContent, 'utf8').digest('hex');

// Calcular SHA256 COM BOM (para agentes v3.10.9 que usam Set-Content UTF8)
const contentWithBOM = Buffer.concat([BOM, Buffer.from(scriptContent, 'utf8')]);
const sha256WithBOM = crypto.createHash('sha256').update(contentWithBOM).digest('hex');

console.log('=== SHA256 Calculation Results ===\n');
console.log('Version: v3.10.11-SCAN-DIRECTORY-FIX');
console.log('Script size:', scriptContent.length, 'caracteres\n');

console.log('SHA256 WITHOUT BOM (standard):');
console.log(sha256WithoutBOM);
console.log('\nSHA256 WITH BOM (for v3.10.9 agents):');
console.log(sha256WithBOM);
console.log('\n⚠️  Use SHA256 WITH BOM to register v3.10.11 in agent_releases');
console.log('This allows v3.10.9 agents (using Set-Content UTF8) to validate the hash.\n');

console.log('Primeiras 200 chars do script:');
console.log(scriptContent.substring(0, 200));
