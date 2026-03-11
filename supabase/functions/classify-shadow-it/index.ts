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

    // Get software inventory for this tenant
    const { data: inventory } = await supabase
      .from('software_inventory')
      .select('id, agent_id, software_name, software_version, publisher, install_date')
      .eq('tenant_id', tenant_id)
      .limit(500);

    // Get web activity domains
    const { data: webActivity } = await supabase
      .from('agent_web_activity')
      .select('url, title, agent_id')
      .eq('tenant_id', tenant_id)
      .order('visited_at', { ascending: false })
      .limit(200);

    if (!inventory?.length && !webActivity?.length) {
      return new Response(JSON.stringify({ classified: 0, message: 'No data to classify' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Classification rules (local, no AI needed for basic classification)
    const shadowItRules: Record<string, { category: string; risk: string; score: number }> = {
      // Cloud Storage
      'dropbox': { category: 'cloud_storage', risk: 'review', score: 60 },
      'google drive': { category: 'cloud_storage', risk: 'review', score: 40 },
      'onedrive': { category: 'cloud_storage', risk: 'approved', score: 20 },
      'mega': { category: 'cloud_storage', risk: 'blocked', score: 80 },
      'wetransfer': { category: 'cloud_storage', risk: 'review', score: 65 },
      // Communication
      'telegram': { category: 'communication', risk: 'review', score: 50 },
      'whatsapp': { category: 'communication', risk: 'review', score: 40 },
      'discord': { category: 'communication', risk: 'review', score: 55 },
      'slack': { category: 'communication', risk: 'approved', score: 20 },
      'signal': { category: 'communication', risk: 'review', score: 45 },
      // VPN
      'nordvpn': { category: 'vpn', risk: 'blocked', score: 85 },
      'expressvpn': { category: 'vpn', risk: 'blocked', score: 85 },
      'tunnelbear': { category: 'vpn', risk: 'blocked', score: 80 },
      'protonvpn': { category: 'vpn', risk: 'blocked', score: 80 },
      'windscribe': { category: 'vpn', risk: 'blocked', score: 80 },
      // Remote Access
      'teamviewer': { category: 'remote_access', risk: 'review', score: 70 },
      'anydesk': { category: 'remote_access', risk: 'review', score: 75 },
      'rustdesk': { category: 'remote_access', risk: 'blocked', score: 85 },
      'ammyy': { category: 'remote_access', risk: 'blocked', score: 90 },
      // AI Tools
      'chatgpt': { category: 'ai_tool', risk: 'review', score: 55 },
      'copilot': { category: 'ai_tool', risk: 'review', score: 40 },
      'claude': { category: 'ai_tool', risk: 'review', score: 50 },
      'gemini': { category: 'ai_tool', risk: 'review', score: 45 },
      // SaaS
      'canva': { category: 'saas', risk: 'approved', score: 15 },
      'notion': { category: 'saas', risk: 'approved', score: 20 },
      'trello': { category: 'saas', risk: 'approved', score: 15 },
      'figma': { category: 'saas', risk: 'approved', score: 15 },
      // Torrents / P2P
      'utorrent': { category: 'desktop', risk: 'blocked', score: 95 },
      'bittorrent': { category: 'desktop', risk: 'blocked', score: 95 },
      'qbittorrent': { category: 'desktop', risk: 'blocked', score: 95 },
    };

    const classified: Array<{
      app_name: string; category: string; risk: string; score: number; agents: Set<string>;
    }> = [];
    const appMap = new Map<string, { category: string; risk: string; score: number; agents: Set<string> }>();

    // Classify from software inventory
    for (const sw of inventory || []) {
      const name = (sw.software_name || '').toLowerCase();
      for (const [pattern, classification] of Object.entries(shadowItRules)) {
        if (name.includes(pattern)) {
          const existing = appMap.get(sw.software_name);
          if (existing) {
            existing.agents.add(sw.agent_id);
          } else {
            appMap.set(sw.software_name, {
              ...classification,
              agents: new Set([sw.agent_id]),
            });
          }
          break;
        }
      }
    }

    // Classify from web activity (extract domain-based apps)
    for (const wa of webActivity || []) {
      try {
        const url = new URL(wa.url);
        const domain = url.hostname.replace('www.', '');
        for (const [pattern, classification] of Object.entries(shadowItRules)) {
          if (domain.includes(pattern) || (wa.title || '').toLowerCase().includes(pattern)) {
            const appName = `${pattern} (web)`;
            const existing = appMap.get(appName);
            if (existing) {
              existing.agents.add(wa.agent_id);
            } else {
              appMap.set(appName, {
                ...classification,
                agents: new Set([wa.agent_id]),
              });
            }
            break;
          }
        }
      } catch {}
    }

    // Upsert into shadow_it_catalog
    let count = 0;
    for (const [appName, info] of appMap.entries()) {
      const agentIds = Array.from(info.agents);
      await supabase.from('shadow_it_catalog').upsert({
        tenant_id,
        app_name: appName,
        app_category: info.category,
        risk_level: info.risk,
        risk_score: info.score,
        agents_count: agentIds.length,
        agent_ids: agentIds,
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        source: 'auto_discovery',
      }, { onConflict: 'tenant_id,app_name' });
      count++;
    }

    return new Response(JSON.stringify({ classified: count, total_software: inventory?.length ?? 0 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('classify-shadow-it error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
