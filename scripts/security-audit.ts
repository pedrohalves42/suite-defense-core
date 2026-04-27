#!/usr/bin/env bun
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

// Padrões de segredos comuns (Regex simplificados para exemplo)
const SECRET_PATTERNS = [
  { name: "Generic Secret/Key", regex: /(?:secret|key|password|token|auth|pwd)[-_]?(?:key|secret|token)?\s*[:=]\s*["'][a-zA-Z0-9/+=]{16,}["']/gi },
  { name: "Private Key", regex: /-----BEGIN (?:RSA|OPENSSH|EC|PGP) PRIVATE KEY-----/g },
  { name: "AWS Access Key", regex: /AKIA[0-9A-Z]{16}/g },
  { name: "Generic Bearer Token", regex: /Bearer\s+[a-zA-Z0-9\-._~+/]+=*/g },
  { name: "Hardcoded Supabase Service Role", regex: /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+/g } // JWT detect
];

const EXCLUDED_DIRS = ["node_modules", ".git", "dev-dist", "playwright-report", "dist", "docs", "e2e", "tests", "__tests__", "supabase/migrations_archived", "public/agent-scripts", "supabase/functions/_shared/agent-scripts"];
const EXCLUDED_FILES = ["package-lock.json", "bun.lockb", "src/integrations/supabase/types.ts", "database.types.ts", "vite.config.ts", ".env.example", ".env.test.example", ".env", "ApiKeys.tsx", "integracoes.ts", "constants.ts", "security-audit.ts"];

function scanFile(filePath: string) {
  const content = readFileSync(filePath, "utf-8");
  const violations: string[] = [];

  for (const pattern of SECRET_PATTERNS) {
    const matches = content.match(pattern.regex);
    if (matches) {
      violations.push(`${pattern.name} found: ${matches.length} occurrences`);
    }
  }

  return violations;
}

function walk(dir: string, callback: (path: string) => void) {
  readdirSync(dir).forEach(file => {
    const filePath = join(dir, file);
    if (EXCLUDED_DIRS.some(d => filePath.includes(d))) return;
    if (EXCLUDED_FILES.some(f => filePath.endsWith(f))) return;

    const stats = statSync(filePath);
    if (stats.isDirectory()) {
      walk(filePath, callback);
    } else if (stats.isFile()) {
      callback(filePath);
    }
  });
}

console.log("🚀 Starting Secrets Scanning Audit...");
let totalViolations = 0;

walk(".", (filePath) => {
  try {
    const violations = scanFile(filePath);
    if (violations.length > 0) {
      console.error(`❌ Security Violation in ${filePath}:`);
      violations.forEach(v => console.error(`   - ${v}`));
      totalViolations += violations.length;
    }
  } catch (e) {
    // Skip binary files or unreadable files
  }
});

if (totalViolations > 0) {
  console.error(`\n🚨 Audit Failed: ${totalViolations} secrets detected. Fix them before building!`);
  process.exit(1);
} else {
  console.log("\n✅ Audit Passed: No secrets detected in the codebase.");
  process.exit(0);
}
