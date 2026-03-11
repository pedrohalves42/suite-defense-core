import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';

/**
 * check-credential-leaks — Hybrid FREE approach
 * 
 * 1. HIBP k-Anonymity API (FREE, no key) — checks if password hashes appear in breaches
 * 2. HIBP Breach search by domain (FREE, no key for breach list)
 * 3. Lovable AI — analyzes identity risk patterns from agent-collected data
 */

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { tenant_id, password_hashes } = await req.json();
    if (!tenant_id) {
      return new Response(JSON.stringify({ error: 'tenant_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results = {
      leaks_found: 0,
      passwords_compromised: 0,
      domains_checked: 0,
      identity_risks: [] as Record<string, unknown>[],
      ai_analysis: '',
    };

    // ── Step 1: HIBP k-Anonymity Password Check (FREE, no API key) ──
    if (password_hashes?.length) {
      for (const hash of password_hashes.slice(0, 50)) {
        try {
          const sha1 = hash.toUpperCase();
          const prefix = sha1.substring(0, 5);
          const suffix = sha1.substring(5);

          const resp = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
            headers: { 'user-agent': 'CyberShield-Security-Platform' },
          });

          if (resp.ok) {
            const text = await resp.text();
            const found = text.split('\r\n').some((line: string) => {
              const [hashSuffix] = line.split(':');
              return hashSuffix === suffix;
            });

            if (found) {
              results.passwords_compromised++;
            }
          }

          // Rate limit: be respectful (1 req/100ms is fine for k-Anonymity)
          await new Promise(r => setTimeout(r, 150));
        } catch (e) {
          console.error('k-Anonymity check failed:', e);
        }
      }
    }

    // ── Step 2: Check monitored domains via free HIBP breach list ──
    const { data: monitors } = await supabase
      .from('credential_monitors')
      .select('*')
      .eq('tenant_id', tenant_id)
      .eq('monitoring_enabled', true);

    if (monitors?.length) {
      for (const monitor of monitors) {
        try {
          // Free endpoint: get all breaches (no API key needed)
          const resp = await fetch('https://haveibeenpwned.com/api/v3/breaches', {
            headers: { 'user-agent': 'CyberShield-Security-Platform' },
          });

          if (resp.ok) {
            const allBreaches = await resp.json();
            // Filter breaches that mention the domain
            const domainBreaches = allBreaches.filter((b: any) =>
              b.Domain?.toLowerCase().includes(monitor.email_domain.toLowerCase()) ||
              b.Name?.toLowerCase().includes(monitor.email_domain.split('.')[0].toLowerCase())
            );

            for (const breach of domainBreaches.slice(0, 10)) {
              const { error } = await supabase.from('credential_leaks').upsert({
                tenant_id,
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
          console.error(`Breach check failed for ${monitor.email_domain}:`, e);
        }

        // Update last check
        await supabase.from('credential_monitors').update({
          last_check_at: new Date().toISOString(),
        }).eq('id', monitor.id);

        results.domains_checked++;
      }
    }

    // ── Step 3: Lovable AI identity risk analysis (FREE) ──
    try {
      // Collect agent identity data for this tenant
      const { data: agents } = await supabase
        .from('agents')
        .select('id, name, hostname, os_version, last_seen_at, agent_version')
        .eq('tenant_id', tenant_id)
        .eq('is_active', true)
        .limit(50);

      const { data: recentAlerts } = await supabase
        .from('security_alerts')
        .select('alert_type, severity, description, created_at')
        .eq('tenant_id', tenant_id)
        .order('created_at', { ascending: false })
        .limit(20);

      const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
      if (LOVABLE_API_KEY && agents?.length) {
        const prompt = `Analise os riscos de identidade e credenciais deste ambiente corporativo.

Endpoints monitorados: ${agents.length}
Domínios monitorados: ${monitors?.map(m => m.email_domain).join(', ') || 'Nenhum'}
Senhas comprometidas encontradas: ${results.passwords_compromised}
Vazamentos de dados encontrados: ${results.leaks_found}
Alertas de segurança recentes: ${JSON.stringify(recentAlerts?.slice(0, 5) || [])}

Forneça em português:
1. Score de risco de identidade (0-100)
2. Top 3 riscos identificados
3. Recomendações prioritárias de remediação
4. Status estimado de cobertura MFA

Responda de forma concisa e acionável.`;

        const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${LOVABLE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash-lite',
            messages: [
              { role: 'system', content: 'Você é um analista de segurança especializado em Identity Security e proteção de credenciais corporativas. Analise riscos e forneça recomendações práticas.' },
              { role: 'user', content: prompt },
            ],
          }),
        });

        if (aiResp.ok) {
          const aiData = await aiResp.json();
          results.ai_analysis = aiData.choices?.[0]?.message?.content || '';
        } else if (aiResp.status === 429) {
          results.ai_analysis = 'Análise IA temporariamente indisponível (rate limit). Tente novamente em alguns minutos.';
        } else if (aiResp.status === 402) {
          results.ai_analysis = 'Créditos de IA insuficientes. Adicione créditos em Settings → Workspace → Usage.';
        }
      }
    } catch (e) {
      console.error('AI identity analysis failed:', e);
      results.ai_analysis = 'Análise IA indisponível no momento.';
    }

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('check-credential-leaks error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function classifyBreachSeverity(dataClasses: string[]): string {
  const critical = ['Passwords', 'Credit cards', 'Bank account numbers', 'Social security numbers'];
  const high = ['Email addresses', 'Phone numbers', 'Physical addresses', 'Passport numbers'];

  if (dataClasses.some(d => critical.includes(d))) return 'critical';
  if (dataClasses.some(d => high.includes(d))) return 'high';
  if (dataClasses.length > 3) return 'medium';
  return 'low';
}
