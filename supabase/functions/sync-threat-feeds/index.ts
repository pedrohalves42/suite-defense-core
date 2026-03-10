import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// ── Feed Fetchers ──

interface RawIndicator {
  type: 'ip_address' | 'domain' | 'url' | 'file_hash_sha256' | 'file_hash_md5';
  value: string;
  severity: 'unknown' | 'low' | 'medium' | 'high' | 'critical';
  tags: string[];
  confidence: number;
  reference?: string;
  metadata?: Record<string, unknown>;
}

async function fetchMalwareBazaarRecent(): Promise<RawIndicator[]> {
  const indicators: RawIndicator[] = [];
  const abuseKey = Deno.env.get('ABUSE_CH_API_KEY');
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' };
    if (abuseKey) headers['Auth-Key'] = abuseKey;
    const resp = await fetch('https://mb-api.abuse.ch/api/v1/', {
      method: 'POST',
      headers,
      body: 'query=get_recent&limit=50',
    });

    if (!resp.ok) {
      console.log(`MalwareBazaar JSON API unavailable (${resp.status}), using CSV fallback`);
      await resp.text(); // consume body
      return await fetchMalwareBazaarCSV();
    }

    const text = await resp.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      console.warn('MalwareBazaar returned non-JSON:', text.substring(0, 200));
      return await fetchMalwareBazaarCSV();
    }

    console.log('MalwareBazaar response status:', data.query_status, 'data count:', data.data?.length ?? 0);

    if (data.query_status === 'ok' && Array.isArray(data.data)) {
      for (const entry of data.data) {
        if (!entry.sha256_hash) continue;
        indicators.push({
          type: 'file_hash_sha256',
          value: entry.sha256_hash,
          severity: 'high',
          tags: Array.isArray(entry.tags) ? entry.tags : (entry.tags ? [entry.tags] : []),
          confidence: 80,
          reference: `https://bazaar.abuse.ch/sample/${entry.sha256_hash}/`,
          metadata: {
            file_type: entry.file_type,
            file_name: entry.file_name,
            signature: entry.signature,
            reporter: entry.reporter,
            delivery_method: entry.delivery_method,
          },
        });
      }
    } else if (data.query_status === 'no_results') {
      console.log('MalwareBazaar: no recent results');
    }
  } catch (err) {
    console.error('MalwareBazaar fetch error:', err);
  }
  return indicators;
}

async function fetchMalwareBazaarCSV(): Promise<RawIndicator[]> {
  const indicators: RawIndicator[] = [];
  try {
    // Fallback: use the daily CSV hash list
    const resp = await fetch('https://bazaar.abuse.ch/export/csv/recent/', {
      method: 'GET',
    });
    if (!resp.ok) {
      console.warn(`MalwareBazaar CSV HTTP ${resp.status}`);
      return indicators;
    }
    const text = await resp.text();
    const lines = text.split('\n').filter(l => l && !l.startsWith('#'));
    
    // CSV format: first_seen_utc,sha256_hash,md5_hash,sha1_hash,reporter,file_name,file_type_guess,mime_type,signature,clamav,vtpercent,imphash,ssdeep,tlsh
    for (const line of lines.slice(0, 100)) {
      const parts = line.split(',');
      if (parts.length < 2) continue;
      const sha256 = parts[1]?.replace(/"/g, '').trim();
      if (!sha256 || sha256.length !== 64) continue;
      
      indicators.push({
        type: 'file_hash_sha256',
        value: sha256,
        severity: 'high',
        tags: parts[8] ? [parts[8].replace(/"/g, '').trim()] : [],
        confidence: 75,
        reference: `https://bazaar.abuse.ch/sample/${sha256}/`,
        metadata: {
          file_name: parts[5]?.replace(/"/g, '').trim(),
          file_type: parts[6]?.replace(/"/g, '').trim(),
          signature: parts[8]?.replace(/"/g, '').trim(),
          reporter: parts[4]?.replace(/"/g, '').trim(),
        },
      });
    }
    console.log(`MalwareBazaar CSV fallback: ${indicators.length} indicators`);
  } catch (err) {
    console.error('MalwareBazaar CSV fetch error:', err);
  }
  return indicators;
}

async function fetchURLhaus(): Promise<RawIndicator[]> {
  const indicators: RawIndicator[] = [];
  try {
    // Primary: JSON API
    const resp = await fetch('https://urlhaus-api.abuse.ch/v1/urls/recent/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'limit=100',
    });

    if (!resp.ok) {
      console.log(`URLhaus JSON API unavailable (${resp.status}), using CSV fallback`);
      await resp.text(); // consume body
      return await fetchURLhausCSV();
    }

    const text = await resp.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      console.warn('URLhaus returned non-JSON:', text.substring(0, 200));
      return await fetchURLhausCSV();
    }

    console.log('URLhaus response status:', data.query_status, 'urls count:', data.urls?.length ?? 0);

    if (data.query_status === 'ok' && Array.isArray(data.urls)) {
      for (const entry of data.urls) {
        if (!entry.url) continue;
        indicators.push({
          type: 'url',
          value: entry.url,
          severity: entry.threat === 'malware_download' ? 'critical' : 'high',
          tags: Array.isArray(entry.tags) ? entry.tags : (entry.tags ? [String(entry.tags)] : []),
          confidence: 85,
          reference: entry.urlhaus_reference,
          metadata: {
            threat: entry.threat,
            host: entry.host,
            url_status: entry.url_status,
          },
        });
      }
    } else if (data.query_status === 'no_results') {
      console.log('URLhaus: no recent results');
    }
  } catch (err) {
    console.error('URLhaus fetch error:', err);
  }
  return indicators;
}

async function fetchURLhausCSV(): Promise<RawIndicator[]> {
  const indicators: RawIndicator[] = [];
  try {
    const resp = await fetch('https://urlhaus.abuse.ch/downloads/csv_recent/');
    if (!resp.ok) {
      console.warn(`URLhaus CSV HTTP ${resp.status}`);
      return indicators;
    }
    const text = await resp.text();
    const lines = text.split('\n').filter(l => l && !l.startsWith('#'));
    
    // CSV: id,dateadded,url,url_status,last_online,threat,tags,urlhaus_link,reporter
    for (const line of lines.slice(0, 100)) {
      const parts = line.split(',');
      if (parts.length < 3) continue;
      const url = parts[2]?.replace(/"/g, '').trim();
      if (!url || !url.startsWith('http')) continue;

      indicators.push({
        type: 'url',
        value: url,
        severity: (parts[5]?.replace(/"/g, '').trim() === 'malware_download') ? 'critical' : 'high',
        tags: parts[6] ? parts[6].replace(/"/g, '').trim().split('|').filter(Boolean) : [],
        confidence: 80,
        reference: parts[7]?.replace(/"/g, '').trim(),
        metadata: {
          threat: parts[5]?.replace(/"/g, '').trim(),
          url_status: parts[3]?.replace(/"/g, '').trim(),
        },
      });
    }
    console.log(`URLhaus CSV fallback: ${indicators.length} indicators`);
  } catch (err) {
    console.error('URLhaus CSV fetch error:', err);
  }
  return indicators;
}

async function fetchFeodoTracker(): Promise<RawIndicator[]> {
  const indicators: RawIndicator[] = [];
  try {
    const resp = await fetch('https://feodotracker.abuse.ch/downloads/ipblocklist_recommended.json');
    
    if (!resp.ok) {
      console.warn(`Feodo Tracker HTTP ${resp.status}`);
      return indicators;
    }

    const text = await resp.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      console.warn('Feodo Tracker returned non-JSON');
      return indicators;
    }

    const entries = Array.isArray(data) ? data : [];
    console.log(`Feodo Tracker: ${entries.length} entries`);

    for (const entry of entries) {
      const ip = entry.ip_address || entry.dst_ip;
      if (!ip) continue;
      indicators.push({
        type: 'ip_address',
        value: ip,
        severity: 'critical',
        tags: [entry.malware || 'botnet'].filter(Boolean),
        confidence: 90,
        reference: `https://feodotracker.abuse.ch/browse/host/${ip}/`,
        metadata: {
          port: entry.dst_port,
          malware: entry.malware,
          first_seen: entry.first_seen,
          last_online: entry.last_online,
        },
      });
    }
  } catch (err) {
    console.error('Feodo Tracker fetch error:', err);
  }
  return indicators;
}

// ── Main Handler ──

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Auth check - accept JWT or service role
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse tenant_id from body
    let tenantIds: string[] = [];
    try {
      const body = await req.json();
      if (body.tenant_id) {
        tenantIds = [body.tenant_id];
      }
    } catch {
      // No body
    }

    // Fallback: get all tenants (no status/state filter — just get all)
    if (tenantIds.length === 0) {
      const { data: tenants } = await supabase.from('tenants').select('id').limit(50);
      tenantIds = (tenants || []).map((t: { id: string }) => t.id);
    }

    const feedConfigs = [
      { name: 'abuse_ch_malwarebazaar' as const, fetcher: fetchMalwareBazaarRecent },
      { name: 'abuse_ch_urlhaus' as const, fetcher: fetchURLhaus },
      { name: 'abuse_ch_feodotracker' as const, fetcher: fetchFeodoTracker },
    ];

    const results: Record<string, unknown>[] = [];

    for (const tenantId of tenantIds) {
      for (const feed of feedConfigs) {
        // Create sync log entry
        const { data: syncLog } = await supabase
          .from('threat_feed_sync_log')
          .insert({
            tenant_id: tenantId,
            feed_source: feed.name,
            status: 'running',
          })
          .select('id')
          .single();

        const syncId = syncLog?.id;

        try {
          const rawIndicators = await feed.fetcher();

          let newCount = 0;
          let updatedCount = 0;

          // Upsert indicators in batches of 50
          const batchSize = 50;
          for (let i = 0; i < rawIndicators.length; i += batchSize) {
            const batch = rawIndicators.slice(i, i + batchSize);
            const rows = batch.map(ind => ({
              tenant_id: tenantId,
              indicator_type: ind.type,
              indicator_value: ind.value,
              severity: ind.severity,
              source: feed.name,
              source_reference: ind.reference,
              tags: ind.tags,
              confidence_score: ind.confidence,
              last_seen_at: new Date().toISOString(),
              is_active: true,
              metadata: ind.metadata || {},
            }));

            const { data: upserted, error: upsertErr } = await supabase
              .from('threat_indicators')
              .upsert(rows, {
                onConflict: 'tenant_id,indicator_type,indicator_value,source',
                ignoreDuplicates: false,
              })
              .select('id, created_at, updated_at');

            if (upsertErr) {
              console.error(`Upsert error for ${feed.name}:`, upsertErr.message);
              continue;
            }

            if (upserted) {
              for (const row of upserted) {
                const created = new Date(row.created_at).getTime();
                const updated = new Date(row.updated_at).getTime();
                if (Math.abs(created - updated) < 2000) {
                  newCount++;
                } else {
                  updatedCount++;
                }
              }
            }
          }

          // Update sync log
          if (syncId) {
            await supabase
              .from('threat_feed_sync_log')
              .update({
                sync_completed_at: new Date().toISOString(),
                indicators_fetched: rawIndicators.length,
                indicators_new: newCount,
                indicators_updated: updatedCount,
                status: 'completed',
              })
              .eq('id', syncId);
          }

          results.push({
            tenant_id: tenantId,
            feed: feed.name,
            fetched: rawIndicators.length,
            new: newCount,
            updated: updatedCount,
            status: 'completed',
          });
        } catch (feedErr) {
          const errMsg = feedErr instanceof Error ? feedErr.message : String(feedErr);
          console.error(`Feed ${feed.name} error:`, errMsg);

          if (syncId) {
            await supabase
              .from('threat_feed_sync_log')
              .update({
                sync_completed_at: new Date().toISOString(),
                status: 'failed',
                error_message: errMsg,
              })
              .eq('id', syncId);
          }

          results.push({
            tenant_id: tenantId,
            feed: feed.name,
            status: 'failed',
            error: errMsg,
          });
        }
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Sync threat feeds error:', err);
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
