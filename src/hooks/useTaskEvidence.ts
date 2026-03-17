import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';

export type TaskEvidenceType = 'log' | 'snapshot' | 'diff' | 'report' | 'decision' | 'timeline';

export interface TaskEvidence {
  id: string;
  task_id: string;
  tenant_id: string;
  evidence_type: TaskEvidenceType;
  title: string;
  content: Json;
  content_hash: string;
  storage_ref: string | null;
  created_at: string;
  created_by: string | null;
}

export function useTaskEvidence(taskId: string | null) {
  return useQuery({
    queryKey: ['task-evidence', taskId],
    queryFn: async () => {
      if (!taskId) return [];

      const { data, error } = await supabase
        .from('task_evidence')
        .select('id, task_id, tenant_id, evidence_type, title, content_hash, storage_ref, created_at, created_by')
        .eq('task_id', taskId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data as TaskEvidence[];
    },
    enabled: !!taskId,
  });
}

export const EVIDENCE_TYPE_LABELS: Record<TaskEvidenceType, string> = {
  log: 'Log',
  snapshot: 'Snapshot',
  diff: 'Diferenças',
  report: 'Relatório',
  decision: 'Decisão',
  timeline: 'Timeline',
};

export const EVIDENCE_TYPE_ICONS: Record<TaskEvidenceType, string> = {
  log: 'FileText',
  snapshot: 'Camera',
  diff: 'GitCompare',
  report: 'FileCheck',
  decision: 'Gavel',
  timeline: 'History',
};
