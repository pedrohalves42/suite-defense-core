/**
 * dispatch-honeypot-ai — Async outbox processor for AI analysis of honeypot interactions.
 * 
 * Via serveInternal (cron, every 10 min).
 * 
 * Rules:
 * - Only processes interactions with ai_analyzed = false AND classification IN ('suspicious', 'malicious')
 * - Marks as ai_analyzed = true BEFORE processing (idempotent)
 * - Processes in batches of 20
 * - Max 100 per tenant per day (budget cap)
 * - Retry: if AI fails, marks ai_analyzed = true anyway to avoid infinite retry
 * - NEVER in hot path — only async via cron
 */

import { serveInternal } from '../_shared/serve-internal.ts';

const BATCH_SIZE = 20;
const MAX_PER_TENANT_PER_DAY = 100;

serveInternal(async (_req, { supabase, requestId }) => {
  // 1. Fetch unanalyzed suspicious/malicious interactions
  const { data: pending, error: fetchError } = await supabase
    .from('honeypot_interactions')
    .select('id, tenant_id, mode, method, path, body_snippet, classification, source_ip_prefix, created_at')
    .eq('ai_analyzed', false)
    .in('classification', ['suspicious', 'malicious'])
    .order('created_at', { ascending: true })
    .limit(BATCH_SIZE);

  if (fetchError) {
    console.error(`[dispatch-honeypot-ai] Fetch error: ${fetchError.message}`);
    return { success: false, error: fetchError.message };
  }

  if (!pending || pending.length === 0) {
    return { success: true, request_id: requestId, processed: 0 };
  }

  // 2. Check daily budget per tenant
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tenantBudgets = new Map<string, number>();

  for (const item of pending) {
    if (!tenantBudgets.has(item.tenant_id)) {
      const { count } = await supabase
        .from('honeypot_interactions')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', item.tenant_id)
        .eq('ai_analyzed', true)
        .gte('created_at', today.toISOString());
      tenantBudgets.set(item.tenant_id, count || 0);
    }
  }

  // 3. Mark as analyzed FIRST (idempotent — prevents reprocessing on retry)
  const eligibleIds = pending
    .filter(p => (tenantBudgets.get(p.tenant_id) || 0) < MAX_PER_TENANT_PER_DAY)
    .map(p => p.id);

  if (eligibleIds.length === 0) {
    // Still mark all as analyzed to prevent infinite loop
    await supabase
      .from('honeypot_interactions')
      .update({ ai_analyzed: true })
      .in('id', pending.map(p => p.id));
    return { success: true, request_id: requestId, processed: 0, budget_exceeded: true };
  }

  await supabase
    .from('honeypot_interactions')
    .update({ ai_analyzed: true })
    .in('id', eligibleIds);

  // 4. Process (placeholder — integrate with ai-insight-dispatcher when ready)
  // For now, just log that items were marked for analysis
  const processed = eligibleIds.length;
  console.log(`[dispatch-honeypot-ai][${requestId}] Marked ${processed} interactions as analyzed`);

  // TODO: When AI integration is ready, send batch to ai-insight-dispatcher:
  // await supabase.functions.invoke('ai-insight-dispatcher', {
  //   body: { source: 'honeypot', interactions: eligible }
  // });

  return {
    success: true,
    request_id: requestId,
    processed,
    skipped_budget: pending.length - processed,
  };
});
