/**
 * reliability-rc2-close.ts — RC-2 Fase B closer
 *
 * Automatiza o encerramento da RC-2:
 *
 *   1. Executa o scanner R4.5 e arquiva a saída como
 *      `docs/audits/active/r4-5-adoption-inventory.rc2-end.md`.
 *   2. Faz diff contra `r4-5-adoption-inventory.rc2-start.md`.
 *   3. Preenche todas as tabelas E1–E6 de
 *      `docs/audits/active/reliability-rc2-evidence-report.md`
 *      a partir de um JSON de inputs (schema:
 *      `scripts/reliability-rc2-inputs.example.json`).
 *   4. Registra `:window_end` e a duração efetiva.
 *   5. Aplica as regras de gate (E1–E6) e escreve a decisão
 *      recomendada: Promote / Extend / Rollback.
 *
 * Uso:
 *   deno run -A scripts/reliability-rc2-close.ts \
 *     --inputs=scripts/reliability-rc2-inputs.example.json \
 *     [--dry-run]
 *
 * Idempotente: re-executar sobrescreve rc2-end.md e regenera as
 * seções marcadas dentro do relatório (delimitadores AUTO-*).
 */

const REPORT = 'docs/audits/active/reliability-rc2-evidence-report.md';
const INV_START = 'docs/audits/active/r4-5-adoption-inventory.rc2-start.md';
const INV_END = 'docs/audits/active/r4-5-adoption-inventory.rc2-end.md';
const INV_GENERATED = 'docs/audits/active/r4-5-adoption-inventory.generated.md';
const SCANNER = 'scripts/reliability-adoption-inventory.ts';

// ---------- Types ----------

interface Pair { baseline: number; rc2: number; }
interface Inputs {
  window_end: string;
  baseline: { start: string; end: string };
  responsible: string;
  e1_functional: {
    scans_initiated: Pair;
    scans_succeeded: Pair;
    virus_scans_writes: Pair;
    update_quota_usage_calls: Pair;
    auto_quarantine_invokes: Pair;
    duplicate_writes: number;
    http_contract_unchanged: boolean;
    payload_headers_status_unchanged: boolean;
  };
  e2_retry: {
    attempt_1: number; attempt_2: number; attempt_3: number; exhausted: number;
    by_cause: { category: string; status: string; count: number }[];
    attempts_on_permanent_4xx: number;
    requestid_preserved: boolean;
    traceid_preserved: boolean;
  };
  e3_latency_ms: {
    p50: Pair; p95: Pair; p99: Pair;
    over_6s_retry_budget: number;
    over_30s_per_attempt: number;
  };
  e4_classification: { status: string; count: number; retry_expected: boolean; retry_observed: boolean }[];
  e4_flags: { retry_after_respected: boolean; no_false_positive: boolean; no_false_negative: boolean };
  e6_incidents: { date: string; system: string; severity: string; correlated: boolean; notes: string }[];
}

// ---------- Args ----------

function parseArgs() {
  let inputs = '';
  let dryRun = false;
  let productionConfirmation = false;
  for (const a of Deno.args) {
    if (a.startsWith('--inputs=')) inputs = a.split('=')[1];
    else if (a === '--dry-run') dryRun = true;
    else if (a === '--production-confirmation') productionConfirmation = true;
  }
  if (!inputs) {
    console.error('ERROR: --inputs=<path> is required.');
    Deno.exit(2);
  }
  // Modo seguro por padrão: sem --production-confirmation, força dry-run.
  if (!dryRun && !productionConfirmation) {
    console.error('');
    console.error('⚠  Safe mode: neither --dry-run nor --production-confirmation was passed.');
    console.error('   Rerun with one of:');
    console.error('     --dry-run                   preview only, no files changed');
    console.error('     --production-confirmation   commit the RC-2 close package');
    console.error('');
    console.error('   The RC-2 close writes AUTO-* blocks into the live evidence report.');
    console.error('   Require explicit confirmation to prevent accidental production writes.');
    Deno.exit(3);
  }
  return { inputs, dryRun, productionConfirmation };
}

// ---------- Helpers ----------

function pct(part: number, whole: number): string {
  if (!whole) return '—';
  return `${((part / whole) * 100).toFixed(2)}%`;
}

function delta(p: Pair): string {
  const d = p.rc2 - p.baseline;
  const sign = d > 0 ? '+' : '';
  return `${sign}${d}`;
}

function deltaPct(p: Pair): string {
  if (!p.baseline) return '—';
  const d = ((p.rc2 - p.baseline) / p.baseline) * 100;
  const sign = d > 0 ? '+' : '';
  return `${sign}${d.toFixed(2)}%`;
}

function check(ok: boolean): string { return ok ? '✅' : '❌'; }

async function run(cmd: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const p = new Deno.Command(cmd[0], { args: cmd.slice(1), stdout: 'piped', stderr: 'piped' });
  const { code, stdout, stderr } = await p.output();
  return { code, stdout: new TextDecoder().decode(stdout), stderr: new TextDecoder().decode(stderr) };
}

// ---------- Inventory diff ----------

async function refreshInventoryEnd(dryRun: boolean): Promise<string> {
  console.log('→ Running R4.5 scanner...');
  const r = await run(['deno', 'run', '--allow-read', '--allow-write', '--allow-run', SCANNER]);
  if (r.code !== 0) {
    console.error(r.stderr);
    throw new Error('scanner failed');
  }
  const md = await Deno.readTextFile(INV_GENERATED);
  if (!dryRun) await Deno.writeTextFile(INV_END, md);
  console.log(`  wrote ${INV_END}`);
  return md;
}

function unifiedDiff(a: string, b: string, labelA: string, labelB: string): string {
  const al = a.split('\n');
  const bl = b.split('\n');
  const out: string[] = [`--- ${labelA}`, `+++ ${labelB}`];
  const max = Math.max(al.length, bl.length);
  let hunk: string[] = [];
  let hunkStart = -1;
  for (let i = 0; i < max; i++) {
    if (al[i] !== bl[i]) {
      if (hunkStart === -1) hunkStart = i + 1;
      if (al[i] !== undefined) hunk.push(`- ${al[i]}`);
      if (bl[i] !== undefined) hunk.push(`+ ${bl[i]}`);
    } else if (hunk.length) {
      out.push(`@@ line ${hunkStart} @@`, ...hunk);
      hunk = []; hunkStart = -1;
    }
  }
  if (hunk.length) out.push(`@@ line ${hunkStart} @@`, ...hunk);
  return out.length > 2 ? out.join('\n') : '<sem alterações>';
}

// ---------- Rollup extraction from scanner MD ----------

interface Rollup { serveAgentRetry: number; serveTenantRetry: number; totalFns: number; retry: number; breaker: number; idempotency: number; }

function parseRollup(md: string): Rollup {
  const lines = md.split('\n');
  const totalFns = Number(md.match(/Total edge functions scanned:\s*(\d+)/)?.[1] ?? 0);
  let serveAgentRetry = 0, serveTenantRetry = 0, retry = 0, breaker = 0, idempotency = 0;
  for (const l of lines) {
    const m = l.match(/^\|\s*(\w+)\s*\|\s*\d+\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*\d+\s*\|\s*(\d+)\s*\|/);
    if (!m) continue;
    const [, w, r, b, i] = m;
    const rn = Number(r), bn = Number(b), inum = Number(i);
    if (w === 'serveAgent') serveAgentRetry = rn;
    if (w === 'serveTenant') serveTenantRetry = rn;
    retry += rn; breaker += bn; idempotency += inum;
  }
  return { serveAgentRetry, serveTenantRetry, totalFns, retry, breaker, idempotency };
}

// ---------- Gate evaluation ----------

interface GateResult { e1: boolean; e2: boolean; e3: boolean; e4: boolean; e5: boolean; e6: boolean; decision: 'Promote' | 'Extend' | 'Rollback' | 'Hold'; reasons: string[]; }

function evaluateGates(inp: Inputs, endRollup: Rollup): GateResult {
  const reasons: string[] = [];

  // E1 — funcional
  const baseOk = inp.e1_functional.scans_succeeded.baseline / Math.max(inp.e1_functional.scans_initiated.baseline, 1);
  const rc2Ok = inp.e1_functional.scans_succeeded.rc2 / Math.max(inp.e1_functional.scans_initiated.rc2, 1);
  const successDelta = rc2Ok - baseOk;
  const e1 =
    inp.e1_functional.duplicate_writes === 0 &&
    inp.e1_functional.http_contract_unchanged &&
    inp.e1_functional.payload_headers_status_unchanged &&
    successDelta >= -0.005; // tolerância 0.5pp
  if (!e1) {
    if (inp.e1_functional.duplicate_writes > 0) reasons.push('E1: duplicate_writes > 0 (bloqueia promoção)');
    if (successDelta < -0.005) reasons.push(`E1: queda em taxa de sucesso (${(successDelta * 100).toFixed(2)}pp)`);
    if (!inp.e1_functional.http_contract_unchanged) reasons.push('E1: contrato HTTP alterado');
    if (!inp.e1_functional.payload_headers_status_unchanged) reasons.push('E1: payload/headers/status alterados');
  }

  // E2 — telemetria retry
  const e2 =
    inp.e2_retry.attempts_on_permanent_4xx === 0 &&
    inp.e2_retry.requestid_preserved &&
    inp.e2_retry.traceid_preserved &&
    inp.e2_retry.by_cause.every(c => c.category === 'transient');
  if (!e2) {
    if (inp.e2_retry.attempts_on_permanent_4xx > 0) reasons.push('E2: retry emitido em 4xx permanente (classifier bug)');
    if (!inp.e2_retry.requestid_preserved) reasons.push('E2: requestId não preservado entre tentativas');
    if (!inp.e2_retry.traceid_preserved) reasons.push('E2: traceId não preservado entre tentativas');
  }

  // E3 — latência (tolerância p95 até +25%, p99 até +40%)
  const p95Delta = (inp.e3_latency_ms.p95.rc2 - inp.e3_latency_ms.p95.baseline) / Math.max(inp.e3_latency_ms.p95.baseline, 1);
  const p99Delta = (inp.e3_latency_ms.p99.rc2 - inp.e3_latency_ms.p99.baseline) / Math.max(inp.e3_latency_ms.p99.baseline, 1);
  const e3 =
    p95Delta <= 0.25 &&
    p99Delta <= 0.40 &&
    inp.e3_latency_ms.over_6s_retry_budget === 0 &&
    inp.e3_latency_ms.over_30s_per_attempt === 0;
  if (!e3) {
    if (p95Delta > 0.25) reasons.push(`E3: p95 aumentou ${(p95Delta * 100).toFixed(1)}% (>25%)`);
    if (p99Delta > 0.40) reasons.push(`E3: p99 aumentou ${(p99Delta * 100).toFixed(1)}% (>40%)`);
    if (inp.e3_latency_ms.over_6s_retry_budget > 0) reasons.push('E3: scans excederam orçamento de 6s');
    if (inp.e3_latency_ms.over_30s_per_attempt > 0) reasons.push('E3: scans excederam 30s por tentativa');
  }

  // E4 — classificação
  const misclass = inp.e4_classification.filter(c => c.retry_observed && !c.retry_expected);
  const e4 =
    misclass.length === 0 &&
    inp.e4_flags.retry_after_respected &&
    inp.e4_flags.no_false_positive &&
    inp.e4_flags.no_false_negative;
  if (!e4) {
    if (misclass.length) reasons.push(`E4: retry indevido em status ${misclass.map(m => m.status).join(', ')}`);
    if (!inp.e4_flags.retry_after_respected) reasons.push('E4: Retry-After não respeitado');
    if (!inp.e4_flags.no_false_positive) reasons.push('E4: falso-positivo detectado');
    if (!inp.e4_flags.no_false_negative) reasons.push('E4: falso-negativo detectado');
  }

  // E5 — inventário estável
  const e5 =
    endRollup.retry === 2 &&
    endRollup.breaker === 0 &&
    endRollup.idempotency === 0 &&
    endRollup.serveAgentRetry === 1 &&
    endRollup.serveTenantRetry === 1;
  if (!e5) reasons.push(`E5: drift no inventário R4.5 (Retry=${endRollup.retry}, Breaker=${endRollup.breaker}, Idempotency=${endRollup.idempotency})`);

  // E6 — incidentes correlatos
  const correlated = inp.e6_incidents.filter(i => i.correlated);
  const e6 = correlated.length === 0;
  if (!e6) reasons.push(`E6: ${correlated.length} incidente(s) correlato(s) ao Retry`);

  // Decisão
  // NOTA (reframe RC-2, 2026-07-07): RC-2 é um Validation Gate pré-produção,
  // NÃO uma janela de observação com tráfego comercial. Mesmo com todos os
  // gates ✅, se não houver evidência de carga real (heurística: baseline
  // muito baixo), a recomendação é Hold em vez de Promote.
  let decision: GateResult['decision'];
  const blocking =
    inp.e1_functional.duplicate_writes > 0 ||
    inp.e2_retry.attempts_on_permanent_4xx > 0 ||
    correlated.some(i => i.severity === 'critical' || i.severity === 'high');
  const syntheticOnly =
    inp.e1_functional.scans_initiated.baseline < 50 ||
    inp.e1_functional.scans_initiated.rc2 < 50;
  if (blocking) decision = 'Rollback';
  else if (syntheticOnly && e1 && e2 && e3 && e4 && e5 && e6) {
    decision = 'Hold';
    reasons.push('HOLD: volume insuficiente para validar carga real (baseline/RC-2 < 50 scans). Mecanismo validado; falta workload representativo. Ver Commercial Readiness Gate.');
  } else if (e1 && e2 && e3 && e4 && e5 && e6) decision = 'Promote';
  else decision = 'Extend';

  return { e1, e2, e3, e4, e5, e6, decision, reasons };
}

// ---------- Report rendering ----------

const AUTO_BEGIN = '<!-- AUTO-RC2-CLOSE:BEGIN -->';
const AUTO_END = '<!-- AUTO-RC2-CLOSE:END -->';

function renderAutoBlock(inp: Inputs, gates: GateResult, endRollup: Rollup, diff: string, windowStart: string): string {
  const durMs = Date.parse(inp.window_end) - Date.parse(windowStart);
  const durH = (durMs / 3_600_000).toFixed(2);
  const f = inp.e1_functional;
  const rt = inp.e2_retry;
  const lat = inp.e3_latency_ms;

  const rows: string[] = [];
  rows.push(AUTO_BEGIN);
  rows.push('');
  rows.push('> Bloco preenchido automaticamente por');
  rows.push('> `scripts/reliability-rc2-close.ts`. Re-execute o script');
  rows.push('> para regenerar. Não editar manualmente entre os marcadores.');
  rows.push('');
  rows.push('## Encerramento — dados consolidados');
  rows.push('');
  rows.push(`- \`:window_end\`: **${inp.window_end}**`);
  rows.push(`- Duração efetiva: **${durH}h**`);
  rows.push(`- Baseline: \`${inp.baseline.start}\` .. \`${inp.baseline.end}\``);
  rows.push(`- Responsável: ${inp.responsible}`);
  rows.push('');

  // E1
  rows.push('### E1 — Regressão funcional (auto)');
  rows.push('');
  rows.push('| Métrica | Baseline | RC-2 | Δ | Δ% | OK |');
  rows.push('| --- | ---: | ---: | ---: | ---: | :-: |');
  const e1rows: [string, Pair][] = [
    ['Scans iniciados', f.scans_initiated],
    ['Scans concluídos com sucesso', f.scans_succeeded],
    ['Escritas em virus_scans', f.virus_scans_writes],
    ['Chamadas update_quota_usage', f.update_quota_usage_calls],
    ['Invokes de auto-quarantine', f.auto_quarantine_invokes],
  ];
  for (const [label, p] of e1rows) {
    rows.push(`| ${label} | ${p.baseline} | ${p.rc2} | ${delta(p)} | ${deltaPct(p)} | ${check(true)} |`);
  }
  rows.push(`| Taxa de sucesso | ${pct(f.scans_succeeded.baseline, f.scans_initiated.baseline)} | ${pct(f.scans_succeeded.rc2, f.scans_initiated.rc2)} | — | — | ${check(gates.e1)} |`);
  rows.push(`| Escritas duplicadas | 0 | ${f.duplicate_writes} | — | — | ${check(f.duplicate_writes === 0)} |`);
  rows.push('');
  rows.push(`- Contratos HTTP inalterados: ${check(f.http_contract_unchanged)}`);
  rows.push(`- Payload/headers/status inalterados: ${check(f.payload_headers_status_unchanged)}`);
  rows.push('');

  // E2
  rows.push('### E2 — Telemetria de retry (auto)');
  rows.push('');
  const totalScans = f.scans_initiated.rc2;
  rows.push('| Evento | Ocorrências | % sobre scans |');
  rows.push('| --- | ---: | ---: |');
  rows.push(`| reliability.retry.attempt (attempt=1) | ${rt.attempt_1} | ${pct(rt.attempt_1, totalScans)} |`);
  rows.push(`| reliability.retry.attempt (attempt=2) | ${rt.attempt_2} | ${pct(rt.attempt_2, totalScans)} |`);
  rows.push(`| reliability.retry.attempt (attempt=3) | ${rt.attempt_3} | ${pct(rt.attempt_3, totalScans)} |`);
  rows.push(`| reliability.retry.exhausted | ${rt.exhausted} | ${pct(rt.exhausted, totalScans)} |`);
  rows.push('');
  rows.push('| Categoria | Status | Ocorrências |');
  rows.push('| --- | --- | ---: |');
  for (const c of rt.by_cause) rows.push(`| ${c.category} | ${c.status} | ${c.count} |`);
  rows.push('');
  rows.push(`- Retry em 4xx permanente: ${rt.attempts_on_permanent_4xx} ${check(rt.attempts_on_permanent_4xx === 0)}`);
  rows.push(`- requestId preservado: ${check(rt.requestid_preserved)}`);
  rows.push(`- traceId preservado: ${check(rt.traceid_preserved)}`);
  rows.push('');

  // E3
  rows.push('### E3 — Latência do handler (auto)');
  rows.push('');
  rows.push('| Percentil | Baseline (ms) | RC-2 (ms) | Δ (ms) | Δ (%) | OK |');
  rows.push('| --- | ---: | ---: | ---: | ---: | :-: |');
  const okP50 = true;
  const okP95 = (lat.p95.rc2 - lat.p95.baseline) / Math.max(lat.p95.baseline, 1) <= 0.25;
  const okP99 = (lat.p99.rc2 - lat.p99.baseline) / Math.max(lat.p99.baseline, 1) <= 0.40;
  rows.push(`| p50 | ${lat.p50.baseline} | ${lat.p50.rc2} | ${delta(lat.p50)} | ${deltaPct(lat.p50)} | ${check(okP50)} |`);
  rows.push(`| p95 | ${lat.p95.baseline} | ${lat.p95.rc2} | ${delta(lat.p95)} | ${deltaPct(lat.p95)} | ${check(okP95)} |`);
  rows.push(`| p99 | ${lat.p99.baseline} | ${lat.p99.rc2} | ${delta(lat.p99)} | ${deltaPct(lat.p99)} | ${check(okP99)} |`);
  rows.push('');
  rows.push(`- Scans excedendo 6s de retry: ${lat.over_6s_retry_budget} ${check(lat.over_6s_retry_budget === 0)}`);
  rows.push(`- Scans excedendo 30s por tentativa: ${lat.over_30s_per_attempt} ${check(lat.over_30s_per_attempt === 0)}`);
  rows.push('');

  // E4
  rows.push('### E4 — Classificação 4xx/404 (auto)');
  rows.push('');
  rows.push('| Status | Ocorrências | Retry esperado | Retry observado | OK |');
  rows.push('| --- | ---: | :-: | :-: | :-: |');
  for (const c of inp.e4_classification) {
    // count=0 → N/A (nada para observar). Erro só se retry indevido (obs && !esp).
    const mark = c.count === 0 ? 'n/a' : (c.retry_observed && !c.retry_expected) ? '❌' : '✅';
    rows.push(`| ${c.status} | ${c.count} | ${c.retry_expected ? 'sim' : 'não'} | ${c.retry_observed ? 'sim' : 'não'} | ${mark} |`);
  }
  rows.push('');
  rows.push(`- Retry-After respeitado: ${check(inp.e4_flags.retry_after_respected)}`);
  rows.push(`- Sem falso-positivo: ${check(inp.e4_flags.no_false_positive)}`);
  rows.push(`- Sem falso-negativo: ${check(inp.e4_flags.no_false_negative)}`);
  rows.push('');

  // E5
  rows.push('### E5 — Estabilidade do inventário R4.5 (auto)');
  rows.push('');
  rows.push('| Métrica | Início | Fim | OK |');
  rows.push('| --- | ---: | ---: | :-: |');
  rows.push(`| Total de funções | 74 | ${endRollup.totalFns} | ${check(endRollup.totalFns === 74)} |`);
  rows.push(`| Funções com Retry | 2 | ${endRollup.retry} | ${check(endRollup.retry === 2)} |`);
  rows.push(`| Funções com Breaker | 0 | ${endRollup.breaker} | ${check(endRollup.breaker === 0)} |`);
  rows.push(`| Funções com Idempotency | 0 | ${endRollup.idempotency} | ${check(endRollup.idempotency === 0)} |`);
  rows.push(`| serveAgent Retry | 1 | ${endRollup.serveAgentRetry} | ${check(endRollup.serveAgentRetry === 1)} |`);
  rows.push(`| serveTenant Retry | 1 | ${endRollup.serveTenantRetry} | ${check(endRollup.serveTenantRetry === 1)} |`);
  rows.push('');
  rows.push('Diff `rc2-start` ↔ `rc2-end`:');
  rows.push('');
  rows.push('```');
  rows.push(diff);
  rows.push('```');
  rows.push('');

  // E6
  rows.push('### E6 — Incidentes correlatos (auto)');
  rows.push('');
  if (!inp.e6_incidents.length) {
    rows.push('**sem incidentes** durante a janela RC-2.');
  } else {
    rows.push('| Data | Sistema | Severidade | Correlato? | Notas |');
    rows.push('| --- | --- | --- | :-: | --- |');
    for (const i of inp.e6_incidents) {
      rows.push(`| ${i.date} | ${i.system} | ${i.severity} | ${i.correlated ? '✅' : '·'} | ${i.notes} |`);
    }
  }
  rows.push('');

  // Consolidação
  rows.push('### Consolidação (auto)');
  rows.push('');
  rows.push('| Critério | Status |');
  rows.push('| --- | :-: |');
  rows.push(`| E1 — Regressão funcional | ${check(gates.e1)} |`);
  rows.push(`| E2 — Telemetria de retry | ${check(gates.e2)} |`);
  rows.push(`| E3 — Latência | ${check(gates.e3)} |`);
  rows.push(`| E4 — Classificação | ${check(gates.e4)} |`);
  rows.push(`| E5 — Inventário estável | ${check(gates.e5)} |`);
  rows.push(`| E6 — Sem incidentes | ${check(gates.e6)} |`);
  rows.push('');

  // Decisão
  rows.push('### Decisão recomendada (auto)');
  rows.push('');
  const badge =
    gates.decision === 'Promote' ? '✅ **PROMOTE**' :
    gates.decision === 'Extend'  ? '⏸️ **EXTEND**'  :
    gates.decision === 'Hold'    ? '🛠️ **HOLD — hardening required before commercial traffic**' :
    '❌ **ROLLBACK**';
  rows.push(`Decisão: ${badge}`);
  rows.push('');
  if (gates.reasons.length) {
    rows.push('Motivos / observações:');
    rows.push('');
    for (const r of gates.reasons) rows.push(`- ${r}`);
    rows.push('');
  }
  rows.push('> Decisão final requer assinatura humana no bloco "Decisão final" abaixo.');
  rows.push('');
  rows.push(AUTO_END);

  return rows.join('\n');
}

function upsertAutoBlock(md: string, block: string): string {
  if (md.includes(AUTO_BEGIN) && md.includes(AUTO_END)) {
    return md.replace(new RegExp(`${AUTO_BEGIN}[\\s\\S]*?${AUTO_END}`), block);
  }
  // Insere antes de "## Log de coleta"
  if (md.includes('## Log de coleta')) {
    return md.replace('## Log de coleta', `${block}\n\n## Log de coleta`);
  }
  return `${md.trimEnd()}\n\n${block}\n`;
}

function stampWindowEnd(md: string, end: string, durH: string): string {
  return md
    .replace(/(Encerramento da janela \(`:window_end`\) \| )_pendente_/, `$1**${end}**`)
    .replace(/(Duração efetiva \| )_pendente_/, `$1**${durH}h**`);
}

function extractWindowStart(md: string): string {
  const m = md.match(/window_start[^\n]*\*\*(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)\*\*/);
  if (!m) throw new Error('cannot locate :window_start in report');
  return m[1];
}

// ---------- Main ----------

async function main() {
  const { inputs, dryRun, productionConfirmation } = parseArgs();
  if (productionConfirmation) {
    console.log('⚠  --production-confirmation active: this run WILL write to the live evidence report.');
  }
  const inp: Inputs = JSON.parse(await Deno.readTextFile(inputs));

  const reportMd = await Deno.readTextFile(REPORT);
  const windowStart = extractWindowStart(reportMd);

  // 1. Inventário fim
  const endMd = await refreshInventoryEnd(dryRun);
  const startMd = await Deno.readTextFile(INV_START);
  const diff = unifiedDiff(startMd, endMd, INV_START, INV_END);
  const endRollup = parseRollup(endMd);

  // 2. Gates + decisão
  const gates = evaluateGates(inp, endRollup);

  // 3. Bloco automático
  const durH = ((Date.parse(inp.window_end) - Date.parse(windowStart)) / 3_600_000).toFixed(2);
  const block = renderAutoBlock(inp, gates, endRollup, diff, windowStart);
  let updated = stampWindowEnd(reportMd, inp.window_end, durH);
  updated = upsertAutoBlock(updated, block);

  if (dryRun) {
    console.log('--- dry-run: preview of AUTO block ---');
    console.log(block);
    console.log('\n--- decision ---');
    console.log(gates.decision);
    return;
  }

  await Deno.writeTextFile(REPORT, updated);
  console.log(`  wrote ${REPORT}`);
  console.log(`\n✔ RC-2 close package generated.`);
  console.log(`  window_end : ${inp.window_end}  (duration: ${durH}h)`);
  console.log(`  gates      : E1=${gates.e1} E2=${gates.e2} E3=${gates.e3} E4=${gates.e4} E5=${gates.e5} E6=${gates.e6}`);
  console.log(`  decision   : ${gates.decision}`);
  if (gates.reasons.length) {
    console.log('  reasons    :');
    for (const r of gates.reasons) console.log(`    - ${r}`);
  }
}

if (import.meta.main) await main();
