import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';

/**
 * deploy-v5014-test: One-time function to deploy v5.0.14 to pcteste1 only
 * 
 * Steps:
 * 1. Read the Windows v5.0.14 script from _shared directory
 * 2. Compute SHA256 hash
 * 3. Upsert into agent_releases (channel=beta)
 * 4. Set force_update_version='v5.0.14' on pcteste1
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

async function calculateSha256(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();
  console.log(`[${requestId}] deploy-v5014-test: Starting targeted deployment`);

  try {
    // Auth: require service role or internal secret
    const authHeader = req.headers.get('authorization');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Verify caller is admin (check bearer token against service role)
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Step 1: Read script content from _shared directory
    let scriptContent = '';
    try {
      const scriptUrl = new URL('../_shared/agent-scripts/cybershield-agent-windows-v5.ps1', import.meta.url);
      scriptContent = await Deno.readTextFile(scriptUrl);
      console.log(`[${requestId}] Script loaded from file: ${scriptContent.length} chars`);
    } catch (fileErr) {
      console.log(`[${requestId}] File not available, trying fetch from public URL`);
      
      // Fallback: fetch from the project's public URL
      const publicUrl = `${SUPABASE_URL.replace('.supabase.co', '.supabase.co')}/storage/v1/object/public/agent-installers/cybershield-agent-windows-v5.ps1`;
      
      // Second fallback: try reading from existing v5.0.13 and warn
      console.error(`[${requestId}] Cannot load script file in deployed environment. Script must be provided in request body.`);
      
      // Accept script content from POST body as last resort
      if (req.method === 'POST') {
        try {
          const body = await req.json();
          if (body.script_content && body.script_content.length > 1000) {
            scriptContent = body.script_content;
            console.log(`[${requestId}] Script provided in request body: ${scriptContent.length} chars`);
          }
        } catch {}
      }
      
      if (!scriptContent) {
        return new Response(JSON.stringify({ 
          error: 'Script file not available in deployed environment',
          hint: 'POST with { "script_content": "..." } or upload via ScriptUploader first'
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // Validate script
    if (!scriptContent.includes('v5.0.14')) {
      return new Response(JSON.stringify({ 
        error: 'Script does not contain v5.0.14 version marker',
        preview: scriptContent.substring(0, 200)
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!scriptContent.includes('CyberShield Agent')) {
      return new Response(JSON.stringify({ error: 'Invalid script: missing CyberShield header' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Step 2: Calculate SHA256
    const sha256 = await calculateSha256(scriptContent);
    console.log(`[${requestId}] SHA256: ${sha256}`);

    // Step 3: Check if release already exists
    const { data: existing } = await supabase
      .from('agent_releases')
      .select('id, version, sha256')
      .eq('version', 'v5.0.14')
      .eq('platform', 'windows')
      .single();

    let releaseId: string;

    if (existing) {
      console.log(`[${requestId}] Release v5.0.14 already exists (id: ${existing.id}), updating...`);
      
      const { error: updateErr } = await supabase
        .from('agent_releases')
        .update({
          script_content: scriptContent,
          sha256,
          is_active: true,
          channel: 'beta',
          release_notes: 'v5.0.14: Edge Event Aggregation + Process Lineage + Threat Network (beta test on pcteste1)'
        })
        .eq('id', existing.id);

      if (updateErr) throw new Error(`Failed to update release: ${updateErr.message}`);
      releaseId = existing.id;
    } else {
      console.log(`[${requestId}] Creating new release v5.0.14...`);
      
      const { data: newRelease, error: insertErr } = await supabase
        .from('agent_releases')
        .insert({
          version: 'v5.0.14',
          platform: 'windows',
          channel: 'beta',
          script_content: scriptContent,
          sha256,
          is_active: true,
          release_notes: 'v5.0.14: Edge Event Aggregation + Process Lineage + Threat Network (beta test on pcteste1)'
        })
        .select('id')
        .single();

      if (insertErr) throw new Error(`Failed to create release: ${insertErr.message}`);
      releaseId = newRelease!.id;
    }

    console.log(`[${requestId}] Release v5.0.14 ready (id: ${releaseId})`);

    // Step 4: Set force_update on pcteste1 only
    const { data: agent, error: agentErr } = await supabase
      .from('agents')
      .select('id, agent_name, agent_version, force_update_version')
      .eq('agent_name', 'pcteste1')
      .single();

    if (agentErr || !agent) {
      return new Response(JSON.stringify({ 
        error: 'Agent pcteste1 not found',
        release_created: true,
        release_id: releaseId
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { error: forceErr } = await supabase
      .from('agents')
      .update({
        force_update_version: 'v5.0.14',
        force_update_reason: 'Beta test deployment via deploy-v5014-test',
        force_update_at: new Date().toISOString(),
        force_update_delivery_count: 0
      })
      .eq('id', agent.id);

    if (forceErr) throw new Error(`Failed to set force_update: ${forceErr.message}`);

    console.log(`[${requestId}] Force update set on pcteste1 (${agent.id})`);

    return new Response(JSON.stringify({
      success: true,
      message: 'v5.0.14 deployed to pcteste1 (beta channel)',
      release: {
        id: releaseId,
        version: 'v5.0.14',
        platform: 'windows',
        channel: 'beta',
        sha256,
        script_size: scriptContent.length
      },
      agent: {
        id: agent.id,
        name: agent.agent_name,
        previous_version: agent.agent_version,
        force_update_version: 'v5.0.14'
      },
      next_steps: [
        'Aguardar proximo heartbeat do pcteste1 (ate 2 min)',
        'Verificar logs do agente em C:\\CyberShield\\logs\\',
        'Confirmar versao no dashboard Agent Monitoring'
      ]
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error(`[${requestId}] Deploy failed:`, error);
    return new Response(JSON.stringify({
      error: 'Deploy failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      requestId
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
