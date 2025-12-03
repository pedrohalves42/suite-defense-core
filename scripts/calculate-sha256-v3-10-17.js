#!/usr/bin/env node
import fs from 'fs';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ler o arquivo PowerShell diretamente
const ps1Path = path.join(__dirname, '..', 'public', 'agent-scripts', 'cybershield-agent-windows-v3.ps1');
const scriptContent = fs.readFileSync(ps1Path, 'utf8');

// Calcular SHA256 SEM BOM (padrao para v3.10.12+)
const sha256WithoutBOM = crypto.createHash('sha256').update(scriptContent, 'utf8').digest('hex');

console.log('=== SHA256 Calculation Results ===\n');
console.log('Version: v3.10.17-SCAN-CAMELCASE-FIX');
console.log('Script size:', scriptContent.length, 'caracteres\n');

console.log('SHA256 WITHOUT BOM (standard for v3.10.12+):');
console.log(sha256WithoutBOM);
console.log('\n✅ Use este SHA256 para registrar v3.10.17 no agent_releases\n');

console.log('Primeiras 200 chars do script:');
console.log(scriptContent.substring(0, 200));
