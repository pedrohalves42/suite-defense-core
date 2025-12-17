import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Globe, 
  Ban,
  Activity,
  ExternalLink
} from 'lucide-react';
import { formatBrazilDateTime } from '@/lib/date-utils';

export const ClientActivity = () => {
  const { tenant } = useTenant();

  const { data, isLoading } = useQuery({
    queryKey: ['client-activity', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return null;

      // Web activity
      const { data: webActivity } = await supabase
        .from('agent_web_activity')
        .select('id, domain, visited_at, visit_count, is_blocked, agent_id, browser')
        .eq('tenant_id', tenant.id)
        .order('visited_at', { ascending: false })
        .limit(50);

      // Blocked attempts
      const { data: blockedAttempts } = await supabase
        .from('blocked_access_attempts')
        .select('id, domain, attempted_at, agent_name, blocked_by')
        .eq('tenant_id', tenant.id)
        .order('attempted_at', { ascending: false })
        .limit(50);

      return {
        webActivity: webActivity || [],
        blockedAttempts: blockedAttempts || []
      };
    },
    enabled: !!tenant?.id
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Atividade Web</h1>
        <p className="text-muted-foreground">
          Sites acessados e tentativas bloqueadas
        </p>
      </div>

      <Tabs defaultValue="activity" className="space-y-4">
        <TabsList>
          <TabsTrigger value="activity" className="gap-2">
            <Activity className="h-4 w-4" />
            Sites Acessados
          </TabsTrigger>
          <TabsTrigger value="blocked" className="gap-2">
            <Ban className="h-4 w-4" />
            Bloqueados
          </TabsTrigger>
        </TabsList>

        <TabsContent value="activity">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Sites Acessados Recentemente</CardTitle>
            </CardHeader>
            <CardContent>
              {data?.webActivity && data.webActivity.length > 0 ? (
                <div className="space-y-2">
                  {data.webActivity.map((activity: any) => (
                    <div 
                      key={activity.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                    >
                      <div className="flex items-center gap-3">
                        <Globe className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="font-medium">{activity.domain}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatBrazilDateTime(activity.visited_at)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {activity.is_blocked && (
                          <Badge variant="destructive">Bloqueado</Badge>
                        )}
                        {activity.visit_count > 1 && (
                          <Badge variant="secondary">
                            {activity.visit_count}x
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-8">
                  Nenhuma atividade web registrada
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="blocked">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Tentativas de Acesso Bloqueadas</CardTitle>
            </CardHeader>
            <CardContent>
              {data?.blockedAttempts && data.blockedAttempts.length > 0 ? (
                <div className="space-y-2">
                  {data.blockedAttempts.map((attempt: any) => (
                    <div 
                      key={attempt.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-destructive/5 border border-destructive/20"
                    >
                      <div className="flex items-center gap-3">
                        <Ban className="h-4 w-4 text-destructive" />
                        <div>
                          <p className="font-medium">{attempt.domain}</p>
                          <p className="text-xs text-muted-foreground">
                            {attempt.agent_name} • {formatBrazilDateTime(attempt.attempted_at)}
                          </p>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-destructive">
                        Bloqueado por {attempt.blocked_by}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Ban className="h-12 w-12 text-green-500 mx-auto mb-4" />
                  <p className="text-muted-foreground">
                    Nenhuma tentativa de acesso bloqueada
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
