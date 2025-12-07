import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { logger } from '../_shared/logger.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface ChangePasswordPayload {
  current_password: string;
  new_password: string;
}

// Rate limiting por usuario
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutos

function checkRateLimitLocal(userId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);
  
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  
  if (entry.count >= MAX_ATTEMPTS) {
    return false;
  }
  
  entry.count++;
  return true;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // Criar cliente com service role para operacoes admin
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Autenticar usuario via JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authorization header required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Criar cliente autenticado para verificar o usuario
    const supabaseClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    
    if (userError || !user) {
      logger.warn('Invalid user token for password change');
      return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Rate limiting
    if (!checkRateLimitLocal(user.id)) {
      logger.warn(`Rate limit exceeded for password change: ${user.id}`);
      return new Response(JSON.stringify({ 
        error: 'Too many attempts. Try again in 15 minutes.' 
      }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const payload: ChangePasswordPayload = await req.json();

    // Validar payload
    if (!payload.current_password || !payload.new_password) {
      return new Response(JSON.stringify({ 
        error: 'Current password and new password are required' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validar forca da nova senha
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>]).{8,72}$/;
    if (!passwordRegex.test(payload.new_password)) {
      return new Response(JSON.stringify({ 
        error: 'New password must be 8-72 characters with uppercase, lowercase, number and special character' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verificar senha atual tentando fazer login
    const { error: signInError } = await supabaseClient.auth.signInWithPassword({
      email: user.email!,
      password: payload.current_password,
    });

    if (signInError) {
      logger.warn(`Invalid current password for user: ${user.id}`);
      
      // Buscar tenant_id do usuario para audit log
      const { data: userRole } = await supabaseAdmin
        .from('user_roles')
        .select('tenant_id')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();

      // Registrar tentativa falhada no audit log
      if (userRole?.tenant_id) {
        await supabaseAdmin.from('audit_logs').insert({
          tenant_id: userRole.tenant_id,
          user_id: user.id,
          actor_id: user.id,
          action: 'change_password_failed',
          resource_type: 'user',
          resource_id: user.id,
          success: false,
          details: { reason: 'invalid_current_password' },
        });
      }

      return new Response(JSON.stringify({ 
        error: 'Current password is incorrect' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Atualizar senha via Admin API
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      user.id,
      { password: payload.new_password }
    );

    if (updateError) {
      logger.error('Failed to update password', updateError);
      return new Response(JSON.stringify({ 
        error: 'Failed to update password' 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Buscar tenant_id para audit log de sucesso
    const { data: userRole } = await supabaseAdmin
      .from('user_roles')
      .select('tenant_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();

    // Registrar sucesso no audit log
    if (userRole?.tenant_id) {
      await supabaseAdmin.from('audit_logs').insert({
        tenant_id: userRole.tenant_id,
        user_id: user.id,
        actor_id: user.id,
        action: 'change_password',
        resource_type: 'user',
        resource_id: user.id,
        success: true,
        details: { timestamp: new Date().toISOString() },
      });
    }

    logger.success(`Password changed successfully for user: ${user.id}`);

    return new Response(JSON.stringify({ 
      success: true,
      message: 'Password updated successfully'
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    logger.error('Change password error', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
