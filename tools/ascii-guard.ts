// tools/ascii-guard.ts
//
// ASCII guard for repository.
// Scans files and optionally rewrites them to remove non-ASCII characters
// (accents, emojis, smart quotes, etc).
//
// Usage:
//   npx tsx tools/ascii-guard.ts --check        # only report
//   npx tsx tools/ascii-guard.ts --fix          # rewrite files in-place
//
// IMPORTANT: The script itself is ASCII-only.

import * as fs from "fs";
import * as path from "path";

const ROOT = process.cwd();

// File extensions to scan (backend only - frontend can have accents for UX)
const TARGET_EXTS = [".ps1", ".psm1", ".sql", ".psd1"];

// Directories to ignore
const IGNORE_DIRS = new Set<string>([
  "node_modules",
  ".git",
  ".turbo",
  "dist",
  "build",
  ".next",
  ".vercel"
]);

const args = process.argv.slice(2);
const FIX_MODE = args.includes("--fix");
const CHECK_MODE = !FIX_MODE;

type Change = {
  file: string;
  line: number;
  column: number;
  original: string;
  replacement: string;
  codePoint: number;
};

const replacementsByCode: Record<number, string> = {
  // Portuguese accented letters
  0x00E1: "a", // a acute
  0x00E0: "a", // a grave
  0x00E2: "a", // a circumflex
  0x00E3: "a", // a tilde
  0x00C1: "A",
  0x00C0: "A",
  0x00C2: "A",
  0x00C3: "A",

  0x00E9: "e", // e acute
  0x00EA: "e", // e circumflex
  0x00C9: "E",
  0x00CA: "E",

  0x00ED: "i", // i acute
  0x00CD: "I",

  0x00F3: "o", // o acute
  0x00F4: "o", // o circumflex
  0x00F5: "o", // o tilde
  0x00D3: "O",
  0x00D4: "O",
  0x00D5: "O",

  0x00FA: "u", // u acute
  0x00DA: "U",

  0x00E7: "c", // c cedilla
  0x00C7: "C",

  0x00AA: "a", // feminine ordinal
  0x00BA: "o", // masculine ordinal

  // Common symbols used in logs
  0x2139: "[INFO] ",  // information symbol
  0x26A0: "[WARN] ",  // warning sign
  0x2705: "[OK] ",    // white heavy check mark
  0x274C: "[ERROR] ", // cross mark

  // Emojis used in previous versions of the agent / installer
  0x1F527: "[JOB] ",    // wrench
  0x1F4ED: "[POLL] ",   // mailbox with no mail
  0x1F4EC: "[MAIL] ",   // mailbox with mail
  0x1F4E6: "[PKG] ",    // package
  0x1F4C4: "[DOC] ",    // document
  0x1F50D: "[SCAN] "    // magnifying glass
};

// Files that intentionally use Unicode (emojis in user-facing messages)
const EMOJI_WHITELIST_PATTERNS = [
  "notification-router/handler-telegram",
  "notification-router/handler-whatsapp",
  "notification-router/handler-email",
  "notification-router/handler-security",
  "notification-router/handler-welcome",
  "submit-router/handlers/ransomware-indicator",
];

function isTargetFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  const normalized = filePath.replace(/\\/g, "/");

  // Skip files that intentionally use emoji in user-facing messages
  if (EMOJI_WHITELIST_PATTERNS.some((p) => normalized.includes(p))) {
    return false;
  }

  // Backend files: always validate
  if (TARGET_EXTS.includes(ext)) {
    return true;
  }
  
  // TypeScript files: only validate if in supabase/functions (Edge Functions)
  if (ext === ".ts" || ext === ".tsx") {
    return normalized.includes("supabase/functions/");
  }
  
  return false;
}

function walk(dir: string, files: string[] = []): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name), files);
    } else if (entry.isFile()) {
      const full = path.join(dir, entry.name);
      if (isTargetFile(full)) {
        files.push(full);
      }
    }
  }

  return files;
}

function sanitizeText(text: string, file: string): { clean: string; changes: Change[] } {
  let clean = "";
  const changes: Change[] = [];

  let line = 1;
  let column = 1;

  for (const ch of text) {
    if (ch === "\n") {
      clean += ch;
      line += 1;
      column = 1;
      continue;
    }

    const codePoint = ch.codePointAt(0)!;

    if (codePoint <= 0x7f) {
      clean += ch;
      column += 1;
      continue;
    }

    const replacement = replacementsByCode[codePoint] ?? "?";

    changes.push({
      file,
      line,
      column,
      original: ch,
      replacement,
      codePoint
    });

    clean += replacement;
    column += 1;
  }

  return { clean, changes };
}

function main(): void {
  const files = walk(ROOT);
  const allChanges: Change[] = [];

  for (const file of files) {
    const original = fs.readFileSync(file, "utf8");
    const { clean, changes } = sanitizeText(original, file);

    if (changes.length === 0) continue;

    allChanges.push(...changes);

    if (FIX_MODE) {
      fs.writeFileSync(file, clean, "utf8");
    }
  }

  if (allChanges.length === 0) {
    console.log("ASCII guard: no non-ASCII characters found in target files.");
    process.exit(0);
  }

  console.log("ASCII guard: non-ASCII characters found:");
  for (const change of allChanges) {
    const hex = "U+" + change.codePoint.toString(16).toUpperCase().padStart(4, "0");
    console.log(
      `  ${change.file}:${change.line}:${change.column} ` +
      `code=${hex} original='${change.original}' replacement='${change.replacement}'`
    );
  }

  if (CHECK_MODE) {
    console.error(
      `\nASCII guard: found ${allChanges.length} non-ASCII occurrences. ` +
      `Run with --fix to rewrite files, or fix manually.`
    );
    process.exit(1);
  } else {
    console.log(
      `\nASCII guard: fixed ${allChanges.length} occurrences and rewrote files in-place.`
    );
    process.exit(0);
  }
}

main();
