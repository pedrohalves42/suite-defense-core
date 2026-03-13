/**
 * flush-event-buffer — Batch processor for the event ingestion buffer.
 * 
 * ARCHITECTURE: Reads unprocessed events from `endpoint_event_buffer`,
 * distributes them to the correct final tables in bulk, then marks
 * rows as processed.
 * 
 * This is the second half of the Event Buffer pattern that provides
 * 10-30x throughput improvement over direct writes.
 * 
 * Runs on cron every 10 seconds for near-real-time processing.
 * 
 * Auth: Internal only (assertInternalCaller)
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';
import { corsHeaders } from '../_shared/cors.ts';

const BATCH_SIZE = 5000; // Max rows per flush cycle
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  assertInternalCaller(req);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const batchId = crypto.randomUUID();
  const startTime = Date.now();

  try {
    // ── Step 1: Claim a batch of unprocessed rows atomically ──
    // Uses FOR UPDATE SKIP LOCKED to prevent double-processing across concurrent workers
    const { data: claimedCount, error: claimError } = await supabase.rpc('claim_event_buffer_batch', {
      p_batch_id: batchId,
      p_limit: BATCH_SIZE,
    });

    if (claimError) {
      console.error('[flush-event-buffer] claim error:', claimError.message);
      return new Response(JSON.stringify({ error: claimError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!claimedCount || claimedCount === 0) {
      return new Response(JSON.stringify({ flushed: 0, message: 'Buffer empty' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Step 2: Fetch claimed rows by batch_id ──
    const { data: rows, error: fetchError } = await supabase
      .from('endpoint_event_buffer')
      .select('id, tenant_id, agent_id, event_category, payload')
      .eq('batch_id', batchId)
      .is('processed_at', null);

    if (fetchError) {
      console.error('[flush-event-buffer] fetch error:', fetchError.message);
      return new Response(JSON.stringify({ error: fetchError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!rows || rows.length === 0) {
      return new Response(JSON.stringify({ flushed: 0, message: 'Buffer empty' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Step 3: Group by category for batch inserts ──
    const processEvents: any[] = [];
    const fileEvents: any[] = [];
    const networkEvents: any[] = [];
    const registryEvents: any[] = [];
    const processedIds: string[] = [];

    for (const row of rows) {
      processedIds.push(row.id);
      const payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;

      switch (row.event_category) {
        case 'process':
          processEvents.push(payload);
          break;
        case 'file':
          fileEvents.push(payload);
          break;
        case 'network':
          networkEvents.push(payload);
          break;
        case 'registry':
          registryEvents.push(payload);
          break;
        default:
          console.warn(`[flush-event-buffer] Unknown category: ${row.event_category}`);
      }
    }

    // ── Step 4: Batch insert into final tables in parallel ──
    const insertPromises: Promise<{ table: string; count: number; error?: string }>[] = [];

    if (processEvents.length > 0) {
      insertPromises.push(
        supabase.from('endpoint_process_events').insert(processEvents).then(({ error }) => ({
          table: 'process',
          count: error ? 0 : processEvents.length,
          error: error?.message,
        }))
      );
    }

    if (fileEvents.length > 0) {
      insertPromises.push(
        supabase.from('endpoint_file_events').insert(fileEvents).then(({ error }) => ({
          table: 'file',
          count: error ? 0 : fileEvents.length,
          error: error?.message,
        }))
      );
    }

    if (networkEvents.length > 0) {
      insertPromises.push(
        supabase.from('endpoint_network_events').insert(networkEvents).then(({ error }) => ({
          table: 'network',
          count: error ? 0 : networkEvents.length,
          error: error?.message,
        }))
      );
    }

    if (registryEvents.length > 0) {
      insertPromises.push(
        supabase.from('endpoint_registry_events').insert(registryEvents).then(({ error }) => ({
          table: 'registry',
          count: error ? 0 : registryEvents.length,
          error: error?.message,
        }))
      );
    }

    const results = await Promise.all(insertPromises);

    // Log any insert failures
    const failures = results.filter(r => r.error);
    if (failures.length > 0) {
      for (const f of failures) {
        console.error(`[flush-event-buffer] ${f.table} insert failed:`, f.error);
      }
      // Don't mark failed rows as processed — they'll be retried next cycle
      const successTables = new Set(results.filter(r => !r.error).map(r => r.table));
      // Only mark rows whose category succeeded
      const successIds = rows
        .filter(r => successTables.has(r.event_category))
        .map(r => r.id);

      if (successIds.length > 0) {
        // V-10002: batch_id already set by claim_event_buffer_batch RPC, only update processed_at
        await supabase
          .from('endpoint_event_buffer')
          .update({ processed_at: new Date().toISOString() })
          .in('id', successIds);
      }
    } else {
      // ── Step 5: Mark ALL rows as processed ──
      // Chunk the IDs to avoid oversized IN clause
      const CHUNK = 500;
      for (let i = 0; i < processedIds.length; i += CHUNK) {
        const chunk = processedIds.slice(i, i + CHUNK);
        // V-10002: batch_id already set by claim RPC, only update processed_at
        await supabase
          .from('endpoint_event_buffer')
          .update({ processed_at: new Date().toISOString() })
          .in('id', chunk);
      }
    }

    const elapsed = Date.now() - startTime;
    const stats = {
      flushed: processedIds.length,
      process: processEvents.length,
      file: fileEvents.length,
      network: networkEvents.length,
      registry: registryEvents.length,
      failures: failures.length,
      elapsed_ms: elapsed,
    };

    console.log(`[flush-event-buffer] Flushed ${stats.flushed} events in ${elapsed}ms (proc=${stats.process} file=${stats.file} net=${stats.network} reg=${stats.registry})`);

    return new Response(JSON.stringify(stats), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[flush-event-buffer] Unexpected error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
