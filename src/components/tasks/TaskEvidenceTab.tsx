import { useTaskEvidence, EVIDENCE_TYPE_LABELS } from '@/hooks/useTaskEvidence';
import { format, ptBR } from '@/lib/date-utils';
import { 
  FileText, 
  Camera, 
  GitCompare, 
  FileCheck, 
  Gavel, 
  History,
  Loader2,
  Copy,
  Check,
  Download,
  Shield
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useState } from 'react';
import { toast } from 'sonner';

interface TaskEvidenceTabProps {
  taskId: string;
}

const getEvidenceIcon = (type: string) => {
  switch (type) {
    case 'log':
      return <FileText className="h-4 w-4" />;
    case 'snapshot':
      return <Camera className="h-4 w-4" />;
    case 'diff':
      return <GitCompare className="h-4 w-4" />;
    case 'report':
      return <FileCheck className="h-4 w-4" />;
    case 'decision':
      return <Gavel className="h-4 w-4" />;
    case 'timeline':
      return <History className="h-4 w-4" />;
    default:
      return <FileText className="h-4 w-4" />;
  }
};

export function TaskEvidenceTab({ taskId }: TaskEvidenceTabProps) {
  const { data: evidence, isLoading } = useTaskEvidence(taskId);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyHash = async (hash: string, id: string) => {
    await navigator.clipboard.writeText(hash);
    setCopiedId(id);
    toast.success('Hash copiado!');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const exportEvidence = () => {
    if (!evidence || evidence.length === 0) return;
    
    const exportData = {
      exported_at: new Date().toISOString(),
      task_id: taskId,
      evidence_count: evidence.length,
      evidence: evidence.map(e => ({
        type: e.evidence_type,
        title: e.title,
        content: e.content,
        hash: e.content_hash,
        created_at: e.created_at,
      })),
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `task-evidence-${taskId.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Evidências exportadas!');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!evidence || evidence.length === 0) {
    return (
      <div className="text-center py-8">
        <Shield className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
        <p className="text-muted-foreground text-sm">
          Nenhuma evidência coletada ainda.
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Evidências serão geradas automaticamente quando a task for fechada.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {evidence.length} evidência(s) coletada(s)
        </p>
        <Button variant="outline" size="sm" onClick={exportEvidence}>
          <Download className="h-4 w-4 mr-2" />
          Exportar
        </Button>
      </div>

      <ScrollArea className="h-[300px] pr-4">
        <div className="space-y-3">
          {evidence.map((item) => (
            <Collapsible key={item.id}>
              <Card>
                <CollapsibleTrigger asChild>
                  <CardHeader className="pb-2 cursor-pointer hover:bg-muted/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm flex items-center gap-2">
                        {getEvidenceIcon(item.evidence_type)}
                        {item.title}
                      </CardTitle>
                      <Badge variant="outline" className="text-xs">
                        {EVIDENCE_TYPE_LABELS[item.evidence_type] || item.evidence_type}
                      </Badge>
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                
                <CollapsibleContent>
                  <CardContent className="pt-0 space-y-3">
                    {/* Content preview */}
                    <div className="bg-muted/50 rounded p-2 text-xs font-mono max-h-32 overflow-auto">
                      <pre className="whitespace-pre-wrap">
                        {JSON.stringify(item.content, null, 2).slice(0, 500)}
                        {JSON.stringify(item.content, null, 2).length > 500 && '...'}
                      </pre>
                    </div>

                    {/* Hash and metadata */}
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {format(new Date(item.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      </span>
                      <button
                        onClick={() => copyHash(item.content_hash, item.id)}
                        className="flex items-center gap-1 hover:text-foreground transition-colors"
                        title="Copiar hash de verificação"
                      >
                        {copiedId === item.id ? (
                          <Check className="h-3 w-3 text-green-500" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                        <span className="font-mono">
                          {item.content_hash.slice(0, 12)}...
                        </span>
                      </button>
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
