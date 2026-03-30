import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../_shared/logger.ts';

const LOW_RISK_ACTIONS = ['notify', 'generate_report', 'log_event', 'update_status', 'send_alert'];
const MAX_AUTO_EXECUTIONS_PER_DAY = 100;

export function isLowRiskAction(actionType: string): boolean {
  return LOW_RISK_ACTIONS.includes(actionType);
}

export async function isActionWhitelisted(supabase: SupabaseClient, actionType: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('ai_action_configs')
    .select('is_enabled')
    .eq('action_type', actionType)
    .eq('is_enabled', true)
    .maybeSingle();
  if (error) { logger.error('[ai-insight-dispatcher] Whitelist check error:', error); return false; }
  return !!data;
}

export async function checkAutoExecutionRateLimit(supabase: SupabaseClient, tenantId: string): Promise<boolean> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const { count, error } = await supabase
    .from('ai_action_executions')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('execution_status', 'executed')
    .gte('executed_at', today.toISOString());
  if (error) { logger.error('[ai-insight-dispatcher] Rate limit check error:', error); return false; }
  return (count || 0) < MAX_AUTO_EXECUTIONS_PER_DAY;
}
