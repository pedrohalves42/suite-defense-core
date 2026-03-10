import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
  try {
    const resp = await fetch('https://mb-api.abuse.ch/api/v1/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'query=get_recent&limit=100',
    });
    const data = await resp.json();
    if (data.query_status === 'ok' && Array.isArray(data.data)) {
      for (const entry of data.data) {
        indicators.push({
          type: 'file_hash_sha256',
          value: entry.sha256_hash,
          severity: 'high',
          tags: entry.tags || [],
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
    }
  } catch (err) {
    console.error('MalwareBazaar fetch error:', err);
  }
  return indicators;
}

async function fetchURLhaus(): Promise<RawIndicator[]> {
  const indicators: RawIndicator[] = [];
  try {
    const resp = await fetch('https://urlhaus-api.abuse.ch/v1/urls/recent/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'limit=100',
    });
    const data = await resp.json();
    if (data.query_status === 'ok' && Array.isArray(data.urls)) {
      for (const entry of data.urls) {
        indicators.push({
          type: 'url',
          value: entry.url,
          severity: entry.threat === 'malware_download' ? 'critical' : 'high',
          tags: entry.tags || [],
          confidence: 85,
          reference: entry.urlhaus_reference,
          metadata: {
            threat: entry.threat,
            host: entry.host,
            url_status: entry.url_status,
          },
        });
      }
    }
  } catch (err) {
    console.error('URLhaus fetch error:', err);
  }
  return indicators;
}

async function fetchFeodoTracker(): Promise<RawIndicator[]> {
  const indicators: RawIndicator[] = [];
  try {
    const resp = await fetch('https://feodotracker.abuse.ch/downloads/ipblocklist_recommended.json');
    const data = await resp.json();
    if (Array.isArray(data)) {
      for (const entry of data) {
        indicators.push({
          type: 'ip_address',
          value: entry.ip_address || entry.dst_ip,
          severity: 'critical',
          tags: [entry.malware || 'botnet'],
          confidence: 90,
          reference: `https://feodotracker.abuse.ch/browse/host/${entry.ip_address || entry.dst_ip}/`,
          metadata: {
            port: entry.dst_port,
            malware: entry.malware,
            first_seen: entry.first_seen,
            last_online: entry.last_online,
          },
        });
      }
    }
  } catch (err) {
    console.error('Feodo Tracker fetch error:', err);
  }
  return indicators;
}

// ── Main Handler ──

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Parse tenant_id from body or use all tenants
    let tenantIds: string[] = [];
    try {
      const body = await req.json();
      if (body.tenant_id) {
        tenantIds = [body.tenant_id];
      }
    } catch {
      // No body, sync for all tenants
    }

    if (tenantIds.length === 0) {
      const { data: tenants } = await supabase.from('tenants').select('id').eq('status', 'active');
      tenantIds = (tenants || []).map((t: { id: string }) => t.id);
    }

    const feedConfigs = [
      { name: 'abuse_ch_malwarebazaar', fetcher: fetchMalwareBazaarRecent },
      { name: 'abuse_ch_urlhaus', fetcher: fetchURLhaus },
      { name: 'abuse_ch_feodotracker', fetcher: fetchFeodoTracker },
    ] as const;

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

            const { data: upserted } = await supabase
              .from('threat_indicators')
              .upsert(rows, {
                onConflict: 'tenant_id,indicator_type,indicator_value,source',
                ignoreDuplicates: false,
              })
              .select('id, created_at, updated_at');

            if (upserted) {
              for (const row of upserted) {
                // If created_at equals updated_at (within 1s), it's new
                const created = new Date(row.created_at).getTime();
                const updated = new Date(row.updated_at).getTime();
                if (Math.abs(created - updated) < 1000) {
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
          if (syncId) {
            await supabase
              .from('threat_feed_sync_log')
              .update({
                sync_completed_at: new Date().toISOString(),
                status: 'failed',
                error_message: feedErr instanceof Error ? feedErr.message : String(feedErr),
              })
              .eq('id', syncId);
          }

          results.push({
            tenant_id: tenantId,
            feed: feed.name,
            status: 'failed',
            error: feedErr instanceof Error ? feedErr.message : String(feedErr),
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
