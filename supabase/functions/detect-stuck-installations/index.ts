/**
 * detect-stuck-installations → Migrated to serveInternal middleware
 */
import { serveInternal } from '../_shared/serve-tenant.ts';
import { Resend } from "https://esm.sh/resend@4.0.0";
import { logger } from '../_shared/logger.ts';

serveInternal(async (_req, ctx) => {
  const { supabase, requestId } = ctx;
  const startedAt = Date.now();
  logger.info(`[${requestId}] Detect stuck installations cron job started`);

  const { data: stuckAgents, error: queryError } = await supabase
    .from("v_agent_lifecycle_state")
    .select("agent_id, tenant_id, agent_name, agent_state, last_heartbeat, lifecycle_status, is_stuck")
    .eq("is_stuck", true);

  if (queryError) {
    await supabase.rpc('log_scheduled_job_run', { p_job_key: 'detect-stuck-installations', p_success: false, p_duration_ms: Date.now() - startedAt, p_error: queryError.message, p_result: { error: queryError.message }, p_processed_count: 0, p_job_source: 'cron' });
    throw queryError;
  }

  if (!stuckAgents || stuckAgents.length === 0) {
    await supabase.rpc('log_scheduled_job_run', { p_job_key: 'detect-stuck-installations', p_success: true, p_duration_ms: Date.now() - startedAt, p_result: { message: 'No stuck agents detected' }, p_processed_count: 0, p_job_source: 'cron' });
    return { success: true, message: "No stuck agents detected", stuck_count: 0, request_id: requestId };
  }

  // Group by tenant
  const stuckByTenant = stuckAgents.reduce((acc: Record<string, unknown[]>, agent: Record<string, unknown>) => {
    const tid = agent.tenant_id as string;
    if (!acc[tid]) acc[tid] = [];
    acc[tid].push(agent);
    return acc;
  }, {});

  const alertsCreated: unknown[] = [];
  const emailsSent: unknown[] = [];

  for (const [tenantId, agents] of Object.entries(stuckByTenant)) {
    const agentList = agents as Array<Record<string, unknown>>;
    const { data: tenant, error: tenantError } = await supabase.from("tenants").select("name").eq("id", tenantId).single();
    if (tenantError) continue;

    const { data: adminRoles } = await supabase.from("user_roles").select("user_id").eq("tenant_id", tenantId).eq("role", "admin");
    if (!adminRoles || adminRoles.length === 0) continue;
    const adminUserIds = adminRoles.map(r => r.user_id);

    const { data: { users } } = await supabase.auth.admin.listUsers();
    if (!users) continue;
    const adminEmails = users.filter(u => adminUserIds.includes(u.id)).map(u => u.email).filter(Boolean) as string[];
    if (adminEmails.length === 0) continue;

    const { data: alert, error: alertError } = await supabase.from("system_alerts").insert({
      tenant_id: tenantId, alert_type: "stuck_installations", severity: "high",
      title: `${agentList.length} instalacao(oes) travada(s)`,
      message: `${agentList.length} agente(s) em estado travado detectados`,
      details: { stuck_agents: agentList.map(a => ({ agent_name: a.agent_name, agent_state: a.agent_state, lifecycle_status: a.lifecycle_status, last_heartbeat: a.last_heartbeat })), detected_at: new Date().toISOString(), request_id: requestId }
    }).select().single();

    if (!alertError) alertsCreated.push(alert);

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) continue;
    const resend = new Resend(resendApiKey);

    const emailHtml = `<h2>[WARN] Agentes em Estado Travado - ${tenant.name}</h2><p><strong>${agentList.length}</strong> agente(s):</p><ul>${agentList.map(a => `<li><strong>${a.agent_name}</strong> - Estado: ${a.agent_state || 'unknown'}, Status: ${a.lifecycle_status || 'unknown'}</li>`).join('')}</ul>`;

    try {
      const emailResult = await resend.emails.send({
        from: "CyberShield Alerts <alerts@cybershield.com>", to: adminEmails,
        subject: `[WARN] ${agentList.length} Agente(s) em Estado Travado - ${tenant.name}`, html: emailHtml
      });
      if (emailResult.data?.id) emailsSent.push({ tenant_id: tenantId, email_id: emailResult.data.id });
      if (alert) await supabase.from("system_alerts").update({ email_sent: true, email_sent_at: new Date().toISOString() }).eq("id", alert.id);
    } catch (emailError) { logger.error(`[${requestId}] Error sending email for tenant ${tenantId}:`, emailError); }
  }

  await supabase.rpc('log_scheduled_job_run', {
    p_job_key: 'detect-stuck-installations', p_success: true, p_duration_ms: Date.now() - startedAt,
    p_result: { stuck_count: stuckAgents.length, tenants_affected: Object.keys(stuckByTenant).length, alerts_created: alertsCreated.length, emails_sent: emailsSent.length },
    p_processed_count: stuckAgents.length, p_job_source: 'cron'
  });

  return { success: true, stuck_count: stuckAgents.length, tenants_affected: Object.keys(stuckByTenant).length, alerts_created: alertsCreated.length, emails_sent: emailsSent.length, request_id: requestId };
});
