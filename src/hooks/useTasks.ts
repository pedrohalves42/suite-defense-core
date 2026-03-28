import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { tenantQuery } from '@/lib/tenantQuery';
import { toast } from 'sonner';
import type { Json } from '@/integrations/supabase/types';
import { logger } from '@/lib/logger';
import { useRealtimeQuery } from '@/hooks/useRealtimeQuery';

export type TaskStatus = 'open' | 'in_progress' | 'blocked' | 'resolved' | 'ignored' | 'accepted_risk';
export type TaskSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type TaskSourceType = 'ai_insight' | 'system_alert' | 'playbook_execution' | 'red_team' | 'manual' | 'job' | 'dlq';

export interface Task {
  id: string;
  tenant_id: string;
  source_type: TaskSourceType;
  source_id: string | null;
  title: string;
  description: string | null;
  severity: TaskSeverity;
  status: TaskStatus;
  assigned_to: string | null;
  due_at: string | null;
  sla_breached_at: string | null;
  closed_at: string | null;
  closed_by: string | null;
  closure_reason: string | null;
  closure_evidence: Json;
  requires_human_review: boolean;
  auto_generated: boolean;
  playbook_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskFilters {
  status?: TaskStatus[];
  severity?: TaskSeverity[];
  sourceType?: TaskSourceType[];
  assignedTo?: string | null;
  slaBreach?: boolean;
}

// Interface aligned with v_task_stats view (ADR-026)
export interface TaskStats {
  tenant_id: string;
  total_tasks: number;
  pending: number;
  in_progress: number;
  completed: number;
  failed: number;
  // Computed properties for backward compatibility
  open_count?: number;
  in_progress_count?: number;
  blocked_count?: number;
  resolved_count?: number;
  ignored_count?: number;
  critical_open?: number;
  high_open?: number;
  sla_breached?: number;
  avg_resolution_hours?: number | null;
}

// Hook para listar tasks
export function useTasks(filters?: TaskFilters) {
  const { tenant, loading } = useTenant();

  return useRealtimeQuery<Task[]>({
    queryKey: ['tasks', tenant?.id, filters],
    queryFn: async () => {
      let query = tenantQuery('tasks', tenant!.id)
        .select('id, tenant_id, title, description, status, severity, source_type, source_id, assigned_to, created_at, updated_at, closed_at, due_at, sla_breached_at')
        .order('severity', { ascending: true })
        .order('created_at', { ascending: false });

      if (filters?.status && filters.status.length > 0) {
        query = query.in('status', filters.status);
      }

      if (filters?.severity && filters.severity.length > 0) {
        query = query.in('severity', filters.severity);
      }

      if (filters?.sourceType && filters.sourceType.length > 0) {
        query = query.in('source_type', filters.sourceType);
      }

      if (filters?.assignedTo !== undefined) {
        if (filters.assignedTo === null) {
          query = query.is('assigned_to', null);
        } else {
          query = query.eq('assigned_to', filters.assignedTo);
        }
      }

      if (filters?.slaBreach) {
        query = query.not('sla_breached_at', 'is', null);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as Task[];
    },
    enabled: !loading && !!tenant?.id,
    realtimeTable: 'tasks',
    realtimeFilter: tenant?.id ? `tenant_id=eq.${tenant.id}` : undefined,
  });
}

// Hook para estatísticas de tasks - computed from actual data
export function useTaskStats() {
  const { tenant, loading } = useTenant();

  return useRealtimeQuery<TaskStats>({
    queryKey: ['task-stats', tenant?.id],
    queryFn: async () => {
      const { data, error } = await tenantQuery('tasks', tenant!.id)
        .select('status, severity, sla_breached_at, closed_at, created_at');

      if (error) throw error;
      const tasks = (data || []) as Pick<Task, 'status' | 'severity' | 'sla_breached_at' | 'closed_at' | 'created_at'>[];

      const activeStatuses: TaskStatus[] = ['open', 'in_progress', 'blocked'];
      const active = tasks.filter(t => activeStatuses.includes(t.status as TaskStatus));

      const open_count = tasks.filter(t => t.status === 'open').length;
      const in_progress_count = tasks.filter(t => t.status === 'in_progress').length;
      const blocked_count = tasks.filter(t => t.status === 'blocked').length;
      const resolved_count = tasks.filter(t => t.status === 'resolved').length;
      const ignored_count = tasks.filter(t => t.status === 'ignored').length;
      const critical_open = active.filter(t => t.severity === 'critical').length;
      const high_open = active.filter(t => t.severity === 'high').length;
      const sla_breached = active.filter(t => t.sla_breached_at != null).length;

      const resolved = tasks.filter(t => t.closed_at);
      let avg_resolution_hours: number | null = null;
      if (resolved.length > 0) {
        const totalHours = resolved.reduce((sum, t) => {
          const created = new Date(t.created_at).getTime();
          const closed = new Date(t.closed_at!).getTime();
          return sum + (closed - created) / 3600000;
        }, 0);
        avg_resolution_hours = totalHours / resolved.length;
      }

      return {
        tenant_id: tenant!.id,
        total_tasks: tasks.length,
        pending: open_count,
        in_progress: in_progress_count,
        completed: resolved_count,
        failed: 0,
        open_count,
        in_progress_count,
        blocked_count,
        resolved_count,
        ignored_count,
        critical_open,
        high_open,
        sla_breached,
        avg_resolution_hours,
      } as TaskStats;
    },
    enabled: !loading && !!tenant?.id,
    realtimeTable: 'tasks',
    realtimeFilter: tenant?.id ? `tenant_id=eq.${tenant.id}` : undefined,
  });
}

// V-1029 FIX: Add tenant_id filter to prevent cross-tenant task access
export function useTaskDetail(taskId: string | null) {
  const { tenant, loading } = useTenant();

  return useQuery({
    queryKey: ['task-detail', tenant?.id, taskId],
    queryFn: async () => {
      if (!taskId || !tenant?.id) return null;

      const { data, error } = await supabase
        .from('tasks')
        .select('id, tenant_id, source_type, source_id, title, description, severity, status, assigned_to, due_at, sla_breached_at, closed_at, closed_by, closure_reason, closure_evidence, requires_human_review, auto_generated, playbook_id, created_at, updated_at')
        .eq('id', taskId)
        .eq('tenant_id', tenant.id)
        .maybeSingle();

      if (error) throw error;
      return data as Task | null;
    },
    enabled: !!taskId && !loading && !!tenant?.id,
  });
}

// V-1030 FIX: Add tenant_id filter to prevent cross-tenant task mutation
export function useUpdateTaskStatus() {
  const queryClient = useQueryClient();
  const { tenant } = useTenant();

  return useMutation({
    mutationFn: async ({ 
      taskId, 
      status,
      closureReason,
      closureEvidence 
    }: { 
      taskId: string; 
      status: TaskStatus;
      closureReason?: string;
      closureEvidence?: Json;
    }) => {
      if (!tenant?.id) throw new Error('Tenant not selected');
      const { data: { user } } = await supabase.auth.getUser();
      
      const updateData: Partial<Task> = {
        status,
        updated_at: new Date().toISOString(),
      };

      if (status === 'resolved' || status === 'ignored') {
        updateData.closed_at = new Date().toISOString();
        updateData.closed_by = user?.id;
        updateData.closure_reason = closureReason || null;
        updateData.closure_evidence = closureEvidence || {};
      }

      const { data, error } = await supabase
        .from('tasks')
        .update(updateData)
        .eq('id', taskId)
        .eq('tenant_id', tenant.id)
        .select()
        .single();

      if (error) throw error;
      return data as Task;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['task-stats'] });
      toast.success('Task atualizada com sucesso');
    },
    onError: (error) => {
      logger.error('Error updating task', error instanceof Error ? error : undefined);
      toast.error('Erro ao atualizar task');
    },
  });
}

// V-1030 FIX: Add tenant_id filter to prevent cross-tenant task assignment
export function useAssignTask() {
  const queryClient = useQueryClient();
  const { tenant } = useTenant();

  return useMutation({
    mutationFn: async ({ taskId, userId }: { taskId: string; userId: string | null }) => {
      if (!tenant?.id) throw new Error('Tenant not selected');
      const { data, error } = await supabase
        .from('tasks')
        .update({ 
          assigned_to: userId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', taskId)
        .eq('tenant_id', tenant.id)
        .select()
        .single();

      if (error) throw error;
      return data as Task;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast.success('Task atribuída com sucesso');
    },
    onError: (error) => {
      logger.error('Error assigning task', error instanceof Error ? error : undefined);
      toast.error('Erro ao atribuir task');
    },
  });
}

// Hook para contagem de tasks abertas (para badge no menu)
export function useOpenTasksCount() {
  const { tenant, loading } = useTenant();

  return useRealtimeQuery<number>({
    queryKey: ['open-tasks-count', tenant?.id],
    queryFn: async () => {
      const { count, error } = await tenantQuery('tasks', tenant!.id)
        .select('id', { count: 'exact', head: true })
        .in('status', ['open', 'in_progress']);

      if (error) throw error;
      return count || 0;
    },
    enabled: !loading && !!tenant?.id,
    realtimeTable: 'tasks',
    realtimeFilter: tenant?.id ? `tenant_id=eq.${tenant.id}` : undefined,
    staleTime: 30000,
  });
}
