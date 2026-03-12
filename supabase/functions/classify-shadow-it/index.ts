import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { validateCallerTenant } from '../_shared/validate-caller-tenant.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// AI provider chain: Groq (fastest) → Gemini → Lovable AI (fallback)
const AI_PROVIDERS = [
  {
    name: 'groq',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    keyEnv: 'GROQ_API_KEY',
    model: 'llama-3.3-70b-versatile',
  },
  {
    name: 'gemini',
    url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    keyEnv: 'GOOGLE_GEMINI_API_KEY',
    model: 'gemini-2.5-flash',
  },
  {
    name: 'lovable',
    url: 'https://ai.gateway.lovable.dev/v1/chat/completions',
    keyEnv: 'LOVABLE_API_KEY',
    model: 'google/gemini-2.5-flash',
  },
];

// Local classification rules (no AI needed)
const SHADOW_IT_RULES: Record<string, { category: string; risk: string; score: number }> = {
  // Cloud Storage
  'dropbox': { category: 'cloud_storage', risk: 'review', score: 60 },
  'google drive': { category: 'cloud_storage', risk: 'review', score: 40 },
  'onedrive': { category: 'cloud_storage', risk: 'approved', score: 20 },
  'mega': { category: 'cloud_storage', risk: 'blocked', score: 80 },
  'wetransfer': { category: 'cloud_storage', risk: 'review', score: 65 },
  'icloud': { category: 'cloud_storage', risk: 'review', score: 45 },
  // Communication
  'telegram': { category: 'communication', risk: 'review', score: 50 },
  'whatsapp': { category: 'communication', risk: 'review', score: 40 },
  'discord': { category: 'communication', risk: 'review', score: 55 },
  'slack': { category: 'communication', risk: 'approved', score: 20 },
  'signal': { category: 'communication', risk: 'review', score: 45 },
  'zoom': { category: 'communication', risk: 'approved', score: 15 },
  'teams': { category: 'communication', risk: 'approved', score: 10 },
  // VPN
  'nordvpn': { category: 'vpn', risk: 'blocked', score: 85 },
  'expressvpn': { category: 'vpn', risk: 'blocked', score: 85 },
  'tunnelbear': { category: 'vpn', risk: 'blocked', score: 80 },
  'protonvpn': { category: 'vpn', risk: 'blocked', score: 80 },
  'windscribe': { category: 'vpn', risk: 'blocked', score: 80 },
  'surfshark': { category: 'vpn', risk: 'blocked', score: 85 },
  'cyberghost': { category: 'vpn', risk: 'blocked', score: 80 },
  'hotspot shield': { category: 'vpn', risk: 'blocked', score: 75 },
  // Remote Access
  'teamviewer': { category: 'remote_access', risk: 'review', score: 70 },
  'anydesk': { category: 'remote_access', risk: 'review', score: 75 },
  'rustdesk': { category: 'remote_access', risk: 'blocked', score: 85 },
  'ammyy': { category: 'remote_access', risk: 'blocked', score: 90 },
  'ultraviewer': { category: 'remote_access', risk: 'blocked', score: 85 },
  'parsec': { category: 'remote_access', risk: 'review', score: 65 },
  // AI Tools
  'chatgpt': { category: 'ai_tool', risk: 'review', score: 55 },
  'openai': { category: 'ai_tool', risk: 'review', score: 55 },
  'copilot': { category: 'ai_tool', risk: 'review', score: 40 },
  'claude': { category: 'ai_tool', risk: 'review', score: 50 },
  'gemini': { category: 'ai_tool', risk: 'review', score: 45 },
  'deepseek': { category: 'ai_tool', risk: 'review', score: 60 },
  'perplexity': { category: 'ai_tool', risk: 'review', score: 45 },
  // SaaS
  'canva': { category: 'saas', risk: 'approved', score: 15 },
  'notion': { category: 'saas', risk: 'approved', score: 20 },
  'trello': { category: 'saas', risk: 'approved', score: 15 },
  'figma': { category: 'saas', risk: 'approved', score: 15 },
  'airtable': { category: 'saas', risk: 'approved', score: 20 },
  // Torrents / P2P
  'utorrent': { category: 'desktop', risk: 'blocked', score: 95 },
  'bittorrent': { category: 'desktop', risk: 'blocked', score: 95 },
  'qbittorrent': { category: 'desktop', risk: 'blocked', score: 95 },
  'deluge': { category: 'desktop', risk: 'blocked', score: 95 },
  // Anti-detect browsers
  'multilogin': { category: 'desktop', risk: 'blocked', score: 98 },
  'gologin': { category: 'desktop', risk: 'blocked', score: 98 },
  'dolphin anty': { category: 'desktop', risk: 'blocked', score: 98 },
  // Games
  'steam': { category: 'desktop', risk: 'review', score: 50 },
  'epic games': { category: 'desktop', risk: 'review', score: 50 },
  'roblox': { category: 'desktop', risk: 'review', score: 55 },
  'minecraft': { category: 'desktop', risk: 'review', score: 45 },
};

interface AppEntry {
  name: string;
  category: string;
  risk: string;
  score: number;
  agents: Set<string>;
  source: string;
  aiClassified?: boolean;
}

function classifyLocal(name: string): { category: string; risk: string; score: number } | null {
  const lower = name.toLowerCase();
  for (const [pattern, classification] of Object.entries(SHADOW_IT_RULES)) {
    if (lower.includes(pattern)) return classification;
  }
  return null;
}

async function classifyWithAI(unclassifiedApps: string[]): Promise<Record<string, { category: string; risk: string; score: number }>> {
  if (unclassifiedApps.length === 0) return {};

  const prompt = `You are a cybersecurity analyst classifying software for Shadow IT risk assessment in a corporate environment.

Classify each application below into:
- category: one of [saas, cloud_storage, desktop, browser_extension, communication, vpn, remote_access, ai_tool, development, security, system, unknown]
- risk: one of [approved, review, blocked] 
  - approved: standard business tools, system utilities, known safe software
  - review: potentially risky but may have legitimate use
  - blocked: high risk, unauthorized, or policy-violating
- score: 0-100 risk score (0=safe, 100=critical risk)

Rules:
- System drivers, Windows updates, Microsoft Office, .NET, Visual C++ = approved, score 5-15
- Known security tools (antivirus, firewalls) = approved, score 5-10
- Unknown/unrecognized apps = review, score 40-60
- VPNs, torrents, anti-detect browsers = blocked, score 80-98

Applications to classify:
${unclassifiedApps.map((a, i) => `${i+1}. ${a}`).join('\n')}

Respond ONLY with a JSON object mapping app names to classifications. Example:
{"App Name": {"category": "desktop", "risk": "approved", "score": 10}}`;

  for (const provider of AI_PROVIDERS) {
    const apiKey = Deno.env.get(provider.keyEnv);
    if (!apiKey) {
      console.log(`[classify-shadow-it] ${provider.name}: no API key, skipping`);
      continue;
    }

    try {
      console.log(`[classify-shadow-it] Trying ${provider.name}...`);
      const response = await fetch(provider.url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: provider.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
          max_tokens: 4096,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error(`[classify-shadow-it] ${provider.name} error ${response.status}: ${errText}`);
        continue;
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      
      // Extract JSON from response (may be wrapped in ```json ... ```)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error(`[classify-shadow-it] ${provider.name}: no JSON in response`);
        continue;
      }

      const parsed = JSON.parse(jsonMatch[0]);
      console.log(`[classify-shadow-it] ${provider.name} classified ${Object.keys(parsed).length} apps`);
      return parsed;
    } catch (err) {
      console.error(`[classify-shadow-it] ${provider.name} failed:`, err);
      continue;
    }
  }

  console.warn('[classify-shadow-it] All AI providers failed, using defaults');
  // Fallback: mark as unknown/review
  const fallback: Record<string, { category: string; risk: string; score: number }> = {};
  for (const app of unclassifiedApps) {
    fallback[app] = { category: 'unknown', risk: 'review', score: 50 };
  }
  return fallback;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { tenant_id } = await req.json();
    if (!tenant_id) {
      return new Response(JSON.stringify({ error: 'tenant_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const validation = await validateCallerTenant(req, supabase, tenant_id);
    if (!validation.authorized) {
      return new Response(
        JSON.stringify({ error: validation.error }),
        { status: validation.statusCode || 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[classify-shadow-it] Starting for tenant ${tenant_id}`);

    // Get software inventory (correct column names: name, version, vendor)
    const { data: inventory, error: invError } = await supabase
      .from('software_inventory')
      .select('id, agent_id, name, version, vendor')
      .eq('tenant_id', tenant_id)
      .limit(1000);

    if (invError) console.error('[classify-shadow-it] inventory error:', invError);

    // Get web activity domains (correct column names: domain, page_title)
    const { data: webActivity, error: waError } = await supabase
      .from('agent_web_activity')
      .select('domain, page_title, agent_id')
      .eq('tenant_id', tenant_id)
      .order('visited_at', { ascending: false })
      .limit(500);

    if (waError) console.error('[classify-shadow-it] web activity error:', waError);

    console.log(`[classify-shadow-it] Found ${inventory?.length ?? 0} software, ${webActivity?.length ?? 0} web entries`);

    if (!inventory?.length && !webActivity?.length) {
      return new Response(JSON.stringify({ classified: 0, message: 'Nenhum dado de inventário ou atividade web encontrado. Certifique-se que os agentes enviaram dados.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const appMap = new Map<string, AppEntry>();
    const unclassifiedNames: string[] = [];

    // Phase 1: Classify software inventory with local rules
    for (const sw of inventory || []) {
      const appName = sw.name || '';
      if (!appName.trim()) continue;

      const localResult = classifyLocal(appName);
      const existing = appMap.get(appName);
      
      if (existing) {
        existing.agents.add(sw.agent_id);
      } else if (localResult) {
        appMap.set(appName, {
          name: appName,
          ...localResult,
          agents: new Set([sw.agent_id]),
          source: 'software_inventory',
        });
      } else {
        // Queue for AI classification
        appMap.set(appName, {
          name: appName,
          category: 'unknown',
          risk: 'unknown',
          score: 0,
          agents: new Set([sw.agent_id]),
          source: 'software_inventory',
        });
        if (!unclassifiedNames.includes(appName)) {
          unclassifiedNames.push(appName);
        }
      }
    }

    // Phase 2: Classify web activity domains with local rules
    const seenDomains = new Set<string>();
    for (const wa of webActivity || []) {
      const domain = (wa.domain || '').replace('www.', '');
      if (!domain || seenDomains.has(domain)) {
        if (domain && appMap.has(domain)) {
          appMap.get(domain)!.agents.add(wa.agent_id);
        }
        seenDomains.add(domain);
        continue;
      }
      seenDomains.add(domain);

      const localResult = classifyLocal(domain) || classifyLocal(wa.page_title || '');
      
      if (localResult) {
        const existing = appMap.get(domain);
        if (existing) {
          existing.agents.add(wa.agent_id);
        } else {
          appMap.set(domain, {
            name: domain,
            ...localResult,
            agents: new Set([wa.agent_id]),
            source: 'web_activity',
          });
        }
      } else {
        const existing = appMap.get(domain);
        if (existing) {
          existing.agents.add(wa.agent_id);
        } else {
          appMap.set(domain, {
            name: domain,
            category: 'unknown',
            risk: 'unknown',
            score: 0,
            agents: new Set([wa.agent_id]),
            source: 'web_activity',
          });
          if (!unclassifiedNames.includes(domain)) {
            unclassifiedNames.push(domain);
          }
        }
      }
    }

    const localClassified = appMap.size - unclassifiedNames.length;
    console.log(`[classify-shadow-it] Local: ${localClassified} classified, ${unclassifiedNames.length} need AI`);

    // Phase 3: AI classification for unknown apps (batch in chunks of 50)
    let aiClassified = 0;
    if (unclassifiedNames.length > 0) {
      const batches: string[][] = [];
      for (let i = 0; i < unclassifiedNames.length; i += 50) {
        batches.push(unclassifiedNames.slice(i, i + 50));
      }

      for (const batch of batches) {
        const aiResults = await classifyWithAI(batch);
        for (const [appName, classification] of Object.entries(aiResults)) {
          // Find matching entry (may be exact or case-insensitive)
          const key = Array.from(appMap.keys()).find(k => k.toLowerCase() === appName.toLowerCase()) || appName;
          const existing = appMap.get(key);
          if (existing) {
            existing.category = classification.category || 'unknown';
            existing.risk = classification.risk || 'review';
            existing.score = classification.score ?? 50;
            existing.aiClassified = true;
            aiClassified++;
          }
        }
      }
    }

    // Phase 4: Upsert into shadow_it_catalog
    let upsertCount = 0;
    for (const [, entry] of appMap.entries()) {
      // Skip system/approved low-risk items to reduce noise
      if (entry.risk === 'approved' && entry.score <= 10 && entry.source === 'software_inventory') continue;

      const agentIds = Array.from(entry.agents);
      const { error: upsertError } = await supabase.from('shadow_it_catalog').upsert({
        tenant_id,
        app_name: entry.name,
        app_category: entry.category,
        risk_level: entry.risk === 'unknown' ? 'review' : entry.risk,
        risk_score: entry.score || 50,
        agents_count: agentIds.length,
        agent_ids: agentIds,
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        source: entry.aiClassified ? 'ai_discovery' : 'auto_discovery',
        ai_classification: entry.aiClassified ? { provider: 'auto', classified_at: new Date().toISOString() } : null,
      }, { onConflict: 'tenant_id,app_name' });

      if (upsertError) {
        console.error(`[classify-shadow-it] Upsert error for "${entry.name}":`, upsertError);
      } else {
        upsertCount++;
      }
    }

    console.log(`[classify-shadow-it] Done: ${upsertCount} upserted (${localClassified} local, ${aiClassified} AI)`);

    return new Response(JSON.stringify({
      classified: upsertCount,
      local_classified: localClassified,
      ai_classified: aiClassified,
      total_software: inventory?.length ?? 0,
      total_web_domains: seenDomains.size,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[classify-shadow-it] Fatal error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
