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
import { getMemberLimit } from '@/lib/subscriptionLimits';

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
      // CORREÇÃO: Adicionar headers de autenticação explicitamente
      const { data: { session } } = await supabase.auth.getSession();
      
      const { data, error } = await supabase.functions.invoke('list-users', {
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      });
      
      if (error) throw error;
      return data.users || [];
    },
    enabled: !!tenant?.id,
  });

  // Buscar assinatura do tenant - CORREÇÃO: usar check-subscription Edge Function
  const { data: subscription } = useQuery({
    queryKey: ['subscription', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) throw new Error('Tenant não encontrado');

      const { data: { session } } = await supabase.auth.getSession();
      
      const { data, error } = await supabase.functions.invoke('check-subscription', {
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      });

      if (error) throw error;
      return data; // { subscribed, plan_name, device_quantity, status, features }
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
      queryClient.invalidateQueries({ queryKey: ['tenant-members', tenant?.id] });
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

  // CORREÇÃO: Tipagem melhorada com AppRole e headers explícitos
  const updateRole = useMutation({
    mutationFn: async ({ userId, newRole }: { userId: string; newRole: AppRole }) => {
      // CORREÇÃO: Adicionar headers de autenticação explicitamente
      const { data: { session } } = await supabase.auth.getSession();
      
      const { data, error } = await supabase.functions.invoke('update-user-role', {
        body: { userId, roles: [newRole] },
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-members', tenant?.id] });
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

  // CRITICAL FIX: Use max_users from tenant_features instead of device_quantity
  const currentUsersCount = members.length;
  const planName = subscription?.plan_name || 'free';
  
  // Get max_users from tenant_features (primary source of truth)
  const maxUsersFeature = subscription?.features?.max_users;
  const memberLimit = maxUsersFeature?.quota_limit ?? getMemberLimit(subscription, 'free');
  
  const isUnlimited = memberLimit === null;
  const isAtLimit = !isUnlimited && currentUsersCount >= (memberLimit ?? 0);
  
  console.log('[Members] Subscription check:', { 
    planName, 
    currentUsersCount, 
    memberLimit, 
    isAtLimit,
    maxUsersFeature: maxUsersFeature ? `limit=${maxUsersFeature.quota_limit}, used=${maxUsersFeature.quota_used}` : 'not found'
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            Gerenciar Membros
            {tenant && (
              <Badge variant="outline" className="font-normal text-base">
                {tenant.name}
              </Badge>
            )}
          </h1>
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
          <CardDescription>Detalhes do seu plano e limites</CardDescription>
          <div className="mt-2">
            <Badge variant="secondary">{planName}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Membros</p>
              <p className="text-2xl font-bold">
                {currentUsersCount} / {isUnlimited ? '∞' : memberLimit}
              </p>
            </div>
            {!isUnlimited && isAtLimit && (
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
            <p className="text-center text-muted-foreground py-8">Carregando membros...</p>
          ) : members.length === 0 ? (
            <div className="text-center py-12 space-y-3">
              <p className="text-muted-foreground text-lg">
                {tenant ? `O tenant "${tenant.name}" ainda não possui membros.` : 'Nenhum membro encontrado.'}
              </p>
              <p className="text-sm text-muted-foreground">
                Clique em "Convidar Membro" acima para adicionar usuários à sua organização.
              </p>
            </div>
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
