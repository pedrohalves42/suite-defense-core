/**
 * Check Tenant Quotas - Migrated to serveInternal middleware
 */
import { serveInternal } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';

interface QuotaAlert {
  tenant_id: string;
  tenant_name: string;
  feature_key: string;
  quota_used: number;
  quota_limit: number;
  usage_percentage: number;
}

serveInternal(async (_req, ctx) => {
  const { supabase, requestId } = ctx;

  logger.info(`[${requestId}] Starting quota monitoring`);

  const { data: features, error: featuresError } = await supabase
    .from('tenant_features')
    .select(`*, tenants!inner (id, name)`)
    .not('quota_limit', 'is', null)
    .gt('quota_limit', 0);

  if (featuresError) throw featuresError;

  logger.info(`[${requestId}] Checking ${features?.length || 0} quota features`);

  const alerts: QuotaAlert[] = [];

  for (const feature of features || []) {
    const usagePercentage = (feature.quota_used / feature.quota_limit) * 100;
    const threshold = feature.quota_warning_threshold || 80;

    if (usagePercentage >= threshold) {
      const tenant = Array.isArray(feature.tenants) ? feature.tenants[0] : feature.tenants;
      alerts.push({
        tenant_id: feature.tenant_id,
        tenant_name: tenant.name,
        feature_key: feature.feature_key,
        quota_used: feature.quota_used,
        quota_limit: feature.quota_limit,
        usage_percentage: Math.round(usagePercentage * 100) / 100,
      });
    }
  }

  const alertResults = [];
  for (const alert of alerts) {
    try {
      const { error: alertError } = await supabase.functions.invoke('notification-dispatcher', {
        headers: { 'X-Internal-Secret': Deno.env.get('INTERNAL_FUNCTION_SECRET') || '' },
        body: {
          channel: 'email', type: 'system',
          severity: alert.usage_percentage >= 100 ? 'critical' : 'warning',
          message: `Limite de quota proximo: ${alert.feature_key}`,
          metadata: {
            feature: alert.feature_key,
            usage: `${alert.quota_used} de ${alert.quota_limit}`,
            percentage: `${alert.usage_percentage}%`,
            tenant: alert.tenant_name,
            warning: alert.usage_percentage >= 100 ? 'Quota excedida!' : 'Proximo do limite.',
          },
          tenant_id: alert.tenant_id
        }
      });
      alertResults.push({ tenant_id: alert.tenant_id, feature_key: alert.feature_key, success: !alertError });
    } catch (error) {
      alertResults.push({ tenant_id: alert.tenant_id, feature_key: alert.feature_key, success: false, error: error instanceof Error ? error.message : 'Unknown' });
    }
  }

  return {
    success: true,
    checked_features: features?.length || 0,
    alerts_triggered: alerts.length,
    alerts_sent: alertResults.filter(r => r.success).length,
    alert_results: alertResults,
    timestamp: new Date().toISOString()
  };
});
