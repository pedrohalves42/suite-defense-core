/**
 * reliability-adoption-inventory.ts — R4.5
 *
 * Automated adoption scanner for the R4 reliability runtime.
 *
 * Scans every `supabase/functions/<name>/index.ts` and reports, per wrapper,
 * which R4 primitives each function has opted into. The wrappers themselves
 * already route through `composePipeline` (R4 Wave 1 — identity), so this
 * scan measures OPT-IN adoption, not wiring.
 *
 * Signals detected per function:
 *   - wrapper       serveTenant | servePublic | serveInternal | serveAgent | serveHoneypot | (none)
 *   - retry         `withRetry(` or `retry:` stage passed to composePipeline
 *   - breaker       `CircuitBreaker(` / `.execute(` or `breaker:` stage
 *   - timeout       `withTimeout(` OR `handlerTimeoutMs` explicitly set OR
 *                   default handler timeout applies (serveTenant only)
 *   - idempotency   `withIdempotency(` or `idempotency:` stage
 *
 * Output:
 *   - Human table on stdout
 *   - `docs/audits/active/r4-5-adoption-inventory.generated.md` (Markdown)
 *   - `docs/audits/active/r4-5-adoption-inventory.generated.json` (machine)
 *
 * Usage (from repo root):
 *   deno run --allow-read --allow-write scripts/reliability-adoption-inventory.ts
 *
 * No runtime side effects. Pure static scan. Safe to run in CI.
 */

const FUNCTIONS_DIR = 'supabase/functions';
const OUT_MD = 'docs/audits/active/r4-5-adoption-inventory.generated.md';
const OUT_JSON = 'docs/audits/active/r4-5-adoption-inventory.generated.json';

type Wrapper =
  | 'serveTenant'
  | 'servePublic'
  | 'serveInternal'
  | 'serveAgent'
  | 'serveHoneypot'
  | 'none';

interface FunctionAdoption {
  name: string;
  wrapper: Wrapper;
  retry: boolean;
  breaker: boolean;
  timeout: boolean;
  idempotency: boolean;
}

const WRAPPER_PATTERNS: Array<[Wrapper, RegExp]> = [
  ['serveHoneypot', /\bserveHoneypot\s*\(/],
  ['serveAgent', /\bserveAgent\s*\(/],
  ['serveInternal', /\bserveInternal\s*\(/],
  ['serveTenant', /\bserveTenant\s*\(/],
  ['servePublic', /\bservePublic\s*\(/],
];

function detectWrapper(src: string): Wrapper {
  for (const [name, re] of WRAPPER_PATTERNS) {
    if (re.test(src)) return name;
  }
  return 'none';
}

function detectRetry(src: string): boolean {
  return /\bwithRetry\s*\(/.test(src) || /\bretry\s*:/.test(src);
}

function detectBreaker(src: string): boolean {
  // Matches R4 primitive; excludes the domain-specific `ai-circuit-breaker`.
  return /\bnew\s+CircuitBreaker\s*\(/.test(src)
      || /\bbreaker\s*:/.test(src)
      || /from\s+['"][^'"]*reliability\/circuit-breaker/.test(src);
}

function detectTimeout(src: string, wrapper: Wrapper): boolean {
  if (/\bwithTimeout\s*\(/.test(src)) return true;
  if (/\bhandlerTimeoutMs\s*:/.test(src)) return true;
  if (/\btimeout\s*:\s*\(/.test(src)) return true;
  // serveTenant applies a default handler timeout of 25s.
  if (wrapper === 'serveTenant') return true;
  return false;
}

function detectIdempotency(src: string): boolean {
  return /\bwithIdempotency\s*\(/.test(src) || /\bidempotency\s*:/.test(src);
}

async function scanFunction(name: string): Promise<FunctionAdoption | null> {
  const path = `${FUNCTIONS_DIR}/${name}/index.ts`;
  let src: string;
  try {
    src = await Deno.readTextFile(path);
  } catch {
    return null; // no index.ts
  }
  const wrapper = detectWrapper(src);
  return {
    name,
    wrapper,
    retry: detectRetry(src),
    breaker: detectBreaker(src),
    timeout: detectTimeout(src, wrapper),
    idempotency: detectIdempotency(src),
  };
}

async function listFunctions(): Promise<string[]> {
  const skip = new Set(['_shared', '__tests__']);
  const names: string[] = [];
  for await (const entry of Deno.readDir(FUNCTIONS_DIR)) {
    if (!entry.isDirectory) continue;
    if (skip.has(entry.name)) continue;
    names.push(entry.name);
  }
  names.sort();
  return names;
}

interface CoverageRatios {
  retry: number;
  breaker: number;
  timeout: number;
  idempotency: number;
}

interface WrapperRollup {
  wrapper: Wrapper;
  functions: number;
  retry: number;
  breaker: number;
  timeout: number;
  idempotency: number;
  coverage: CoverageRatios;
  status: 'None' | 'Partial' | 'Good' | 'Full';
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function rollup(adoptions: FunctionAdoption[]): WrapperRollup[] {
  const byWrapper = new Map<Wrapper, FunctionAdoption[]>();
  for (const a of adoptions) {
    const list = byWrapper.get(a.wrapper) ?? [];
    list.push(a);
    byWrapper.set(a.wrapper, list);
  }
  const rows: WrapperRollup[] = [];
  for (const [wrapper, list] of byWrapper) {
    const retry = list.filter(a => a.retry).length;
    const breaker = list.filter(a => a.breaker).length;
    const timeout = list.filter(a => a.timeout).length;
    const idempotency = list.filter(a => a.idempotency).length;
    const n = list.length;
    const coverage: CoverageRatios = {
      retry: n === 0 ? 0 : round2(retry / n),
      breaker: n === 0 ? 0 : round2(breaker / n),
      timeout: n === 0 ? 0 : round2(timeout / n),
      idempotency: n === 0 ? 0 : round2(idempotency / n),
    };
    const total = n * 4;
    const covered = retry + breaker + timeout + idempotency;
    const ratio = total === 0 ? 0 : covered / total;
    const status: WrapperRollup['status'] =
      ratio === 0 ? 'None' : ratio < 0.5 ? 'Partial' : ratio < 1 ? 'Good' : 'Full';
    rows.push({ wrapper, functions: n, retry, breaker, timeout, idempotency, coverage, status });
  }
  rows.sort((a, b) => a.wrapper.localeCompare(b.wrapper));
  return rows;
}

async function resolveCommit(): Promise<string | null> {
  // Best-effort. Scanner must not fail if git is unavailable or repo is shallow.
  try {
    const cmd = new Deno.Command('git', {
      args: ['rev-parse', 'HEAD'],
      stdout: 'piped',
      stderr: 'null',
    });
    const { code, stdout } = await cmd.output();
    if (code !== 0) return null;
    const sha = new TextDecoder().decode(stdout).trim();
    return sha || null;
  } catch {
    return null;
  }
}

const SCHEMA_VERSION = 1;
const INVENTORY_TYPE = 'edge-function-adoption';
const PROJECT = 'backend-runtime';

function renderMarkdown(rows: WrapperRollup[], adoptions: FunctionAdoption[]): string {
  const totalFns = adoptions.length;
  const now = new Date().toISOString();
  const header = [
    '# R4.5 — Reliability Adoption Inventory (generated)',
    '',
    `Generated: ${now}`,
    `Total edge functions scanned: ${totalFns}`,
    '',
    '> Static scan. Measures OPT-IN adoption of R4 primitives per wrapper.',
    "> The wrappers themselves route through `composePipeline` since R4 Wave 1,",
    '> so this report does NOT measure runtime wiring — only per-function opt-in.',
    '',
    '## Rollup by wrapper',
    '',
    '| Wrapper | Functions | Retry | Breaker | Timeout | Idempotency | Status |',
    '| --- | ---: | ---: | ---: | ---: | ---: | --- |',
  ];
  for (const r of rows) {
    header.push(
      `| ${r.wrapper} | ${r.functions} | ${r.retry} | ${r.breaker} | ${r.timeout} | ${r.idempotency} | ${r.status} |`,
    );
  }
  header.push('', '## Per-function detail', '');
  header.push('| Function | Wrapper | Retry | Breaker | Timeout | Idempotency |');
  header.push('| --- | --- | :-: | :-: | :-: | :-: |');
  const y = (b: boolean) => (b ? '✅' : '·');
  for (const a of adoptions) {
    header.push(`| ${a.name} | ${a.wrapper} | ${y(a.retry)} | ${y(a.breaker)} | ${y(a.timeout)} | ${y(a.idempotency)} |`);
  }
  header.push('');
  return header.join('\n');
}

function renderConsole(rows: WrapperRollup[]): void {
  console.log('R4.5 Adoption Inventory');
  console.log('=======================');
  const w = (s: string, n: number) => s.padEnd(n);
  console.log(w('Wrapper', 16) + w('Fns', 6) + w('Retry', 8) + w('Breaker', 10) + w('Timeout', 10) + w('Idem', 8) + 'Status');
  for (const r of rows) {
    console.log(
      w(r.wrapper, 16) +
      w(String(r.functions), 6) +
      w(String(r.retry), 8) +
      w(String(r.breaker), 10) +
      w(String(r.timeout), 10) +
      w(String(r.idempotency), 8) +
      r.status,
    );
  }
}

async function main(): Promise<void> {
  const names = await listFunctions();
  const adoptions: FunctionAdoption[] = [];
  for (const name of names) {
    const a = await scanFunction(name);
    if (a) adoptions.push(a);
  }
  const rows = rollup(adoptions);
  renderConsole(rows);

  const envelope = {
    project: PROJECT,
    inventory_type: INVENTORY_TYPE,
    schema_version: SCHEMA_VERSION,
    generated_at: new Date().toISOString(),
    commit: await resolveCommit(),
    total_functions: adoptions.length,
    rollup: rows,
    functions: adoptions,
  };

  await Deno.writeTextFile(OUT_MD, renderMarkdown(rows, adoptions));
  await Deno.writeTextFile(OUT_JSON, JSON.stringify(envelope, null, 2));
  console.log(`\nWrote ${OUT_MD}`);
  console.log(`Wrote ${OUT_JSON}`);
}

if (import.meta.main) {
  await main();
}
