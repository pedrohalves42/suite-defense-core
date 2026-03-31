/**
 * check-pending-agents → Migrated to serveInternal middleware
 */
import { serveInternal } from '../_shared/serve-tenant.ts';
import { Resend } from 'https://esm.sh/resend@4.0.0';
import { logger } from '../_shared/logger.ts';

interface PendingAgent { id: string; agent_name: string; enrolled_at: string; tenant_id: string; last_heartbeat: string | null; }

serveInternal(async (_req, ctx) => {
  const { supabase, requestId } = ctx;
  logger.info(`[${requestId}] Starting check-pending-agents...`);

  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: agents, error: agentsError } = await supabase
    .from('agents').select('id, agent_name, enrolled_at, tenant_id, last_heartbeat')
    .is('last_heartbeat', null).lt('enrolled_at', tenMinutesAgo)
    .order('enrolled_at', { ascending: false }).limit(100);

  if (agentsError) throw agentsError;
  if (!agents || agents.length === 0) return { success: true, message: 'No pending agents', count: 0 };

  logger.info(`[${requestId}] Found ${agents.length} agents without heartbeat`);

  const agentIds = agents.map(a => a.id);
  const { data: installations } = await supabase.from('installation_analytics').select('agent_id').in('agent_id', agentIds).eq('event_type', 'post_installation');
  const installedAgentIds = new Set(installations?.map(i => i.agent_id) || []);
  const notInstalledAgents = agents.filter(a => !installedAgentIds.has(a.id));

  if (notInstalledAgents.length === 0) return { success: true, message: 'All agents have installation events', count: 0 };

  const tenantGroups = notInstalledAgents.reduce((acc, agent) => {
    if (!acc[agent.tenant_id]) acc[agent.tenant_id] = [];
    acc[agent.tenant_id].push(agent);
    return acc;
  }, {} as Record<string, PendingAgent[]>);

  const notifications: Array<Record<string, unknown>> = [];
  const resend = new Resend(Deno.env.get('RESEND_API_KEY'));

  for (const [tenantId, agentsList] of Object.entries(tenantGroups)) {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: recentAlert } = await supabase.from('system_alerts').select('id').eq('tenant_id', tenantId).eq('alert_type', 'pending_agents').gte('created_at', oneHourAgo).maybeSingle();
    if (recentAlert) continue;

    const { data: tenant } = await supabase.from('tenants').select('name, owner_user_id').eq('id', tenantId).single();
    const { data: adminUsers } = await supabase.from('user_roles').select('user_id, profiles!inner(full_name)').eq('tenant_id', tenantId).eq('role', 'admin');

    const adminEmails: string[] = [];
    if (adminUsers) {
      for (const admin of adminUsers) {
        const { data: authUser } = await supabase.auth.admin.getUserById(admin.user_id);
        if (authUser.user?.email) adminEmails.push(authUser.user.email);
      }
    }

    const agentsPending30Min = agentsList.filter(a => (Date.now() - new Date(a.enrolled_at).getTime()) / 1000 / 60 >= 30);

    const { data: insertedAlert, error: alertError } = await supabase.from('system_alerts').insert({
      tenant_id: tenantId, alert_type: 'pending_agents',
      severity: agentsPending30Min.length > 0 ? 'high' : 'medium',
      title: `${agentsList.length} agente(s) pendente(s) de instalacao`,
      message: `Agentes pendentes: ${agentsList.map(a => a.agent_name).join(', ')}`,
      details: { agents: agentsList.map(a => ({ id: a.id, name: a.agent_name, enrolled_at: a.enrolled_at, minutes_pending: Math.floor((Date.now() - new Date(a.enrolled_at).getTime()) / 1000 / 60) })), recommendation: 'Verifique se os instaladores foram executados corretamente.' },
      acknowledged: false, resolved: false
    }).select().single();

    if (!alertError) {
      notifications.push({ tenant_id: tenantId, agents_count: agentsList.length, agents: agentsList.map(a => a.agent_name) });

      if (agentsPending30Min.length > 0 && adminEmails.length > 0) {
        const agentList = agentsPending30Min.map(a => `• ${a.agent_name} (pendente ha ${Math.floor((Date.now() - new Date(a.enrolled_at).getTime()) / 1000 / 60)} minutos)`).join('\n');
        try {
          await resend.emails.send({
            from: 'CyberShield Alerts <alerts@resend.dev>', to: adminEmails,
            subject: `[WARN] ${agentsPending30Min.length} agente(s) pendente(s) ha mais de 30 minutos`,
            html: `<h1>Alerta: Agentes Pendentes de Instalacao</h1><pre style="background:#f5f5f5;padding:15px">${agentList}</pre><p>Acesse o painel para detalhes.</p>`
          });
          await supabase.from('system_alerts').update({ email_sent: true, email_sent_at: new Date().toISOString() }).eq('id', insertedAlert.id);
        } catch (emailError) { logger.error(`[${requestId}] Error sending email:`, emailError); }
      }
    }
  }

  return { success: true, message: `Checked ${agents.length} agents, created ${notifications.length} alerts`, total_agents: agents.length, not_installed: notInstalledAgents.length, notifications };
});
