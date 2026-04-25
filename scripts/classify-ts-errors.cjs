#!/usr/bin/env node
/**
 * scripts/classify-ts-errors.cjs
 * Hardened parser for Deno/TS error output.
 */

const fs = require('fs');

let input = '';
process.stdin.on('data', data => {
  input += data;
});

process.stdin.on('end', () => {
  // Strip ANSI color codes
  const cleanInput = input.replace(/\x1B\[[0-9;]*[mK]/g, '');
  const lines = cleanInput.split('\n');
  const reports = [];

  const PATTERNS = [
    { name: 'JSON.parse/unknown/any', regex: /implicitly has an 'any' type|unknown|JSON\.parse/i },
    { name: 'Unions/Null/Undefined', regex: /is possibly 'undefined'|is possibly 'null'|not assignable to type/i },
    { name: 'Property Access', regex: /Property '.*' does not exist on type/i },
    { name: 'Argument/Params', regex: /Expected \d+ arguments|Argument of type/i },
    { name: 'Module/Import', regex: /Cannot find module|Relative import path|does not have a default export/i }
  ];

  let currentError = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Start of an error block: "TS2339 [ERROR]: Property '...' does not exist..."
    const errorStartMatch = line.match(/^TS(\d+)\s+\[ERROR\]:\s*(.*)/);
    if (errorStartMatch) {
      currentError = {
        code: `TS${errorStartMatch[1]}`,
        message: errorStartMatch[2],
        file: 'unknown',
        module: 'unknown'
      };
      
      // Look ahead for "at file:///dev-server/..."
      for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
        const locLine = lines[j].trim();
        const locMatch = locLine.match(/at\s+file:\/\/\/dev-server\/(supabase\/functions\/([^:]+))/);
        if (locMatch) {
          currentError.file = locMatch[1];
          currentError.module = locMatch[2].split('/')[0];
          break;
        }
      }

      if (currentError.file !== 'unknown') {
        let category = 'Other/Misc';
        for (const p of PATTERNS) {
          if (p.regex.test(currentError.message)) {
            category = p.name;
            break;
          }
        }
        currentError.category = category;
        reports.push(currentError);
      }
      currentError = null;
    }
  }

  if (reports.length === 0) {
    console.log('\n✅ No TypeScript errors detected in Edge Functions output.');
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

  console.log('\n🚀 RECOMMENDATION: Tackle "JSON.parse/unknown/any" and "Unions" hotspots.');
  console.log(`Total unique errors found: ${reports.length}\n`);
});
