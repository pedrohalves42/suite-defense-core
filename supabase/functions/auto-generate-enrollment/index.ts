import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { AutoGenerateEnrollmentSchema } from '../_shared/validation.ts';
import { handleException, handleValidationError } from '../_shared/error-handler.ts';

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID();
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log(`[${requestId}] Starting auto-generate-enrollment`);
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Authenticate user
    const authHeader = req.headers.get('Authorization');
    console.log(`[${requestId}] Auth header present:`, !!authHeader);
    
    if (!authHeader) {
      console.error(`[${requestId}] Missing Authorization header`);
      return new Response(JSON.stringify({ error: 'Unauthorized: Missing Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    console.log(`[${requestId}] User auth result:`, { userId: user?.id, authError: authError?.message });
    
    if (authError || !user) {
      console.error(`[${requestId}] Auth failed:`, authError);
      return new Response(JSON.stringify({ error: 'Unauthorized: Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    console.log(`[${requestId}] Request body received`);

    // Validate input with Zod
    const validation = AutoGenerateEnrollmentSchema.safeParse(body);
    
    if (!validation.success) {
      console.error(`[${requestId}] Validation failed:`, validation.error.issues);
      return handleValidationError(validation.error);
    }

    const { agentName } = validation.data;
    console.log(`[${requestId}] Valid agent name:`, agentName);

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

    // Get user's tenant - prefer admin role, then any role
    console.log(`[${requestId}] Fetching tenant for user:`, user.id);
    const { data: userRoles, error: roleError } = await supabase
      .from('user_roles')
      .select('tenant_id, role')
      .eq('user_id', user.id);

    console.log(`[${requestId}] User roles result:`, { 
      rolesCount: userRoles?.length, 
      roleError: roleError?.message 
    });

    if (roleError || !userRoles || userRoles.length === 0) {
      console.error(`[${requestId}] User tenant not found for user:`, user.id);
      return new Response(JSON.stringify({ 
        error: 'Sua conta ainda não está associada a um tenant. Entre em contato com o administrador para configurar sua conta.' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Prefer admin role, otherwise use first available tenant
    const adminRole = userRoles.find(r => r.role === 'admin');
    const tenantId = adminRole?.tenant_id || userRoles[0].tenant_id;
    
    console.log(`[${requestId}] Selected tenant:`, { 
      tenantId, 
      isAdmin: !!adminRole,
      totalRoles: userRoles.length 
    });

    // Create enrollment key
    console.log(`[${requestId}] Creating enrollment key:`, enrollmentKey);
    const { error: keyError } = await supabase
      .from('enrollment_keys')
      .insert({
        key: enrollmentKey,
        tenant_id: tenantId,
        created_by: user.id,
        expires_at: expiresAt.toISOString(),
        max_uses: 1,
        current_uses: 0,
        is_active: true,
        description: `Auto-generated for ${agentName}`,
      });

    if (keyError) {
      console.error(`[${requestId}] Failed to create enrollment key:`, keyError);
      throw keyError;
    }
    
    console.log(`[${requestId}] Enrollment key created successfully`);

    // Generate agent token and HMAC secret
    const agentToken = crypto.randomUUID();
    const hmacSecret = crypto.randomUUID();

    // Check if agent exists
    const { data: existingAgent } = await supabase
      .from('agents')
      .select('id')
      .eq('agent_name', agentName)
      .eq('tenant_id', tenantId)
      .maybeSingle();

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
          tenant_id: tenantId,
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

    console.log(`[${requestId}] Successfully generated credentials`);
    
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
    return handleException(error, requestId, 'auto-generate-enrollment');
  }
});
