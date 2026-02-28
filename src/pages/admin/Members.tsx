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
import { useTranslation } from 'react-i18next';

export default function Members() {
  const { t } = useTranslation();
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
          'X-Tenant-Id': tenant?.id || '',
        },
      });
      
      if (error) throw error;
      // Map edge function response to Member type (profiles wrapper)
      return (data.users || []).map((u: any) => ({
        ...u,
        id: u.user_id,
        profiles: u.profiles || { full_name: u.full_name || null },
      }));
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
                {t('adminPages.members.title')}
              </h2>
              {tenant && (
                <Badge variant="outline" className="font-normal text-sm">
                  {tenant.name}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {t('adminPages.members.subtitle')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {!isUnlimited && isAtLimit && (
            <Badge variant="destructive" className="text-sm">
              {t('adminPages.members.memberLimitReached')} ({memberLimit})
            </Badge>
          )}
          <Button 
            variant="outline"
            onClick={() => setShowCreateUserForm(true)}
            disabled={isAtLimit}
          >
            <UserCog className="h-4 w-4 mr-2" />
            {t('adminPages.members.createUser')}
          </Button>
          <Button 
            onClick={() => navigate('/admin/invites')}
            disabled={isAtLimit}
          >
            <UserPlus className="h-4 w-4 mr-2" />
            {t('adminPages.members.inviteByEmail')}
          </Button>
        </div>
      </div>

      {!isUnlimited && isAtLimit && (
        <Card className="border-destructive bg-destructive/5">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <p className="font-semibold text-destructive">{t('adminPages.members.memberLimitReached')}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {t('adminPages.members.limitReachedDesc', { plan: planName, limit: memberLimit })}
                </p>
              </div>
              <Button 
                onClick={() => navigate('/admin/plan-upgrade')}
                variant="default"
              >
                {t('adminPages.members.upgrade')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t('adminPages.members.subscriptionInfo')}</CardTitle>
          <CardDescription>{t('adminPages.members.subscriptionInfoDesc')}</CardDescription>
          <div className="mt-2">
            <Badge variant="secondary">{planName}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div>
              <p className="text-sm text-muted-foreground">{t('adminPages.members.membersCount')}</p>
              <p className="text-2xl font-bold" data-testid="member-count">
                {currentUsersCount} / {isUnlimited ? '∞' : memberLimit}
              </p>
            </div>
            {!isUnlimited && isAtLimit && (
              <Badge variant="destructive">{t('adminPages.members.limitReached')}</Badge>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('adminPages.members.tenantMembers')}</CardTitle>
          <CardDescription>
            {t('adminPages.members.tenantMembersDesc')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {(isLoading || tenantLoading) ? (
            <p className="text-center text-muted-foreground py-8">{t('adminPages.members.loadingMembers')}</p>
          ) : members.length === 0 ? (
            <div className="text-center py-12 space-y-3">
              <p className="text-muted-foreground text-lg">
                {tenant ? t('adminPages.members.noMembersYet', { name: tenant.name }) : t('adminPages.members.noMembersFound')}
              </p>
              <p className="text-sm text-muted-foreground">
                {t('adminPages.members.inviteHint')}
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
            <AlertDialogTitle>{t('adminPages.members.removeMember')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('adminPages.members.removeConfirm', { name: memberToRemove?.profiles?.full_name || memberToRemove?.email })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('adminPages.members.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => memberToRemove && removeMember.mutate(memberToRemove.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('adminPages.members.remove')}
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
