import type { PlaybookAction, ActionContext } from '../types.ts';

export async function handleNotify(
  action: PlaybookAction,
  ctx: ActionContext
): Promise<Record<string, unknown>> {
  const { supabase, tenantId, agentId, playbookSnapshot, triggerContext } = ctx;
  const payload = action.action_payload;

  const { data: notification } = await supabase
    .from('notification_queue')
    .insert({
      tenant_id: tenantId,
      channel: (payload.channels as string[])?.[0] || 'email',
      recipient_type: 'admin',
      subject: `[CyberShield] Playbook: ${action.label}`,
      message: action.description || 'Acao de playbook executada',
      priority: 'high',
      metadata: {
        playbook_execution_id: ctx.executionId,
        playbook_version: playbookSnapshot.version,
        action_id: action.id,
        agent_id: agentId,
        context: triggerContext,
      },
    })
    .select('id')
    .single();

  return { notification_id: notification?.id, channels: payload.channels };
}
