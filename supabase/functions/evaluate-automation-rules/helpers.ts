/**
 * Shared helpers for evaluate-automation-rules
 */

export function evaluateOperator(value: number, operator: string, threshold: number): boolean {
  switch (operator) {
    case '>': return value > threshold;
    case '>=': return value >= threshold;
    case '<': return value < threshold;
    case '<=': return value <= threshold;
    case '==': return value === threshold;
    default: return false;
  }
}

export function isInCooldown(rule: Record<string, unknown>): boolean {
  if (!rule.last_triggered_at) return false;
  const cooldownMs = ((rule.cooldown_minutes as number) || 30) * 60 * 1000;
  return Date.now() - new Date(rule.last_triggered_at as string).getTime() < cooldownMs;
}

export function matchesScope(rule: Record<string, unknown>, agentId: string): boolean {
  if (rule.target_scope === 'all_agents') return true;
  if (rule.target_scope === 'specific_agent') {
    return ((rule.target_ids as string[]) || []).includes(agentId);
  }
  return true;
}

export function generateIdempotencyKey(agentId: string, ruleId: string): string {
  const hourBucket = Math.floor(Date.now() / (60 * 60 * 1000));
  return `${ruleId}:${agentId}:${hourBucket}`;
}
