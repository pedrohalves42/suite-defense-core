/**
 * reliability-rc2-window-check.ts — RC-2 Fase A watchdog
 *
 * Lê `:window_start` do relatório vivo
 * (`docs/audits/active/reliability-rc2-evidence-report.md`) e reporta
 * se a janela já atingiu o gate de tempo (>=72h) e/ou o gate de
 * volume (via input opcional --scans-count=N, threshold padrão 100).
 *
 * Saída:
 *   READY   → cumpre tempo OU volume; Fase B pode ser executada.
 *   PENDING → nenhum dos gates cumprido.
 *
 * Exit code: 0 sempre (uso em CI/cron informativo). Use --strict
 * para exit 1 quando PENDING.
 *
 * Uso:
 *   deno run --allow-read scripts/reliability-rc2-window-check.ts \
 *     [--scans-count=N] [--min-hours=72] [--min-scans=100] [--strict]
 *
 * Read-only. Nenhum side effect.
 */

const REPORT = 'docs/audits/active/reliability-rc2-evidence-report.md';

interface Args {
  scansCount: number | null;
  minHours: number;
  minScans: number;
  strict: boolean;
}

function parseArgs(): Args {
  const out: Args = { scansCount: null, minHours: 72, minScans: 100, strict: false };
  for (const a of Deno.args) {
    if (a === '--strict') out.strict = true;
    else if (a.startsWith('--scans-count=')) out.scansCount = Number(a.split('=')[1]);
    else if (a.startsWith('--min-hours=')) out.minHours = Number(a.split('=')[1]);
    else if (a.startsWith('--min-scans=')) out.minScans = Number(a.split('=')[1]);
  }
  return out;
}

function extractWindowStart(md: string): string | null {
  // Match "Início da janela (`:window_start`) | **YYYY-MM-DDTHH:MM:SSZ**"
  const m = md.match(/window_start[^\n]*\*\*(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)\*\*/);
  return m ? m[1] : null;
}

function extractWindowEnd(md: string): string | null {
  const m = md.match(/window_end[^\n]*\*\*(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)\*\*/);
  return m ? m[1] : null;
}

async function main() {
  const args = parseArgs();
  const md = await Deno.readTextFile(REPORT);
  const start = extractWindowStart(md);
  if (!start) {
    console.error(`ERROR: could not parse :window_start from ${REPORT}`);
    Deno.exit(2);
  }
  const end = extractWindowEnd(md);
  if (end) {
    console.log(`CLOSED — window ended at ${end}. Nothing to do.`);
    Deno.exit(0);
  }

  const startMs = Date.parse(start);
  const nowMs = Date.now();
  const hours = (nowMs - startMs) / 3_600_000;
  const timeGate = hours >= args.minHours;
  const volumeGate = args.scansCount !== null && args.scansCount >= args.minScans;

  const status = timeGate || volumeGate ? 'READY' : 'PENDING';

  console.log(`RC-2 window-check`);
  console.log(`  window_start    : ${start}`);
  console.log(`  elapsed_hours   : ${hours.toFixed(2)} (gate: ${args.minHours})`);
  console.log(`  scans_count     : ${args.scansCount ?? 'n/a'} (gate: ${args.minScans})`);
  console.log(`  time_gate       : ${timeGate ? 'MET' : 'not met'}`);
  console.log(`  volume_gate     : ${volumeGate ? 'MET' : 'not met'}`);
  console.log(`  status          : ${status}`);

  if (status === 'READY') {
    console.log('');
    console.log('Next step: run scripts/reliability-rc2-close.ts with the');
    console.log('collected inputs JSON to auto-generate the RC-2 close package.');
  }

  if (status === 'PENDING' && args.strict) Deno.exit(1);
}

if (import.meta.main) await main();
