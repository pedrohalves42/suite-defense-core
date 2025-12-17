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
  TrendingUp,
  TrendingDown,
  BarChart3,
  Clock
} from 'lucide-react';
import { formatBrazilDateTime } from '@/lib/date-utils';
import { motion } from 'framer-motion';

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
        .limit(100);

      // Blocked attempts
      const { data: blockedAttempts } = await supabase
        .from('blocked_access_attempts')
        .select('id, domain, attempted_at, agent_name, blocked_by')
        .eq('tenant_id', tenant.id)
        .order('attempted_at', { ascending: false })
        .limit(50);

      // Calculate top 10 sites
      const domainCounts: Record<string, number> = {};
      webActivity?.forEach(activity => {
        const domain = activity.domain;
        domainCounts[domain] = (domainCounts[domain] || 0) + (activity.visit_count || 1);
      });

      const topSites = Object.entries(domainCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([domain, count]) => ({ domain, count }));

      // Today's stats
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayActivity = webActivity?.filter(a => new Date(a.visited_at) >= today) || [];
      const todayBlocked = blockedAttempts?.filter(a => new Date(a.attempted_at) >= today) || [];

      // Yesterday's stats for comparison
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayEnd = new Date(today);
      const yesterdayActivity = webActivity?.filter(a => {
        const date = new Date(a.visited_at);
        return date >= yesterday && date < yesterdayEnd;
      }) || [];

      const activityChange = yesterdayActivity.length > 0 
        ? Math.round(((todayActivity.length - yesterdayActivity.length) / yesterdayActivity.length) * 100)
        : 0;

      return {
        webActivity: webActivity?.slice(0, 50) || [],
        blockedAttempts: blockedAttempts || [],
        topSites,
        todayStats: {
          sites: todayActivity.length,
          blocked: todayBlocked.length,
          change: activityChange
        }
      };
    },
    enabled: !!tenant?.id
  });

  // Get category icon based on domain
  const getCategoryIcon = (domain: string) => {
    const socialDomains = ['facebook.com', 'instagram.com', 'twitter.com', 'tiktok.com', 'linkedin.com'];
    const workDomains = ['google.com', 'microsoft.com', 'office.com', 'outlook.com', 'teams.microsoft.com'];
    const entertainmentDomains = ['youtube.com', 'netflix.com', 'spotify.com', 'twitch.tv'];

    if (socialDomains.some(d => domain.includes(d))) return '📱';
    if (workDomains.some(d => domain.includes(d))) return '💼';
    if (entertainmentDomains.some(d => domain.includes(d))) return '🎬';
    return '🌐';
  };

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

      {/* Daily Summary */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Hoje</p>
                <p className="text-2xl font-bold">{data?.todayStats.sites || 0}</p>
                <p className="text-xs text-muted-foreground">sites acessados</p>
              </div>
              <Activity className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Bloqueados Hoje</p>
                <p className="text-2xl font-bold text-red-500">{data?.todayStats.blocked || 0}</p>
                <p className="text-xs text-muted-foreground">tentativas</p>
              </div>
              <Ban className="h-8 w-8 text-red-500/50" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">vs. Ontem</p>
                <div className="flex items-center gap-2">
                  <p className={`text-2xl font-bold ${
                    (data?.todayStats.change || 0) > 0 ? 'text-green-500' : 
                    (data?.todayStats.change || 0) < 0 ? 'text-red-500' : ''
                  }`}>
                    {(data?.todayStats.change || 0) > 0 ? '+' : ''}{data?.todayStats.change || 0}%
                  </p>
                  {(data?.todayStats.change || 0) > 0 ? (
                    <TrendingUp className="h-4 w-4 text-green-500" />
                  ) : (data?.todayStats.change || 0) < 0 ? (
                    <TrendingDown className="h-4 w-4 text-red-500" />
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">variação</p>
              </div>
              <BarChart3 className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top 10 Sites */}
      {data?.topSites && data.topSites.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Top 10 Sites Mais Acessados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.topSites.map((site, index) => (
                <motion.div
                  key={site.domain}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg w-6 text-center">{getCategoryIcon(site.domain)}</span>
                    <span className="text-muted-foreground w-6">{index + 1}.</span>
                    <span className="font-medium">{site.domain}</span>
                  </div>
                  <Badge variant="secondary">{site.count}x</Badge>
                </motion.div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

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
                  {data.webActivity.map((activity: any, index: number) => (
                    <motion.div 
                      key={activity.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.02 }}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-lg">{getCategoryIcon(activity.domain)}</span>
                        <div>
                          <p className="font-medium">{activity.domain}</p>
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" />
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
                    </motion.div>
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
                  {data.blockedAttempts.map((attempt: any, index: number) => (
                    <motion.div 
                      key={attempt.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.02 }}
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
                    </motion.div>
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
