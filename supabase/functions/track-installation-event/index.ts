import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { getTenantIdForUser } from '../_shared/tenant.ts';
import { logger } from '../_shared/logger.ts';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

// Validation schema
const InstallationEventSchema = z.object({
  agent_name: z.string().trim().min(1).max(100),
  event_type: z.enum(['generated', 'downloaded', 'command_copied', 'installed', 'failed']),
  platform: z.enum(['windows', 'linux']),
  installation_method: z.enum(['download', 'one_click', 'manual']).optional(),
  installation_time_seconds: z.number().int().positive().max(86400).optional(),
  error_message: z.string().max(500).optional(),
  metadata: z.record(z.any()).optional(),
});

type InstallationEvent = z.infer<typeof InstallationEventSchema>;

interface TelemetryResponse {
  ok: boolean;
  tracked: boolean;
  reason?: string;
  requestId: string;
  details?: {
    code?: string;
    message?: string;
    issues?: Array<{ path: string; message: string }>;
  };
}

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID();
  
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse JSON with error handling
    let body: any;
    try {
      body = await req.json();
      logger.debug('[track-installation-event] Payload received', { requestId, eventType: body?.event_type });
    } catch (jsonError) {
      logger.warn('[track-installation-event] Invalid JSON', { requestId });
      return new Response(
        JSON.stringify({
          ok: false,
          tracked: false,
          reason: 'invalid_json',
          requestId,
          details: { message: 'Request body is not valid JSON' }
        } as TelemetryResponse),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Validate payload with zod
    const validation = InstallationEventSchema.safeParse(body);
    if (!validation.success) {
      const issues = validation.error.issues.map(issue => ({
        path: issue.path.join('.'),
        message: issue.message
      }));
      logger.warn('[track-installation-event] Invalid payload', { requestId, issues });
      return new Response(
        JSON.stringify({
          ok: false,
          tracked: false,
          reason: 'invalid_payload',
          requestId,
          details: { issues }
        } as TelemetryResponse),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const event: InstallationEvent = validation.data;

    // Get user authentication (optional for telemetry)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      logger.warn('[track-installation-event] No authorization header', { requestId });
      return new Response(
        JSON.stringify({
          ok: false,
          tracked: false,
          reason: 'no_auth',
          requestId,
        } as TelemetryResponse),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      logger.warn('[track-installation-event] Unauthorized', { requestId, error: authError?.message });
      return new Response(
        JSON.stringify({
          ok: false,
          tracked: false,
          reason: 'unauthorized',
          requestId,
        } as TelemetryResponse),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Get tenant_id using helper
    const tenantId = await getTenantIdForUser(supabase, user.id);
    if (!tenantId) {
      logger.warn('[track-installation-event] No tenant for user', { requestId, userId: user.id });
      return new Response(
        JSON.stringify({
          ok: false,
          tracked: false,
          reason: 'no_tenant',
          requestId,
        } as TelemetryResponse),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Collect metadata
    const ip_address = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    const user_agent = req.headers.get('user-agent') || 'unknown';

    // Optional: Find agent_id if agent already exists
    let agent_id: string | null = null;
    try {
      const { data: agent } = await supabase
        .from('agents')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('agent_name', event.agent_name)
        .order('enrolled_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      agent_id = agent?.id || null;
    } catch (lookupError) {
      // Non-critical, continue without agent_id
      logger.debug('[track-installation-event] Agent lookup failed (non-critical)', { requestId });
    }

    // Insert into installation_analytics using service role (bypasses RLS)
    const { error: insertError } = await supabase
      .from('installation_analytics')
      .insert({
        tenant_id: tenantId,
        agent_id: agent_id,
        agent_name: event.agent_name,
        event_type: event.event_type,
        platform: event.platform,
        installation_method: event.installation_method,
        installation_time_seconds: event.installation_time_seconds,
        error_message: event.error_message,
        ip_address,
        user_agent,
        metadata: event.metadata || {}
      });

    if (insertError) {
      logger.error('[track-installation-event] Insert failed', { 
        requestId, 
        code: insertError.code, 
        message: insertError.message 
      });
      return new Response(
        JSON.stringify({
          ok: false,
          tracked: false,
          reason: 'insert_failed',
          requestId,
          details: {
            code: insertError.code,
            message: insertError.message
          }
        } as TelemetryResponse),
        { 
          status: 202, // Accepted but not processed
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    logger.success('[track-installation-event] Event tracked successfully', { 
      requestId, 
      eventType: event.event_type,
      agentName: event.agent_name 
    });

    return new Response(
      JSON.stringify({
        ok: true,
        tracked: true,
        requestId
      } as TelemetryResponse),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    // Catch-all for unexpected errors - NEVER return 500 for telemetry
    logger.error('[track-installation-event] Unexpected error', { requestId, error });
    return new Response(
      JSON.stringify({
        ok: false,
        tracked: false,
        reason: 'unexpected_error',
        requestId,
        details: {
          message: error instanceof Error ? error.message : 'Unknown error'
        }
      } as TelemetryResponse),
      { 
        status: 202,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
