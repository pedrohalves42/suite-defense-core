import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from './useTenant';

interface TenantFeature {
  id: string;
  tenant_id: string;
  feature_key: string;
  enabled: boolean;
  quota_limit: number | null;
  quota_used: number;
  metadata: any;
}

export const useTenantFeatures = () => {
  const { tenant } = useTenant();

  const { data: features, isLoading } = useQuery({
    queryKey: ['tenant-features', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];

      const { data, error } = await supabase
        .from('tenant_features')
        .select('*')
        .eq('tenant_id', tenant.id);

      if (error) throw error;
      return data as TenantFeature[];
    },
    enabled: !!tenant?.id,
  });

  const hasFeature = (featureKey: string): boolean => {
    const feature = features?.find(f => f.feature_key === featureKey);
    return feature?.enabled ?? false;
  };

  const getFeatureQuota = (featureKey: string): { limit: number | null; used: number; remaining: number | null } => {
    const feature = features?.find(f => f.feature_key === featureKey);
    if (!feature) {
      return { limit: null, used: 0, remaining: null };
    }

    const remaining = feature.quota_limit !== null 
      ? feature.quota_limit - feature.quota_used 
      : null;

    return {
      limit: feature.quota_limit,
      used: feature.quota_used,
      remaining,
    };
  };

  const canUseFeature = (featureKey: string): boolean => {
    const feature = features?.find(f => f.feature_key === featureKey);
    if (!feature?.enabled) return false;

    // If no quota limit, feature is available
    if (feature.quota_limit === null) return true;

    // Check if under quota
    return feature.quota_used < feature.quota_limit;
  };

  const isNearQuota = (featureKey: string, threshold: number = 90): boolean => {
    const feature = features?.find(f => f.feature_key === featureKey);
    if (!feature?.quota_limit) return false;

    const percentage = (feature.quota_used / feature.quota_limit) * 100;
    return percentage >= threshold;
  };

  return {
    features,
    loading: isLoading,
    hasFeature,
    getFeatureQuota,
    canUseFeature,
    isNearQuota,
  };
};
