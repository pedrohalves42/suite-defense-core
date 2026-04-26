#!/usr/bin/env bun
/**
 * ADR-045 Enforcement: Prohibit direct fetch() usage in Edge Functions
 * Usage: bun scripts/lint-fetch.ts
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const IGNORE_DIRS = ['node_modules', 'dist', '__tests__', '.git'];
const ALLOWED_FILES = [
  'supabase/functions/_shared/fetch-with-timeout.ts', // Provider file
  'supabase/functions/_shared/http.ts',             // Provider file
];

let errorCount = 0;

function walk(dir: string) {
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
        // Simple regex to catch direct fetch calls, excluding comments
        if (line.includes('fetch(') && !line.trim().startsWith('//') && !line.trim().startsWith('*')) {
          console.error(`❌ Prohibited direct fetch() found at ${path}:${i + 1}`);
          console.error(`   Line: ${line.trim()}`);
          console.error(`   Recommendation: Use httpJson() or fetchWithTimeout() from _shared/http.ts\n`);
          errorCount++;
        }
      });
    }
  }
}

console.log('--- ADR-045: Fetch Enforcement Lint ---');
walk('supabase/functions');

if (errorCount > 0) {
  console.log(`Found ${errorCount} violations.`);
  process.exit(1);
} else {
  console.log('✅ No prohibited fetch() calls found.');
}
