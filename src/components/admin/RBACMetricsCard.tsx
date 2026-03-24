/**
 * RBAC Metrics Card - Exibe distribuição de papéis para auditoria
 * Etapa 3 do plano de melhoria 68% → 80%
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users, ShieldCheck, Eye, UserCog, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { logger } from '@/lib/logger';

interface RBACMetrics {
  role: string;
  user_count: number;
}

export function RBACMetricsCard() {
  const { tenant } = useTenant();

  const { data: metrics, isLoading } = useQuery({
    queryKey: ['rbac-metrics', tenant?.id],
    queryFn: async (): Promise<RBACMetrics[]> => {
      if (!tenant?.id) return [];

      // Try to use the view first
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('tenant_id', tenant.id);

      if (error) {
        logger.error('Error fetching RBAC metrics:', error);
        return [];
      }

      // Aggregate by role
      const roleCounts: Record<string, number> = {};
      data?.forEach(row => {
        const role = row.role || 'unknown';
        roleCounts[role] = (roleCounts[role] || 0) + 1;
      });

      return Object.entries(roleCounts).map(([role, user_count]) => ({
        role,
        user_count,
      }));
    },
    enabled: !!tenant?.id,
    refetchInterval: 300000,
    refetchIntervalInBackground: false, // COST-OPT: 60s → 5min
  });

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'super_admin':
        return <ShieldCheck className="h-4 w-4 text-purple-500" />;
      case 'admin':
        return <UserCog className="h-4 w-4 text-blue-500" />;
      case 'analyst':
        return <Users className="h-4 w-4 text-green-500" />;
      case 'viewer':
        return <Eye className="h-4 w-4 text-muted-foreground" />;
      default:
        return <Users className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getRoleLabel = (role: string) => {
    const labels: Record<string, string> = {
      super_admin: 'Super Admin',
      admin: 'Administrador',
      analyst: 'Analista',
      viewer: 'Visualizador',
    };
    return labels[role] || role;
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'super_admin':
        return 'default';
      case 'admin':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  const totalUsers = metrics?.reduce((sum, m) => sum + m.user_count, 0) || 0;
  const hasRoleSeparation = metrics && metrics.length > 1;
  const adminCount = metrics?.filter(m => m.role === 'admin' || m.role === 'super_admin')
    .reduce((sum, m) => sum + m.user_count, 0) || 0;
  const isAllAdmins = adminCount === totalUsers && totalUsers > 0;

  if (isLoading) {
    return (
      <Card className="animate-pulse">
        <CardHeader className="pb-2">
          <div className="h-5 bg-muted rounded w-32" />
        </CardHeader>
        <CardContent>
          <div className="h-16 bg-muted rounded" />
        </CardContent>
      </Card>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
    >
      <Card className={cn(
        "border",
        isAllAdmins && "border-amber-500/30 bg-amber-500/5"
      )}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            Distribuição de Papéis (RBAC)
            {!hasRoleSeparation && totalUsers > 0 && (
              <Badge variant="outline" className="text-amber-600 border-amber-500/50">
                <AlertTriangle className="h-3 w-3 mr-1" />
                Sem separação
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {totalUsers === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum usuário encontrado</p>
          ) : (
            <div className="space-y-3">
              {/* Role Distribution */}
              <div className="flex flex-wrap gap-2">
                {metrics?.map((m) => (
                  <div
                    key={m.role}
                    className="flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-lg"
                  >
                    {getRoleIcon(m.role)}
                    <span className="text-sm font-medium">{getRoleLabel(m.role)}</span>
                    <Badge variant={getRoleBadgeVariant(m.role) as any}>
                      {m.user_count}
                    </Badge>
                  </div>
                ))}
              </div>

              {/* Compliance Warning */}
              {isAllAdmins && (
                <div className="p-2 bg-amber-500/10 rounded text-xs text-amber-600 dark:text-amber-400">
                  <strong>⚠️ Recomendação:</strong> Todos os usuários são administradores. 
                  Considere adicionar papéis como "Analista" ou "Visualizador" para separação de funções.
                </div>
              )}

              {/* Compliance Check */}
              {hasRoleSeparation && (
                <div className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400">
                  <ShieldCheck className="h-3 w-3" />
                  <span>Separação de funções implementada ✓</span>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
