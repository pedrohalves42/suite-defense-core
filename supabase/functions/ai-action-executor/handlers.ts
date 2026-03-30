/**
 * Action type handlers for ai-action-executor
 */
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import {
  DiagnosticJobPayloadSchema, SystemAlertPayloadSchema,
  SuggestAgentRestartPayloadSchema, SuggestConfigChangePayloadSchema,
  SuggestJobCleanupPayloadSchema, DeleteOldDataPayloadSchema,
  QuarantineAgentPayloadSchema, IsolateAgentPayloadSchema,
  RevokeTokenPayloadSchema, DisableUserPayloadSchema,
  BlockIpPayloadSchema, IncludeFirewallRulePayloadSchema,
  RestartServicePayloadSchema, AcknowledgeAlertPayloadSchema,
  CleanupStuckJobsPayloadSchema,
} from '../_shared/validation.ts';

type ActionResult = Record<string, unknown>;

export async function executeActionByType(
  actionType: string,
  actionPayload: Record<string, unknown>,
  supabase: SupabaseClient,
  tenantId: string,
  insightId: string | null,
  userId: string,
  req: Request,
): Promise<ActionResult> {
  switch (actionType) {
    case 'create_diagnostic_job': {
      const payload = DiagnosticJobPayloadSchema.parse(actionPayload);
      const { data: job, error } = await supabase.from('jobs').insert({
        tenant_id: tenantId, agent_name: payload.agent_name, type: 'diagnostic',
        status: 'queued', approved: true,
        payload: { diagnostic_type: payload.diagnostic_type, priority: payload.priority, reason: 'AI-suggested diagnostic', insight_id: insightId, checks: ['heartbeat', 'metrics', 'jobs', 'token'], ...(payload.metadata ?? {}) },
      }).select().maybeSingle();
      if (error) throw error;
      return { job_id: job?.id, agent_name: payload.agent_name };
    }

    case 'create_system_alert': {
      const payload = SystemAlertPayloadSchema.parse(actionPayload);
      const { data: alert, error } = await supabase.from('system_alerts').insert({
        tenant_id: tenantId, alert_type: payload.alert_type, severity: payload.severity,
        title: payload.message.slice(0, 80), message: payload.message,
        details: { insight_id: insightId, source: 'ai-action-executor', ...(payload.metadata ?? {}) },
      }).select().maybeSingle();
      if (error) throw error;
      return { alert_id: alert?.id };
    }

    case 'suggest_agent_restart': {
      const payload = SuggestAgentRestartPayloadSchema.parse(actionPayload);
      return { suggestion_type: 'agent_restart', agent_name: payload.agent_name, reason: payload.reason, urgency: payload.urgency, note: 'Suggestion recorded. Manual action required.' };
    }

    case 'suggest_config_change': {
      const payload = SuggestConfigChangePayloadSchema.parse(actionPayload);
      return { suggestion_type: 'config_change', agent_name: payload.agent_name, config_key: payload.config_key, suggested_value: payload.suggested_value, reason: payload.reason, note: 'Suggestion recorded. Manual action required.' };
    }

    case 'suggest_job_cleanup': {
      const payload = SuggestJobCleanupPayloadSchema.parse(actionPayload);
      return { suggestion_type: 'job_cleanup', agent_name: payload.agent_name, job_status: payload.job_status, older_than_days: payload.older_than_days, reason: payload.reason, note: 'Suggestion recorded. Manual action required.' };
    }

    case 'delete_old_data': {
      const payload = DeleteOldDataPayloadSchema.parse(actionPayload);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - payload.older_than_days);
      let deletedCount = 0;
      const tables: string[] = [];

      if (payload.data_type === 'jobs' || payload.data_type === 'all') {
        if (!payload.dry_run) {
          let query = supabase.from('jobs').delete().eq('tenant_id', tenantId).lt('created_at', cutoffDate.toISOString());
          if (payload.job_status !== 'all') query = query.eq('status', payload.job_status);
          const { data: deletedJobs } = await query.select('id');
          deletedCount += deletedJobs?.length || 0;
        }
        tables.push('jobs');
      }
      if (payload.data_type === 'alerts' || payload.data_type === 'all') {
        if (!payload.dry_run) {
          const { data: deletedAlerts } = await supabase.from('system_alerts').delete().eq('tenant_id', tenantId).lt('created_at', cutoffDate.toISOString()).eq('acknowledged', true).select('id');
          deletedCount += deletedAlerts?.length || 0;
        }
        tables.push('system_alerts');
      }
      return { action: 'delete_old_data', tables_affected: tables, cutoff_date: cutoffDate.toISOString(), deleted_count: deletedCount, dry_run: payload.dry_run, reason: payload.reason };
    }

    case 'quarantine_agent': {
      const payload = QuarantineAgentPayloadSchema.parse(actionPayload);
      const { data: agent, error: agentError } = await supabase.from('agents').select('id, agent_name, is_isolated').eq('tenant_id', tenantId).eq('agent_name', payload.agent_name).maybeSingle();
      if (agentError || !agent) throw new Error(`Agent ${payload.agent_name} not found`);
      const { error: updateError } = await supabase.from('agents').update({ is_isolated: true, isolated_at: new Date().toISOString(), isolation_reason: payload.reason }).eq('id', agent.id);
      if (updateError) throw updateError;
      if (payload.notify_admin) {
        await supabase.from('system_alerts').insert({ tenant_id: tenantId, alert_type: 'warning', severity: 'high', title: `Agente ${payload.agent_name} foi colocado em quarentena`, message: payload.reason, details: { agent_id: agent.id, source: 'ai-action-executor' } });
      }
      return { action: 'quarantine_agent', agent_id: agent.id, agent_name: payload.agent_name, quarantined: true, reason: payload.reason };
    }

    case 'isolate_agent': {
      const payload = IsolateAgentPayloadSchema.parse(actionPayload);
      const { data: agent, error: agentError } = await supabase.from('agents').select('id, agent_name').eq('tenant_id', tenantId).eq('agent_name', payload.agent_name).maybeSingle();
      if (agentError || !agent) throw new Error(`Agent ${payload.agent_name} not found`);
      await supabase.from('agents').update({ is_isolated: true, isolated_at: new Date().toISOString(), isolation_reason: `[${payload.isolation_level.toUpperCase()}] ${payload.reason}` }).eq('id', agent.id);
      if (payload.isolation_level !== 'soft') {
        await supabase.from('jobs').insert({ tenant_id: tenantId, agent_name: payload.agent_name, type: 'config', status: 'queued', approved: true, payload: { action: 'isolate_network', level: payload.isolation_level, allow_management: payload.allow_management, duration_hours: payload.duration_hours } });
      }
      return { action: 'isolate_agent', agent_id: agent.id, agent_name: payload.agent_name, isolation_level: payload.isolation_level, isolated: true };
    }

    case 'revoke_token': {
      const payload = RevokeTokenPayloadSchema.parse(actionPayload);
      const { data: agent, error: agentError } = await supabase.from('agents').select('id, agent_name').eq('tenant_id', tenantId).eq('agent_name', payload.agent_name).maybeSingle();
      if (agentError || !agent) throw new Error(`Agent ${payload.agent_name} not found`);
      const { data: revokedTokens, error: revokeError } = await supabase.from('agent_tokens').update({ is_active: false }).eq('agent_id', agent.id).eq('is_active', true).select('id');
      if (revokeError) throw revokeError;
      return { action: 'revoke_token', agent_id: agent.id, agent_name: payload.agent_name, tokens_revoked: revokedTokens?.length || 0, force_reenrollment: payload.force_reenrollment, reason: payload.reason };
    }

    case 'disable_user': {
      const payload = DisableUserPayloadSchema.parse(actionPayload);
      await supabase.from('security_logs').insert({ tenant_id: tenantId, user_id: userId, ip_address: req.headers.get('x-forwarded-for') || 'unknown', endpoint: '/functions/v1/ai-action-executor', attack_type: 'ai_disable_user_request', severity: 'high', blocked: false, user_agent: req.headers.get('user-agent') || 'unknown', details: { target_email: payload.user_email, reason: payload.reason } });
      return { action: 'disable_user', user_email: payload.user_email, reason: payload.reason, duration_hours: payload.duration_hours, note: 'User disable is a manual action.', requires_manual_action: true };
    }

    case 'block_ip': {
      const payload = BlockIpPayloadSchema.parse(actionPayload);
      const jobPayload: Record<string, unknown> = { ip_address: payload.ip_address, duration_hours: payload.duration_hours, scope: payload.scope, reason: payload.reason };
      if (payload.agent_name) {
        const { data: agent } = await supabase.from('agents').select('id').eq('tenant_id', tenantId).eq('agent_name', payload.agent_name).maybeSingle();
        if (agent) jobPayload.agent_id = agent.id;
      }
      const { data: job, error } = await supabase.from('jobs').insert({ tenant_id: tenantId, agent_name: payload.agent_name || 'all', type: 'config', status: 'queued', approved: true, payload: { action: 'block_ip', ...jobPayload } }).select().maybeSingle();
      if (error) throw error;
      return { action: 'block_ip', job_id: job?.id, ip_address: payload.ip_address, scope: payload.scope, duration_hours: payload.duration_hours };
    }

    case 'include_firewall_rule': {
      const payload = IncludeFirewallRulePayloadSchema.parse(actionPayload);
      const { data: job, error } = await supabase.from('jobs').insert({ tenant_id: tenantId, agent_name: payload.agent_name, type: 'fix_firewall', status: 'queued', approved: true, payload: { rule_type: payload.rule_type, protocol: payload.protocol, port: payload.port, port_range: payload.port_range, ip_address: payload.ip_address, direction: payload.direction, reason: payload.reason } }).select().maybeSingle();
      if (error) throw error;
      return { action: 'include_firewall_rule', job_id: job?.id, agent_name: payload.agent_name, rule_type: payload.rule_type, protocol: payload.protocol, direction: payload.direction };
    }

    case 'restart_service': {
      const payload = RestartServicePayloadSchema.parse(actionPayload);
      const { data: job, error } = await supabase.from('jobs').insert({ tenant_id: tenantId, agent_name: payload.agent_name, type: 'restart_service', status: 'queued', approved: true, payload: { service_name: payload.service_name, force: payload.force, timeout_seconds: payload.timeout_seconds, reason: payload.reason } }).select().maybeSingle();
      if (error) throw error;
      return { action: 'restart_service', job_id: job?.id, agent_name: payload.agent_name, service_name: payload.service_name };
    }

    case 'acknowledge_alerts': {
      const payload = AcknowledgeAlertPayloadSchema.parse(actionPayload);
      let query = supabase.from('system_alerts').update({ acknowledged: true, acknowledged_at: new Date().toISOString() }).eq('tenant_id', tenantId).eq('acknowledged', false);
      if (!payload.acknowledge_all && payload.alert_ids) query = query.in('id', payload.alert_ids);
      const { data: acknowledgedAlerts, error } = await query.select('id');
      if (error) throw error;
      return { action: 'acknowledge_alerts', acknowledged_count: acknowledgedAlerts?.length || 0, all_alerts: payload.acknowledge_all, reason: payload.reason };
    }

    case 'cleanup_stuck_jobs': {
      const payload = CleanupStuckJobsPayloadSchema.parse(actionPayload);
      const cutoffDate = new Date();
      cutoffDate.setHours(cutoffDate.getHours() - payload.older_than_hours);
      if (!payload.dry_run) {
        let query = supabase.from('jobs').update({ status: 'failed', completed_at: new Date().toISOString() }).eq('tenant_id', tenantId).in('status', ['pending', 'in_progress']).lt('created_at', cutoffDate.toISOString());
        if (payload.agent_name) query = query.eq('agent_name', payload.agent_name);
        if (payload.job_types && payload.job_types.length > 0) query = query.in('type', payload.job_types);
        const { data: cleanedJobs, error } = await query.select('id');
        if (error) throw error;
        return { action: 'cleanup_stuck_jobs', jobs_cleaned: cleanedJobs?.length || 0, cutoff_hours: payload.older_than_hours, agent_filter: payload.agent_name || 'all', dry_run: false };
      }
      return { action: 'cleanup_stuck_jobs', cutoff_hours: payload.older_than_hours, agent_filter: payload.agent_name || 'all', dry_run: true, note: 'Dry run - no changes made' };
    }

    default:
      throw new Error(`Action type ${actionType} not implemented`);
  }
}
