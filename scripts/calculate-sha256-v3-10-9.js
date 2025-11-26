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

// Calcular SHA256
const sha256 = crypto.createHash('sha256').update(scriptContent, 'utf8').digest('hex');

console.log('SHA256 calculado para v3.10.9-PSCUSTOMOBJECT-FIX:');
console.log(sha256);
console.log('\nTamanho do script:', scriptContent.length, 'caracteres');
console.log('\nPrimeiras 200 chars do script:');
console.log(scriptContent.substring(0, 200));
