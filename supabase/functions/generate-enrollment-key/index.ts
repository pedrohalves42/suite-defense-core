import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { handleException, corsHeaders } from '../_shared/error-handler.ts';
import { z } from 'https://deno.land/x/zod@v3.23.8/mod.ts';

const GenerateKeySchema = z.object({
  expiresInHours: z.number().positive().int(),
  maxUses: z.number().positive().int().optional().default(1),
  description: z.string().max(500).optional(),
});

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID();
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser();

    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    console.log(`[${requestId}] Checking role for user:`, user.id);
    
    const { data: userRole, error: rolesError } = await supabaseClient
      .from('user_roles')
      .select('role, tenant_id')
      .eq('user_id', user.id)
      .single();

    console.log(`[${requestId}] User role query result:`, { userRole, rolesError });

    if (rolesError || !userRole) {
      console.error(`[${requestId}] Error fetching user role:`, rolesError);
      throw new Error('Forbidden');
    }

    if (userRole.role !== 'admin' && userRole.role !== 'operator') {
      console.warn(`[${requestId}] User ${user.id} does not have permission, role:`, userRole.role);
      throw new Error('Forbidden: only admins and operators can generate keys');
    }

    console.log(`[${requestId}] User ${user.id} authorized with role:`, userRole.role);

    const tenantId = userRole.tenant_id;
    const body = await req.json();
    const validatedData = GenerateKeySchema.parse(body);
    const { expiresInHours, maxUses, description } = validatedData;

    // Gerar chave no formato XXXX-XXXX-XXXX-XXXX
    const generateKey = () => {
      const segments = [];
      for (let i = 0; i < 4; i++) {
        const segment = Math.random().toString(36).substring(2, 6).toUpperCase();
        segments.push(segment);
      }
      return segments.join('-');
    };

    const enrollmentKey = generateKey();
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString();

    // Usar service role para inserir a chave
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: keyData, error: insertError } = await supabaseAdmin
      .from('enrollment_keys')
      .insert({
        key: enrollmentKey,
        created_by: user.id,
        expires_at: expiresAt,
        max_uses: maxUses,
        description: description || `Chave gerada por ${user.email}`,
        tenant_id: tenantId,
      })
      .select()
      .single();

    if (insertError) {
      throw new Error('Failed to create enrollment key');
    }

    // Audit log
    await supabaseAdmin.from('audit_logs').insert({
      user_id: user.id,
      action: 'create_enrollment_key',
      resource_type: 'enrollment_key',
      resource_id: keyData.id,
      tenant_id: tenantId,
      details: { 
        key: enrollmentKey, 
        expiresInHours, 
        maxUses,
        description: keyData.description 
      },
      success: true,
    });

    console.log(`[${requestId}] Enrollment key created: ${enrollmentKey} by ${user.email}`);

    return new Response(
      JSON.stringify({
        enrollmentKey: keyData.key,
        expiresAt: keyData.expires_at,
        maxUses: keyData.max_uses,
        description: keyData.description,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    return handleException(error, requestId, 'generate-enrollment-key');
  }
});
