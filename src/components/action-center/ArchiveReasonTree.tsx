import { Archive, ChevronDown } from 'lucide-react';
import { format, ptBR } from '@/lib/date-utils';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useArchiveReasonTree } from '@/hooks/useArchiveReasonTree';

interface ArchiveReasonTreeProps {
  agentId: string | null;
}

const REASON_LABELS: Record<string, string> = {
  never_connected: 'Nunca conectou',
  inactive_30_days: 'Inativo há 30+ dias',
  manual_archive: 'Arquivado manualmente',
  decommissioned: 'Descomissionado',
  duplicate: 'Duplicado',
};

const ACTOR_LABELS: Record<string, string> = {
  system: 'Sistema (automático)',
  user: 'Usuário',
  admin: 'Administrador',
};

export function ArchiveReasonTree({ agentId }: ArchiveReasonTreeProps) {
  const { data: archiveReason, isLoading } = useArchiveReasonTree(agentId);

  if (isLoading || !archiveReason) {
    return null;
  }

  const reasonLabel = REASON_LABELS[archiveReason.reason] || archiveReason.reason;
  const actorLabel = ACTOR_LABELS[archiveReason.actor_type] || archiveReason.actor_type;
  const formattedDate = format(new Date(archiveReason.archived_at), "dd/MM/yyyy 'às' HH:mm", {
    locale: ptBR,
  });

  return (
    <Collapsible className="mt-3">
      <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors group">
        <Badge variant="secondary" className="gap-1.5 cursor-pointer">
          <Archive className="h-3 w-3" />
          Contexto: Agente arquivado
          <ChevronDown className="h-3 w-3 transition-transform group-data-[state=open]:rotate-180" />
        </Badge>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2">
        <div className="pl-4 border-l-2 border-muted space-y-1 text-sm text-muted-foreground">
          <p>
            ↳ <span className="font-medium text-foreground">Motivo:</span> {reasonLabel}
          </p>
          <p>
            ↳ <span className="font-medium text-foreground">Ator:</span> {actorLabel}
          </p>
          <p>
            ↳ <span className="font-medium text-foreground">Data:</span> {formattedDate}
          </p>
          {archiveReason.notes && (
            <p>
              ↳ <span className="font-medium text-foreground">Notas:</span> {archiveReason.notes}
            </p>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
