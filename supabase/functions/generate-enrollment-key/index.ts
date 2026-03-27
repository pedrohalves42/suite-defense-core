import { requireEnv } from '../_shared/env.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { handleException, corsHeaders } from '../_shared/error-handler.ts';
import { z } from 'https://esm.sh/zod@3.23.8';
import { getTenantIdForUser } from '../_shared/tenant.ts';

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
    
    // Use service role to check permissions (handles multiple roles)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    
    const { data: userRole, error: rolesError } = await supabaseAdmin
      .from('user_roles')
      .select('role, tenant_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();

    console.log(`[${requestId}] User role query result:`, { userRole, rolesError });

    if (rolesError || !userRole) {
      console.error(`[${requestId}] Error fetching user role:`, rolesError);
      throw new Error('Forbidden');
    }

    if (userRole.role !== 'admin' && userRole.role !== 'operator' && userRole.role !== 'super_admin') {
      console.warn(`[${requestId}] User ${user.id} does not have permission, role:`, userRole.role);
      throw new Error('Forbidden: only admins, operators, and super admins can generate keys');
    }

    console.log(`[${requestId}] User ${user.id} authorized with role:`, userRole.role);

    const tenantId = userRole.tenant_id;
    const body = await req.json();
    const validatedData = GenerateKeySchema.parse(body);
    const { expiresInHours, maxUses, description } = validatedData;

    // Gerar chave no formato XXXX-XXXX-XXXX-XXXX (cryptographically secure)
    const generateKey = () => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      const segments = [];
      
      for (let i = 0; i < 4; i++) {
        const randomBytes = new Uint8Array(4);
        crypto.getRandomValues(randomBytes);
        
        let segment = '';
        for (let j = 0; j < 4; j++) {
          segment += chars[randomBytes[j] % chars.length];
        }
        segments.push(segment);
      }
      return segments.join('-');
    };

    const enrollmentKey = generateKey();
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString();

    // SEC-001: Calculate SHA-256 hash - never store plaintext key
    const keyHashBuffer = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(enrollmentKey)
    );
    const keyHash = Array.from(new Uint8Array(keyHashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    // Insert enrollment key using service role (already initialized above)
    const { data: keyData, error: insertError } = await supabaseAdmin
      .from('enrollment_keys')
      .insert({
        key_hash: keyHash,  // Only hash, never plaintext
        created_by: user.id,
        expires_at: expiresAt,
        max_uses: maxUses,
        description: description || `Chave gerada por ${user.email}`,
        tenant_id: tenantId,
      })
      .select()
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (insertError) {
      throw new Error('Failed to create enrollment key');
    }

    // Audit log - SEC-001: Do not log plaintext key
    await supabaseAdmin.from('audit_logs').insert({
      user_id: user.id,
      action: 'create_enrollment_key',
      resource_type: 'enrollment_key',
      resource_id: keyData.id,
      tenant_id: tenantId,
      details: { 
        expiresInHours, 
        maxUses,
        description: keyData.description 
      },
      success: true,
    });

    console.log(`[${requestId}] Enrollment key created by ${user.email}`);

    return new Response(
      JSON.stringify({
        enrollmentKey: enrollmentKey,  // Return plaintext to user (one-time visibility)
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
