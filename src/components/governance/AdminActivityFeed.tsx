import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Shield, Trash2, UserMinus, Key, AlertTriangle, Settings } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useAdaptivePolling } from '@/hooks/useAdaptivePolling';

/**
 * AdminActivityFeed — HUM-003 mitigation
 * Read-only component showing recent admin actions from audit_logs,
 * with destructive actions highlighted for insider threat visibility.
 */

const DESTRUCTIVE_ACTIONS = [
  'agent_deleted', 'agent_archived', 'token_revoked', 'user_removed',
  'role_changed', 'tenant_suspended', 'mass_action', 'policy_deleted',
  'enrollment_key_deleted', 'nuclear_rotation', 'bulk_revoke',
];

const ACTION_ICONS: Record<string, typeof Shield> = {
  agent_deleted: Trash2,
  agent_archived: Trash2,
  token_revoked: Key,
  user_removed: UserMinus,
  role_changed: Shield,
  tenant_suspended: AlertTriangle,
  mass_action: AlertTriangle,
  policy_deleted: Trash2,
  nuclear_rotation: Key,
  bulk_revoke: Key,
};

interface AuditEntry {
  id: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  created_at: string;
  ip_address: string | null;
  user_agent: string | null;
  details: any | null;
}

export function AdminActivityFeed({
  const adaptiveInterval = useAdaptivePolling(300_000); limit = 20 }: { limit?: number }) {
  const { tenant } = useTenant();

  const { data: activities, isLoading } = useQuery({
    queryKey: ['admin-activity', tenant?.id, limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('id, action, resource_type, resource_id, created_at, ip_address, user_agent, details')
        .eq('tenant_id', tenant!.id)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return (data || []) as AuditEntry[];
    },
    enabled: !!tenant?.id,
    refetchInterval: adaptiveInterval,
    staleTime: 120_000,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const destructiveCount = activities?.filter(a => DESTRUCTIVE_ACTIONS.includes(a.action)).length || 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Settings className="h-5 w-5 text-muted-foreground" />
            Atividade Administrativa
          </CardTitle>
          {destructiveCount > 0 && (
            <Badge variant="destructive" className="text-xs">
              {destructiveCount} ação(ões) destrutiva(s)
            </Badge>
          )}
        </div>
        <CardDescription>
          Últimas {limit} ações administrativas registradas
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[360px] pr-3">
          <div className="space-y-2">
            {activities?.map((entry) => {
              const isDestructive = DESTRUCTIVE_ACTIONS.includes(entry.action);
              const Icon = ACTION_ICONS[entry.action] || Settings;

              return (
                <div
                  key={entry.id}
                  className={`flex items-start gap-3 rounded-md border p-3 transition-colors ${
                    isDestructive
                      ? 'border-destructive/30 bg-destructive/5'
                      : 'hover:bg-muted/50'
                  }`}
                >
                  <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${isDestructive ? 'text-destructive' : 'text-muted-foreground'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm truncate">
                        {entry.action}
                      </span>
                      {isDestructive && (
                        <Badge variant="destructive" className="text-[10px] px-1 py-0">
                          destrutiva
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {entry.resource_type}
                      {entry.resource_id && ` → ${entry.resource_id.slice(0, 8)}...`}
                      {entry.ip_address && ` • IP: ${entry.ip_address}`}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatDistanceToNow(new Date(entry.created_at), { locale: ptBR, addSuffix: true })}
                  </span>
                </div>
              );
            })}
            {(!activities || activities.length === 0) && (
              <p className="text-sm text-muted-foreground text-center py-8">
                Nenhuma atividade registrada
              </p>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
