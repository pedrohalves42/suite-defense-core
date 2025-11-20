import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface RecentAuditActivityProps {
  tenantId?: string;
}

export function RecentAuditActivity({ tenantId }: RecentAuditActivityProps) {
  const { data: logs = [] } = useQuery({
    queryKey: ['recent-audit', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
    enabled: !!tenantId,
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
            {format(new Date(log.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
          </span>
        </div>
      ))}
    </div>
  );
}
