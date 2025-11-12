import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { UserPlus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useNavigate } from 'react-router-dom';
import { useTenant } from '@/hooks/useTenant';
import { MemberCard } from '@/components/members/MemberCard';
import { AppRole } from '@/types/roles';
import { Member, TenantSubscription } from '@/types/user';

export default function Members() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { tenant, loading: tenantLoading } = useTenant();
  const [memberToRemove, setMemberToRemove] = useState<Member | null>(null);

  // CORREÇÃO: Cache key com tenant.id para invalidação correta
  const { data: members = [], isLoading } = useQuery({
    queryKey: ['tenant-members', tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('list-users');
      
      if (error) throw error;
      return data.users || [];
    },
  });

  // Buscar assinatura do tenant
  const { data: subscription } = useQuery({
    queryKey: ['tenant-subscription', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) throw new Error('Tenant não encontrado');

      const { data, error } = await supabase
        .from('tenant_subscriptions')
        .select(`
          subscription_plans (
            name,
            max_users
          )
        `)
        .eq('tenant_id', tenant.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data as TenantSubscription;
    },
    enabled: !!tenant?.id,
  });

  // Remover membro
  const removeMember = useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase
        .from('user_roles')
        .delete()
        .eq('id', memberId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-members'] });
      toast({
        title: 'Membro removido',
        description: 'O membro foi removido com sucesso do tenant.',
      });
      setMemberToRemove(null);
    },
    onError: (error) => {
      toast({
        title: 'Erro ao remover membro',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // CORREÇÃO: Tipagem melhorada com AppRole
  const updateRole = useMutation({
    mutationFn: async ({ userId, newRole }: { userId: string; newRole: AppRole }) => {
      const { data, error } = await supabase.functions.invoke('update-user-role', {
        body: { userId, roles: [newRole] },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-members'] });
      toast({
        title: 'Role atualizado',
        description: 'O role do membro foi atualizado com sucesso.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao atualizar role',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const currentUsersCount = members.length;
  const maxUsers = subscription?.subscription_plans.max_users || 0;
  const planName = subscription?.subscription_plans.name || 'free';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Gerenciar Membros</h1>
          <p className="text-muted-foreground mt-1">
            Gerencie os membros do seu tenant
          </p>
        </div>
        <Button onClick={() => navigate('/admin/invites')}>
          <UserPlus className="h-4 w-4 mr-2" />
          Convidar Membro
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Informações da Assinatura</CardTitle>
          <CardDescription>
            Plano atual: <Badge variant="secondary">{planName}</Badge>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Membros</p>
              <p className="text-2xl font-bold">
                {currentUsersCount} / {maxUsers}
              </p>
            </div>
            {currentUsersCount >= maxUsers && (
              <Badge variant="destructive">Limite atingido</Badge>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Membros do Tenant</CardTitle>
          <CardDescription>
            Lista de todos os usuários com acesso ao seu tenant
          </CardDescription>
        </CardHeader>
        <CardContent>
          {(isLoading || tenantLoading) ? (
            <p className="text-center text-muted-foreground py-8">Carregando...</p>
          ) : members.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              Nenhum membro encontrado
            </p>
          ) : (
            <div className="space-y-4">
              {members.map((member) => (
                <MemberCard
                  key={member.id}
                  member={member}
                  onRoleChange={(userId, newRole) => updateRole.mutate({ userId, newRole })}
                  onRemove={(m) => setMemberToRemove(m)}
                  isUpdating={updateRole.isPending}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={!!memberToRemove}
        onOpenChange={() => setMemberToRemove(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover membro?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover{' '}
              <strong>{memberToRemove?.profiles?.full_name || memberToRemove?.email}</strong>{' '}
              do tenant? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => memberToRemove && removeMember.mutate(memberToRemove.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
