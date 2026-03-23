/**
 * insight-actions.ts
 * 
 * Implements real actions for AI insights.
 * Creates jobs, updates agent states, and logs actions.
 */

import { supabase } from '@/integrations/supabase/client';
import { prepareJobForInsert } from '@/lib/job-utils';

export interface ActionResult {
  success: boolean;
  message: string;
  jobId?: string;
}

/**
 * Executes an insight action by creating jobs or updating agent state.
 */
export async function executeInsightAction(
  action: string,
  agentId: string,
  agentName: string,
  tenantId: string,
  insightId: string
): Promise<ActionResult> {
  try {
    switch (action) {
      case 'navigate_agent':
        // Navigation is handled in frontend
        return { success: true, message: 'Navegando para agente' };

      case 'collect_diagnostics':
      case 'collect_logs': {
        const logJob = await prepareJobForInsert({
          tenant_id: tenantId,
          agent_id: agentId,
          agent_name: agentName,
          type: 'collect_logs',
          status: 'queued',
          payload: { 
            source: 'insight_action', 
            insight_id: insightId,
            requested_at: new Date().toISOString()
          },
        });
        const { data, error } = await supabase.from('jobs').insert(logJob).select('id').single();
        if (error) throw error;
        return { 
          success: true, 
          message: 'Coleta de logs iniciada',
          jobId: data?.id 
        };
      }

      case 'force_health_report':
      case 'health_report': {
        const healthJob = await prepareJobForInsert({
          tenant_id: tenantId,
          agent_id: agentId,
          agent_name: agentName,
          type: 'health_report',
          status: 'queued',
          payload: { 
            source: 'insight_action', 
            insight_id: insightId,
            priority: 'high'
          },
        });
        const { data, error } = await supabase.from('jobs').insert(healthJob).select('id').single();
        if (error) throw error;
        return { 
          success: true, 
          message: 'Relatório de saúde solicitado',
          jobId: data?.id 
        };
      }

      case 'restart_services': {
        const restartJob = await prepareJobForInsert({
          tenant_id: tenantId,
          agent_id: agentId,
          agent_name: agentName,
          type: 'restart_services',
          status: 'queued',
          payload: { 
            source: 'insight_action', 
            insight_id: insightId,
            services: ['CyberShieldAgent']
          },
        });
        const { data, error } = await supabase.from('jobs').insert(restartJob).select('id').single();
        if (error) throw error;
        return { 
          success: true, 
          message: 'Reinício de serviços agendado',
          jobId: data?.id 
        };
      }

      case 'ping': {
        const pingJob = await prepareJobForInsert({
          tenant_id: tenantId,
          agent_id: agentId,
          agent_name: agentName,
          type: 'ping',
          status: 'queued',
          payload: { 
            source: 'insight_action', 
            insight_id: insightId 
          },
        });
        const { data, error } = await supabase.from('jobs').insert(pingJob).select('id').single();
        if (error) throw error;
        return { 
          success: true, 
          message: 'Ping enviado ao agente',
          jobId: data?.id 
        };
      }

      case 'isolate_agent': {
        // V-1052 FIX: Add tenant_id filter to prevent cross-tenant agent manipulation
        const { error } = await supabase.from('agents').update({
          is_isolated: true,
          isolation_reason: `Isolated via insight ${insightId}`,
          isolated_at: new Date().toISOString(),
        }).eq('id', agentId).eq('tenant_id', tenantId);
        if (error) throw error;
        return { success: true, message: 'Agente isolado com sucesso' };
      }

      case 'remove_isolation': {
        // V-1052 FIX: Add tenant_id filter to prevent cross-tenant agent manipulation
        const { error } = await supabase.from('agents').update({
          is_isolated: false,
          isolation_reason: null,
          isolated_at: null,
        }).eq('id', agentId).eq('tenant_id', tenantId);
        if (error) throw error;
        return { success: true, message: 'Isolamento removido' };
      }

      case 'check_services': {
        const checkJob = await prepareJobForInsert({
          tenant_id: tenantId,
          agent_id: agentId,
          agent_name: agentName,
          type: 'check_services',
          status: 'queued',
          payload: { 
            source: 'insight_action', 
            insight_id: insightId 
          },
        });
        const { data, error } = await supabase.from('jobs').insert(checkJob).select('id').single();
        if (error) throw error;
        return { 
          success: true, 
          message: 'Verificação de serviços iniciada',
          jobId: data?.id 
        };
      }

      case 'disk_cleanup': {
        const cleanupJob = await prepareJobForInsert({
          tenant_id: tenantId,
          agent_id: agentId,
          agent_name: agentName,
          type: 'disk_cleanup',
          status: 'queued',
          payload: { 
            source: 'insight_action', 
            insight_id: insightId,
            targets: ['temp', 'logs', 'cache']
          },
        });
        const { data, error } = await supabase.from('jobs').insert(cleanupJob).select('id').single();
        if (error) throw error;
        return { 
          success: true, 
          message: 'Limpeza de disco agendada',
          jobId: data?.id 
        };
      }

      case 'run_scan': {
        const scanJob = await prepareJobForInsert({
          tenant_id: tenantId,
          agent_id: agentId,
          agent_name: agentName,
          type: 'antivirus_scan',
          status: 'queued',
          payload: { 
            source: 'insight_action', 
            insight_id: insightId,
            scan_type: 'quick'
          },
        });
        const { data, error } = await supabase.from('jobs').insert(scanJob).select('id').single();
        if (error) throw error;
        return { 
          success: true, 
          message: 'Verificação de segurança agendada',
          jobId: data?.id 
        };
      }

      default:
        return { 
          success: false, 
          message: `Ação "${action}" não implementada` 
        };
    }
  } catch (error) {
    logger.error('Error executing insight action', error instanceof Error ? error : undefined);
    return { 
      success: false, 
      message: error instanceof Error ? error.message : 'Erro ao executar ação' 
    };
  }
}

/**
 * Gets a user-friendly label for an action.
 */
export function getActionLabel(action: string): string {
  const labels: Record<string, string> = {
    'navigate_agent': 'Ver Agente',
    'collect_diagnostics': 'Coletar Diagnóstico',
    'collect_logs': 'Coletar Logs',
    'force_health_report': 'Relatório de Saúde',
    'health_report': 'Relatório de Saúde',
    'restart_services': 'Reiniciar Serviços',
    'ping': 'Testar Conexão',
    'isolate_agent': 'Isolar Agente',
    'remove_isolation': 'Remover Isolamento',
    'check_services': 'Verificar Serviços',
    'disk_cleanup': 'Limpar Disco',
    'run_scan': 'Executar Verificação',
  };
  return labels[action] || action;
}
