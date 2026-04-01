import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SectionDivider } from '@/components/ui/section-divider';
import { AgentSystemInfo } from '@/components/agent/AgentSystemInfo';
import { AgentStateExplainer } from '@/components/agent/AgentStateExplainer';
import {
  Stethoscope, ExternalLink, ShieldAlert, RefreshCw, FileText,
} from 'lucide-react';

interface OverviewTabProps {
  agentId: string;
  agentName?: string;
  tenantId?: string;
  antivirusStatus: any[] | undefined;
  causality: any;
  generatingReport: boolean;
  onGenerateReport: () => void;
  onViewDiagnostics: () => void;
  onViewTimeline: () => void;
}

export const OverviewTab = ({
  agentId, tenantId, antivirusStatus, causality,
  generatingReport, onGenerateReport, onViewDiagnostics, onViewTimeline,
}: OverviewTabProps) => (
  <div className="space-y-4">
    <SectionDivider label="Informações do Sistema" />
    <AgentSystemInfo agentId={agentId} tenantId={tenantId} />

    <SectionDivider label="Estado Atual" />
    <AgentStateExplainer agentId={agentId} tenantId={tenantId} />

    <SectionDivider label="Antivírus" />
    {antivirusStatus && antivirusStatus.length > 0 ? (
      <div className="space-y-2">
        {antivirusStatus.map((av: any, idx: number) => (
          <div key={av.id || idx} className="p-3 rounded-lg bg-muted/30 border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{av.engine_name || 'Antivírus'}</p>
                <p className="text-xs text-muted-foreground">{av.engine_version || 'Versão desconhecida'}</p>
              </div>
              <Badge variant={av.status === 'active' ? 'default' : 'destructive'}>
                {av.status || 'Desconhecido'}
              </Badge>
            </div>
            {av.last_scan_at && (
              <p className="text-xs text-muted-foreground mt-1">
                Último scan: {new Date(av.last_scan_at).toLocaleDateString('pt-BR')}
              </p>
            )}
            {(av.threats_found ?? 0) > 0 && (
              <div className="flex items-center gap-1.5 mt-1.5 text-destructive">
                <ShieldAlert className="h-3.5 w-3.5" />
                <span className="text-xs font-medium">{av.threats_found} ameaça(s) detectada(s)</span>
              </div>
            )}
          </div>
        ))}
      </div>
    ) : (
      <div className="p-4 rounded-lg border border-amber-500/30 bg-amber-500/5">
        <div className="flex items-start gap-3">
          <ShieldAlert className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-foreground">AV de terceiros inativo</p>
            <p className="text-xs text-muted-foreground mt-1">
              Não foi possível detectar nenhum antivírus de terceiros ativo em seu dispositivo.
              Para se manter protegido, ative a Segurança do Windows.
            </p>
          </div>
        </div>
      </div>
    )}

    <div className="space-y-2 pt-2">
      <Button variant="outline" className="w-full justify-start" onClick={onViewDiagnostics}>
        <Stethoscope className="h-4 w-4 mr-2" />
        Ver Diagnóstico Completo
        <ExternalLink className="h-3 w-3 ml-auto opacity-50" />
      </Button>
      <Button variant="outline" className="w-full justify-start" onClick={onGenerateReport} disabled={generatingReport}>
        {generatingReport ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
        {generatingReport ? 'Gerando Relatório...' : 'Relatório Forense (PDF)'}
        <ExternalLink className="h-3 w-3 ml-auto opacity-50" />
      </Button>
      {causality && causality.stateTransitions.length > 0 && (
        <Button variant="outline" className="w-full justify-start" onClick={onViewTimeline}>
          <ExternalLink className="h-4 w-4 mr-2" />
          Ver Timeline Completa
          <ExternalLink className="h-3 w-3 ml-auto opacity-50" />
        </Button>
      )}
    </div>
  </div>
);
