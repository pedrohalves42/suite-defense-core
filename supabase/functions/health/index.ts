import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0'
import { 
  EDGE_VERSION, 
  EDGE_BUILD_TIMESTAMP,
  getSystemMode,
  validateSchema,
  addHealthHeaders
} from '../_shared/health-probe.ts'
import { requireSuperAdmin } from '../_shared/require-super-admin.ts'

Deno.serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'content-type, authorization, x-client-info, apikey'
  }

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: addHealthHeaders(corsHeaders) })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Emergency script sync mode
    const url = new URL(req.url)
    if (url.searchParams.get('sync_script') === 'true') {
      // SECURITY: Require super_admin authentication for script sync
      const authResult = await requireSuperAdmin(req);
      if (!authResult.success) {
        return authResult.response!;
      }
      // Accept POST body with script content
      if (req.method !== 'POST') {
        return new Response(JSON.stringify({
          error: 'POST the script content as request body',
          usage: 'curl -X POST --data-binary @script.ps1 "URL/health?sync_script=true&version=v5.0.4&platform=windows"'
        }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      const script = await req.text()
      const version = url.searchParams.get('version') || 'v5.0.4'
      const platform = url.searchParams.get('platform') || 'windows'

      if (!script || script.length < 1000) {
        return new Response(JSON.stringify({
          error: 'Script content too short',
          length: script?.length || 0
        }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      if (script.trimStart().startsWith('<!DOCTYPE') || script.trimStart().startsWith('<html')) {
        return new Response(JSON.stringify({ error: 'Content is HTML, not a script' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const normalized = platform === 'windows'
        ? script.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n/g, '\r\n')
        : script.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

      const bytes = new TextEncoder().encode(normalized)
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
        .map(b => b.toString(16).padStart(2, '0')).join('')

      const { data, error } = await supabase.from('agent_releases')
        .update({ script_content: normalized, sha256: hash })
        .eq('version', version)
        .eq('platform', platform)
        .eq('is_active', true)
        .select('id, version, platform')

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      return new Response(JSON.stringify({
        success: true, version, platform,
        script_size: bytes.length, sha256: hash, updated: data
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Regular health check
    const systemMode = await getSystemMode(supabase);
    const schemaValidation = await validateSchema(supabase);

    const { error: dbError } = await supabase
      .from('agents')
      .select('id')
      .limit(1)

    if (dbError) {
      return new Response(
        JSON.stringify({ 
          status: 'unhealthy', component: 'database',
          error: dbError.message, timestamp: new Date().toISOString(),
          edge_version: EDGE_VERSION
        }),
        { status: 503, headers: addHealthHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }) }
      )
    }

    return new Response(
      JSON.stringify({ 
        status: schemaValidation.valid ? 'healthy' : 'degraded',
        timestamp: new Date().toISOString(),
        edge_version: EDGE_VERSION, edge_build: EDGE_BUILD_TIMESTAMP,
        system_mode: systemMode, schema_valid: schemaValidation.valid,
        missing_tables: schemaValidation.missingTables, uptime: 'ok'
      }),
      { status: 200, headers: addHealthHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }) }
    )
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return new Response(
      JSON.stringify({ status: 'error', message: errorMessage, timestamp: new Date().toISOString() }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
