import { formatBrazilDateTime } from '@/lib/date-utils';
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';
import { useTenant } from '@/hooks/useTenant';

export interface AutomationRule {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  trigger_type: string;
  trigger_conditions: {
    metric?: string;
    operator?: string;
    value?: number;
    duration_minutes?: number;
  };
  action_type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  action_config: any;
  target_scope: string;
  cooldown_minutes: number;
  last_triggered_at: string | null;
  trigger_count: number;
  priority: number;
  created_at: string;
}

export interface AutomationExecution {
  id: string;
  rule_id: string;
  agent_id: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  trigger_data: any;
  action_taken: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  action_result: any | null;
  status: string;
  triggered_at: string;
}

export const METRIC_OPTIONS = [
  { value: 'cpu_usage_percent', label: 'CPU (%)' },
  { value: 'memory_usage_percent', label: 'Memória (%)' },
  { value: 'disk_usage_percent', label: 'Disco (%)' },
];

export const OPERATOR_OPTIONS = [
  { value: '>', label: '>' },
  { value: '>=', label: '>=' },
  { value: '<', label: '<' },
  { value: '<=', label: '<=' },
  { value: '==', label: '==' },
];

export const ACTION_OPTIONS = [
  { value: 'send_alert', label: 'Enviar Alerta' },
  { value: 'create_alert', label: 'Criar Alerta' },
  { value: 'create_job', label: 'Criar Job de Remediação' },
];

export function useAutomationRules() {
  const { tenant } = useTenant();
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [executions, setExecutions] = useState<AutomationExecution[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newRule, setNewRule] = useState({
    name: '', description: '', trigger_metric: 'cpu_usage_percent',
    trigger_operator: '>', trigger_value: 90, action_type: 'send_alert',
    cooldown_minutes: 30, priority: 5,
  });

  const fetchData = async () => {
    if (!tenant?.id) return;
    try {
      const [rulesRes, execRes] = await Promise.all([
        supabase.from('automation_rules')
          .select('id, name, description, trigger_type, trigger_conditions, action_type, action_config, is_active, cooldown_minutes, last_triggered_at, priority, created_at, tenant_id, dry_run')
          .eq('tenant_id', tenant.id).order('priority', { ascending: true }),
        supabase.from('automation_executions')
          .select('id, rule_id, agent_id, trigger_data, action_taken, action_result, status, triggered_at, tenant_id')
          .eq('tenant_id', tenant.id).order('triggered_at', { ascending: false }).limit(50),
      ]);
      if (rulesRes.data) setRules(rulesRes.data as unknown as AutomationRule[]);
      if (execRes.data) setExecutions(execRes.data as unknown as AutomationExecution[]);
    } catch (error) {
      logger.error('Error fetching automation data', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [tenant?.id]);

  const createRule = async () => {
    if (!tenant?.id || !newRule.name.trim()) return;
    try {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.from('automation_rules').insert({
        tenant_id: tenant.id, name: newRule.name.trim(), description: newRule.description || null,
        trigger_type: 'metric_threshold',
        trigger_conditions: { metric: newRule.trigger_metric, operator: newRule.trigger_operator, value: newRule.trigger_value },
        action_type: newRule.action_type,
        action_config: newRule.action_type === 'create_job' ? { job_type: 'health_report' } : {},
        cooldown_minutes: newRule.cooldown_minutes, priority: newRule.priority,
        created_by: userData.user?.id,
      });
      if (error) throw error;
      toast({ title: 'Regra criada', description: `"${newRule.name}" ativada com sucesso` });
      setShowCreateDialog(false);
      setNewRule({ name: '', description: '', trigger_metric: 'cpu_usage_percent', trigger_operator: '>', trigger_value: 90, action_type: 'send_alert', cooldown_minutes: 30, priority: 5 });
      fetchData();
    } catch (error: unknown) {
      toast({ title: 'Erro', description: (error as Error).message, variant: 'destructive' });
    }
  };

  const toggleRule = async (ruleId: string, isActive: boolean) => {
    try {
      const { error } = await supabase.from('automation_rules').update({ is_active: isActive }).eq('id', ruleId).eq('tenant_id', tenant?.id);
      if (error) throw error;
      setRules(prev => prev.map(r => r.id === ruleId ? { ...r, is_active: isActive } : r));
    } catch (error: unknown) {
      toast({ title: 'Erro', description: (error as Error).message, variant: 'destructive' });
    }
  };

  const deleteRule = async (ruleId: string) => {
    try {
      const { error } = await supabase.from('automation_rules').delete().eq('id', ruleId).eq('tenant_id', tenant?.id);
      if (error) throw error;
      setRules(prev => prev.filter(r => r.id !== ruleId));
      toast({ title: 'Regra removida' });
    } catch (error: unknown) {
      toast({ title: 'Erro', description: (error as Error).message, variant: 'destructive' });
    }
  };

  const runEvaluation = async () => {
    if (!tenant?.id) return;
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) return;
      const { data, error } = await supabase.functions.invoke('ops-router', {
        body: { action: 'automation:evaluate', payload: { tenant_id: tenant.id } },
        headers: { Authorization: `Bearer ${session.session.access_token}` },
      });
      if (error) throw error;
      toast({ title: 'Avaliação concluída', description: `${data.evaluated} regras avaliadas, ${data.triggered} acionadas` });
      fetchData();
    } catch (error: unknown) {
      toast({ title: 'Erro', description: (error as Error).message, variant: 'destructive' });
    }
  };

  const getMetricLabel = (metric: string) => METRIC_OPTIONS.find(m => m.value === metric)?.label || metric;
  const getActionLabel = (action: string) => ACTION_OPTIONS.find(a => a.value === action)?.label || action;

  return {
    rules, executions, loading,
    showCreateDialog, setShowCreateDialog,
    newRule, setNewRule,
    createRule, toggleRule, deleteRule, runEvaluation,
    getMetricLabel, getActionLabel,
  };
}
