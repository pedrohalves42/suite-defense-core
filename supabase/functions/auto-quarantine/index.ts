import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
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

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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
      .single();

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
      .single();

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
      .single();

    if (quarantineError) {
      console.error('[AUTO-QUARANTINE] Error creating quarantine record:', quarantineError);
      throw quarantineError;
    }

    console.log('[AUTO-QUARANTINE] File quarantined successfully:', quarantined.id);

    // Create audit log
    await createAuditLog({
      supabase,
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
      body: {
        tenant_id,
        alert_type: 'auto_quarantine',
        severity: 'high',
        title: '⚠️ Arquivo Malicioso em Quarentena',
        message: `Um arquivo malicioso foi automaticamente colocado em quarentena:\n\nArquivo: ${file_path}\nAgente: ${agent_name}\nDetecções: ${positives}/${total_scans}\n\nAcesse o painel de quarentena para mais detalhes.`,
        metadata: {
          quarantine_id: quarantined.id,
          file_hash,
          virus_scan_id
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
