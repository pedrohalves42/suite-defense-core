#!/usr/bin/env node
/**
 * Script para registrar v3.10.16-MULTIUSER-WEB-ACTIVITY no agent_releases
 * 
 * Uso:
 *   node scripts/register-v3-10-16.js
 * 
 * Este script:
 * 1. Lê o conteúdo do script PS1 atualizado
 * 2. Calcula o SHA256 (sem BOM, padrão v3.10.12+)
 * 3. Chama a Edge Function register-agent-release
 */

import fs from 'fs';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carregar .env
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('ERRO: VITE_SUPABASE_URL ou VITE_SUPABASE_PUBLISHABLE_KEY não encontrado no .env');
  process.exit(1);
}

// Ler script atualizado
const scriptPath = path.join(__dirname, '..', 'public', 'agent-scripts', 'cybershield-agent-windows-v3.ps1');
const scriptContent = fs.readFileSync(scriptPath, 'utf8');

// Calcular SHA256 (sem BOM - padrão v3.10.12+)
const sha256 = crypto.createHash('sha256').update(scriptContent, 'utf8').digest('hex');

console.log('=== v3.10.16-MULTIUSER-WEB-ACTIVITY Registration ===\n');
console.log('Script size:', scriptContent.length, 'characters');
console.log('SHA256:', sha256);
console.log('\n--- Script preview (first 300 chars) ---');
console.log(scriptContent.substring(0, 300));
console.log('\n--- End preview ---\n');

const payload = {
  version: 'v3.10.16-MULTIUSER-WEB-ACTIVITY',
  platform: 'windows',
  script_content: scriptContent,
  sha256: sha256,
  release_notes: 'MULTIUSER-WEB-ACTIVITY: Coleta de histórico de TODOS os perfis de usuário em C:\\Users\\*',
  channel: 'stable'
};

console.log('Payload size:', JSON.stringify(payload).length, 'bytes');
console.log('\n⚠️ IMPORTANTE: Este script precisa de autenticação como super_admin.');
console.log('Use a página Agent Releases do dashboard para registrar a nova versão.\n');

console.log('Informações para registro manual:');
console.log('- Version:', payload.version);
console.log('- Platform:', payload.platform);
console.log('- SHA256:', payload.sha256);
console.log('- Size:', payload.script_content.length, 'characters');
console.log('- Release Notes:', payload.release_notes);

// Salvar o script_content em arquivo temporário para facilitar copy/paste
const tempFile = path.join(__dirname, '..', 'temp-script-v3-10-16.txt');
fs.writeFileSync(tempFile, scriptContent, 'utf8');
console.log('\n✅ Script salvo em:', tempFile);
console.log('   Use este arquivo para copiar o conteúdo na página Agent Releases.\n');
