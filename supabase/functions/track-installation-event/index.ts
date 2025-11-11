import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';

interface InstallationEvent {
  agent_name: string;
  event_type: 'generated' | 'downloaded' | 'command_copied' | 'installed' | 'failed';
  platform: 'windows' | 'linux';
  installation_method?: 'download' | 'one_click' | 'manual';
  installation_time_seconds?: number;
  error_message?: string;
  metadata?: Record<string, any>;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user info
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get tenant_id from user_roles
    const { data: userRole, error: roleError } = await supabase
      .from('user_roles')
      .select('tenant_id')
      .eq('user_id', user.id)
      .single();

    if (roleError || !userRole) {
      return new Response(
        JSON.stringify({ error: 'User has no tenant' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const event: InstallationEvent = await req.json();

    // Get IP and User Agent
    const ip_address = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    const user_agent = req.headers.get('user-agent') || 'unknown';

    // Find agent_id if exists
    const { data: agent } = await supabase
      .from('agents')
      .select('id')
      .eq('tenant_id', userRole.tenant_id)
      .eq('agent_name', event.agent_name)
      .single();

    // Insert analytics event
    const { error: insertError } = await supabase
      .from('installation_analytics')
      .insert({
        tenant_id: userRole.tenant_id,
        agent_id: agent?.id || null,
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
      console.error('Error inserting analytics:', insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to track event' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Event tracked successfully' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in track-installation-event:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});