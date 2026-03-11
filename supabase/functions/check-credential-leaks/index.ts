import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { tenant_id } = await req.json();
    if (!tenant_id) {
      return new Response(JSON.stringify({ error: 'tenant_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get monitored domains
    const { data: monitors } = await supabase
      .from('credential_monitors')
      .select('*')
      .eq('tenant_id', tenant_id)
      .eq('monitoring_enabled', true);

    if (!monitors?.length) {
      return new Response(JSON.stringify({ leaks_found: 0, message: 'No domains monitored' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check HIBP API key
    const HIBP_API_KEY = Deno.env.get('HIBP_API_KEY');
    let leaksFound = 0;

    for (const monitor of monitors) {
      if (HIBP_API_KEY) {
        // Real HIBP API call
        try {
          const response = await fetch(
            `https://haveibeenpwned.com/api/v3/breaches?domain=${monitor.email_domain}`,
            {
              headers: {
                'hibp-api-key': HIBP_API_KEY,
                'user-agent': 'CyberShield-Security-Platform',
              },
            }
          );

          if (response.ok) {
            const breaches = await response.json();
            for (const breach of breaches.slice(0, 10)) {
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

              if (!error) leaksFound++;
            }
          } else if (response.status === 404) {
            // No breaches found for domain - good!
          }

          // Rate limit: 1 request per 1.5 seconds
          await new Promise(r => setTimeout(r, 1600));
        } catch (e) {
          console.error(`HIBP check failed for ${monitor.email_domain}:`, e);
        }
      } else {
        // Demo mode: check known breach databases patterns
        // In production, HIBP API key is required
        console.log(`No HIBP_API_KEY, skipping real check for ${monitor.email_domain}`);
      }

      // Update last check timestamp
      await supabase.from('credential_monitors').update({
        last_check_at: new Date().toISOString(),
      }).eq('id', monitor.id);
    }

    return new Response(JSON.stringify({ 
      leaks_found: leaksFound, 
      domains_checked: monitors.length,
      has_api_key: !!HIBP_API_KEY,
    }), {
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
