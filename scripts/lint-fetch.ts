#!/usr/bin/env bun
/**
 * ADR-045 Enforcement: Prohibit direct fetch() usage in Edge Functions
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join } from 'path';

const IGNORE_DIRS = ['node_modules', 'dist', '__tests__', '.git'];
const ALLOWED_FILES = [
  'supabase/functions/_shared/fetch-with-timeout.ts',
  'supabase/functions/_shared/http.ts',
];

let errorCount = 0;

function walk(dir: string) {
  if (!existsSync(dir)) return;
  const files = readdirSync(dir);
  for (const file of files) {
    const path = join(dir, file);
    if (IGNORE_DIRS.some(d => path.includes(d))) continue;
    if (ALLOWED_FILES.includes(path)) continue;

    const stats = statSync(path);
    if (stats.isDirectory()) {
      walk(path);
    } else if (path.endsWith('.ts') || path.endsWith('.tsx')) {
      const content = readFileSync(path, 'utf8');
      const lines = content.split('\n');
      
      lines.forEach((line, i) => {
        if (line.includes('fetch(') && !line.trim().startsWith('//') && !line.trim().startsWith('*')) {
          console.error(`❌ Prohibited direct fetch() found at ${path}:${i + 1}`);
          errorCount++;
        }
      });
    }
  }
}

walk('supabase/functions');
if (errorCount > 0) process.exit(1);
console.log('✅ No prohibited fetch() calls found.');
