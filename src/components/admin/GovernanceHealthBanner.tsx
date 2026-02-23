import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { useMFAEnforcement } from '@/hooks/useMFAEnforcement';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Shield, 
  ShieldAlert, 
  Users, 
  KeyRound, 
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Loader2,
  Trash2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

interface GovernanceMetrics {
  totalUsers: number;
  usersWithMFA: number;
  privilegedUsers: number;
  criticalAlerts: number;
  totalAlerts: number;
}

export function GovernanceHealthBanner() {
  const { tenant } = useTenant();
  const { requiresMFA, hasMFA, isCompliant } = useMFAEnforcement();
  const [expanded, setExpanded] = useState(false);
  const queryClient = useQueryClient();

  // Bulk resolve mutation for accumulated alerts
  const bulkResolveMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Não autenticado');
      if (!tenant?.id) throw new Error('Tenant não encontrado');

      // Resolve all non-critical alerts older than 7 days
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      
      // 1. Resolve non-critical alerts older than 7 days
      const { data: nonCriticalData } = await supabase
        .from('system_alerts')
        .update({
          resolved: true,
          resolved_at: new Date().toISOString(),
          resolution_notes: 'Resolução em massa — alertas antigos (>7 dias)',
        })
        .eq('tenant_id', tenant.id)
        .eq('resolved', false)
        .lt('created_at', sevenDaysAgo)
        .not('severity', 'in', '("critical")')
        .select('id');

      // 2. Resolve critical alerts (requires resolved_by)
      const { data: criticalData } = await supabase
        .from('system_alerts')
        .update({
          resolved: true,
          resolved_at: new Date().toISOString(),
          resolved_by: user.id,
          resolution_notes: 'Resolução em massa — alertas críticos antigos (>7 dias) revisados por admin',
        })
        .eq('tenant_id', tenant.id)
        .eq('resolved', false)
        .eq('severity', 'critical')
        .lt('created_at', sevenDaysAgo)
        .select('id');

      return (nonCriticalData?.length ?? 0) + (criticalData?.length ?? 0);
    },
    onSuccess: (count) => {
      toast.success(`${count} alertas antigos resolvidos em massa`);
      queryClient.invalidateQueries({ queryKey: ['governance-metrics'] });
      queryClient.invalidateQueries({ queryKey: ['system-alerts'] });
    },
    onError: (error) => {
      toast.error('Erro na resolução em massa: ' + (error as Error).message);
    },
  });

  // Fetch governance metrics
  const { data: metrics, isLoading } = useQuery({
    queryKey: ['governance-metrics', tenant?.id],
    queryFn: async (): Promise<GovernanceMetrics> => {
      if (!tenant?.id) return {
        totalUsers: 0,
        usersWithMFA: 0,
        privilegedUsers: 0,
        criticalAlerts: 0,
        totalAlerts: 0,
      };

      // Get users with MFA (simplified - checking AMR claim would require more complex logic)
      const { data: users } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .eq('tenant_id', tenant.id);

      const totalUsers = new Set(users?.map(u => u.user_id) || []).size;
      const privilegedUsers = users?.filter(u => u.role === 'admin' || u.role === 'super_admin').length || 0;
      
      // Get MFA coverage using dedicated RPC that queries auth.mfa_factors
      let usersWithMFA = 0;
      try {
        const { data: mfaData } = await supabase.rpc('get_mfa_user_count', {
          p_tenant_id: tenant.id
        });
        
        if (mfaData && typeof mfaData === 'object' && 'users_with_mfa' in mfaData) {
          usersWithMFA = (mfaData as { users_with_mfa: number }).users_with_mfa || 0;
        }
      } catch {
        // Fallback: ignore errors
      }

      // Get critical alerts
      const { data: alerts } = await supabase
        .from('system_alerts')
        .select('id, severity')
        .eq('tenant_id', tenant.id)
        .eq('resolved', false);

      const criticalAlerts = alerts?.filter(a => a.severity === 'critical' || a.severity === 'high').length || 0;
      const totalAlerts = alerts?.length || 0;

      return {
        totalUsers,
        usersWithMFA,
        privilegedUsers,
        criticalAlerts,
        totalAlerts,
      };
    },
    enabled: !!tenant?.id,
    refetchInterval: 300000, // COST-OPT: 60s → 5min
  });

  // Calculate health score
  const calculateHealthScore = () => {
    if (!metrics) return 0;
    let score = 100;
    
    // MFA coverage (max -30 points)
    const mfaCoverage = metrics.totalUsers > 0 
      ? (metrics.usersWithMFA / metrics.totalUsers) * 100 
      : 0;
    score -= Math.min((100 - mfaCoverage) * 0.3, 30);
    
    // Critical alerts (max -40 points)
    score -= Math.min(metrics.criticalAlerts * 10, 40);
    
    // Privileged user ratio (max -20 points)
    const privilegedRatio = metrics.totalUsers > 0 
      ? (metrics.privilegedUsers / metrics.totalUsers) * 100 
      : 0;
    if (privilegedRatio > 50) {
      score -= Math.min((privilegedRatio - 50) * 0.4, 20);
    }
    
    return Math.max(0, Math.round(score));
  };

  const healthScore = calculateHealthScore();
  
  const getHealthStatus = () => {
    if (healthScore >= 80) return { 
      label: 'Saudável', 
      color: 'text-green-600 dark:text-green-400',
      bg: 'bg-green-500/10',
      border: 'border-green-500/30'
    };
    if (healthScore >= 60) return { 
      label: 'Atenção', 
      color: 'text-amber-600 dark:text-amber-400',
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/30'
    };
    return { 
      label: 'Crítico', 
      color: 'text-red-600 dark:text-red-400',
      bg: 'bg-red-500/10',
      border: 'border-red-500/30'
    };
  };

  const status = getHealthStatus();

  if (isLoading) return null;

  // Personal MFA Warning (highest priority) - Non-dismissible for admins
  const showPersonalMFAWarning = requiresMFA && !hasMFA;

  return (
    <div className="space-y-3">
      {/* Personal MFA Warning - Always show if admin without MFA - NON-DISMISSIBLE */}
      {showPersonalMFAWarning && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card className="border-2 border-red-500/50 bg-red-500/5 shadow-lg shadow-red-500/10">
            <CardContent className="py-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-red-500/20 animate-pulse">
                    <KeyRound className="h-5 w-5 text-red-500" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-red-600 dark:text-red-400">
                      🔐 Configuração de MFA Obrigatória
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Sua conta tem privilégios administrativos. <strong>Configure MFA agora</strong> para continuar usando o sistema.
                    </p>
                  </div>
                </div>
                <Button asChild className="bg-red-600 hover:bg-red-700 text-white shadow-lg">
                  <Link to="/admin/setup-mfa-required">
                    <KeyRound className="h-4 w-4 mr-2" />
                    Configurar MFA Agora
                  </Link>
                </Button>
              </div>
              <div className="mt-3 p-2 bg-red-500/10 rounded text-xs text-red-600 dark:text-red-400">
                <strong>Política ADR-008:</strong> Administradores e Super Admins devem ter MFA configurado. 
                Este aviso não pode ser fechado até que o MFA seja configurado.
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Governance Health Card */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: showPersonalMFAWarning ? 0.1 : 0 }}
      >
        <Card className={cn("border", status.border, status.bg)}>
          <CardContent className="py-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-3 min-w-0">
                <div className={cn("p-2 rounded-full shrink-0", status.bg)}>
                  {healthScore >= 60 ? (
                    <Shield className={cn("h-5 w-5", status.color)} />
                  ) : (
                    <ShieldAlert className={cn("h-5 w-5", status.color)} />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-sm">Saúde de Governança</h3>
                    <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", status.color)}>
                      {status.label}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    <div className="flex items-center gap-2 w-28">
                      <Progress value={healthScore} className="h-1.5" />
                      <span className={cn("text-xs font-bold", status.color)}>
                        {healthScore}%
                      </span>
                    </div>
                    {metrics && (
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <KeyRound className="h-3 w-3" />
                          {metrics.usersWithMFA}/{metrics.totalUsers} MFA
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {metrics.privilegedUsers} admins
                        </span>
                        {metrics.criticalAlerts > 0 && (
                          <span className="flex items-center gap-1 text-red-500">
                            <AlertTriangle className="h-3 w-3" />
                            {metrics.criticalAlerts} críticos
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </div>

            {/* Expanded Details */}
            <AnimatePresence>
              {expanded && metrics && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-4 pt-4 border-t border-border/50"
                >
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* MFA Coverage */}
                    <Link 
                      to="/admin/tenant?tab=security"
                      className="p-3 rounded-lg bg-background/50 hover:bg-background/80 transition-colors group"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Cobertura MFA</span>
                        <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        {metrics.usersWithMFA === metrics.totalUsers && metrics.totalUsers > 0 ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-amber-500" />
                        )}
                        <span className="text-lg font-bold">
                          {metrics.totalUsers > 0 
                            ? Math.round((metrics.usersWithMFA / metrics.totalUsers) * 100) 
                            : 0}%
                        </span>
                        <span className="text-xs text-muted-foreground">
                          ({metrics.usersWithMFA} de {metrics.totalUsers})
                        </span>
                      </div>
                    </Link>

                    {/* Privileged Users */}
                    <Link 
                      to="/admin/users"
                      className="p-3 rounded-lg bg-background/50 hover:bg-background/80 transition-colors group"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Usuários Privilegiados</span>
                        <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        {metrics.privilegedUsers <= metrics.totalUsers * 0.3 ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-amber-500" />
                        )}
                        <span className="text-lg font-bold">{metrics.privilegedUsers}</span>
                        <span className="text-xs text-muted-foreground">
                          de {metrics.totalUsers} total
                        </span>
                      </div>
                    </Link>

                    {/* Critical Alerts */}
                    <Link 
                      to="/admin/security-monitoring"
                      className="p-3 rounded-lg bg-background/50 hover:bg-background/80 transition-colors group"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Alertas Críticos</span>
                        <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        {metrics.criticalAlerts === 0 ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-red-500" />
                        )}
                        <span className={cn(
                          "text-lg font-bold",
                          metrics.criticalAlerts > 0 ? "text-red-500" : "text-green-500"
                        )}>
                          {metrics.criticalAlerts}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          de {metrics.totalAlerts} ativos
                        </span>
                      </div>
                    </Link>
                  </div>

                  {/* Quick Actions */}
                  <div className="mt-4 flex items-center gap-2">
                    <Button asChild variant="outline" size="sm">
                      <Link to="/admin/system-audit">
                        <Shield className="h-4 w-4 mr-2" />
                        Ver Auditoria Completa
                      </Link>
                    </Button>
                    {metrics.criticalAlerts > 0 && (
                      <>
                        <Button asChild variant="outline" size="sm" className="text-red-500 hover:text-red-600">
                          <Link to="/admin/security-monitoring">
                            <AlertTriangle className="h-4 w-4 mr-2" />
                            Resolver Alertas
                          </Link>
                        </Button>
                        <Button 
                          variant="destructive" 
                          size="sm"
                          onClick={() => bulkResolveMutation.mutate()}
                          disabled={bulkResolveMutation.isPending}
                        >
                          {bulkResolveMutation.isPending ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4 mr-2" />
                          )}
                          Resolução em Massa ({metrics.criticalAlerts})
                        </Button>
                      </>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
