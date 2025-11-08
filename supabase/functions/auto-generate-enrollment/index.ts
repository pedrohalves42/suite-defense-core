import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Authenticate user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { agentName } = await req.json();

    if (!agentName || typeof agentName !== 'string') {
      return new Response(JSON.stringify({ error: 'Agent name is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Generate enrollment key
    const generateKey = () => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      const segments = 4;
      const segmentLength = 4;
      const parts = [];
      for (let i = 0; i < segments; i++) {
        let segment = '';
        for (let j = 0; j < segmentLength; j++) {
          segment += chars[Math.floor(Math.random() * chars.length)];
        }
        parts.push(segment);
      }
      return parts.join('-');
    };

    const enrollmentKey = generateKey();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Get user's tenant
    const { data: userRole } = await supabase
      .from('user_roles')
      .select('tenant_id')
      .eq('user_id', user.id)
      .single();

    if (!userRole?.tenant_id) {
      return new Response(JSON.stringify({ error: 'User tenant not found' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create enrollment key
    const { error: keyError } = await supabase
      .from('enrollment_keys')
      .insert({
        key: enrollmentKey,
        tenant_id: userRole.tenant_id,
        created_by: user.id,
        expires_at: expiresAt.toISOString(),
        max_uses: 1,
        current_uses: 0,
        is_active: true,
        description: `Auto-generated for ${agentName}`,
      });

    if (keyError) throw keyError;

    // Generate agent token and HMAC secret
    const agentToken = crypto.randomUUID();
    const hmacSecret = crypto.randomUUID();

    // Check if agent exists
    const { data: existingAgent } = await supabase
      .from('agents')
      .select('id')
      .eq('agent_name', agentName)
      .eq('tenant_id', userRole.tenant_id)
      .single();

    let agentId: string;

    if (existingAgent) {
      agentId = existingAgent.id;
      
      // Update HMAC secret
      await supabase
        .from('agents')
        .update({ hmac_secret: hmacSecret })
        .eq('id', agentId);

      // Deactivate old tokens
      await supabase
        .from('agent_tokens')
        .update({ is_active: false })
        .eq('agent_id', agentId);
    } else {
      // Create new agent
      const { data: newAgent, error: agentError } = await supabase
        .from('agents')
        .insert({
          agent_name: agentName,
          tenant_id: userRole.tenant_id,
          hmac_secret: hmacSecret,
          status: 'pending',
        })
        .select('id')
        .single();

      if (agentError) throw agentError;
      agentId = newAgent.id;
    }

    // Create agent token
    const tokenExpiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year
    const { error: tokenError } = await supabase
      .from('agent_tokens')
      .insert({
        agent_id: agentId,
        token: agentToken,
        expires_at: tokenExpiresAt.toISOString(),
        is_active: true,
      });

    if (tokenError) throw tokenError;

    // Mark enrollment key as used
    await supabase
      .from('enrollment_keys')
      .update({ current_uses: 1 })
      .eq('key', enrollmentKey);

    return new Response(
      JSON.stringify({
        enrollmentKey,
        agentToken,
        hmacSecret,
        expiresAt: tokenExpiresAt.toISOString(),
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
