// check-action-effectiveness.use-case.ts
import { ICheckRepository } from '../../_shared/hexagonal/repositories/check.repository.ts';
import { logger } from '../../_shared/logger.ts';

type EffectivenessResult = { status: 'resolved' | 'partial' | 'failed' | 'unknown'; evidence: Record<string, unknown>; reason: string; };

export class CheckActionEffectivenessUseCase {
  constructor(private readonly checkRepository: ICheckRepository) {}

  async execute(requestId: string, _payload: Record<string, unknown>) {
    const startedAt = Date.now();
    logger.info(`[${requestId}] CheckActionEffectivenessUseCase: Starting effectiveness check`);

    // This logic is quite complex and involves many tables. 
    // For now I'll extract it as is but using the repository's supabase client where needed.
    // In a full hexagonal implementation, these would be repository methods.
    
    const { data: pendingActions, error: fetchError } = await (this.checkRepository as any).supabase
      .from('agent_actions')
      .select('id, agent_id, type, created_at, evidence, tenant_id')
      .eq('status', 'completed')
      .is('effectiveness_status', null)
      .order('created_at', { ascending: false })
      .limit(50);

    if (fetchError) throw fetchError;

    if (!pendingActions || pendingActions.length === 0) {
      return { success: true, checked: 0, updated: 0, timestamp: new Date().toISOString() };
    }

    let updatedCount = 0;
    for (const action of pendingActions) {
      let result: EffectivenessResult = { status: 'unknown', evidence: {}, reason: 'Unsupported action type' };

      try {
        if (action.type === 'block_domain') {
          result = await this.checkDnsActivity(action.agent_id, action.created_at, action.evidence as Record<string, unknown>);
        } else if (action.type === 'enable_antivirus') {
          result = await this.checkAntivirusStatus(action.agent_id, action.created_at, 'enabled');
        } else if (action.type === 'quarantine_file') {
          // Add logic for other types as needed
        }

        if (result.status !== 'unknown') {
          await (this.checkRepository as any).supabase
            .from('agent_actions')
            .update({
              effectiveness_status: result.status,
              effectiveness_evidence: result.evidence,
              effectiveness_checked_at: new Date().toISOString(),
              effectiveness_reason: result.reason
            })
            .eq('id', action.id);
          updatedCount++;
        }
      } catch (err) {
        logger.error(`[${requestId}] Error checking effectiveness for action ${action.id}:`, err);
      }
    }

    const duration = Date.now() - startedAt;
    return { success: true, checked: pendingActions.length, updated: updatedCount, duration_ms: duration };
  }

  private async checkDnsActivity(agentId: string, actionCreatedAt: string, originalEvidence: Record<string, unknown>): Promise<EffectivenessResult> {
    const domain = originalEvidence?.domain || originalEvidence?.blocked_domain;
    if (!domain) return { status: 'unknown', evidence: {}, reason: 'No domain in original evidence' };

    const { data: recentActivity, error } = await (this.checkRepository as any).supabase
      .from('agent_web_activity').select('id, domain, visited_at, is_blocked')
      .eq('agent_id', agentId).eq('domain', domain).gt('visited_at', actionCreatedAt).limit(10);

    if (error) return { status: 'unknown', evidence: { error: error.message }, reason: 'Query failed' };

    const activities = recentActivity as Array<{ id: string; domain: string; visited_at: string; is_blocked: boolean }> || [];
    const attempts = activities.length;
    const blockedAttempts = activities.filter(a => a.is_blocked).length;

    if (attempts === 0) return { status: 'resolved', evidence: { domain, attempts_after_action: 0 }, reason: `Nenhuma tentativa de acesso ao dominio ${domain} apos o bloqueio` };
    if (blockedAttempts === attempts) return { status: 'resolved', evidence: { domain, attempts, all_blocked: true }, reason: `Todas ${attempts} tentativas foram bloqueadas` };
    return { status: 'partial', evidence: { domain, attempts, blocked: blockedAttempts, unblocked: attempts - blockedAttempts }, reason: `${attempts - blockedAttempts} tentativa(s) nao bloqueada(s)` };
  }

  private async checkAntivirusStatus(agentId: string, actionCreatedAt: string, expectedState: string): Promise<EffectivenessResult> {
    const { data: avStatus, error } = await (this.checkRepository as any).supabase
      .from('antivirus_status').select('status, engine_name, last_update_at')
      .eq('agent_id', agentId).order('created_at', { ascending: false }).limit(1).single();

    if (error) return { status: 'unknown', evidence: { error: error.message }, reason: 'Failed to fetch AV status' };
    if (!avStatus) return { status: 'unknown', evidence: {}, reason: 'No AV status found' };

    const lastUpdateAt = avStatus.last_update_at;
    const isResolved = expectedState === 'enabled' ? avStatus.status === 'active' || avStatus.status === 'enabled' : !!lastUpdateAt && new Date(lastUpdateAt) > new Date(actionCreatedAt);

    if (isResolved) return { status: 'resolved', evidence: avStatus, reason: `Antivirus status is now ${avStatus.status}` };
    return { status: 'failed', evidence: avStatus, reason: `Antivirus status is ${avStatus.status}, expected ${expectedState}` };
  }
}
