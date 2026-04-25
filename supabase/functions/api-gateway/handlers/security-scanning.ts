/**
 * Security Scanning Handlers — Inlined from standalone functions
 * Handles: check-credential-leaks, classify-shadow-it, clear-failed-logins
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../../_shared/logger.ts';
import { fetchWithTimeout } from '../../_shared/fetch-with-timeout.ts';
import type { HandlerContext } from './admin.ts';

type SupabaseClient = any;

// ─── check-credential-leaks ──────────────────────────────────────────────────

function classifyBreachSeverity(dataClasses: string[]): string {
  const critical = ['Passwords', 'Credit cards', 'Bank account numbers', 'Social security numbers'];
  const high = ['Email addresses', 'Phone numbers', 'Physical addresses', 'Passport numbers'];
  if (dataClasses.some(d => critical.includes(d))) return 'critical';
  if (dataClasses.some(d => high.includes(d))) return 'high';
  if (dataClasses.length > 3) return 'medium';
  return 'low';
}

export async function handleCheckCredentialLeaks(
  supabase: SupabaseClient, requestId: string, payload: Record<string, unknown>, ctx?: HandlerContext,
): Promise<unknown> {
  const tenantId = (payload.tenant_id as string) || ctx?.tenantId;
  if (!tenantId) return { __status: 400, error: 'tenant_id required' };

  const password_hashes = payload.password_hashes as string[] | undefined;
  const results = { leaks_found: 0, passwords_compromised: 0, domains_checked: 0, identity_risks: [] as Record<string, unknown>[], ai_analysis: '' };

  // HIBP k-Anonymity Password Check (FREE)
  if (password_hashes?.length) {
    for (const hash of password_hashes.slice(0, 50)) {
      try {
        const sha1 = hash.toUpperCase();
        const prefix = sha1.substring(0, 5);
        const suffix = sha1.substring(5);
        const resp = await fetchWithTimeout(`https://api.pwnedpasswords.com/range/${prefix}`, { headers: { 'user-agent': 'CyberShield-Security-Platform' } });
        if (resp.ok) {
          const text = await resp.text();
          const found = text.split('\r\n').some((line: string) => line.split(':')[0] === suffix);
          if (found) results.passwords_compromised++;
        }
        await new Promise(r => setTimeout(r, 150));
      } catch (e) { logger.error('k-Anonymity check failed:', e); }
    }
  }

  // Check monitored domains
  const { data: monitors } = await supabase.from('credential_monitors').select('id, tenant_id, email_domain, monitoring_enabled, last_checked_at').eq('tenant_id', tenantId).eq('monitoring_enabled', true);
  if (monitors?.length) {
    for (const monitor of monitors) {
      try {
        const resp = await fetchWithTimeout('https://haveibeenpwned.com/api/v3/breaches', { headers: { 'user-agent': 'CyberShield-Security-Platform' } });
        if (resp.ok) {
          const allBreaches = await resp.json();
          const domainBreaches = allBreaches.filter((b: Record<string, unknown>) =>
            (b.Domain as string)?.toLowerCase().includes(monitor.email_domain.toLowerCase()) ||
            (b.Name as string)?.toLowerCase().includes(monitor.email_domain.split('.')[0].toLowerCase())
          );
          const breachRows = domainBreaches.slice(0, 10).map((breach: Record<string, unknown>) => ({
            tenant_id: tenantId, email: `*@${monitor.email_domain}`, breach_name: breach.Name,
            breach_source: (breach.Domain as string) || 'haveibeenpwned.com',
            breach_date: breach.BreachDate ? new Date(breach.BreachDate as string).toISOString() : null,
            data_types_exposed: (breach.DataClasses as string[]) || [],
            severity: classifyBreachSeverity((breach.DataClasses as string[]) || []),
            detected_at: new Date().toISOString(),
          }));
          if (breachRows.length > 0) {
            const { error } = await supabase.from('credential_leaks').upsert(breachRows, { onConflict: 'id' });
            if (!error) results.leaks_found += breachRows.length;
          }
        }
        await new Promise(r => setTimeout(r, 1600));
      } catch (e) { logger.error(`Breach check failed for ${monitor.email_domain}:`, e); }
      await supabase.from('credential_monitors').update({ last_check_at: new Date().toISOString() }).eq('id', monitor.id);
      results.domains_checked++;
    }
  }

  // Lovable AI identity risk analysis
  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (LOVABLE_API_KEY) {
      const { data: agents } = await supabase.from('agents').select('id, name, hostname').eq('tenant_id', tenantId).eq('is_active', true).limit(50);
      const { data: recentAlerts } = await supabase.from('security_alerts').select('alert_type, severity, description, created_at').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(20);
      if (agents?.length) {
        const prompt = `Analise os riscos de identidade. Endpoints: ${agents.length}. Dominios: ${monitors?.map(m => m.email_domain).join(', ') || 'Nenhum'}. Senhas comprometidas: ${results.passwords_compromised}. Vazamentos: ${results.leaks_found}. Alertas: ${JSON.stringify(recentAlerts?.slice(0, 5) || [])}. Forneca: Score de risco (0-100), Top 3 riscos, Recomendacoes.`;
        const aiResp = await fetchWithTimeout('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST', headers: { 'Authorization': `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'google/gemini-2.5-flash-lite', messages: [{ role: 'system', content: 'Voce e um analista de seguranca especializado em Identity Security.' }, { role: 'user', content: prompt }] }),
        });
        if (aiResp.ok) { const aiData = await aiResp.json(); results.ai_analysis = aiData.choices?.[0]?.message?.content || ''; }
        else if (aiResp.status === 429) results.ai_analysis = 'Analise IA temporariamente indisponivel (rate limit).';
        else if (aiResp.status === 402) results.ai_analysis = 'Creditos de IA insuficientes.';
      }
    }
  } catch (e) { logger.error('AI identity analysis failed:', e); results.ai_analysis = 'Analise IA indisponivel no momento.'; }

  return results;
}

// ─── classify-shadow-it ──────────────────────────────────────────────────────

const SHADOW_IT_RULES: Record<string, { category: string; risk: string; score: number }> = {
  'dropbox': { category: 'cloud_storage', risk: 'review', score: 60 }, 'google drive': { category: 'cloud_storage', risk: 'review', score: 40 },
  'onedrive': { category: 'cloud_storage', risk: 'approved', score: 20 }, 'mega': { category: 'cloud_storage', risk: 'blocked', score: 80 },
  'telegram': { category: 'communication', risk: 'review', score: 50 }, 'whatsapp': { category: 'communication', risk: 'review', score: 40 },
  'discord': { category: 'communication', risk: 'review', score: 55 }, 'slack': { category: 'communication', risk: 'approved', score: 20 },
  'teams': { category: 'communication', risk: 'approved', score: 10 },
  'nordvpn': { category: 'vpn', risk: 'blocked', score: 85 }, 'expressvpn': { category: 'vpn', risk: 'blocked', score: 85 },
  'teamviewer': { category: 'remote_access', risk: 'review', score: 70 }, 'anydesk': { category: 'remote_access', risk: 'review', score: 75 },
  'rustdesk': { category: 'remote_access', risk: 'blocked', score: 85 },
  'utorrent': { category: 'torrent', risk: 'blocked', score: 95 }, 'bittorrent': { category: 'torrent', risk: 'blocked', score: 95 },
};

function classifyLocally(name: string) {
  const lower = name.toLowerCase();
  for (const [key, rule] of Object.entries(SHADOW_IT_RULES)) {
    if (lower.includes(key)) return { name, ...rule, source: 'local_rules' };
  }
  return { name, category: 'unknown', risk: 'review', score: 30, source: 'local_rules' };
}

export async function handleClassifyShadowIt(
  supabase: SupabaseClient, requestId: string, payload: Record<string, unknown>, ctx?: HandlerContext,
): Promise<unknown> {
  const software_names = payload.software_names as string[];
  if (!software_names?.length) return { __status: 400, error: 'software_names required' };
  return { classifications: software_names.slice(0, 500).map(classifyLocally) };
}

// ─── clear-failed-logins ────────────────────────────────────────────────────

export async function handleClearFailedLogins(
  supabase: SupabaseClient, requestId: string, payload: Record<string, unknown>, ctx?: HandlerContext,
): Promise<unknown> {
  const ipAddress = (payload.ip_address as string)
    || ctx?.req?.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || ctx?.req?.headers.get('x-real-ip')
    || null;

  // If no IP can be determined, return success silently — this is a best-effort cleanup
  if (!ipAddress) {
    return { success: true, skipped: true, reason: 'ip_not_available' };
  }

  await supabase.from('failed_login_attempts').delete().eq('ip_address', ipAddress);
  await supabase.from('ip_blocklist').delete().eq('ip_address', ipAddress);

  return { success: true };
}
