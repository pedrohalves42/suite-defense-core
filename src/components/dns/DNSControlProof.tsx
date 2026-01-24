import { useMemo } from 'react';
import { CheckCircle2, Clock, Shield, ExternalLink } from 'lucide-react';
import { useBlockedWebsites, BlockedWebsite } from '@/hooks/useBlockedWebsites';
import { useBlockedAttempts, BlockedAttempt } from '@/hooks/useBlockedAttempts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatBrazilDateTime } from '@/lib/date-utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

interface PolicyWithProof {
  id: string;
  domain_pattern: string;
  reason: string | null;
  created_at: string;
  proofStatus: 'verified' | 'pending';
  lastEnforcement: string | null;
  enforcementCount: number;
  recentAttempts: Array<{
    id: string;
    agent_name: string;
    attempted_at: string;
    source: string | null;
  }>;
}

export function DNSControlProof() {
  const { blockedWebsites, isLoading: websitesLoading } = useBlockedWebsites();
  const { attempts, isLoading: attemptsLoading } = useBlockedAttempts({ limit: 500 });

  const policiesWithProof = useMemo<PolicyWithProof[]>(() => {
    if (!blockedWebsites || !attempts) return [];
    
    return blockedWebsites.map((policy: BlockedWebsite) => {
      // Match attempts by domain pattern or policy_id
      const matchingAttempts = attempts.filter((a: BlockedAttempt) => 
        a.policy_id === policy.id ||
        a.domain === policy.domain_pattern || 
        a.domain.endsWith(policy.domain_pattern.replace('*.', '.'))
      );
      
      return {
        id: policy.id,
        domain_pattern: policy.domain_pattern,
        reason: policy.reason,
        created_at: policy.created_at,
        proofStatus: matchingAttempts.length > 0 ? 'verified' : 'pending',
        lastEnforcement: matchingAttempts[0]?.attempted_at || null,
        enforcementCount: matchingAttempts.length,
        recentAttempts: matchingAttempts.slice(0, 5).map((a: BlockedAttempt) => ({
          id: a.id,
          agent_name: a.agent_name,
          attempted_at: a.attempted_at,
          source: a.source,
        })),
      };
    });
  }, [blockedWebsites, attempts]);

  const verifiedCount = policiesWithProof.filter(p => p.proofStatus === 'verified').length;
  const totalCount = policiesWithProof.length;

  if (websitesLoading || attemptsLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Card */}
      <Card className="border-2 border-green-500/20 bg-green-500/5">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-full bg-green-500/10">
              <Shield className="h-8 w-8 text-green-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">
                {verifiedCount} de {totalCount} políticas com prova de controle
              </h3>
              <p className="text-sm text-muted-foreground">
                Cadeia verificável: Política → Endpoint → Tentativa Bloqueada → Evidência
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Policies Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Prova de Controle End-to-End
          </CardTitle>
          <CardDescription>
            Cada política mostra se há evidência real de bloqueio nos endpoints
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Política</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Última Execução</TableHead>
                  <TableHead>Total Bloqueados</TableHead>
                  <TableHead className="w-[100px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {policiesWithProof.map(policy => (
                  <TableRow key={policy.id}>
                    <TableCell>
                      <code className="px-2 py-1 rounded bg-muted text-sm">
                        {policy.domain_pattern}
                      </code>
                      {policy.reason && (
                        <p className="text-xs text-muted-foreground mt-1 truncate max-w-[200px]">
                          {policy.reason}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      {policy.proofStatus === 'verified' ? (
                        <Badge className="gap-1 bg-green-500/10 text-green-600 border-green-500/20">
                          <CheckCircle2 className="h-3 w-3" />
                          Verificado
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="gap-1">
                          <Clock className="h-3 w-3" />
                          Aguardando
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {policy.lastEnforcement 
                        ? formatBrazilDateTime(policy.lastEnforcement)
                        : 'Nenhuma tentativa registrada'}
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">{policy.enforcementCount}</span>
                    </TableCell>
                    <TableCell>
                      {policy.enforcementCount > 0 && (
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="outline" size="sm" className="gap-1">
                              <ExternalLink className="h-3 w-3" />
                              Ver
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Cadeia de Evidências</DialogTitle>
                              <DialogDescription>
                                Tentativas bloqueadas para {policy.domain_pattern}
                              </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-2 max-h-[300px] overflow-y-auto">
                              {policy.recentAttempts.map(attempt => (
                                <div 
                                  key={attempt.id}
                                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                                >
                                  <div>
                                    <p className="font-medium">{attempt.agent_name}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {formatBrazilDateTime(attempt.attempted_at)}
                                    </p>
                                  </div>
                                  <Badge variant="outline" className="text-xs">
                                    {attempt.source || 'dns'}
                                  </Badge>
                                </div>
                              ))}
                            </div>
                          </DialogContent>
                        </Dialog>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {policiesWithProof.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      Nenhuma política de bloqueio configurada.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
