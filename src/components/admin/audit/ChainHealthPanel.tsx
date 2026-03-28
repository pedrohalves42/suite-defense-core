import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Shield, ShieldCheck, ShieldAlert, Link2, Unlink, Wrench, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

interface ChainHealthPanelProps {
  tenantId: string;
}

interface ChainDiagnosis {
  audit_chain: {
    breaks_found: number;
    details: Array<{ id: string; created_at: string; previous_log_hash: string }>;
  };
  execution_chain: {
    agents_with_gaps: number;
    total_gaps: number;
    details: Array<{ agent_id: string; expected: number; actual: number; gaps: number }>;
  };
  diagnosed_at: string;
}

export function ChainHealthPanel({ tenantId }: ChainHealthPanelProps) {
  const queryClient = useQueryClient();

  const { data: diagnosis, isLoading, refetch } = useQuery({
    queryKey: ['chain-health', tenantId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('diagnose_chain_health', {
        p_tenant_id: tenantId,
      });
      if (error) throw error;
      return data as unknown as ChainDiagnosis;
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!tenantId,
  });

  const reanchorAudit = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('reanchor_audit_log_chain', {
        p_tenant_id: tenantId,
      });
      if (error) throw error;
      return data as unknown as any;
    },
    onSuccess: (data: Record<string, unknown>) => {
      toast.success(`Cadeia de auditoria reparada: ${data?.links_repaired || 0} links corrigidos`);
      queryClient.invalidateQueries({ queryKey: ['chain-health'] });
      queryClient.invalidateQueries({ queryKey: ['audit-integrity'] });
    },
    onError: (err: Error) => {
      toast.error(`Erro ao reparar: ${err.message}`);
    },
  });

  const reanchorExecution = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('reanchor_execution_chains');
      if (error) throw error;
      return data as unknown as any;
    },
    onSuccess: (data: Record<string, unknown>) => {
      toast.success(`Cadeias de execução reancoradas: ${data?.agents_reanchored || 0} agentes`);
      queryClient.invalidateQueries({ queryKey: ['chain-health'] });
    },
    onError: (err: Error) => {
      toast.error(`Erro ao reancorer: ${err.message}`);
    },
  });

  const auditHealthy = diagnosis?.audit_chain?.breaks_found === 0;
  const execHealthy = diagnosis?.execution_chain?.agents_with_gaps === 0;
  const allHealthy = auditHealthy && execHealthy;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
      <Card className={cn(
        "border-l-4",
        allHealthy ? "border-l-green-500" : "border-l-amber-500"
      )}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              <CardTitle className="text-base">ADR-036 — Integridade das Cadeias</CardTitle>
            </div>
            <Button variant="ghost" size="icon" onClick={() => refetch()} disabled={isLoading}>
              <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
            </Button>
          </div>
          <CardDescription>Diagnóstico criptográfico das cadeias de hash</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              Diagnosticando cadeias...
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Audit Log Chain */}
              <div className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {auditHealthy ? (
                      <ShieldCheck className="h-4 w-4 text-green-500" />
                    ) : (
                      <ShieldAlert className="h-4 w-4 text-amber-500" />
                    )}
                    <span className="font-medium text-sm">Cadeia de Auditoria</span>
                  </div>
                  <Badge variant={auditHealthy ? "default" : "secondary"} className={cn(
                    "text-xs",
                    auditHealthy 
                      ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" 
                      : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                  )}>
                    {auditHealthy ? (
                      <><Link2 className="h-3 w-3 mr-1" /> Íntegra</>
                    ) : (
                      <><Unlink className="h-3 w-3 mr-1" /> {diagnosis?.audit_chain?.breaks_found} quebras</>
                    )}
                  </Badge>
                </div>
                
                {!auditHealthy && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="outline" className="w-full gap-2" disabled={reanchorAudit.isPending}>
                        {reanchorAudit.isPending ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Wrench className="h-3 w-3" />
                        )}
                        Reparar Cadeia de Auditoria
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Reparar Cadeia de Auditoria</AlertDialogTitle>
                        <AlertDialogDescription>
                          Essa ação irá re-vincular os hashes da cadeia de auditoria cronologicamente. 
                          {diagnosis?.audit_chain?.breaks_found} link(s) quebrado(s) serão corrigidos.
                          O evento será registrado no log de segurança.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => reanchorAudit.mutate()}>
                          Confirmar Reparo
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>

              {/* Execution Hash Chain */}
              <div className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {execHealthy ? (
                      <ShieldCheck className="h-4 w-4 text-green-500" />
                    ) : (
                      <ShieldAlert className="h-4 w-4 text-amber-500" />
                    )}
                    <span className="font-medium text-sm">Cadeia de Execução</span>
                  </div>
                  <Badge variant={execHealthy ? "default" : "secondary"} className={cn(
                    "text-xs",
                    execHealthy 
                      ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" 
                      : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                  )}>
                    {execHealthy ? (
                      <><Link2 className="h-3 w-3 mr-1" /> Íntegra</>
                    ) : (
                      <><Unlink className="h-3 w-3 mr-1" /> {diagnosis?.execution_chain?.agents_with_gaps} agentes / {diagnosis?.execution_chain?.total_gaps} gaps</>
                    )}
                  </Badge>
                </div>

                {!execHealthy && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="outline" className="w-full gap-2" disabled={reanchorExecution.isPending}>
                        {reanchorExecution.isPending ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Wrench className="h-3 w-3" />
                        )}
                        Reancorer Cadeias de Execução
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Reancorer Cadeias de Execução</AlertDialogTitle>
                        <AlertDialogDescription>
                          Essa ação irá sincronizar as âncoras de {diagnosis?.execution_chain?.agents_with_gaps} agente(s) 
                          com seus últimos estados válidos. Gaps causados por arquivamento de execuções serão resolvidos.
                          O evento será registrado no log de segurança.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => reanchorExecution.mutate()}>
                          Confirmar Reancoragem
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
