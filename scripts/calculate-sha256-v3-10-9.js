#!/usr/bin/env node
import fs from 'fs';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const scriptPath = path.join(__dirname, '..', 'public', 'agent-scripts', 'cybershield-agent-windows-v3.ps1');
const content = fs.readFileSync(scriptPath, 'utf8');
const sha256 = crypto.createHash('sha256').update(content, 'utf8').digest('hex');

console.log('SHA256 para v3.10.9-PSCUSTOMOBJECT-FIX:');
console.log(sha256);
console.log('\nConteudo do script tem', content.length, 'caracteres');
