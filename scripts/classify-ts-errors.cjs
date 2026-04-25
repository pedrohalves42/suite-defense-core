#!/usr/bin/env node
/**
 * scripts/classify-ts-errors.js
 * 
 * Classifies and groups TypeScript/Deno errors by pattern and module.
 * Designed to identify technical debt hotspots for systematic remediation.
 */

const fs = require('fs');
const path = require('path');

// Read from stdin (output of deno check or tsc)
let input = '';
process.stdin.on('data', data => {
  input += data;
});

process.stdin.on('end', () => {
  const lines = input.split('\n');
  const reports = [];

  // Patterns for classification
  const PATTERNS = [
    { name: 'JSON.parse/unknown', regex: /JSON\.parse|unknown|any/i },
    { name: 'Unions/Undefined', regex: /is possibly 'undefined'|is possibly 'null'|not assignable to type/i },
    { name: 'Property Access', regex: /Property '.*' does not exist on type/i },
    { name: 'Argument Count/Type', regex: /Expected \d+ arguments, but got \d+|Argument of type '.*' is not assignable/i },
    { name: 'Module/Import', regex: /Cannot find module|Relative import path|does not have a default export/i },
    { name: 'Async/Promise', regex: /'await' has no effect|is not a function|not assignable to parameter of type 'Promise/i },
    { name: 'Database/Schema', regex: /type 'Database'|public\.|tables|views/i }
  ];

  let currentFile = '';
  
  for (const line of lines) {
    // Match "Check file:///path/to/file.ts" or "error: TS2339 [ERROR]: ... at file:///path/to/file.ts:line:col"
    const fileMatch = line.match(/(?:Check|at)\s+file:\/\/\/dev-server\/(supabase\/functions\/[^:]+)/);
    if (fileMatch) {
      currentFile = fileMatch[1];
    }

    const errorMatch = line.match(/error: TS(\d+).*?:\s*(.*)/);
    if (errorMatch && currentFile) {
      const errorCode = errorMatch[1];
      const message = errorMatch[2];
      
      // Determine module (e.g., _shared, api-gateway, heartbeat)
      const moduleMatch = currentFile.match(/supabase\/functions\/([^/]+)/);
      const module = moduleMatch ? moduleMatch[1] : 'unknown';

      // Classify
      let category = 'Other/Misc';
      for (const p of PATTERNS) {
        if (p.regex.test(message)) {
          category = p.name;
          break;
        }
      }

      reports.push({
        file: currentFile,
        module,
        code: `TS${errorCode}`,
        message,
        category
      });
    }
  }

  // Grouping
  const byModule = {};
  const byCategory = {};

  reports.forEach(r => {
    byModule[r.module] = (byModule[r.module] || 0) + 1;
    byCategory[r.category] = (byCategory[r.category] || 0) + 1;
  });

  // Output Summary
  console.log('\n📊 --- TS ERROR AUDIT SUMMARY ---');
  
  console.log('\n🔥 TOP MODULES BY ERROR COUNT:');
  Object.entries(byModule)
    .sort((a, b) => b[1] - a[1])
    .forEach(([mod, count]) => console.log(`  - ${mod.padEnd(25)}: ${count}`));

  console.log('\n🧩 ERROR CLASSIFICATION:');
  Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .forEach(([cat, count]) => console.log(`  - ${cat.padEnd(25)}: ${count}`));

  console.log('\n📍 HOTSPOT FILES (TOP 10):');
  const fileCounts = {};
  reports.forEach(r => fileCounts[r.file] = (fileCounts[r.file] || 0) + 1);
  Object.entries(fileCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([file, count]) => console.log(`  - ${count.toString().padEnd(4)} : ${file}`));

  console.log('\n🚀 RECOMMENDATION: Tackle "JSON.parse/unknown" and "Unions/Undefined" first via Zod validation.');
  console.log(`Total unique errors found: ${reports.length}\n`);
});
