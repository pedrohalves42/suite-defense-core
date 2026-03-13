/**
 * Hook for SOC 2 Readiness data - fetches real data from database
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { SOC2_TRUST_CRITERIA, type CriteriaCode } from '@/types/soc2-compliance';

export interface SOC2ReadinessData {
  criteriaCode: CriteriaCode;
  criteriaName: string;
  totalControls: number;
  implementedControls: number;
  readinessScore: number;
}

export function useSOC2Readiness() {
  const { tenant } = useTenant();

  return useQuery({
    queryKey: ['soc2-readiness', tenant?.id],
    queryFn: async (): Promise<SOC2ReadinessData[]> => {
      // Fetch real criteria and controls from database
      const { data: criteria } = await supabase
        .from('soc2_criteria')
        .select('id, criteria_code, criteria_name, status')
        .eq('tenant_id', tenant!.id);

      const { data: controls } = await supabase
        .from('soc2_controls')
        .select('id, criteria_id, status')
        .eq('tenant_id', tenant!.id);

      // Fetch additional compliance data
      const { count: approvedPolicies } = await supabase
        .from('compliance_policies')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenant!.id)
        .eq('status', 'approved');

      const { count: registeredVendors } = await supabase
        .from('vendor_risk_registry')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenant!.id);

      const { count: openAlerts } = await supabase
        .from('security_events')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenant!.id)
        .eq('status', 'open');

      // Build readiness data from database or fallback to definitions
      const readinessData: SOC2ReadinessData[] = SOC2_TRUST_CRITERIA.map(criteriaDef => {
        const dbCriteria = criteria?.find(c => c.criteria_code === criteriaDef.code);
        const criteriaControls = controls?.filter(c => c.criteria_id === dbCriteria?.id) || [];
        
        const totalControls = criteriaControls.length || criteriaDef.controls.length;
        // V-4005 FIX: Don't inflate scores with fake 85% when no DB data exists
        const implementedControls = criteriaControls.filter(c => 
          c.status === 'implemented' || c.status === 'verified'
        ).length;

        // Apply bonuses based on actual compliance state
        let bonus = 0;
        
        // CC2 bonus for approved policies (9 policies = +15%)
        if (criteriaDef.code === 'CC2') {
          bonus = Math.min(15, (approvedPolicies || 0) * 1.67);
        }
        
        // CC9 bonus for registered vendors (3 vendors = +15%)
        if (criteriaDef.code === 'CC9') {
          bonus = Math.min(15, (registeredVendors || 0) * 5);
        }
        
        // CC4/CC7 penalty for too many open alerts
        if ((criteriaDef.code === 'CC4' || criteriaDef.code === 'CC7') && (openAlerts || 0) > 100) {
          bonus = -Math.min(15, Math.floor((openAlerts || 0) / 20));
        }

        const baseScore = totalControls > 0 
          ? Math.round((implementedControls / totalControls) * 100)
          : 85;
        
        const readinessScore = Math.min(100, Math.max(0, baseScore + bonus));

        return {
          criteriaCode: criteriaDef.code,
          criteriaName: dbCriteria?.criteria_name || criteriaDef.name,
          totalControls,
          implementedControls,
          readinessScore,
        };
      });

      return readinessData;
    },
    enabled: !!tenant?.id,
  });
}

export function calculateOverallScore(data: SOC2ReadinessData[]): number {
  if (data.length === 0) return 0;
  const total = data.reduce((sum, d) => sum + d.readinessScore, 0);
  return Math.round(total / data.length);
}
