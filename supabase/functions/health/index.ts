/**
 * health — Migrated to servePublic middleware.
 * GET: public health check. POST ?sync_script=true: super_admin only.
 */
import {
  EDGE_VERSION,
  EDGE_BUILD_TIMESTAMP,
  getSystemMode,
  validateSchema,
  addHealthHeaders
} from '../_shared/health-probe.ts';
import { requireSuperAdmin } from '../_shared/require-super-admin.ts';
import { servePublic } from '../_shared/serve-tenant.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';

servePublic(async (req, ctx) => {
  const { supabase, requestId } = ctx;
  const origin = req.headers.get('origin');
  const url = new URL(req.url);

  // Emergency script sync mode
  if (url.searchParams.get('sync_script') === 'true') {
    const authResult = await requireSuperAdmin(req);
    if (!authResult.success) return authResult.response!;

    if (req.method !== 'POST') {
      return new Response(JSON.stringify({
        error: 'POST the script content as request body',
        usage: 'curl -X POST --data-binary @script.ps1 "URL/health?sync_script=true&version=v5.0.4&platform=windows"'
      }), { status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
    }

    const script = await req.text();
    const version = url.searchParams.get('version') || 'v5.0.4';
    const platform = url.searchParams.get('platform') || 'windows';

    if (!script || script.length < 1000) {
      return new Response(JSON.stringify({ error: 'Script content too short', length: script?.length || 0 }), { status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
    }

    if (script.trimStart().startsWith('<!DOCTYPE') || script.trimStart().startsWith('<html')) {
      return new Response(JSON.stringify({ error: 'Content is HTML, not a script' }), { status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
    }

    const normalized = platform === 'windows'
      ? script.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n/g, '\r\n')
      : script.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    const bytes = new TextEncoder().encode(normalized);
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
      .map(b => b.toString(16).padStart(2, '0')).join('');

    const { data, error } = await supabase.from('agent_releases')
      .update({ script_content: normalized, sha256: hash })
      .eq('version', version).eq('platform', platform).eq('is_active', true)
      .select('id, version, platform');

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({
      success: true, version, platform, script_size: bytes.length, sha256: hash, updated: data
    }), { headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
  }

  // Regular health check
  const systemMode = await getSystemMode(supabase);
  const schemaValidation = await validateSchema(supabase);

  const { error: dbError } = await supabase.from('agents').select('id').limit(1);

  if (dbError) {
    return new Response(JSON.stringify({
      status: 'unhealthy', component: 'database', error: dbError.message,
      timestamp: new Date().toISOString(), edge_version: EDGE_VERSION
    }), { status: 503, headers: addHealthHeaders({ ...buildCorsHeaders(origin), 'Content-Type': 'application/json' }) });
  }

  return new Response(JSON.stringify({
    status: schemaValidation.valid ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(), edge_version: EDGE_VERSION,
    edge_build: EDGE_BUILD_TIMESTAMP, system_mode: systemMode,
    schema_valid: schemaValidation.valid, missing_tables: schemaValidation.missingTables, uptime: 'ok'
  }), { status: 200, headers: addHealthHeaders({ ...buildCorsHeaders(origin), 'Content-Type': 'application/json' }) });
});
