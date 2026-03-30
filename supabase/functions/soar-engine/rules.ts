/**
 * SOAR Engine rules and event mapping
 */

export interface SOARRule {
  id: string;
  name: string;
  trigger_type: string;
  trigger_conditions: Record<string, unknown>;
  action_type: string;
  action_params: Record<string, unknown>;
  severity_filter: string[];
  enabled: boolean;
  requires_approval: boolean;
  cooldown_minutes: number;
}

export const BUILTIN_RULES: SOARRule[] = [
  { id: 'soar-builtin-001', name: 'Ransomware -> Isolate Host', trigger_type: 'ransomware_detected', trigger_conditions: {}, action_type: 'isolate_host', action_params: {}, severity_filter: ['critical', 'high'], enabled: true, requires_approval: false, cooldown_minutes: 0 },
  { id: 'soar-builtin-002', name: 'Token Exfiltration -> Revoke Token', trigger_type: 'token_exfiltration', trigger_conditions: {}, action_type: 'revoke_agent_token', action_params: {}, severity_filter: ['critical', 'high'], enabled: true, requires_approval: false, cooldown_minutes: 5 },
  { id: 'soar-builtin-003', name: 'AV Disabled -> Re-enable AV', trigger_type: 'antivirus_disabled', trigger_conditions: {}, action_type: 'check_antivirus', action_params: {}, severity_filter: ['critical', 'high', 'medium'], enabled: true, requires_approval: false, cooldown_minutes: 30 },
  { id: 'soar-builtin-004', name: 'Firewall Disabled -> Re-enable Firewall', trigger_type: 'firewall_disabled', trigger_conditions: {}, action_type: 'enable_firewall', action_params: {}, severity_filter: ['critical', 'high', 'medium'], enabled: true, requires_approval: false, cooldown_minutes: 30 },
  { id: 'soar-builtin-005', name: 'Suspicious Process -> Kill Process', trigger_type: 'suspicious_process', trigger_conditions: {}, action_type: 'kill_process', action_params: {}, severity_filter: ['critical'], enabled: true, requires_approval: true, cooldown_minutes: 5 },
  { id: 'soar-builtin-006', name: 'C2 Communication -> Block IP + Isolate', trigger_type: 'c2_communication', trigger_conditions: {}, action_type: 'isolate_host', action_params: { also_block_ip: true }, severity_filter: ['critical'], enabled: true, requires_approval: false, cooldown_minutes: 0 },
];

const EVENT_TRIGGER_MAP: Record<string, string> = {
  'ransomware': 'ransomware_detected',
  'ransomware_detected': 'ransomware_detected',
  'token_leak': 'token_exfiltration',
  'token_exfiltration': 'token_exfiltration',
  'antivirus_inactive': 'antivirus_disabled',
  'antivirus_disabled': 'antivirus_disabled',
  'firewall_disabled': 'firewall_disabled',
  'suspicious_process': 'suspicious_process',
  'c2_detected': 'c2_communication',
  'c2_communication': 'c2_communication',
  'DET-015': 'c2_communication',
  'DET-008': 'suspicious_process',
};

export function mapEventToTrigger(eventType: string): string {
  return EVENT_TRIGGER_MAP[eventType] || eventType;
}

export function matchRules(triggerType: string, severity: string): SOARRule[] {
  return BUILTIN_RULES.filter(r => r.enabled && r.trigger_type === triggerType && r.severity_filter.includes(severity));
}
