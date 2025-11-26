#!/usr/bin/env node
/**
 * Script para corrigir agent_releases v3.10.9-PSCUSTOMOBJECT-FIX
 * Extrai script completo do arquivo TypeScript e gera migration SQL
 */
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
const match = tsContent.match(/export const AGENT_SCRIPT_WINDOWS_CONTENT = `([\s\S]*?)`;\s*$/m);

if (!match) {
  console.error('ERRO: Nao foi possivel extrair o script do arquivo TypeScript');
  process.exit(1);
}

const scriptContent = match[1];
const sha256 = crypto.createHash('sha256').update(scriptContent, 'utf8').digest('hex');

console.log('='.repeat(80));
console.log('AGENT RELEASE v3.10.9-PSCUSTOMOBJECT-FIX - CORRECAO');
console.log('='.repeat(80));
console.log('SHA256 calculado:', sha256);
console.log('Tamanho do script:', scriptContent.length, 'caracteres');
console.log('='.repeat(80));

// Escapar single quotes para SQL
const scriptEscaped = scriptContent.replace(/'/g, "''");

// Gerar migration SQL
const timestamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0];
const migrationName = `${timestamp}_fix_agent_releases_v3_10_9.sql`;
const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', migrationName);

const migrationSQL = `-- ================================================================
-- MIGRATION: Fix agent_releases v3.10.9-PSCUSTOMOBJECT-FIX
-- ================================================================
-- Root cause: script_content was corrupted (49 chars instead of ~50000)
-- Fix: Delete corrupted release and insert with complete script

-- Delete corrupted release
DELETE FROM public.agent_releases 
WHERE version = 'v3.10.9-PSCUSTOMOBJECT-FIX' 
  AND platform = 'windows';

-- Insert corrected release with complete script
INSERT INTO public.agent_releases (
  version,
  platform,
  channel,
  script_content,
  sha256,
  is_active,
  release_notes,
  created_by
) VALUES (
  'v3.10.9-PSCUSTOMOBJECT-FIX',
  'windows',
  'stable',
  '${scriptEscaped}',
  '${sha256}',
  true,
  'CRITICAL FIX: PowerShell job handlers use PSCustomObject from ConvertFrom-Json, not hashtable. Replaced $Job.ContainsKey("payload") with $null -ne $Job.payload for null checking. All handlers must handle responses as PSCustomObject (property access), not hashtable (method calls). Triple-layer TLS 1.2 enforcement (command + installer + script) for corporate firewall compatibility.',
  NULL
);
`;

fs.writeFileSync(migrationPath, migrationSQL, 'utf8');

console.log('\nMigration SQL gerada:');
console.log('Arquivo:', migrationPath);
console.log('\nConteudo da migration:');
console.log(migrationSQL.substring(0, 1000) + '\n...[truncated]...\n');
console.log('='.repeat(80));
console.log('PROXIMOS PASSOS:');
console.log('1. Execute: supabase--migration para aplicar a migration');
console.log('2. Valide: SELECT version, length(script_content) as script_length, sha256 FROM agent_releases WHERE version = \'v3.10.9-PSCUSTOMOBJECT-FIX\'');
console.log('='.repeat(80));
