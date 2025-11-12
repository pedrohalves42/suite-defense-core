import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Trash2, UserPlus, Shield, Eye, Settings as SettingsIcon } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useNavigate } from 'react-router-dom';
import { useTenant } from '@/hooks/useTenant';

interface Member {
  id: string;
  user_id: string;
  role: string;
  tenant_id: string;
  created_at: string;
  profiles: {
    full_name: string | null;
  } | null;
  email?: string;
}

interface Subscription {
  subscription_plans: {
    name: string;
    max_users: number;
  };
}

export default function Members() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { tenant, loading: tenantLoading } = useTenant();
  const [memberToRemove, setMemberToRemove] = useState<Member | null>(null);

  // Buscar membros do tenant via edge function
  const { data: members = [], isLoading } = useQuery({
    queryKey: ['tenant-members'],
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
        .single();

      if (error) throw error;
      return data as Subscription;
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

  // Atualizar role do membro
  const updateRole = useMutation({
    mutationFn: async ({ userRoleId, newRole }: { userRoleId: string; newRole: string }) => {
      const { error } = await supabase.functions.invoke('update-member-role', {
        body: { user_role_id: userRoleId, new_role: newRole },
      });

      if (error) throw error;
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

  const getRoleBadge = (role: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'outline'> = {
      admin: 'default',
      operator: 'secondary',
      viewer: 'outline',
    };

    const icons: Record<string, any> = {
      admin: Shield,
      operator: SettingsIcon,
      viewer: Eye,
    };

    const Icon = icons[role] || Eye;

    return (
      <Badge variant={variants[role] || 'outline'} className="gap-1">
        <Icon className="h-3 w-3" />
        {role}
      </Badge>
    );
  };

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
                <div
                  key={member.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <div>
                        <p className="font-medium">
                          {member.profiles?.full_name || 'Sem nome'}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {member.email}
                        </p>
                      </div>
                      {getRoleBadge(member.role)}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Adicionado em{' '}
                      {new Date(member.created_at).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select
                      value={member.role}
                      onValueChange={(newRole) =>
                        updateRole.mutate({ userRoleId: member.id, newRole })
                      }
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="operator">Operator</SelectItem>
                        <SelectItem value="viewer">Viewer</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setMemberToRemove(member)}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
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
