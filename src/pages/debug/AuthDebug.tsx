import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { useTenant } from '@/hooks/useTenant';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Shield, Database, Users, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function AuthDebug() {
  const { user } = useAuth();
  const { role, isAdmin, isOperator, isViewer, canWrite, loading: roleLoading } = useUserRole();
  const { tenant, loading: tenantLoading } = useTenant();
  const { toast } = useToast();
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string }>>({});
  const [testing, setTesting] = useState<string | null>(null);

  const testEndpoint = async (name: string, testFn: () => Promise<void>) => {
    setTesting(name);
    try {
      await testFn();
      setTestResults(prev => ({
        ...prev,
        [name]: { success: true, message: 'Sucesso' }
      }));
      toast({
        title: `Teste ${name} passou`,
        description: 'Endpoint funcionando corretamente',
      });
    } catch (error: any) {
      setTestResults(prev => ({
        ...prev,
        [name]: { success: false, message: error.message || 'Erro desconhecido' }
      }));
      toast({
        variant: 'destructive',
        title: `Teste ${name} falhou`,
        description: error.message,
      });
    } finally {
      setTesting(null);
    }
  };

  const testUserRoles = async () => {
    await testEndpoint('Roles', async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('*')
        .eq('user_id', user?.id);
      
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Nenhuma role encontrada');
    });
  };

  const testTenantAccess = async () => {
    await testEndpoint('Tenant', async () => {
      const { data, error } = await supabase
        .from('tenants')
        .select('*')
        .limit(1)
        .maybeSingle();
      
      if (error) throw error;
      if (!data) throw new Error('Tenant não encontrado');
    });
  };

  const testAgents = async () => {
    await testEndpoint('Agents', async () => {
      const { data, error } = await supabase
        .from('agents_safe')
        .select('*')
        .limit(1);
      
      if (error) throw error;
    });
  };

  const testAdminUsers = async () => {
    await testEndpoint('Admin Users', async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .limit(5);
      
      if (error) throw error;
    });
  };

  return (
    <div className="container mx-auto p-6 max-w-6xl space-y-6">
      <div className="flex items-center gap-2 mb-6">
        <Shield className="h-8 w-8 text-primary" />
        <h1 className="text-3xl font-bold">Diagnóstico de Autenticação</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Session Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Informações da Sessão
            </CardTitle>
            <CardDescription>Detalhes do usuário autenticado</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">User ID</p>
              <p className="text-sm font-mono break-all">{user?.id || 'Não autenticado'}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Email</p>
              <p className="text-sm">{user?.email || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Email Confirmado</p>
              <Badge variant={user?.email_confirmed_at ? 'default' : 'destructive'}>
                {user?.email_confirmed_at ? 'Sim' : 'Não'}
              </Badge>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Último Login</p>
              <p className="text-sm">
                {user?.last_sign_in_at 
                  ? new Date(user.last_sign_in_at).toLocaleString('pt-BR')
                  : 'N/A'}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Role Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Permissões e Roles
            </CardTitle>
            <CardDescription>Roles atribuídas ao usuário</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {roleLoading ? (
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Carregando roles...</span>
              </div>
            ) : (
              <>
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-2">Role Atual</p>
                  <Badge variant="default" className="text-base">
                    {role || 'Nenhuma'}
                  </Badge>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Verificações</p>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      {isAdmin ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className="text-sm">Admin</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {isOperator ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className="text-sm">Operator</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {isViewer ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className="text-sm">Viewer</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {canWrite ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className="text-sm">Can Write</span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Tenant Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Informações do Tenant
            </CardTitle>
            <CardDescription>Dados da organização</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {tenantLoading ? (
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Carregando tenant...</span>
              </div>
            ) : tenant ? (
              <>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Tenant ID</p>
                  <p className="text-sm font-mono break-all">{tenant.id}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Nome</p>
                  <p className="text-sm">{tenant.name}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Slug</p>
                  <p className="text-sm">{tenant.slug}</p>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhum tenant encontrado</p>
            )}
          </CardContent>
        </Card>

        {/* Test Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Testes de Endpoints</CardTitle>
            <CardDescription>Verificar acesso a recursos</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              onClick={testUserRoles}
              disabled={testing !== null}
              className="w-full justify-start"
              variant="outline"
            >
              {testing === 'Roles' && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {testResults['Roles']?.success && <CheckCircle2 className="h-4 w-4 mr-2 text-green-500" />}
              {testResults['Roles']?.success === false && <XCircle className="h-4 w-4 mr-2 text-red-500" />}
              Testar User Roles
            </Button>

            <Button
              onClick={testTenantAccess}
              disabled={testing !== null}
              className="w-full justify-start"
              variant="outline"
            >
              {testing === 'Tenant' && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {testResults['Tenant']?.success && <CheckCircle2 className="h-4 w-4 mr-2 text-green-500" />}
              {testResults['Tenant']?.success === false && <XCircle className="h-4 w-4 mr-2 text-red-500" />}
              Testar Acesso Tenant
            </Button>

            <Button
              onClick={testAgents}
              disabled={testing !== null}
              className="w-full justify-start"
              variant="outline"
            >
              {testing === 'Agents' && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {testResults['Agents']?.success && <CheckCircle2 className="h-4 w-4 mr-2 text-green-500" />}
              {testResults['Agents']?.success === false && <XCircle className="h-4 w-4 mr-2 text-red-500" />}
              Testar Listagem de Agents
            </Button>

            <Button
              onClick={testAdminUsers}
              disabled={testing !== null || !isAdmin}
              className="w-full justify-start"
              variant="outline"
            >
              {testing === 'Admin Users' && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {testResults['Admin Users']?.success && <CheckCircle2 className="h-4 w-4 mr-2 text-green-500" />}
              {testResults['Admin Users']?.success === false && <XCircle className="h-4 w-4 mr-2 text-red-500" />}
              Testar Admin - Listar Usuários
            </Button>

            {Object.entries(testResults).map(([name, result]) => (
              <div key={name} className="text-xs text-muted-foreground">
                <span className="font-medium">{name}:</span> {result.message}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Informações do Console</CardTitle>
          <CardDescription>
            Os logs detalhados estão sendo enviados para o console do navegador
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Abra as Ferramentas do Desenvolvedor (F12) e verifique a aba Console para ver logs detalhados
            das verificações de role, tenant e autenticação.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
