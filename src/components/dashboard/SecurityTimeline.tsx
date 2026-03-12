import { useMemo } from "react";
import { Clock } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatBrazilDateTime } from "@/lib/date-utils";
import type { DashboardAuditLog } from "@/hooks/useDashboardData";

const formatUnknownAction = (action: string, resource: string): string => {
  const resourceMap: Record<string, string> = {
    'agent': 'computador', 'job': 'verificação', 'report': 'relatório',
    'user': 'usuário', 'ai_action': 'sistema automático',
    'enrollment_key': 'chave de registro', 'invite': 'convite',
    'tenant': 'empresa', 'policy': 'política',
  };
  const resourceText = resourceMap[resource] || resource;
  return `Ação em ${resourceText}`;
};

const humanizeAction = (action: string, resource: string): { icon: string; text: string } => {
  const map: Record<string, { icon: string; text: string }> = {
    'agent.enroll': { icon: '✓', text: 'Novo computador registrado' },
    'agent_enrolled': { icon: '✓', text: 'Novo computador conectado' },
    'agent.heartbeat': { icon: '💓', text: 'Computador se comunicou' },
    'cleanup_agent': { icon: '🗑️', text: 'Computador foi removido' },
    'job.create': { icon: '⚙️', text: 'Nova verificação iniciada' },
    'job_created': { icon: '⚙️', text: 'Nova verificação criada' },
    'job.complete': { icon: '✓', text: 'Verificação concluída com sucesso' },
    'job.fail': { icon: '⚠️', text: 'Verificação não foi concluída' },
    'job_creation_denied': { icon: '🚫', text: 'Verificação não autorizada' },
    'UPDATE_ai_action': { icon: '🤖', text: 'Sistema aplicou correção automática' },
    'ai_action': { icon: '🤖', text: 'Ação automática executada' },
    'INSERT_ai_action': { icon: '🤖', text: 'Correção automática registrada' },
    'enrollment_key_used': { icon: '🔑', text: 'Computador registrado com chave' },
    'create_enrollment_key': { icon: '🔑', text: 'Nova chave de registro criada' },
    'list_enrollment_key': { icon: '📋', text: 'Chaves de registro consultadas' },
    'create_user': { icon: '👤', text: 'Novo usuário criado' },
    'invite_sent': { icon: '📧', text: 'Convite enviado para novo usuário' },
    'scan.complete': { icon: '🛡️', text: 'Verificação de vírus realizada' },
    'report.create': { icon: '📄', text: 'Novo relatório gerado' },
    'login.success': { icon: '🔐', text: 'Login realizado' },
    'login.fail': { icon: '⚠️', text: 'Tentativa de login falhou' },
    'alert.create': { icon: '🚨', text: 'Novo alerta detectado' },
    'alert.resolve': { icon: '✓', text: 'Alerta resolvido' },
  };
  return map[action] || { icon: '•', text: formatUnknownAction(action, resource) };
};

const friendlyResource = (resource: string): string => {
  const map: Record<string, string> = {
    'agent': 'Computador', 'enrollment_key': 'Chave de Registro',
    'job': 'Verificação', 'user': 'Usuário', 'scan': 'Análise de Vírus',
    'report': 'Relatório', 'alert': 'Alerta', 'ai_action': 'Ação Automática',
    'login': 'Acesso', 'tenant': 'Empresa', 'policy': 'Política', 'session': 'Sessão',
  };
  return map[resource] || resource;
};

interface SecurityTimelineProps {
  auditLogs: DashboardAuditLog[];
  loading: boolean;
}

export function SecurityTimeline({ auditLogs, loading }: SecurityTimelineProps) {
  const rawEvents = auditLogs.slice(0, 30).map(log => {
    const { icon, text } = humanizeAction(log.action, log.resource_type);
    return {
      time: formatBrazilDateTime(log.created_at, 'time'),
      date: formatBrazilDateTime(log.created_at, 'day-month'),
      icon, text,
      action: log.action,
      resource: friendlyResource(log.resource_type),
      status: log.success ? 'success' as const : 'failed' as const,
    };
  });

  const securityEvents = useMemo(() => {
    const grouped: Array<typeof rawEvents[0] & { count: number }> = [];
    for (const event of rawEvents) {
      const last = grouped[grouped.length - 1];
      if (last && last.text === event.text && last.status === event.status && last.date === event.date) {
        last.count++;
      } else {
        grouped.push({ ...event, count: 1 });
      }
    }
    return grouped.slice(0, 10);
  }, [rawEvents]);

  return (
    <Card className="bg-gradient-card border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-primary" />Linha do Tempo de Segurança
        </CardTitle>
        <CardDescription>História recente do sistema — o que aconteceu</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <div className="space-y-1">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
                <div className="text-right space-y-1">
                  <Skeleton className="h-5 w-16 rounded-full ml-auto" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            ))}
          </div>
        ) : securityEvents.length === 0 ? (
          <div className="text-center py-8">
            <Clock className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-muted-foreground">Nenhum evento registrado</p>
            <p className="text-xs text-muted-foreground/70 mt-2">Os eventos aparecerão conforme ações forem realizadas</p>
          </div>
        ) : (
          <div className="space-y-2">
            {securityEvents.map((event, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg border border-border hover:bg-secondary/50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-lg",
                    event.status === 'success' ? 'bg-success/20' : 'bg-destructive/20'
                  )}>{event.icon}</div>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {event.text}
                      {event.count > 1 && (
                        <span className="ml-2 text-xs font-normal bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">×{event.count}</span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">{event.resource}</p>
                  </div>
                </div>
                <div className="text-right">
                  <Badge variant={event.status === 'success' ? 'default' : 'destructive'} className="text-xs">
                    {event.status === 'success' ? 'Sucesso' : 'Erro'}
                  </Badge>
                  <p className="text-xs text-muted-foreground mt-1">{event.date} às {event.time}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
