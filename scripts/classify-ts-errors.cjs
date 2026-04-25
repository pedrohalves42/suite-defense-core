#!/usr/bin/env node
/**
 * scripts/classify-ts-errors.cjs
 */

const fs = require('fs');

let input = '';
process.stdin.on('data', data => {
  input += data;
});

process.stdin.on('end', () => {
  const lines = input.split('\n');
  const reports = [];

  const PATTERNS = [
    { name: 'JSON.parse/unknown', regex: /JSON\.parse|unknown|'any'/i },
    { name: 'Unions/Undefined/Null', regex: /is possibly 'undefined'|is possibly 'null'|not assignable to type/i },
    { name: 'Property Access', regex: /Property '.*' does not exist on type/i },
    { name: 'Argument/Params', regex: /Expected \d+ arguments|Argument of type/i },
    { name: 'Module/Import', regex: /Cannot find module|Relative import path|does not have a default export/i },
    { name: 'Database/Schema', regex: /type 'Database'|public\.|tables|views/i }
  ];

  let lastFile = '';
  
  for (const line of lines) {
    // Deno format: "Check file:///dev-server/supabase/functions/..."
    const checkMatch = line.match(/Check\s+file:\/\/\/dev-server\/(supabase\/functions\/[^\s]+)/);
    if (checkMatch) {
      lastFile = checkMatch[1];
    }

    // Deno Error format: "error: TS2339 [ERROR]: Property '...' does not exist... at file:///dev-server/path/to/file.ts:line:col"
    const errorMatch = line.match(/error:\s*TS(\d+).*?\]:\s*(.*)/);
    const locationMatch = line.match(/at\s+file:\/\/\/dev-server\/(supabase\/functions\/[^:]+)/);

    if (errorMatch) {
      const code = `TS${errorMatch[1]}`;
      const message = errorMatch[2];
      const file = locationMatch ? locationMatch[1] : lastFile;

      if (file) {
        const moduleMatch = file.match(/supabase\/functions\/([^/]+)/);
        const module = moduleMatch ? moduleMatch[1] : 'unknown';

        let category = 'Other/Misc';
        for (const p of PATTERNS) {
          if (p.regex.test(message)) {
            category = p.name;
            break;
          }
        }

        reports.push({ file, module, code, message, category });
      }
    }
  }

  if (reports.length === 0) {
    console.log('\n✅ No TypeScript errors detected in Edge Functions.');
    return;
  }

  const byModule = {};
  const byCategory = {};
  const fileCounts = {};

  reports.forEach(r => {
    byModule[r.module] = (byModule[r.module] || 0) + 1;
    byCategory[r.category] = (byCategory[r.category] || 0) + 1;
    fileCounts[r.file] = (fileCounts[r.file] || 0) + 1;
  });

  console.log('\n📊 --- TS ERROR AUDIT SUMMARY ---');
  
  console.log('\n🔥 TOP MODULES BY ERROR COUNT:');
  Object.entries(byModule).sort((a,b)=>b[1]-a[1]).forEach(([m,c]) => console.log(`  - ${m.padEnd(25)}: ${c}`));

  console.log('\n🧩 ERROR CLASSIFICATION:');
  Object.entries(byCategory).sort((a,b)=>b[1]-a[1]).forEach(([m,c]) => console.log(`  - ${m.padEnd(25)}: ${c}`));

  console.log('\n📍 HOTSPOT FILES (TOP 10):');
  Object.entries(fileCounts).sort((a,b)=>b[1]-a[1]).slice(0,10).forEach(([f,c]) => console.log(`  - ${c.toString().padEnd(4)} : ${f}`));

  console.log('\n🚀 RECOMMENDATION: Start with "JSON.parse/unknown" (use Zod) and "Unions" (add null checks).');
  console.log(`Total unique errors: ${reports.length}\n`);
});
