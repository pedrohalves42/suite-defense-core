/**
 * Auto-Quarantine - Migrated to serveInternal middleware
 * Quarantines files flagged as malicious by virus scans.
 */
import { serveInternal } from '../_shared/serve-tenant.ts';
import { createAuditLog } from '../_shared/audit.ts';
import { logger } from '../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const QuarantineSchema = z.object({
  virus_scan_id: z.string().uuid(),
  agent_name: z.string().min(1),
  file_path: z.string().min(1),
  file_hash: z.string().min(1),
  positives: z.number().int().min(0),
  total_scans: z.number().int().min(0),
});

serveInternal(async (req, ctx) => {
  const { supabase, requestId, body } = ctx;

  const parsed = QuarantineSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { virus_scan_id, agent_name, file_path, file_hash, positives, total_scans } = parsed.data;

  logger.info(`[${requestId}] AUTO-QUARANTINE: Processing`, { virus_scan_id, agent_name, file_path, positives, total_scans });

  const { data: agent, error: agentError } = await supabase
    .from('agents')
    .select('tenant_id')
    .eq('agent_name', agent_name)
    .order('enrolled_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (agentError || !agent) {
    logger.error(`[${requestId}] AUTO-QUARANTINE: Agent not found:`, agentError);
    throw new Error('Agent not found');
  }

  const tenant_id = agent.tenant_id;

  const { data: settings } = await supabase
    .from('tenant_settings')
    .select('enable_auto_quarantine')
    .eq('tenant_id', tenant_id)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!settings?.enable_auto_quarantine) {
    return { message: 'Auto-quarantine is disabled' };
  }

  const quarantine_reason = `Arquivo malicioso detectado: ${positives}/${total_scans} engines reportaram positivo`;

  const { data: quarantined, error: quarantineError } = await supabase
    .from('quarantined_files')
    .insert({ tenant_id, agent_name, file_path, file_hash, virus_scan_id, quarantine_reason, status: 'quarantined' })
    .select()
    .order('quarantined_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (quarantineError) throw quarantineError;

  logger.info(`[${requestId}] AUTO-QUARANTINE: File quarantined: ${quarantined.id}`);

  await createAuditLog({
    supabase, tenantId: tenant_id, action: 'auto_quarantine',
    resourceType: 'quarantined_files', resourceId: quarantined.id,
    details: { file_path, file_hash, positives, total_scans, agent_name },
    request: req, success: true
  });

  await supabase.functions.invoke('notification-dispatcher', {
    headers: { 'X-Internal-Secret': Deno.env.get('INTERNAL_FUNCTION_SECRET') || '' },
    body: {
      event: 'virus_detected', severity: 'critical', tenantId: tenant_id,
      agentName: agent_name,
      details: { file_path, file_hash, positives, total_scans, quarantine_id: quarantined.id, virus_scan_id,
        message: `Arquivo malicioso em quarentena: ${file_path} (${positives}/${total_scans} deteccoes)` }
    }
  });

  return { success: true, quarantine_id: quarantined.id, message: 'File quarantined successfully' };
});
