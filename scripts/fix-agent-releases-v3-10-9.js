#!/usr/bin/env node
/**
 * Script para re-registrar agent_releases v3.10.9-PSCUSTOMOBJECT-FIX
 * Extrai script completo do arquivo TypeScript e registra via Edge Function
 */
import fs from 'fs';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('ERRO: Variaveis de ambiente VITE_SUPABASE_URL ou VITE_SUPABASE_PUBLISHABLE_KEY nao encontradas');
  process.exit(1);
}

// Ler o arquivo TypeScript que contém o script embarcado
const tsPath = path.join(__dirname, '..', 'supabase', 'functions', '_shared', 'agent-script-windows-content.ts');
const tsContent = fs.readFileSync(tsPath, 'utf8');

// Extrair o script PowerShell do template literal
const match = tsContent.match(/export const AGENT_SCRIPT_WINDOWS_CONTENT = `([\s\S]*?)`;\s*$/m);

if (!match) {
  console.error('ERRO: Nao foi possivel extrair o script do arquivo TypeScript');
  process.exit(1);
}

const scriptContent = match[1];
const sha256 = crypto.createHash('sha256').update(scriptContent, 'utf8').digest('hex');

console.log('='.repeat(80));
console.log('AGENT RELEASE v3.10.9-PSCUSTOMOBJECT-FIX - RE-REGISTRO');
console.log('='.repeat(80));
console.log('SHA256 calculado:', sha256);
console.log('Tamanho do script:', scriptContent.length, 'caracteres');
console.log('='.repeat(80));

const payload = {
  version: 'v3.10.9-PSCUSTOMOBJECT-FIX',
  platform: 'windows',
  script_content: scriptContent,
  sha256: sha256,
  release_notes: 'CRITICAL FIX: PowerShell job handlers use PSCustomObject from ConvertFrom-Json, not hashtable. Replaced $Job.ContainsKey("payload") with $null -ne $Job.payload for null checking. All handlers must handle responses as PSCustomObject (property access), not hashtable (method calls). Triple-layer TLS 1.2 enforcement (command + installer + script) for corporate firewall compatibility.',
  channel: 'stable'
};

console.log('\nChamando Edge Function register-agent-release...');

const url = `${SUPABASE_URL}/functions/v1/register-agent-release`;

fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'apikey': SUPABASE_ANON_KEY
  },
  body: JSON.stringify(payload)
})
  .then(response => {
    if (!response.ok) {
      return response.text().then(text => {
        throw new Error(`HTTP ${response.status}: ${text}`);
      });
    }
    return response.json();
  })
  .then(result => {
    console.log('\n✅ SUCCESS: Agent release registrado com sucesso!');
    console.log(JSON.stringify(result, null, 2));
    console.log('\n' + '='.repeat(80));
    console.log('PROXIMOS PASSOS:');
    console.log('1. Valide: SELECT version, length(script_content) as script_length, sha256, is_active FROM agent_releases WHERE version = \'v3.10.9-PSCUSTOMOBJECT-FIX\'');
    console.log('2. Verifique se script_length = ' + scriptContent.length);
    console.log('3. Verifique se sha256 = ' + sha256);
    console.log('='.repeat(80));
  })
  .catch(error => {
    console.error('\n❌ ERRO ao registrar agent release:');
    console.error(error.message);
    process.exit(1);
  });
