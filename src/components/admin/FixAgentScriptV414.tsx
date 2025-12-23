import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, Loader2, Wrench, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface FixResult {
  success: boolean;
  fixApplied?: boolean;
  previousVersion?: string;
  newVersion?: string;
  previousSha?: string;
  newSha?: string;
  scriptSize?: number;
  diagnosis?: {
    tryCountBefore: number;
    catchCountBefore: number;
    tryCountAfter: number;
    catchCountAfter: number;
    wasBalanced: boolean;
    isBalanced: boolean;
  };
  error?: string;
  message?: string;
}

/**
 * Component to fix v4.1.3 script and create v4.1.4
 * SSA-011 v2: Proper fix for MissingCatchOrFinally in Verify-Ed25519Signature
 */
export function FixAgentScriptV414() {
  const [isFixing, setIsFixing] = useState(false);
  const [result, setResult] = useState<FixResult | null>(null);

  const handleFix = async () => {
    setIsFixing(true);
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('fix-agent-script-v414');

      if (error) {
        throw new Error(error.message);
      }

      setResult(data);

      if (data.success) {
        toast.success('Script corrigido com sucesso!', {
          description: `Criada versão ${data.newVersion} com SHA ${data.newSha?.substring(0, 12)}...`
        });
      } else {
        toast.error('Falha ao corrigir script', {
          description: data.error || data.message || 'Erro desconhecido'
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      setResult({ success: false, error: errorMessage });
      toast.error('Erro ao executar correção', { description: errorMessage });
    } finally {
      setIsFixing(false);
    }
  };

  return (
    <Card className="border-orange-500/30 bg-orange-500/5">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Wrench className="h-5 w-5 text-orange-500" />
          <CardTitle>Correção v4.1.4 (SSA-011 v2)</CardTitle>
          <Badge className="bg-orange-600">HOTFIX CRÍTICO</Badge>
        </div>
        <CardDescription>
          Corrige erro MissingCatchOrFinally no script Windows v4.1.3
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg bg-orange-500/10 border border-orange-500/20 p-4 text-sm">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-500 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="font-semibold mb-1">Problema Identificado:</h4>
              <p className="text-muted-foreground mb-2">
                O script v4.1.3 contém um erro de sintaxe PowerShell na função 
                <code className="mx-1 px-1 bg-muted rounded">Verify-Ed25519Signature</code>:
                um bloco <code className="px-1 bg-muted rounded">try</code> sem 
                <code className="px-1 bg-muted rounded">catch</code> correspondente.
              </p>
              <p className="text-muted-foreground">
                Isso impede a execução do agente e causa "Last Task Result: 1" no Scheduled Task.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-lg bg-muted/50 p-4 text-sm">
          <h4 className="font-semibold mb-2">O que será corrigido:</h4>
          <ul className="list-disc list-inside space-y-1 text-muted-foreground">
            <li>Adicionar bloco <code className="px-1 bg-muted rounded">catch</code> ausente na função Verify-Ed25519Signature</li>
            <li>Atualizar versão do header para v4.1.4</li>
            <li>Recalcular SHA256 do script</li>
            <li>Desativar v4.1.3 e ativar v4.1.4</li>
          </ul>
        </div>

        <Button 
          onClick={handleFix} 
          disabled={isFixing}
          className="w-full bg-orange-600 hover:bg-orange-700"
          size="lg"
        >
          {isFixing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Corrigindo script...
            </>
          ) : (
            <>
              <Wrench className="mr-2 h-4 w-4" />
              Executar Correção v4.1.4
            </>
          )}
        </Button>

        {result && (
          <div className={`rounded-lg p-4 ${
            result.success 
              ? 'bg-green-500/10 border border-green-500/20' 
              : 'bg-destructive/10 border border-destructive/20'
          }`}>
            <div className="flex items-center gap-2 mb-3">
              {result.success ? (
                <CheckCircle className="h-5 w-5 text-green-500" />
              ) : (
                <XCircle className="h-5 w-5 text-destructive" />
              )}
              <span className="font-semibold">
                {result.success ? 'Correção aplicada com sucesso!' : 'Falha na correção'}
              </span>
            </div>

            {result.success && result.diagnosis && (
              <div className="space-y-2 text-sm">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-muted-foreground">Versão anterior:</span>
                    <Badge variant="outline" className="ml-2">{result.previousVersion}</Badge>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Nova versão:</span>
                    <Badge className="ml-2 bg-green-600">{result.newVersion}</Badge>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-muted-foreground">try/catch antes:</span>
                    <span className={`ml-2 font-mono ${
                      result.diagnosis.wasBalanced ? 'text-green-600' : 'text-red-500'
                    }`}>
                      {result.diagnosis.tryCountBefore}/{result.diagnosis.catchCountBefore}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">try/catch depois:</span>
                    <span className={`ml-2 font-mono ${
                      result.diagnosis.isBalanced ? 'text-green-600' : 'text-red-500'
                    }`}>
                      {result.diagnosis.tryCountAfter}/{result.diagnosis.catchCountAfter}
                    </span>
                  </div>
                </div>

                <div className="pt-2 border-t border-border/50">
                  <span className="text-muted-foreground">Novo SHA256:</span>
                  <code className="ml-2 text-xs font-mono bg-muted px-2 py-0.5 rounded">
                    {result.newSha?.substring(0, 24)}...
                  </code>
                </div>
              </div>
            )}

            {!result.success && (
              <p className="text-sm text-destructive">
                {result.error || result.message || 'Erro desconhecido'}
              </p>
            )}
          </div>
        )}

        {result?.success && (
          <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 p-4 text-sm">
            <h4 className="font-semibold mb-2">Próximos passos:</h4>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
              <li>Gere uma nova Enrollment Key para os agentes afetados</li>
              <li>Reinstale os agentes usando o novo instalador</li>
              <li>Os agentes baixarão automaticamente o script v4.1.4 corrigido</li>
            </ol>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
