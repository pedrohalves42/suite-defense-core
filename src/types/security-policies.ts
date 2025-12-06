/**
 * Types for Security Policies System
 */

export type RuleType = 
  | 'usb_control'
  | 'software_restriction'
  | 'website_block'
  | 'firewall_rule'
  | 'process_block'
  | 'file_access'
  | 'registry_protection'
  | 'network_restriction';

export type RuleAction = 'allow' | 'block' | 'audit' | 'warn';

export interface SecurityPolicy {
  id: string;
  tenant_id: string;
  name: string;
  description?: string | null;
  is_active: boolean;
  priority: number;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  enabled?: boolean;
}

export interface SecurityPolicyRule {
  id: string;
  policy_id: string;
  rule_type: RuleType;
  action: RuleAction;
  target: string;
  conditions: Record<string, unknown>;
  is_enabled: boolean;
  created_at: string;
}

export interface AgentGroupPolicy {
  id: string;
  group_id: string;
  policy_id: string;
  assigned_at: string;
  assigned_by?: string | null;
}

export interface PolicyEnforcementLog {
  id: string;
  tenant_id: string;
  agent_id?: string | null;
  policy_id?: string | null;
  rule_id?: string | null;
  rule_type: string;
  action_taken: string;
  target: string;
  details: Record<string, unknown>;
  blocked: boolean;
  created_at: string;
}

export const RULE_TYPE_LABELS: Record<RuleType, string> = {
  usb_control: 'Controle de USB',
  software_restriction: 'Restrição de Software',
  website_block: 'Bloqueio de Sites',
  firewall_rule: 'Regra de Firewall',
  process_block: 'Bloqueio de Processos',
  file_access: 'Acesso a Arquivos',
  registry_protection: 'Proteção de Registro',
  network_restriction: 'Restrição de Rede',
};

export const RULE_TYPE_ICONS: Record<RuleType, string> = {
  usb_control: 'Usb',
  software_restriction: 'Package',
  website_block: 'Globe',
  firewall_rule: 'Shield',
  process_block: 'XCircle',
  file_access: 'FileWarning',
  registry_protection: 'Database',
  network_restriction: 'Wifi',
};

export const ACTION_LABELS: Record<RuleAction, string> = {
  allow: 'Permitir',
  block: 'Bloquear',
  audit: 'Auditar',
  warn: 'Alertar',
};

export const ACTION_COLORS: Record<RuleAction, string> = {
  allow: 'bg-green-500/10 text-green-500 border-green-500/20',
  block: 'bg-red-500/10 text-red-500 border-red-500/20',
  audit: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  warn: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
};
