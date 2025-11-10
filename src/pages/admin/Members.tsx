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
import { useNavigate } from 'react-router-dom';

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
  const [memberToRemove, setMemberToRemove] = useState<Member | null>(null);

  // Buscar membros do tenant
  const { data: members = [], isLoading } = useQuery({
    queryKey: ['tenant-members'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Não autorizado');

      // Buscar tenant_id do usuário
      const { data: userRole } = await supabase
        .from('user_roles')
        .select('tenant_id')
        .eq('user_id', user.id)
        .single();

      if (!userRole) throw new Error('Tenant não encontrado');

      // Buscar todos os membros do tenant
      const { data: membersData, error } = await supabase
        .from('user_roles')
        .select(`
          id,
          user_id,
          role,
          tenant_id,
          created_at,
          profiles (
            full_name
          )
        `)
        .eq('tenant_id', userRole.tenant_id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Buscar emails dos usuários
      const { data: { users } } = await supabase.auth.admin.listUsers();
      
      return membersData.map((member) => ({
        ...member,
        email: users.find((u) => u.id === member.user_id)?.email || 'N/A',
      }));
    },
  });

  // Buscar assinatura do tenant
  const { data: subscription } = useQuery({
    queryKey: ['tenant-subscription'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Não autorizado');

      const { data: userRole } = await supabase
        .from('user_roles')
        .select('tenant_id')
        .eq('user_id', user.id)
        .single();

      if (!userRole) throw new Error('Tenant não encontrado');

      const { data, error } = await supabase
        .from('tenant_subscriptions')
        .select(`
          subscription_plans (
            name,
            max_users
          )
        `)
        .eq('tenant_id', userRole.tenant_id)
        .single();

      if (error) throw error;
      return data as Subscription;
    },
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
          {isLoading ? (
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
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setMemberToRemove(member)}
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
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
