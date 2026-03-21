import { useState, useCallback, useMemo } from "react";
import { useTenant } from "./useTenant";
import { useTenantFeatures } from "./useTenantFeatures";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { 
  PLAN_CONFIG, 
  isLegacyPlan, 
  type ActivePlan 
} from "@/constants/plans";

type PlanType = "starter_compliance" | "business" | "enterprise";

interface UpgradeFlowState {
  showModal: boolean;
  triggerReason: "device_limit" | "feature_lock" | "critical_risk" | undefined;
  featureName: string | undefined;
}

// V4 Plan limits derived from PLAN_CONFIG
const PLAN_LIMITS: Record<PlanType, {
  baseDevices: number;
  maxDevices: number;
  features: string[];
  lockedFeatures: string[];
}> = {
  starter_compliance: {
    baseDevices: PLAN_CONFIG.starter_compliance.baseDevices,
    maxDevices: PLAN_CONFIG.starter_compliance.maxDevices,
    features: ["monitoring", "inventory", "antivirus_status", "vulnerability_detection", "dashboard"],
    lockedFeatures: ["advanced_scans", "custom_reports", "analytics", "extended_history"],
  },
  business: {
    baseDevices: PLAN_CONFIG.business.baseDevices,
    maxDevices: PLAN_CONFIG.business.maxDevices,
    features: ["monitoring", "inventory", "antivirus_status", "vulnerability_detection", "dashboard", "advanced_scans", "custom_reports", "analytics", "extended_history"],
    lockedFeatures: [],
  },
  enterprise: {
    baseDevices: 200,
    maxDevices: Infinity,
    features: ["all"],
    lockedFeatures: [],
  },
};

export const useUpgradeFlow = () => {
  const { tenant } = useTenant();
  const { getFeatureQuota } = useTenantFeatures();
  
  const [state, setState] = useState<UpgradeFlowState>({
    showModal: false,
    triggerReason: undefined,
    featureName: undefined,
  });

  // Fetch current plan from tenant_subscriptions
  const { data: subscriptionData } = useQuery({
    queryKey: ['tenant-subscription-plan', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return null;
      const { data, error } = await supabase
        .from('tenant_subscriptions')
        .select('plan_id, is_legacy, subscription_plans(name)')
        .eq('tenant_id', tenant.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!tenant?.id,
    staleTime: 5 * 60 * 1000,
  });

  const { currentPlan, isLegacy } = useMemo(() => {
    const planName = (subscriptionData?.subscription_plans as Record<string, string> | null)?.name || "starter_compliance";
    // Map plan names to PlanType categories
    const planMapping: Record<string, PlanType> = {
      starter_compliance: "starter_compliance",
      starter: "starter_compliance",
      starter_6m: "starter_compliance",
      starter_12m: "starter_compliance",
      starter_24m: "starter_compliance",
      free: "starter_compliance",
      home_basic: "starter_compliance",
      home_complete: "starter_compliance",
      home_advanced: "starter_compliance",
      basico_residencial: "starter_compliance",
      completo_residencial: "starter_compliance",
      avancado_residencial: "starter_compliance",
      business: "business",
      pro: "business",
      pro_6m: "business",
      pro_12m: "business",
      pro_24m: "business",
      scale: "enterprise",
      scale_6m: "enterprise",
      scale_12m: "enterprise",
      scale_24m: "enterprise",
      enterprise: "enterprise",
    };
    const mapped = planMapping[planName] || "starter_compliance";
    return {
      currentPlan: mapped,
      isLegacy: subscriptionData?.is_legacy ?? isLegacyPlan(planName),
    };
  }, [subscriptionData]);
  
  const planLimits = PLAN_LIMITS[currentPlan];

  // Check device quota
  const deviceQuota = getFeatureQuota("max_devices");
  const isNearDeviceLimit = deviceQuota.limit ? (deviceQuota.used / deviceQuota.limit) >= 0.8 : false;
  const hasReachedDeviceLimit = deviceQuota.limit ? deviceQuota.used >= deviceQuota.limit : false;

  // Check if a feature is locked
  const isFeatureLocked = useCallback((featureKey: string): boolean => {
    return planLimits.lockedFeatures.includes(featureKey);
  }, [planLimits]);

  // Trigger upgrade modal for device limit
  const triggerDeviceLimitUpgrade = useCallback(() => {
    setState({
      showModal: true,
      triggerReason: "device_limit",
      featureName: undefined,
    });
  }, []);

  // Trigger upgrade modal for locked feature
  const triggerFeatureLockUpgrade = useCallback((featureName: string) => {
    setState({
      showModal: true,
      triggerReason: "feature_lock",
      featureName,
    });
  }, []);

  // Trigger upgrade modal for critical risk
  const triggerCriticalRiskUpgrade = useCallback(() => {
    setState({
      showModal: true,
      triggerReason: "critical_risk",
      featureName: undefined,
    });
  }, []);

  // Close modal
  const closeModal = useCallback(() => {
    setState({
      showModal: false,
      triggerReason: undefined,
      featureName: undefined,
    });
  }, []);

  // Check and auto-trigger upgrade
  const checkAndTriggerUpgrade = useCallback((context: {
    type: "add_device" | "access_feature" | "critical_risk";
    featureName?: string;
  }): boolean => {
    if (currentPlan === "business" || currentPlan === "enterprise") {
      return false; // Already on max or enterprise plan
    }

    switch (context.type) {
      case "add_device":
        if (hasReachedDeviceLimit) {
          triggerDeviceLimitUpgrade();
          return true;
        }
        break;
      case "access_feature":
        if (context.featureName && isFeatureLocked(context.featureName)) {
          triggerFeatureLockUpgrade(context.featureName);
          return true;
        }
        break;
      case "critical_risk":
        if (currentPlan === "starter_compliance") {
          triggerCriticalRiskUpgrade();
          return true;
        }
        break;
    }
    return false;
  }, [currentPlan, hasReachedDeviceLimit, isFeatureLocked, triggerDeviceLimitUpgrade, triggerFeatureLockUpgrade, triggerCriticalRiskUpgrade]);

  return {
    // State
    showModal: state.showModal,
    triggerReason: state.triggerReason,
    featureName: state.featureName,
    
    // Plan info
    currentPlan,
    isLegacy,
    planLimits,
    isNearDeviceLimit,
    hasReachedDeviceLimit,
    
    // Actions
    isFeatureLocked,
    triggerDeviceLimitUpgrade,
    triggerFeatureLockUpgrade,
    triggerCriticalRiskUpgrade,
    closeModal,
    checkAndTriggerUpgrade,
  };
};
