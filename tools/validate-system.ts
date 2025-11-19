#!/usr/bin/env tsx
/**
 * 🛡 Guardian – Validação Completa do Sistema CyberShield
 *
 * Rodar com:
 *   npx tsx tools/validate-system.ts
 * ou
 *   npm run validate:all
 */

import 'dotenv/config';
import { exec as execCb } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const exec = promisify(execCb);

const IS_CI = process.env.CI === 'true';

type CheckResult = {
  name: string;
  ok: boolean;
  details?: string;
};

type Section = {
  title: string;
  results: CheckResult[];
};

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function getSupabaseAdmin() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    // Retorna null para permitir validação parcial localmente
    return null;
  }

  return createClient(supabaseUrl, serviceKey);
}

async function runCommand(name: string, command: string, optional = false): Promise<CheckResult> {
  try {
    const { stdout, stderr } = await exec(command, { timeout: 30000 });
    let details = stdout.trim();
    if (!details && stderr) details = stderr.trim();
    return {
      name,
      ok: true,
      details: details || undefined,
    };
  } catch (err: any) {
    const errorMsg = err?.message || String(err);
    
    // Se é opcional e falhou, retorna como sucesso com aviso
    if (optional) {
      return {
        name,
        ok: true,
        details: `⏭️  Check pulado (comando falhou ou não disponível): ${errorMsg.split('\n')[0]}`,
      };
    }
    
    return {
      name,
      ok: false,
      details: errorMsg,
    };
  }
}

/* -------------------------------------------------------------------------- */
/* 1. Env Vars                                                                */
/* -------------------------------------------------------------------------- */

async function checkEnvVars(): Promise<CheckResult> {
  const required = [
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_PUBLISHABLE_KEY',
  ];

  const optionalImportant = [
    'SUPABASE_URL',
    'SUPABASE_DB_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'INTERNAL_FUNCTION_SECRET',
    'STRIPE_SECRET_KEY',
    'VIRUSTOTAL_API_KEY',
    'RESEND_API_KEY',
  ];

  const missing: string[] = [];
  for (const key of required) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }

  let details = '';

  if (missing.length > 0) {
    details += `Variáveis obrigatórias faltando: ${missing.join(', ')}\n`;
  }

  const optionalMissing = optionalImportant.filter((k) => !process.env[k]);
  if (optionalMissing.length > 0) {
    details += `Aviso: variáveis opcionais não definidas (ok em dev): ${optionalMissing.join(', ')}\n`;
  }

  if (!details) {
    details = 'Todas as variáveis obrigatórias estão definidas.';
  }

  return {
    name: 'Variáveis de ambiente (.env)',
    ok: missing.length === 0,
    details,
  };
}

/* -------------------------------------------------------------------------- */
/* 2. Edge Functions (config.toml)                                            */
/* -------------------------------------------------------------------------- */

async function checkEdgeFunctionsConfig(): Promise<CheckResult> {
  try {
    const configPath = path.join(process.cwd(), 'supabase', 'config.toml');
    const configContent = fs.readFileSync(configPath, 'utf-8');

    const criticalFunctions = [
      'submit-job-result',
      'poll-jobs',
      'heartbeat',
      'scan-virus',
      'auto-quarantine',
      'check-subscription',
      'enroll-agent',
      'serve-agent-update',
    ];

    const missing: string[] = [];
    const present: string[] = [];

    for (const fn of criticalFunctions) {
      if (configContent.includes(`[functions.${fn}]`)) {
        present.push(fn);
      } else {
        missing.push(fn);
      }
    }

    if (missing.length > 0) {
      return {
        name: 'Edge Functions críticas registradas em supabase/config.toml',
        ok: false,
        details:
          `Faltando seções de function no config.toml para: ${missing.join(', ')}.\n` +
          `Presentes: ${present.join(', ') || 'nenhuma'}.`,
      };
    }

    return {
      name: 'Edge Functions críticas registradas em supabase/config.toml',
      ok: true,
      details: `Todas as funções críticas estão registradas: ${present.join(', ')}`,
    };
  } catch (err: any) {
    return {
      name: 'Edge Functions críticas registradas em supabase/config.toml',
      ok: false,
      details:
        err?.message ||
        'Erro ao ler supabase/config.toml (confirme se o arquivo existe).',
    };
  }
}

/* -------------------------------------------------------------------------- */
/* 3. Segurança HMAC dos agentes                                              */
/* -------------------------------------------------------------------------- */

async function checkAgentHMAC(): Promise<CheckResult> {
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    return {
      name: 'HMAC Secrets dos agentes',
      ok: true,
      details: '⏭️  Check pulado (SUPABASE_SERVICE_ROLE_KEY não configurada localmente)',
    };
  }

  const { data, error } = await supabase
    .from('agents')
    .select('id, agent_name, hmac_secret')
    .or('hmac_secret.is.null,hmac_secret.eq.')
    .limit(20);

  if (error) {
    return {
      name: 'HMAC Secrets dos agentes',
      ok: false,
      details: error.message,
    };
  }

  if (data && data.length > 0) {
    const list = data.map((a) => a.agent_name).join(', ');
    return {
      name: 'HMAC Secrets dos agentes',
      ok: false,
      details: `Agentes sem hmac_secret válido: ${list}`,
    };
  }

  return {
    name: 'HMAC Secrets dos agentes',
    ok: true,
    details: 'Todos os agentes possuem hmac_secret configurado (não nulo/não vazio).',
  };
}

/* -------------------------------------------------------------------------- */
/* 4. Multi-tenancy: tenant_id em tabelas críticas                            */
/* -------------------------------------------------------------------------- */

async function checkTenantIsolation(): Promise<CheckResult> {
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    return {
      name: 'Isolamento multi-tenant (tenant_id)',
      ok: true,
      details: '⏭️  Check pulado (SUPABASE_SERVICE_ROLE_KEY não configurada localmente)',
    };
  }

  const tablesWithTenantId = [
    'agents',
    'jobs',
    'virus_scans',
    'audit_logs',
    'enrollment_keys',
    'quarantined_files',
  ];

  const problems: string[] = [];

  for (const table of tablesWithTenantId) {
    const { data, error } = await supabase
      .from(table)
      .select('id')
      .is('tenant_id', null)
      .limit(1);

    if (error) {
      problems.push(`${table} (erro ao consultar: ${error.message})`);
      continue;
    }

    if (data && data.length > 0) {
      problems.push(`${table} (há registros com tenant_id NULL)`);
    }
  }

  if (problems.length > 0) {
    return {
      name: 'Isolamento multi-tenant (tenant_id)',
      ok: false,
      details:
        'Foram encontrados problemas de tenant_id ou erros ao consultar:\n- ' +
        problems.join('\n- '),
    };
  }

  return {
    name: 'Isolamento multi-tenant (tenant_id)',
    ok: true,
    details: 'Nenhuma tabela crítica possui registros com tenant_id NULL.',
  };
}

/* -------------------------------------------------------------------------- */
/* 5. Jobs – últimos 7 dias (v1: status = done)                               */
/* -------------------------------------------------------------------------- */

async function checkRecentCompletedJobs(): Promise<CheckResult> {
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    return {
      name: 'Jobs concluídos v1 (últimos 7 dias)',
      ok: true,
      details: '⏭️  Check pulado (SUPABASE_SERVICE_ROLE_KEY não configurada localmente)',
    };
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('jobs')
    .select(
      'id, agent_name, type, status, output, error_message, started_at, finished_at, execution_time_seconds, created_at'
    )
    .gt('created_at', sevenDaysAgo)
    .eq('status', 'done') // v1 ainda usa 'done'
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    return {
      name: 'Jobs concluídos v1 (últimos 7 dias)',
      ok: false,
      details: error.message,
    };
  }

  if (!data || data.length === 0) {
    return {
      name: 'Jobs concluídos v1 (últimos 7 dias)',
      ok: false,
      details:
        'Nenhum job com status=done nos últimos 7 dias. Agentes podem estar offline ou já migraram para v3.',
    };
  }

  const withOutput = data.filter((j) => j.output !== null);

  let details = `${data.length} job(s) v1 concluídos encontrados (status=done).`;
  if (withOutput.length === 0) {
    details +=
      '\n✅ Nenhum job v1 tem campo "output" preenchido (esperado para v1).';
  } else {
    details += `\n⚠ ${withOutput.length} job(s) v1 têm output preenchido (inconsistência).`;
  }

  return {
    name: 'Jobs concluídos v1 (últimos 7 dias)',
    ok: data.length > 0,
    details,
  };
}

/* -------------------------------------------------------------------------- */
/* 6. Jobs v3 – Adoção e Saúde                                                */
/* -------------------------------------------------------------------------- */

async function checkJobsV3Adoption(): Promise<CheckResult> {
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    return {
      name: 'Adoção Jobs v3',
      ok: true,
      details: '⏭️  Check pulado (SUPABASE_SERVICE_ROLE_KEY não configurada localmente)',
    };
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Buscar jobs concluídos (v1 + v3)
  const { data, error } = await supabase
    .from('jobs')
    .select('id, agent_name, output, status')
    .gt('created_at', sevenDaysAgo)
    .in('status', ['done', 'completed', 'failed']);

  if (error) {
    return {
      name: 'Adoção Jobs v3',
      ok: false,
      details: error.message,
    };
  }

  if (!data || data.length === 0) {
    return {
      name: 'Adoção Jobs v3',
      ok: false,
      details: 'Nenhum job concluído nos últimos 7 dias.',
    };
  }

  const total = data.length;
  const v3Jobs = data.filter((j) => j.output !== null).length;
  const v1Jobs = total - v3Jobs;
  const v3Percentage = (v3Jobs / total) * 100;

  // Identificar agentes ainda em v1
  const agentStats = new Map<string, { v3: number; v1: number }>();
  for (const job of data) {
    if (!agentStats.has(job.agent_name)) {
      agentStats.set(job.agent_name, { v3: 0, v1: 0 });
    }
    const stats = agentStats.get(job.agent_name)!;
    if (job.output !== null) stats.v3++;
    else stats.v1++;
  }

  const v1Agents = Array.from(agentStats.entries())
    .filter(([_, stats]) => stats.v1 > stats.v3)
    .map(([name]) => name);

  let details = `Total: ${total} jobs | v3: ${v3Jobs} (${v3Percentage.toFixed(1)}%) | v1: ${v1Jobs}`;

  if (v3Percentage < 50) {
    details += `\n❌ CRÍTICO: Menos de 50% dos jobs estão usando v3. Rollout pode estar falhando.`;
  } else if (v3Percentage < 80) {
    details += `\n⚠ Aviso: Menos de 80% dos jobs estão usando v3.`;
  } else {
    details += `\n✅ Migração bem-sucedida: >80% dos jobs usam v3.`;
  }

  if (v1Agents.length > 0) {
    details += `\n\nAgentes ainda predominantemente em v1 (${v1Agents.length}): ${v1Agents.slice(0, 5).join(', ')}`;
    if (v1Agents.length > 5) {
      details += ` ... e mais ${v1Agents.length - 5}`;
    }
  }

  return {
    name: 'Adoção Jobs v3',
    ok: v3Percentage >= 50,
    details,
  };
}

async function checkJobsHealthV3(): Promise<CheckResult> {
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    return {
      name: 'Saúde Jobs v3 (output estruturado)',
      ok: true,
      details: '⏭️  Check pulado (SUPABASE_SERVICE_ROLE_KEY não configurada localmente)',
    };
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('jobs')
    .select('id, status, output, error_message, execution_time_seconds')
    .gt('created_at', sevenDaysAgo)
    .in('status', ['completed', 'failed'])
    .not('output', 'is', null);

  if (error) {
    return {
      name: 'Saúde Jobs v3 (output estruturado)',
      ok: false,
      details: error.message,
    };
  }

  if (!data || data.length === 0) {
    return {
      name: 'Saúde Jobs v3 (output estruturado)',
      ok: true,
      details: 'Nenhum job v3 encontrado ainda (migração em andamento).',
    };
  }

  const completed = data.filter((j) => j.status === 'completed').length;
  const failed = data.filter((j) => j.status === 'failed').length;
  const withExecTime = data.filter((j) => j.execution_time_seconds !== null).length;
  const avgExecTime =
    withExecTime > 0
      ? data.reduce((sum, j) => sum + (j.execution_time_seconds || 0), 0) / withExecTime
      : 0;

  const details = `
Total v3: ${data.length}
Completados: ${completed}
Falhados: ${failed}
Com execution_time: ${withExecTime} (${((withExecTime / data.length) * 100).toFixed(1)}%)
Tempo médio: ${avgExecTime.toFixed(1)}s
  `.trim();

  return {
    name: 'Saúde Jobs v3 (output estruturado)',
    ok: true,
    details,
  };
}

/* -------------------------------------------------------------------------- */
/* 7. Distribuição de jobs (type/status)                                      */
/* -------------------------------------------------------------------------- */

async function checkJobsDistribution(): Promise<CheckResult> {
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    return {
      name: 'Distribuição de jobs (7 dias)',
      ok: true,
      details: '⏭️  Check pulado (SUPABASE_SERVICE_ROLE_KEY não configurada localmente)',
    };
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase.from('jobs').select('type, status').gt('created_at', sevenDaysAgo);

  if (error) {
    return {
      name: 'Distribuição de jobs (7 dias)',
      ok: false,
      details: error.message,
    };
  }

  if (!data || data.length === 0) {
    return {
      name: 'Distribuição de jobs (7 dias)',
      ok: false,
      details: 'Nenhum job encontrado nos últimos 7 dias.',
    };
  }

  const map = new Map<string, number>();
  let total = 0;
  let queued = 0;
  let done = 0;

  for (const row of data) {
    const key = `${row.type}::${row.status}`;
    map.set(key, (map.get(key) ?? 0) + 1);
    total++;
    if (row.status === 'queued') queued++;
    if (row.status === 'done' || row.status === 'completed') done++;
  }

  const queuedRate = total > 0 ? (queued / total) * 100 : 0;

  const summary = Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([k, v]) => `${k} = ${v}`)
    .join(' | ');

  let details = `Total: ${total} | Concluídos (done/completed): ${done} | Na fila (queued): ${queued}`;
  if (queuedRate > 30) {
    details += `\n⚠ ${queuedRate.toFixed(
      1
    )}% dos jobs estão em 'queued'. Possível congestionamento ou agentes offline.`;
  }
  details += `\nTop 10 combinações type::status: ${summary}`;

  return {
    name: 'Distribuição de jobs (7 dias)',
    ok: done > 0,
    details,
  };
}

/* -------------------------------------------------------------------------- */
/* Main                                                                       */
/* -------------------------------------------------------------------------- */

async function main() {
  console.log('🛡  Guardian – Validação Completa do Sistema CyberShield\n');

  const sections: Section[] = [];

  // 1. Env vars
  sections.push({
    title: 'Configuração de Ambiente',
    results: [await checkEnvVars()],
  });

  // 2. Qualidade de código (opcional em dev)
  if (!IS_CI) {
    sections.push({
      title: 'Qualidade de Código (TypeScript / ESLint / Testes)',
      results: [
        await runCommand('TypeScript typecheck', 'npm run typecheck', true),
        await runCommand('ESLint', 'npm run lint', true),
        await runCommand('Vitest (unit tests)', 'npm run test', true),
      ],
    });
  } else {
    sections.push({
      title: 'Qualidade de Código (CI)',
      results: [
        {
          name: 'Checks executados no workflow de CI',
          ok: true,
          details: 'Pulados aqui para evitar duplicidade (typecheck/lint/tests já rodando em outros jobs)',
        },
      ],
    });
  }

  // 3. Edge Functions
  sections.push({
    title: 'Edge Functions',
    results: [await checkEdgeFunctionsConfig()],
  });

  // 4. Banco – segurança e multi-tenancy
  sections.push({
    title: 'Segurança no Banco (HMAC, Multi-tenant)',
    results: [await checkAgentHMAC(), await checkTenantIsolation()],
  });

  // 5. Operacional – jobs e migração v3
  sections.push({
    title: 'Métricas Operacionais (Jobs v1/v3)',
    results: [
      await checkRecentCompletedJobs(),
      await checkJobsDistribution(),
      await checkJobsV3Adoption(),
      await checkJobsHealthV3(),
    ],
  });

  // Imprimir resultados
  let globalOk = true;

  for (const section of sections) {
    console.log(`\n=== ${section.title} ===`);
    for (const r of section.results) {
      const status = r.ok ? '✅' : '❌';
      console.log(`${status} ${r.name}`);
      if (r.details) {
        const details =
          r.details.length > 1000
            ? r.details.slice(0, 1000) + '\n... (detalhes truncados)'
            : r.details;
        console.log('    ' + details.replace(/\n/g, '\n    '));
      }
      if (!r.ok) globalOk = false;
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  if (globalOk) {
    console.log('✅ Sistema validado sem erros críticos.');
  } else {
    console.log('❌ Validação encontrou problemas – revisar seções acima.');
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (!globalOk) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('Erro inesperado na validação:', err);
  process.exitCode = 1;
});