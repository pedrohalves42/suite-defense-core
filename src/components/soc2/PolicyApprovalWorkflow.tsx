/**
 * Policy Approval Workflow Component
 * Displays policies with approval status and actions
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CheckCircle2, Clock, FileText, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { format, ptBR } from '@/lib/date-utils';

interface Policy {
  id: string;
  policy_code: string;
  policy_name: string;
  version: string;
  status: string;
  owner: string | null;
  approved_by: string | null;
  approved_at: string | null;
  effective_date: string | null;
  review_date: string | null;
  soc2_criteria: string[];
}

export function PolicyApprovalWorkflow() {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const { data: policies, isLoading } = useQuery({
    queryKey: ['compliance-policies', tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('compliance_policies')
        .select('*')
        .eq('tenant_id', tenant!.id)
        .order('policy_code');
      
      if (error) throw error;
      return data as Policy[];
    },
    enabled: !!tenant?.id,
  });

  const approveMutation = useMutation({
    mutationFn: async (policyId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      // V-1057 FIX: Add tenant_id filter
      const { error } = await supabase
        .from('compliance_policies')
        .update({
          status: 'approved',
          approved_by: user.id,
          approved_at: new Date().toISOString(),
        })
        .eq('id', policyId)
        .eq('tenant_id', tenant!.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compliance-policies'] });
      toast.success('Política aprovada com sucesso');
    },
    onError: () => {
      toast.error('Erro ao aprovar política');
    },
    onSettled: () => {
      setApprovingId(null);
    },
  });

  const handleApprove = (policyId: string) => {
    setApprovingId(policyId);
    approveMutation.mutate(policyId);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-green-500/10 text-green-500 border-green-500/20"><CheckCircle2 className="h-3 w-3 mr-1" /> Aprovada</Badge>;
      case 'review':
        return <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20"><Clock className="h-3 w-3 mr-1" /> Em Revisão</Badge>;
      case 'draft':
        return <Badge variant="secondary"><FileText className="h-3 w-3 mr-1" /> Rascunho</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const approvedCount = policies?.filter(p => p.status === 'approved').length || 0;
  const totalCount = policies?.length || 0;
  const allApproved = approvedCount === totalCount && totalCount > 0;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Workflow de Aprovação de Políticas
            </CardTitle>
            <CardDescription>
              Gerencie o ciclo de vida das políticas de conformidade SOC 2
            </CardDescription>
          </div>
          <Badge variant={allApproved ? 'default' : 'secondary'} className="text-lg px-3 py-1">
            {approvedCount}/{totalCount} Aprovadas
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {allApproved && (
          <div className="mb-4 p-3 bg-green-500/10 border border-green-500/20 rounded-lg flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            <span className="text-green-500 font-medium">Todas as políticas estão aprovadas e em conformidade</span>
          </div>
        )}

        {!allApproved && (
          <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-yellow-500" />
            <span className="text-yellow-500 font-medium">
              {totalCount - approvedCount} política(s) pendente(s) de aprovação
            </span>
          </div>
        )}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Política</TableHead>
              <TableHead>Critérios SOC 2</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Aprovada em</TableHead>
              <TableHead>Ação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {policies?.map((policy) => (
              <TableRow key={policy.id}>
                <TableCell className="font-mono text-sm">{policy.policy_code}</TableCell>
                <TableCell className="font-medium">{policy.policy_name}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {policy.soc2_criteria?.map(cc => (
                      <Badge key={cc} variant="outline" className="text-xs">{cc}</Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>{getStatusBadge(policy.status)}</TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {policy.approved_at 
                    ? format(new Date(policy.approved_at), "dd/MM/yyyy", { locale: ptBR })
                    : '—'
                  }
                </TableCell>
                <TableCell>
                  {policy.status !== 'approved' ? (
                    <Button 
                      size="sm" 
                      onClick={() => handleApprove(policy.id)}
                      disabled={approvingId === policy.id}
                    >
                      {approvingId === policy.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        'Aprovar'
                      )}
                    </Button>
                  ) : (
                    <span className="text-muted-foreground text-sm">✓ Aprovada</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
