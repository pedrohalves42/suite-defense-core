import { serveTenant } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';
import { fetchWithTimeout } from '../_shared/fetch-with-timeout.ts';

serveTenant(async (req, ctx) => {
  const { supabase, tenantId, requestId, body } = ctx;

  const password_hashes = body?.password_hashes;

  const results = {
    leaks_found: 0,
    passwords_compromised: 0,
    domains_checked: 0,
    identity_risks: [] as Record<string, unknown>[],
    ai_analysis: '',
  };

  // Step 1: HIBP k-Anonymity Password Check (FREE)
  if (password_hashes?.length) {
    for (const hash of password_hashes.slice(0, 50)) {
      try {
        const sha1 = hash.toUpperCase();
        const prefix = sha1.substring(0, 5);
        const suffix = sha1.substring(5);
        const resp = await fetchWithTimeout(`https://api.pwnedpasswords.com/range/${prefix}`, {
          headers: { 'user-agent': 'CyberShield-Security-Platform' },
        });
        if (resp.ok) {
          const text = await resp.text();
          const found = text.split('\r\n').some((line: string) => {
            const [hashSuffix] = line.split(':');
            return hashSuffix === suffix;
          });
          if (found) results.passwords_compromised++;
        }
        await new Promise(r => setTimeout(r, 150));
      } catch (e) {
        logger.error('k-Anonymity check failed:', e);
      }
    }
  }

  // Step 2: Check monitored domains
  const { data: monitors } = await supabase
    .from('credential_monitors')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('monitoring_enabled', true);

  if (monitors?.length) {
    for (const monitor of monitors) {
      try {
        const resp = await fetchWithTimeout('https://haveibeenpwned.com/api/v3/breaches', {
          headers: { 'user-agent': 'CyberShield-Security-Platform' },
        });
        if (resp.ok) {
          const allBreaches = await resp.json();
          const domainBreaches = allBreaches.filter((b: Record<string, unknown>) =>
            b.Domain?.toLowerCase().includes(monitor.email_domain.toLowerCase()) ||
            b.Name?.toLowerCase().includes(monitor.email_domain.split('.')[0].toLowerCase())
          );
          for (const breach of domainBreaches.slice(0, 10)) {
            const { error } = await supabase.from('credential_leaks').upsert({
              tenant_id: tenantId,
              email: `*@${monitor.email_domain}`,
              breach_name: breach.Name,
              breach_source: breach.Domain || 'haveibeenpwned.com',
              breach_date: breach.BreachDate ? new Date(breach.BreachDate).toISOString() : null,
              data_types_exposed: breach.DataClasses || [],
              severity: classifyBreachSeverity(breach.DataClasses || []),
              detected_at: new Date().toISOString(),
            }, { onConflict: 'id' });
            if (!error) results.leaks_found++;
          }
        }
        await new Promise(r => setTimeout(r, 1600));
      } catch (e) {
        logger.error(`Breach check failed for ${monitor.email_domain}:`, e);
      }
      await supabase.from('credential_monitors').update({ last_check_at: new Date().toISOString() }).eq('id', monitor.id);
      results.domains_checked++;
    }
  }

  // Step 3: Lovable AI identity risk analysis
  try {
    const { data: agents } = await supabase
      .from('agents')
      .select('id, name, hostname, os_version, last_seen_at, agent_version')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .limit(50);

    const { data: recentAlerts } = await supabase
      .from('security_alerts')
      .select('alert_type, severity, description, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(20);

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (LOVABLE_API_KEY && agents?.length) {
      const prompt = `Analise os riscos de identidade e credenciais deste ambiente corporativo.
Endpoints monitorados: ${agents.length}
Dominios monitorados: ${monitors?.map(m => m.email_domain).join(', ') || 'Nenhum'}
Senhas comprometidas encontradas: ${results.passwords_compromised}
Vazamentos de dados encontrados: ${results.leaks_found}
Alertas recentes: ${JSON.stringify(recentAlerts?.slice(0, 5) || [])}
Forneca: Score de risco (0-100), Top 3 riscos, Recomendacoes prioritarias, Status MFA.`;

      const aiResp = await fetchWithTimeout('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash-lite',
          messages: [
            { role: 'system', content: 'Voce e um analista de seguranca especializado em Identity Security.' },
            { role: 'user', content: prompt },
          ],
        }),
      });
      if (aiResp.ok) {
        const aiData = await aiResp.json();
        results.ai_analysis = aiData.choices?.[0]?.message?.content || '';
      } else if (aiResp.status === 429) {
        results.ai_analysis = 'Analise IA temporariamente indisponivel (rate limit).';
      } else if (aiResp.status === 402) {
        results.ai_analysis = 'Creditos de IA insuficientes.';
      }
    }
  } catch (e) {
    logger.error('AI identity analysis failed:', e);
    results.ai_analysis = 'Analise IA indisponivel no momento.';
  }

  return results;
}, { methods: ['POST'] });

function classifyBreachSeverity(dataClasses: string[]): string {
  const critical = ['Passwords', 'Credit cards', 'Bank account numbers', 'Social security numbers'];
  const high = ['Email addresses', 'Phone numbers', 'Physical addresses', 'Passport numbers'];
  if (dataClasses.some(d => critical.includes(d))) return 'critical';
  if (dataClasses.some(d => high.includes(d))) return 'high';
  if (dataClasses.length > 3) return 'medium';
  return 'low';
}
