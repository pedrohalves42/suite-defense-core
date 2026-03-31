import { serveTenant } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';
import { fetchWithTimeout } from '../_shared/fetch-with-timeout.ts';

const SHADOW_IT_RULES: Record<string, { category: string; risk: string; score: number }> = {
  'dropbox': { category: 'cloud_storage', risk: 'review', score: 60 }, 'google drive': { category: 'cloud_storage', risk: 'review', score: 40 }, 'onedrive': { category: 'cloud_storage', risk: 'approved', score: 20 }, 'mega': { category: 'cloud_storage', risk: 'blocked', score: 80 }, 'wetransfer': { category: 'cloud_storage', risk: 'review', score: 65 }, 'icloud': { category: 'cloud_storage', risk: 'review', score: 45 },
  'telegram': { category: 'communication', risk: 'review', score: 50 }, 'whatsapp': { category: 'communication', risk: 'review', score: 40 }, 'discord': { category: 'communication', risk: 'review', score: 55 }, 'slack': { category: 'communication', risk: 'approved', score: 20 }, 'signal': { category: 'communication', risk: 'review', score: 45 }, 'zoom': { category: 'communication', risk: 'approved', score: 15 }, 'teams': { category: 'communication', risk: 'approved', score: 10 },
  'nordvpn': { category: 'vpn', risk: 'blocked', score: 85 }, 'expressvpn': { category: 'vpn', risk: 'blocked', score: 85 }, 'tunnelbear': { category: 'vpn', risk: 'blocked', score: 80 }, 'protonvpn': { category: 'vpn', risk: 'blocked', score: 80 }, 'surfshark': { category: 'vpn', risk: 'blocked', score: 85 },
  'teamviewer': { category: 'remote_access', risk: 'review', score: 70 }, 'anydesk': { category: 'remote_access', risk: 'review', score: 75 }, 'rustdesk': { category: 'remote_access', risk: 'blocked', score: 85 }, 'ammyy': { category: 'remote_access', risk: 'blocked', score: 90 },
  'utorrent': { category: 'torrent', risk: 'blocked', score: 95 }, 'bittorrent': { category: 'torrent', risk: 'blocked', score: 95 }, 'qbittorrent': { category: 'torrent', risk: 'blocked', score: 95 },
};

const AI_PROVIDERS = [
  { name: 'groq', url: 'https://api.groq.com/openai/v1/chat/completions', keyEnv: 'GROQ_API_KEY', model: 'llama-3.3-70b-versatile' },
  { name: 'gemini', url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', keyEnv: 'GOOGLE_GEMINI_API_KEY', model: 'gemini-2.5-flash' },
  { name: 'lovable', url: 'https://ai.gateway.lovable.dev/v1/chat/completions', keyEnv: 'LOVABLE_API_KEY', model: 'google/gemini-2.5-flash' },
];

function classifyLocally(name: string) {
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(SHADOW_IT_RULES)) { if (lower.includes(key)) return value; }
  return null;
}

async function classifyWithAI(list: string[]) {
  const prompt = `Classify as Shadow IT. For each: category, risk (approved/review/blocked), score (0-100), reason. Software: ${list.join(', ')}. Respond JSON: { "name": { "category":"...", "risk":"...", "score":N, "reason":"..." } }`;
  for (const p of AI_PROVIDERS) {
    const key = Deno.env.get(p.keyEnv); if (!key) continue;
    try {
      const r = await fetchWithTimeout(p.url, { method: 'POST', headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: p.model, messages: [{ role: 'system', content: 'Cybersecurity Shadow IT expert.' }, { role: 'user', content: prompt }], temperature: 0.1, max_tokens: 2048, response_format: { type: 'json_object' } }) });
      if (!r.ok) continue;
      const d = await r.json(); const c = d.choices?.[0]?.message?.content; if (c) return JSON.parse(c);
    } catch (err) { console.warn('[classify-shadow-it] AI provider failed', err); continue; }
  }
  return {};
}

serveTenant(async (req, ctx) => {
  const { supabase, tenantId, requestId, body } = ctx;
  const { software_names, agent_id } = body;
  if (!Array.isArray(software_names) || !software_names.length) {
    return new Response(JSON.stringify({ error: 'software_names array required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  logger.info(`[classify-shadow-it][${requestId}] Classifying ${software_names.length} items`);
  const results: Record<string, any> = {}; const unknown: string[] = [];
  for (const name of software_names) { const l = classifyLocally(name); if (l) results[name] = { ...l, source: 'local_rules' }; else unknown.push(name); }
  if (unknown.length) {
    try { const ai = await classifyWithAI(unknown); for (const [n, c] of Object.entries(ai)) results[n] = { ...(c as Record<string, unknown>), source: 'ai' }; } catch { /* fallback */ }
    for (const n of unknown) { if (!results[n]) results[n] = { category: 'unknown', risk: 'review', score: 50, source: 'fallback' }; }
  }
  const rows = Object.entries(results).map(([n, d]) => ({ tenant_id: tenantId, software_name: n, category: d.category, risk_level: d.risk, risk_score: d.score, classification_source: d.source, agent_id: agent_id || null, classified_at: new Date().toISOString() }));
  if (rows.length) { await supabase.from('shadow_it_classifications').upsert(rows, { onConflict: 'tenant_id,software_name' }); }
  return { success: true, total: software_names.length, classified: Object.keys(results).length, results, summary: { approved: Object.values(results).filter(r => r.risk === 'approved').length, review: Object.values(results).filter(r => r.risk === 'review').length, blocked: Object.values(results).filter(r => r.risk === 'blocked').length } };
}, { methods: ['POST'] });
