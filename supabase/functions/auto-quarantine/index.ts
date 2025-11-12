import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { handleException } from '../_shared/error-handler.ts';
import { createAuditLog } from '../_shared/audit.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface QuarantineRequest {
  virus_scan_id: string;
  agent_name: string;
  file_path: string;
  file_hash: string;
  positives: number;
  total_scans: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify internal function secret for service-to-service authentication
    const internalSecret = Deno.env.get('INTERNAL_FUNCTION_SECRET');
    const authHeader = req.headers.get('X-Internal-Secret');
    
    if (!authHeader || authHeader !== internalSecret) {
      console.error('[AUTO-QUARANTINE] Unauthorized: Invalid or missing internal secret');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const {
      virus_scan_id,
      agent_name,
      file_path,
      file_hash,
      positives,
      total_scans
    }: QuarantineRequest = await req.json();

    console.log('[AUTO-QUARANTINE] Processing quarantine request', {
      virus_scan_id,
      agent_name,
      file_path,
      positives,
      total_scans
    });

    // Get tenant_id from agent
    const { data: agent, error: agentError } = await supabase
      .from('agents')
      .select('tenant_id')
      .eq('agent_name', agent_name)
      .order('enrolled_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (agentError || !agent) {
      console.error('[AUTO-QUARANTINE] Agent not found:', agentError);
      throw new Error('Agent not found');
    }

    const tenant_id = agent.tenant_id;

    // Check if auto-quarantine is enabled
    const { data: settings } = await supabase
      .from('tenant_settings')
      .select('enable_auto_quarantine')
      .eq('tenant_id', tenant_id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!settings?.enable_auto_quarantine) {
      console.log('[AUTO-QUARANTINE] Auto-quarantine disabled for tenant');
      return new Response(
        JSON.stringify({ message: 'Auto-quarantine is disabled' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create quarantine record
    const quarantine_reason = `Arquivo malicioso detectado: ${positives}/${total_scans} engines reportaram positivo`;
    
    const { data: quarantined, error: quarantineError } = await supabase
      .from('quarantined_files')
      .insert({
        tenant_id,
        agent_name,
        file_path,
        file_hash,
        virus_scan_id,
        quarantine_reason,
        status: 'quarantined'
      })
      .select()
      .order('quarantined_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (quarantineError) {
      console.error('[AUTO-QUARANTINE] Error creating quarantine record:', quarantineError);
      throw quarantineError;
    }

    console.log('[AUTO-QUARANTINE] File quarantined successfully:', quarantined.id);

    // Create audit log with tenant_id
    await createAuditLog({
      supabase,
      tenantId: tenant_id,
      action: 'auto_quarantine',
      resourceType: 'quarantined_files',
      resourceId: quarantined.id,
      details: {
        file_path,
        file_hash,
        positives,
        total_scans,
        agent_name
      },
      request: req,
      success: true
    });

    // Send alert to admins
    await supabase.functions.invoke('send-system-alert', {
      headers: {
        'X-Internal-Secret': Deno.env.get('INTERNAL_FUNCTION_SECRET') || '',
      },
      body: {
        event: 'virus_detected',
        severity: 'critical',
        tenantId: tenant_id,
        agentName: agent_name,
        details: {
          file_path,
          file_hash,
          positives,
          total_scans,
          quarantine_id: quarantined.id,
          virus_scan_id,
          message: `Arquivo malicioso em quarentena: ${file_path} (${positives}/${total_scans} detecções)`
        }
      }
    });

    return new Response(
      JSON.stringify({
        success: true,
        quarantine_id: quarantined.id,
        message: 'File quarantined successfully'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return handleException(error, crypto.randomUUID(), 'auto-quarantine');
  }
});
