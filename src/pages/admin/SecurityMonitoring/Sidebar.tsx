import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Globe, Lock, Shield, Unlock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import type { ActiveAlert, BlockedIP, FailedLoginStat } from './types';
import { severityConfig } from './types';

interface SidebarProps {
  activeAlerts: ActiveAlert[];
  blockedIPs: BlockedIP[];
  failedLoginStats: FailedLoginStat[];
  onUnblockIP: (id: string, ip: string) => void;
}

export function Sidebar({ activeAlerts, blockedIPs, failedLoginStats, onUnblockIP }: SidebarProps) {
  return (
    <div className="space-y-4">
      {/* Active Alerts */}
      {activeAlerts.length > 0 && (
        <Card className="border-destructive/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Alertas Ativos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {activeAlerts.slice(0, 5).map(alert => {
                const sev = severityConfig[alert.severity] || severityConfig.warning;
                return (
                  <div key={alert.id} className="flex items-start gap-2 p-2 rounded-md bg-muted/30">
                    <span className={cn("w-1.5 h-1.5 rounded-full mt-1.5 shrink-0", sev.dotColor)} />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium truncate">{alert.title}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {formatDistanceToNow(new Date(alert.created_at), { addSuffix: true, locale: ptBR })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Blocked IPs */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Globe className="h-4 w-4 text-muted-foreground" />
            IPs Bloqueados
          </CardTitle>
        </CardHeader>
        <CardContent>
          {blockedIPs.length > 0 ? (
            <div className="space-y-2">
              {blockedIPs.slice(0, 8).map((ip) => (
                <div key={ip.id} className="flex items-center justify-between p-2 rounded-md bg-muted/30 group">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-mono truncate">{ip.ip_address}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{ip.reason}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100 shrink-0"
                    onClick={() => onUnblockIP(ip.id, ip.ip_address)}
                  >
                    <Unlock className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <Shield className="h-6 w-6 text-muted-foreground/20 mb-2" />
              <p className="text-xs text-muted-foreground">Nenhum IP bloqueado</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Failed Login Stats */}
      {failedLoginStats.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Lock className="h-4 w-4 text-muted-foreground" />
              Tentativas de Login
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {failedLoginStats.slice(0, 5).map((stat) => (
                <div key={stat.ip_address} className="flex items-center justify-between p-2 rounded-md bg-muted/30">
                  <span className="text-xs font-mono truncate">{stat.ip_address}</span>
                  <Badge variant={stat.count >= 10 ? 'destructive' : 'outline'} className="text-[10px] shrink-0">
                    {stat.count}×
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
