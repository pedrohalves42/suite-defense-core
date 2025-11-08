import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useTenant } from '@/hooks/useTenant';

export default function Settings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { tenant, loading } = useTenant();
  const [tenantName, setTenantName] = useState('');

  const updateTenant = useMutation({
    mutationFn: async () => {
      if (!tenant) throw new Error('No tenant found');
      
      const { error } = await supabase
        .from('tenants')
        .update({ name: tenantName })
        .eq('id', tenant.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant'] });
      toast({ title: 'Configurações atualizadas com sucesso!' });
    },
    onError: () => {
      toast({ title: 'Erro ao atualizar configurações', variant: 'destructive' });
    },
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold">Configurações</h2>
        <p className="text-muted-foreground">Gerencie as configurações do seu tenant</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Informações do Tenant</CardTitle>
          <CardDescription>Configure as informações básicas do tenant</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Nome do Tenant</Label>
            <Input 
              value={tenantName || tenant?.name || ''}
              onChange={(e) => setTenantName(e.target.value)}
              placeholder={tenant?.name}
            />
          </div>
          <div>
            <Label>Slug</Label>
            <Input 
              value={tenant?.slug || ''}
              disabled
              className="bg-muted"
            />
            <p className="text-sm text-muted-foreground mt-1">
              O slug não pode ser alterado
            </p>
          </div>
          <div>
            <Label>ID do Tenant</Label>
            <Input 
              value={tenant?.id || ''}
              disabled
              className="bg-muted font-mono text-sm"
            />
          </div>
          <Button 
            onClick={() => updateTenant.mutate()}
            disabled={updateTenant.isPending || !tenantName}
          >
            Salvar Alterações
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Informações do Sistema</CardTitle>
          <CardDescription>Detalhes técnicos do tenant</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex justify-between py-2 border-b">
            <span className="text-muted-foreground">Criado em</span>
            <span>{tenant?.created_at ? new Date(tenant.created_at).toLocaleDateString('pt-BR') : '-'}</span>
          </div>
          <div className="flex justify-between py-2 border-b">
            <span className="text-muted-foreground">Última atualização</span>
            <span>{tenant?.updated_at ? new Date(tenant.updated_at).toLocaleDateString('pt-BR') : '-'}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
