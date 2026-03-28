/**
 * Auto-Quarantine - Migrated to assertInternalCaller
 * Quarantines files flagged as malicious by virus scans.
 */
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { handleException } from '../_shared/error-handler.ts';
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const authError = assertInternalCaller(req);
  if (authError) return authError;

  const requestId = crypto.randomUUID();

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const parsed = QuarantineSchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { virus_scan_id, agent_name, file_path, file_hash, positives, total_scans } = parsed.data;

    logger.info('[AUTO-QUARANTINE] Processing quarantine request', {
      virus_scan_id, agent_name, file_path, positives, total_scans
    });

    const { data: agent, error: agentError } = await supabase
      .from('agents')
      .select('tenant_id')
      .eq('agent_name', agent_name)
      .order('enrolled_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (agentError || !agent) {
      logger.error('[AUTO-QUARANTINE] Agent not found:', agentError);
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
      logger.info('[AUTO-QUARANTINE] Auto-quarantine disabled for tenant');
      return new Response(
        JSON.stringify({ message: 'Auto-quarantine is disabled' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const quarantine_reason = `Arquivo malicioso detectado: ${positives}/${total_scans} engines reportaram positivo`;

    const { data: quarantined, error: quarantineError } = await supabase
      .from('quarantined_files')
      .insert({
        tenant_id, agent_name, file_path, file_hash, virus_scan_id,
        quarantine_reason, status: 'quarantined'
      })
      .select()
      .order('quarantined_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (quarantineError) {
      logger.error('[AUTO-QUARANTINE] Error creating quarantine record:', quarantineError);
      throw quarantineError;
    }

    logger.info('[AUTO-QUARANTINE] File quarantined successfully:', quarantined.id);

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
        details: {
          file_path, file_hash, positives, total_scans,
          quarantine_id: quarantined.id, virus_scan_id,
          message: `Arquivo malicioso em quarentena: ${file_path} (${positives}/${total_scans} deteccoes)`
        }
      }
    });

    return new Response(
      JSON.stringify({ success: true, quarantine_id: quarantined.id, message: 'File quarantined successfully' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return handleException(error, requestId, 'auto-quarantine');
  }
});
