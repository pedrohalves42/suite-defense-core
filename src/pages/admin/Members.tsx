import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { UserPlus, UserCog } from 'lucide-react';
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
import { CreateUserForm } from '@/components/members/CreateUserForm';
import { AppRole } from '@/types/roles';
import { Member, TenantSubscription } from '@/types/user';
import { getMemberLimit } from '@/lib/subscriptionLimits';

export default function Members() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { tenant, loading: tenantLoading } = useTenant();
  const [memberToRemove, setMemberToRemove] = useState<Member | null>(null);
  const [showCreateUserForm, setShowCreateUserForm] = useState(false);

  // CORRECAO: Cache key com tenant.id para invalidacao correta
  const { data: members = [], isLoading } = useQuery({
    queryKey: ['tenant-members', tenant?.id],
    queryFn: async () => {
      // CORRECAO: Adicionar headers de autenticacao explicitamente
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

  // Buscar assinatura do tenant - CORRECAO: usar check-subscription Edge Function
  const { data: subscription } = useQuery({
    queryKey: ['subscription', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) throw new Error('Tenant nao encontrado');

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

  // P0 FIX: Remover membro via Edge Function (nao DELETE direto)
  // Edge Function valida: nao remover ultimo admin, nao remover a si mesmo, audit log
  const removeMember = useMutation({
    mutationFn: async (memberId: string) => {
      const { data: { session } } = await supabase.auth.getSession();
      
      const { data, error } = await supabase.functions.invoke('remove-member', {
        body: { member_id: memberId },
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.message || 'Erro ao remover membro');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-members', tenant?.id] });
      toast({
        title: 'Membro removido',
        description: 'O membro foi removido com sucesso do tenant.',
      });
      setMemberToRemove(null);
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao remover membro',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // CORRECAO: Tipagem melhorada com AppRole e headers explicitos
  const updateRole = useMutation({
    mutationFn: async ({ userId, newRole }: { userId: string; newRole: AppRole }) => {
      // CORRECAO: Adicionar headers de autenticacao explicitamente
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
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/20">
            <UserCog className="h-5 w-5 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                Gerenciar Membros
              </h2>
              {tenant && (
                <Badge variant="outline" className="font-normal text-sm">
                  {tenant.name}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Gerencie os membros do seu tenant
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {!isUnlimited && isAtLimit && (
            <Badge variant="destructive" className="text-sm">
              Limite de membros atingido ({memberLimit})
            </Badge>
          )}
          <Button 
            variant="outline"
            onClick={() => setShowCreateUserForm(true)}
            disabled={isAtLimit}
          >
            <UserCog className="h-4 w-4 mr-2" />
            Criar Usuário
          </Button>
          <Button 
            onClick={() => navigate('/admin/invites')}
            disabled={isAtLimit}
          >
            <UserPlus className="h-4 w-4 mr-2" />
            Convidar por Email
          </Button>
        </div>
      </div>

      {!isUnlimited && isAtLimit && (
        <Card className="border-destructive bg-destructive/5">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <p className="font-semibold text-destructive">Limite de membros atingido</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Seu plano <Badge variant="secondary" className="mx-1">{planName}</Badge> 
                  permite ate {memberLimit} membros. Para adicionar mais membros, faca upgrade do seu plano.
                </p>
              </div>
              <Button 
                onClick={() => navigate('/admin/plan-upgrade')}
                variant="default"
              >
                Fazer Upgrade
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Informacoes da Assinatura</CardTitle>
          <CardDescription>Detalhes do seu plano e limites</CardDescription>
          <div className="mt-2">
            <Badge variant="secondary">{planName}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Membros</p>
              <p className="text-2xl font-bold" data-testid="member-count">
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
            Lista de todos os usuarios com acesso ao seu tenant
          </CardDescription>
        </CardHeader>
        <CardContent>
          {(isLoading || tenantLoading) ? (
            <p className="text-center text-muted-foreground py-8">Carregando membros...</p>
          ) : members.length === 0 ? (
            <div className="text-center py-12 space-y-3">
              <p className="text-muted-foreground text-lg">
                {tenant ? `O tenant "${tenant.name}" ainda nao possui membros.` : 'Nenhum membro encontrado.'}
              </p>
              <p className="text-sm text-muted-foreground">
                Clique em "Convidar Membro" acima para adicionar usuarios a sua organizacao.
              </p>
            </div>
          ) : (
            <div className="space-y-4" data-testid="members-list">
              {members.map((member) => (
                <MemberCard
                  key={member.id}
                  member={member}
                  onRoleChange={(userId, newRole) => updateRole.mutate({ userId, newRole })}
                  onRemove={(m) => setMemberToRemove(m)}
                  isUpdating={updateRole.isPending}
                  data-testid={`member-card-${member.id}`}
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
              do tenant? Esta acao nao pode ser desfeita.
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

      {/* Create User Modal */}
      <CreateUserForm 
        open={showCreateUserForm} 
        onOpenChange={setShowCreateUserForm} 
      />
    </div>
  );
}
