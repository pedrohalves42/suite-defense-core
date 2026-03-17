import { Activity, Key, ShieldAlert, Clock, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import type { DashboardAgent, DashboardAgentToken, DashboardRateLimit } from "@/types/dashboard";

interface SecurityTabProps {
  agents: DashboardAgent[];
  agentTokens: DashboardAgentToken[];
  rateLimits: DashboardRateLimit[];
  loading: boolean;
  tenantNames: Record<string, string>;
}

export default function SecurityTab({ agents, agentTokens, rateLimits, loading, tenantNames }: SecurityTabProps) {
  const activeAgents = agents.filter(a => a.last_heartbeat && 
    (new Date().getTime() - new Date(a.last_heartbeat).getTime()) < 5 * 60 * 1000);

  return (
    <div className="space-y-4">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-gradient-card border-primary/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />Status dos Computadores
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Ativos</span>
              <span className="text-lg font-bold text-success">{activeAgents.length}</span>
            </div>
            <Progress value={(activeAgents.length / Math.max(agents.length, 1)) * 100} className="h-2" />
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Inativos: {agents.length - activeAgents.length}</span>
              <span className="text-primary font-semibold">
                {((activeAgents.length / Math.max(agents.length, 1)) * 100).toFixed(0)}%
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-card border-warning/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Key className="h-4 w-4 text-warning" />Credenciais de Acesso
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="text-lg font-bold text-foreground">{agentTokens.length}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Ativos</span>
              <span className="text-success font-semibold">{agentTokens.filter(t => t.is_active).length}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Expirados</span>
              <span className="text-destructive font-semibold">
                {agentTokens.filter(t => t.expires_at && new Date(t.expires_at) < new Date()).length}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-card border-destructive/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-destructive" />Rate Limiting
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Endpoints Monitorados</span>
              <span className="text-lg font-bold text-foreground">{new Set(rateLimits.map(r => r.endpoint)).size}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Bloqueios Ativos</span>
              <span className="text-destructive font-semibold">
                {rateLimits.filter(r => r.blocked_until && new Date(r.blocked_until) > new Date()).length}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Total de Requests</span>
              <span className="text-muted-foreground font-semibold">{rateLimits.reduce((sum, r) => sum + r.request_count, 0)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Heartbeats */}
      <Card className="bg-gradient-card border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5 text-primary" />Últimos Heartbeats</CardTitle>
          <CardDescription>Atividade recente dos agentes</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => (<div key={i} className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg"><div className="flex items-center gap-3"><Skeleton className="h-2 w-2 rounded-full" /><div><Skeleton className="h-4 w-32 mb-1" /><Skeleton className="h-3 w-24" /></div></div><Skeleton className="h-3 w-16" /></div>))}</div> :
           agents.filter(a => a.last_heartbeat).length === 0 ? <p className="text-center text-muted-foreground py-4">Nenhum heartbeat registrado</p> : (
            <div className="space-y-2">
              {agents.filter(a => a.last_heartbeat)
                .sort((a, b) => new Date(b.last_heartbeat!).getTime() - new Date(a.last_heartbeat!).getTime())
                .slice(0, 10)
                .map((agent) => {
                  const isActive = agent.last_heartbeat && (new Date().getTime() - new Date(agent.last_heartbeat).getTime()) < 5 * 60 * 1000;
                  const timeSince = agent.last_heartbeat ? Math.floor((new Date().getTime() - new Date(agent.last_heartbeat).getTime()) / 1000) : 0;
                  return (
                    <div key={agent.id} className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg border border-border hover:border-primary/30 transition-all">
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-success animate-pulse' : 'bg-muted'}`} />
                        <div>
                          <p className="font-mono font-semibold text-sm text-foreground">{agent.agent_name}</p>
                          <p className="text-xs text-muted-foreground">{tenantNames[agent.tenant_id] || agent.tenant_id.slice(0, 8) + '...'}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">
                          {timeSince < 60 ? `${timeSince}s atrás` : timeSince < 3600 ? `${Math.floor(timeSince / 60)}m atrás` : `${Math.floor(timeSince / 3600)}h atrás`}
                        </p>
                        <p className="text-xs text-muted-foreground">{new Date(agent.last_heartbeat!).toLocaleTimeString()}</p>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Expired Tokens */}
      <Card className="bg-gradient-card border-warning/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Key className="h-5 w-5 text-warning" />Tokens Expirados e Inativos</CardTitle>
          <CardDescription>Tokens que precisam de atenção</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? <div className="space-y-2">{Array.from({ length: 2 }).map((_, i) => (<div key={i} className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg"><Skeleton className="h-4 w-32" /><Skeleton className="h-5 w-16 rounded-full" /></div>))}</div> : (() => {
            const expiredOrInactive = agentTokens.filter(t => !t.is_active || (t.expires_at && new Date(t.expires_at) < new Date()));
            return expiredOrInactive.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-success/50" />
                <p>Todos os tokens estão ativos e válidos</p>
              </div>
            ) : (
              <div className="space-y-2">
                {expiredOrInactive.slice(0, 10).map((token) => {
                  const isExpired = token.expires_at && new Date(token.expires_at) < new Date();
                  return (
                    <div key={token.id} className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg border border-border">
                      <div className="flex-1">
                        <p className="font-mono font-semibold text-sm text-foreground">{token.agents?.agent_name || 'Desconhecido'}</p>
                        <p className="text-xs text-muted-foreground font-mono mt-1">{token.token_prefix}...****</p>
                      </div>
                      <div className="text-right space-y-1">
                        <Badge variant={isExpired ? "destructive" : "secondary"} className="text-xs">{isExpired ? "Expirado" : "Inativo"}</Badge>
                        {token.expires_at && <p className="text-xs text-muted-foreground">{new Date(token.expires_at).toLocaleDateString()}</p>}
                        {token.last_used_at && <p className="text-xs text-muted-foreground">Último uso: {new Date(token.last_used_at).toLocaleDateString()}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </CardContent>
      </Card>

      {/* Rate Limiting Stats */}
      <Card className="bg-gradient-card border-destructive/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-destructive" />Estatísticas de Rate Limiting</CardTitle>
          <CardDescription>Proteção contra abuso de recursos</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? <div className="space-y-2">{Array.from({ length: 2 }).map((_, i) => (<div key={i} className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg"><Skeleton className="h-4 w-40" /><Skeleton className="h-5 w-20 rounded-full" /></div>))}</div> :
           rateLimits.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-success/50" />
              <p>Nenhuma atividade de rate limiting registrada</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-semibold text-foreground mb-3">Por Endpoint</h4>
                <div className="space-y-2">
                  {Object.entries(
                    rateLimits.reduce((acc, r) => {
                      if (!acc[r.endpoint]) acc[r.endpoint] = { count: 0, blocked: 0 };
                      acc[r.endpoint].count += r.request_count;
                      if (r.blocked_until && new Date(r.blocked_until) > new Date()) acc[r.endpoint].blocked++;
                      return acc;
                    }, {} as Record<string, { count: number; blocked: number }>)
                  ).map(([endpoint, stats]) => (
                    <div key={endpoint} className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg border border-border">
                      <div>
                        <p className="font-mono font-semibold text-sm text-foreground">{endpoint}</p>
                        <p className="text-xs text-muted-foreground mt-1">{stats.count} requests • {stats.blocked} bloqueados</p>
                      </div>
                      <Badge variant={stats.blocked > 0 ? "destructive" : "default"} className="text-xs">
                        {stats.blocked > 0 ? `${stats.blocked} bloqueios` : "Normal"}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
              {(() => {
                const activeBlocks = rateLimits.filter(r => r.blocked_until && new Date(r.blocked_until) > new Date());
                return activeBlocks.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-foreground mb-3">Bloqueios Ativos</h4>
                    <div className="space-y-2">
                      {activeBlocks.map((limit) => (
                        <div key={limit.id} className="flex items-center justify-between p-3 bg-destructive/10 rounded-lg border border-destructive/30">
                          <div>
                            <p className="font-mono font-semibold text-sm text-foreground">{limit.identifier}</p>
                            <p className="text-xs text-muted-foreground mt-1">{limit.endpoint}</p>
                          </div>
                          <div className="text-right">
                            <Badge variant="destructive" className="text-xs mb-1">Bloqueado</Badge>
                            <p className="text-xs text-muted-foreground">Até: {new Date(limit.blocked_until!).toLocaleTimeString()}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
