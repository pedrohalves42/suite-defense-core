import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ShieldX, TrendingUp, Clock, Monitor, Ban, Activity } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { motion } from 'framer-motion';

interface BlockedSitesStatsProps {
  stats: {
    totalAttempts: number;
    uniqueDomains: number;
    uniqueAgents: number;
    todayAttempts: number;
    weekAttempts: number;
    topBlockedDomains: { domain: string; count: number }[];
    attemptsByHour: { hour: number; count: number }[];
    agentBreakdown: { agentId: string; agentName: string; count: number }[];
  };
}

export function BlockedSitesStats({ stats }: BlockedSitesStatsProps) {
  const maxDomainCount = stats.topBlockedDomains[0]?.count || 1;
  const maxAgentCount = stats.agentBreakdown[0]?.count || 1;

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="border-l-4 border-l-destructive">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <ShieldX className="h-4 w-4 text-destructive" />
                Total de Bloqueios
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalAttempts}</div>
              <p className="text-xs text-muted-foreground">Tentativas registradas</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="border-l-4 border-l-warning">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Clock className="h-4 w-4 text-warning" />
                Hoje
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-warning">{stats.todayAttempts}</div>
              <p className="text-xs text-muted-foreground">Bloqueios nas últimas 24h</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card className="border-l-4 border-l-info">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Ban className="h-4 w-4 text-info" />
                Domínios Únicos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.uniqueDomains}</div>
              <p className="text-xs text-muted-foreground">Sites diferentes bloqueados</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card className="border-l-4 border-l-primary">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Monitor className="h-4 w-4 text-primary" />
                Computadores
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.uniqueAgents}</div>
              <p className="text-xs text-muted-foreground">Com bloqueios ativos</p>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Charts Row */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Hourly Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4" />
              Bloqueios por Hora (24h)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.attemptsByHour}>
                  <XAxis 
                    dataKey="hour" 
                    tick={{ fontSize: 10 }} 
                    tickFormatter={(h) => `${h}h`}
                  />
                  <YAxis tick={{ fontSize: 10 }} width={30} />
                  <Tooltip 
                    formatter={(value: number) => [`${value} bloqueios`, 'Total']}
                    labelFormatter={(hour) => `${hour}:00 - ${hour}:59`}
                  />
                  <Bar 
                    dataKey="count" 
                    fill="hsl(var(--destructive))" 
                    radius={[2, 2, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Top Blocked Domains */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4" />
              Top Domínios Bloqueados
            </CardTitle>
            <CardDescription>Sites mais bloqueados</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats.topBlockedDomains.slice(0, 5).map((item, idx) => (
                <div key={item.domain} className="flex items-center gap-3">
                  <Badge variant="outline" className="w-6 h-6 flex items-center justify-center p-0 text-xs">
                    {idx + 1}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium truncate">{item.domain}</span>
                      <Badge variant="destructive" className="text-xs ml-2">
                        {item.count}
                      </Badge>
                    </div>
                    <Progress 
                      value={(item.count / maxDomainCount) * 100} 
                      className="h-1.5"
                    />
                  </div>
                </div>
              ))}
              {stats.topBlockedDomains.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nenhum bloqueio registrado
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Agent Breakdown */}
      {stats.agentBreakdown.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Monitor className="h-4 w-4" />
              Bloqueios por Computador
            </CardTitle>
            <CardDescription>Distribuição de tentativas bloqueadas por agente</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {stats.agentBreakdown.slice(0, 6).map((agent) => (
                <div 
                  key={agent.agentId} 
                  className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                >
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Monitor className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{agent.agentName}</p>
                    <p className="text-xs text-muted-foreground">{agent.count} bloqueios</p>
                  </div>
                  <Badge variant="secondary">{Math.round((agent.count / stats.totalAttempts) * 100)}%</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
