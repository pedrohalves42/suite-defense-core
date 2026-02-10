import { format, ptBR } from '@/lib/date-utils';
import { 
  Sheet, 
  SheetContent, 
  SheetHeader, 
  SheetTitle, 
  SheetDescription 
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  Shield, 
  Clock,
  Hash,
  Server,
  FileCode,
  Activity
} from 'lucide-react';
import { DecisionEvent } from '@/hooks/useDecisionEvents';

interface EvidenceData {
  error_signature?: string;
  failure_count?: number;
  time_window_minutes?: number;
  heartbeat_age_seconds?: number;
  agent_version?: string;
  [key: string]: unknown;
}

interface ActionExecuted {
  type: string;
  success: boolean;
  id?: string;
  error?: string;
}

interface DecisionEventDrawerProps {
  event: DecisionEvent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DecisionEventDrawer({ event, open, onOpenChange }: DecisionEventDrawerProps) {
  if (!event) return null;

  // Safe type guards
  const evidence = (event.evidence && typeof event.evidence === 'object' && !Array.isArray(event.evidence)) 
    ? event.evidence as unknown as EvidenceData 
    : {} as EvidenceData;
  
  const actionsExecuted = Array.isArray(event.actions_executed) 
    ? (event.actions_executed as unknown as ActionExecuted[])
    : [];

  const getActionIcon = (type: string) => {
    switch (type) {
      case 'ENTER_SAFE_MODE':
        return Shield;
      case 'CREATE_AI_INSIGHT':
        return Activity;
      case 'CREATE_SYSTEM_ALERT':
        return AlertTriangle;
      case 'FORENSIC_SNAPSHOT':
        return FileCode;
      case 'SEND_NOTIFICATION':
        return Server;
      case 'APPLY_THROTTLE':
        return Clock;
      case 'APPLY_ISOLATION':
        return Shield;
      case 'CANCEL_PENDING_JOBS':
        return XCircle;
      case 'CREATE_SECURITY_EVENT':
        return AlertTriangle;
      case 'BLOCK_VERSION':
        return XCircle;
      default:
        return Hash;
    }
  };

  const getActionLabel = (type: string) => {
    switch (type) {
      case 'ENTER_SAFE_MODE':
        return 'Entrar em SAFE_MODE';
      case 'CREATE_AI_INSIGHT':
        return 'Criar AI Insight';
      case 'CREATE_SYSTEM_ALERT':
        return 'Criar Alerta do Sistema';
      case 'FORENSIC_SNAPSHOT':
        return 'Snapshot Forense';
      case 'SEND_NOTIFICATION':
        return 'Enviar Notificação';
      case 'APPLY_THROTTLE':
        return 'Aplicar Throttle';
      case 'APPLY_ISOLATION':
        return 'Aplicar Isolamento';
      case 'CANCEL_PENDING_JOBS':
        return 'Cancelar Jobs Pendentes';
      case 'CREATE_SECURITY_EVENT':
        return 'Criar Evento de Segurança';
      case 'BLOCK_VERSION':
        return 'Bloquear Versão';
      default:
        return type;
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[500px] sm:max-w-[600px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-destructive" />
            Decisão Automática
          </SheetTitle>
          <SheetDescription>
            Detalhes completos da decisão executada pelo motor de regras
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-120px)] mt-4 pr-4">
          <div className="space-y-6">
            {/* Header Info */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Regra</span>
                <Badge variant="outline" className="font-mono">
                  {event.rule_code}
                </Badge>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Ação</span>
                <Badge variant={
                  ['ENTER_SAFE_MODE', 'ISOLATE'].includes(event.action) ? 'destructive' :
                  event.action === 'THROTTLE' ? 'secondary' : 'outline'
                }>
                  {event.action}
                </Badge>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Agente</span>
                <span className="font-medium">{event.agent_name || 'N/A'}</span>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Data/Hora</span>
                <span className="flex items-center gap-1 text-sm">
                  <Clock className="h-3 w-3" />
                  {format(new Date(event.created_at), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}
                </span>
              </div>
            </div>

            <Separator />

            {/* Evidence */}
            <div className="space-y-3">
              <h4 className="font-semibold flex items-center gap-2">
                <FileCode className="h-4 w-4" />
                Evidência
              </h4>
              
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                {evidence.error_signature && (
                  <div className="flex items-start justify-between">
                    <span className="text-sm text-muted-foreground">Assinatura do Erro</span>
                    <code className="text-xs bg-background px-2 py-1 rounded max-w-[200px] truncate">
                      {evidence.error_signature}
                    </code>
                  </div>
                )}
                
                {evidence.failure_count !== undefined && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Contagem de Falhas</span>
                    <Badge variant="secondary">{evidence.failure_count}</Badge>
                  </div>
                )}
                
                {evidence.time_window_minutes !== undefined && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Janela de Tempo</span>
                    <span className="text-sm">{evidence.time_window_minutes} minutos</span>
                  </div>
                )}
                
                {evidence.heartbeat_age_seconds !== undefined && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Idade do Heartbeat</span>
                    <span className="text-sm">{evidence.heartbeat_age_seconds}s</span>
                  </div>
                )}
                
                {evidence.agent_version && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Versão do Agente</span>
                    <span className="text-sm font-mono">{evidence.agent_version}</span>
                  </div>
                )}
              </div>
            </div>

            <Separator />

            {/* Actions Executed */}
            <div className="space-y-3">
              <h4 className="font-semibold flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Ações Executadas
              </h4>
              
              <div className="space-y-2">
                {actionsExecuted.map((action, idx) => {
                  const Icon = getActionIcon(action.type);
                  return (
                    <div 
                      key={idx}
                      className="flex items-center justify-between p-3 bg-muted/30 rounded-lg"
                    >
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">{getActionLabel(action.type)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {action.id && (
                          <code className="text-xs text-muted-foreground">
                            {action.id.slice(0, 8)}...
                          </code>
                        )}
                        {action.success ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : (
                          <XCircle className="h-4 w-4 text-destructive" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <Separator />

            {/* Raw Evidence JSON */}
            <div className="space-y-3">
              <h4 className="font-semibold text-sm text-muted-foreground">JSON Completo</h4>
              <pre className="bg-muted/50 p-4 rounded-lg text-xs overflow-x-auto">
                {JSON.stringify(event.evidence, null, 2)}
              </pre>
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
