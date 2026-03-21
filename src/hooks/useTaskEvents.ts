import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';

export type TaskEventActorType = 'system' | 'ai' | 'human';

export interface TaskEvent {
  id: string;
  task_id: string;
  tenant_id: string;
  actor_type: TaskEventActorType;
  actor_id: string | null;
  action: string;
  metadata: Json;
  created_at: string;
}

export function useTaskEvents(taskId: string | null) {
  return useQuery({
    queryKey: ['task-events', taskId],
    queryFn: async () => {
      if (!taskId) return [];

      const { data, error } = await supabase
        .from('task_events')
        .select('id, task_id, event_type, actor_id, actor_name, old_value, new_value, comment, created_at')
        .eq('task_id', taskId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data as TaskEvent[];
    },
    enabled: !!taskId,
  });
}

// Labels for task event actions
export const TASK_EVENT_LABELS: Record<string, string> = {
  created: 'Task criada',
  status_changed: 'Status alterado',
  assigned: 'Task atribuída',
  sla_breached: 'SLA violado',
  escalated: 'Escalada',
  warning: 'Aviso',
  evidence_collected: 'Evidência coletada',
};

// Icons for task event actor types
export const ACTOR_TYPE_LABELS: Record<TaskEventActorType, string> = {
  system: 'Sistema',
  ai: 'IA',
  human: 'Usuário',
};
