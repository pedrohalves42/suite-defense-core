/**
 * Tenant Claim Alerts Component
 * 
 * ADR-026: Displays alerts for JWT claim health and tenant isolation issues.
 * Shows missing claims, cross-tenant attempts, and links to forensic logs.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { 
  AlertTriangle, 
  CheckCircle, 
  Shield, 
  Activity,
  ExternalLink,
  RefreshCw
} from 'lucide-react';
import { motion } from 'framer-motion';
import { formatBrazilDateTime } from '@/lib/date-utils';

interface ClaimHealthData {
  period: string;
  valid_claims: number;
  missing_claims: number;
  tenant_switches: number;
  cross_tenant_attempts: number;
}

interface TenantClaimSummary {
  total_valid_24h: number;
  total_missing_24h: number;
  total_switches_24h: number;
  total_cross_tenant_24h: number;
  last_period: string | null;
}

export function TenantClaimAlerts() {
  const { data: claimHealth, isLoading, refetch } = useQuery({
    queryKey: ['tenant-claim-health'],
    queryFn: async (): Promise<TenantClaimSummary> => {
      const { data, error } = await supabase
        .from('v_tenant_claim_health')
        .select('*')
        .limit(24); // Last 24 hours

      if (error) {
        console.warn('Error fetching claim health:', error);
        return {
          total_valid_24h: 0,
          total_missing_24h: 0,
          total_switches_24h: 0,
          total_cross_tenant_24h: 0,
          last_period: null
        };
      }

      const rows = data as ClaimHealthData[] || [];
      
      return {
        total_valid_24h: rows.reduce((sum, r) => sum + (r.valid_claims || 0), 0),
        total_missing_24h: rows.reduce((sum, r) => sum + (r.missing_claims || 0), 0),
        total_switches_24h: rows.reduce((sum, r) => sum + (r.tenant_switches || 0), 0),
        total_cross_tenant_24h: rows.reduce((sum, r) => sum + (r.cross_tenant_attempts || 0), 0),
        last_period: rows[0]?.period || null
      };
    },
    refetchInterval: 300000, // COST-OPT: 60s → 5min
  });

  const hasCriticalIssues = (claimHealth?.total_missing_24h || 0) > 0 || 
                            (claimHealth?.total_cross_tenant_24h || 0) > 0;

  const getHealthStatus = () => {
    if (!claimHealth) return 'unknown';
    if (claimHealth.total_missing_24h > 10 || claimHealth.total_cross_tenant_24h > 5) return 'critical';
    if (claimHealth.total_missing_24h > 0 || claimHealth.total_cross_tenant_24h > 0) return 'warning';
    return 'healthy';
  };

  const healthStatus = getHealthStatus();

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-32">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      {/* Critical Alerts */}
      {hasCriticalIssues && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Tenant Isolation Alert</AlertTitle>
          <AlertDescription className="flex items-center justify-between">
            <span>
              {claimHealth?.total_missing_24h || 0} missing claims e{' '}
              {claimHealth?.total_cross_tenant_24h || 0} tentativas cross-tenant detectadas (24h)
            </span>
            <Button variant="outline" size="sm" asChild>
              <a href="/admin/security/audit-logs" className="flex items-center gap-1">
                Ver Logs Forenses
                <ExternalLink className="h-3 w-3" />
              </a>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Main Card */}
      <Card data-testid="tenant-claim-health-card">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Tenant Isolation Health
            </CardTitle>
            <CardDescription>
              ADR-026: Monitoramento de JWT Claims (24h)
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Valid Claims */}
            <div className="space-y-1">
              <div className="text-2xl font-bold text-green-500">
                {claimHealth?.total_valid_24h || 0}
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <CheckCircle className="h-3 w-3" />
                Claims Válidos
              </p>
            </div>

            {/* Missing Claims */}
            <div className="space-y-1">
              <div className={`text-2xl font-bold ${
                (claimHealth?.total_missing_24h || 0) > 0 ? 'text-red-500' : 'text-green-500'
              }`}>
                {claimHealth?.total_missing_24h || 0}
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Claims Ausentes
              </p>
              {(claimHealth?.total_missing_24h || 0) > 0 && (
                <Badge variant="destructive" className="text-xs">
                  Requer Atenção
                </Badge>
              )}
            </div>

            {/* Tenant Switches */}
            <div className="space-y-1">
              <div className="text-2xl font-bold text-blue-500">
                {claimHealth?.total_switches_24h || 0}
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Activity className="h-3 w-3" />
                Trocas de Tenant
              </p>
            </div>

            {/* Cross-Tenant Attempts */}
            <div className="space-y-1">
              <div className={`text-2xl font-bold ${
                (claimHealth?.total_cross_tenant_24h || 0) > 0 ? 'text-red-500' : 'text-green-500'
              }`}>
                {claimHealth?.total_cross_tenant_24h || 0}
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Shield className="h-3 w-3" />
                Cross-Tenant Bloqueados
              </p>
              {(claimHealth?.total_cross_tenant_24h || 0) > 0 && (
                <Badge variant="destructive" className="text-xs">
                  Auditoria Forense
                </Badge>
              )}
            </div>
          </div>

          {/* Status Badge */}
          <div className="mt-4 flex items-center justify-between">
            <Badge 
              variant={healthStatus === 'healthy' ? 'outline' : 'destructive'}
              className={
                healthStatus === 'healthy' 
                  ? 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400' 
                  : ''
              }
            >
              {healthStatus === 'healthy' && <CheckCircle className="h-3 w-3 mr-1" />}
              {healthStatus === 'warning' && <AlertTriangle className="h-3 w-3 mr-1" />}
              {healthStatus === 'critical' && <AlertTriangle className="h-3 w-3 mr-1" />}
              {healthStatus === 'healthy' ? 'Isolation Healthy' : 
               healthStatus === 'warning' ? 'Minor Issues' : 'Critical Issues'}
            </Badge>
            
            {claimHealth?.last_period && (
              <span className="text-xs text-muted-foreground">
                Último período: {formatBrazilDateTime(claimHealth.last_period, 'short')}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
