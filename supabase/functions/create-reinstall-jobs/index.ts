import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { logger } from '../_shared/logger.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

/**
 * Edge Function para criar jobs de reinstalacao de agentes
 * 
 * Cria jobs do tipo 'reinstall_agent' para agentes especificos ou todos os agentes
 * com bootstrap problem (nao conseguem atualizar devido a path incorreto)
 */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const requestId = crypto.randomUUID();

  try {
    logger.info('[create-reinstall-jobs] Request received', { requestId });

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Verificar autenticacao (super admin ou admin)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verificar se e admin ou super admin
    const { data: roles } = await supabase
      .from('user_roles')
      .select('role, tenant_id')
      .eq('user_id', user.id)
      .single();

    if (!roles || !['admin', 'super_admin'].includes(roles.role)) {
      return new Response(
        JSON.stringify({ error: 'Requires admin role' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse payload
    const payload = await req.json();
    const { agent_names, target_version } = payload;

    // Se agent_names fornecido, usar esses; senao buscar agentes com versao antiga
    let agentsToReinstall: { id: string; agent_name: string; agent_version: string | null; tenant_id: string }[] = [];

    if (agent_names && Array.isArray(agent_names) && agent_names.length > 0) {
      // Buscar agentes especificos
      const { data: agents, error: agentsError } = await supabase
        .from('agents')
        .select('id, agent_name, agent_version, tenant_id')
        .in('agent_name', agent_names)
        .eq('tenant_id', roles.tenant_id)
        .eq('status', 'active');

      if (agentsError) {
        throw agentsError;
      }

      agentsToReinstall = agents || [];
    } else {
      // Buscar todos os agentes com versao < v3.10.24 (bootstrap problem)
      const { data: agents, error: agentsError } = await supabase
        .from('agents')
        .select('id, agent_name, agent_version, tenant_id')
        .eq('tenant_id', roles.tenant_id)
        .eq('status', 'active');

      if (agentsError) {
        throw agentsError;
      }

      // Filtrar agentes com versao antiga (< v3.10.24)
      agentsToReinstall = (agents || []).filter(agent => {
        if (!agent.agent_version) return true; // Sem versao = precisa reinstalar
        
        // Normalizar versao (remover 'v' prefix)
        const version = agent.agent_version.replace(/^v/, '');
        const targetV = (target_version || 'v3.10.24').replace(/^v/, '');
        
        // Comparar versoes (simplificado)
        const vParts = version.split('.').map(Number);
        const tParts = targetV.split('.').map(Number);
        
        for (let i = 0; i < Math.max(vParts.length, tParts.length); i++) {
          const v = vParts[i] || 0;
          const t = tParts[i] || 0;
          if (v < t) return true;
          if (v > t) return false;
        }
        return false; // Igual ou maior
      });
    }

    if (agentsToReinstall.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No agents need reinstallation',
          jobs_created: 0 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Criar jobs de reinstalacao
    const jobsToCreate = agentsToReinstall.map(agent => ({
      agent_id: agent.id,
      agent_name: agent.agent_name,
      tenant_id: agent.tenant_id,
      type: 'reinstall_agent',
      status: 'queued',
      payload: { 
        target_version: target_version || 'v3.10.24-SMART-UPDATE',
        reason: 'bootstrap_problem_fix'
      },
      approved: true,
      created_by: user.id
    }));

    const { data: createdJobs, error: createError } = await supabase
      .from('jobs')
      .insert(jobsToCreate)
      .select('id, agent_name');

    if (createError) {
      throw createError;
    }

    logger.info('[create-reinstall-jobs] Jobs created successfully', {
      requestId,
      jobs_created: createdJobs?.length || 0,
      agents: agentsToReinstall.map(a => a.agent_name)
    });

    return new Response(
      JSON.stringify({
        success: true,
        jobs_created: createdJobs?.length || 0,
        agents: agentsToReinstall.map(a => ({
          agent_name: a.agent_name,
          current_version: a.agent_version
        })),
        jobs: createdJobs
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const err = error as Error;
    logger.error('[create-reinstall-jobs] Internal error', {
      requestId,
      error: err.message,
      stack: err.stack
    });

    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: err.message,
        requestId
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
