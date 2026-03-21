import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatBrazilDateTime } from '@/lib/date-utils';

interface RecentAuditActivityProps {
  tenantId?: string;
  loading?: boolean;  // V-501: Guard para sincronização de tenant
}

export function RecentAuditActivity({ tenantId, loading }: RecentAuditActivityProps) {
  const { data: logs = [] } = useQuery({
    queryKey: ['recent-audit', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('audit_logs')
        .select('id, action, resource_type, created_at')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
    enabled: !loading && !!tenantId,  // V-501: Só executar após sincronização
  });

  return (
    <div className="space-y-2">
      {logs.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhuma atividade recente</p>
      )}
      {logs.map((log) => (
        <div key={log.id} className="flex justify-between text-sm border-b pb-2">
          <div>
            <span className="font-medium">{log.action}</span>
            <span className="text-muted-foreground"> ? {log.resource_type}</span>
          </div>
          <span className="text-xs text-muted-foreground">
            {formatBrazilDateTime(log.created_at, 'datetime')}
          </span>
        </div>
      ))}
    </div>
  );
}
