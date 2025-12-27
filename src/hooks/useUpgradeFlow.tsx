import { useState, useCallback, useMemo } from "react";
import { useTenant } from "./useTenant";
import { useTenantFeatures } from "./useTenantFeatures";

type PlanType = "starter" | "business" | "enterprise";

interface UpgradeFlowState {
  showModal: boolean;
  triggerReason: "device_limit" | "feature_lock" | "critical_risk" | undefined;
  featureName: string | undefined;
}

// Limites por plano (V4 Pricing)
const PLAN_LIMITS: Record<PlanType, {
  baseDevices: number;
  maxDevices: number;
  features: string[];
  lockedFeatures: string[];
}> = {
  starter: {
    baseDevices: 10,
    maxDevices: 50,
    features: ["monitoring", "inventory", "antivirus_status", "vulnerability_detection", "dashboard"],
    lockedFeatures: ["advanced_scans", "custom_reports", "analytics", "extended_history"],
  },
  business: {
    baseDevices: 30,
    maxDevices: 200,
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

  // Obter plano atual - por enquanto usar starter como default
  // TODO: Integrar com tenant_subscriptions quando disponível
  const currentPlan: PlanType = useMemo(() => {
    // Aqui integraria com o tenant subscription
    return "starter";
  }, [tenant]);
  
  const planLimits = PLAN_LIMITS[currentPlan];

  // Verificar se está próximo do limite de dispositivos
  const deviceQuota = getFeatureQuota("max_devices");
  const isNearDeviceLimit = deviceQuota.limit ? (deviceQuota.used / deviceQuota.limit) >= 0.8 : false;
  const hasReachedDeviceLimit = deviceQuota.limit ? deviceQuota.used >= deviceQuota.limit : false;

  // Verificar se uma feature está bloqueada
  const isFeatureLocked = useCallback((featureKey: string): boolean => {
    return planLimits.lockedFeatures.includes(featureKey);
  }, [planLimits]);

  // Abrir modal por limite de dispositivos
  const triggerDeviceLimitUpgrade = useCallback(() => {
    setState({
      showModal: true,
      triggerReason: "device_limit",
      featureName: undefined,
    });
  }, []);

  // Abrir modal por feature bloqueada
  const triggerFeatureLockUpgrade = useCallback((featureName: string) => {
    setState({
      showModal: true,
      triggerReason: "feature_lock",
      featureName,
    });
  }, []);

  // Abrir modal por risco crítico
  const triggerCriticalRiskUpgrade = useCallback(() => {
    setState({
      showModal: true,
      triggerReason: "critical_risk",
      featureName: undefined,
    });
  }, []);

  // Fechar modal
  const closeModal = useCallback(() => {
    setState({
      showModal: false,
      triggerReason: undefined,
      featureName: undefined,
    });
  }, []);

  // Verificar se deve mostrar upgrade automaticamente
  const checkAndTriggerUpgrade = useCallback((context: {
    type: "add_device" | "access_feature" | "critical_risk";
    featureName?: string;
  }): boolean => {
    const plan = currentPlan as PlanType;
    if (plan === "business" || plan === "enterprise") {
      return false; // Já está no plano máximo ou enterprise
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
        if (plan === "starter") {
          triggerCriticalRiskUpgrade();
          return true;
        }
        break;
    }
    return false;
  }, [currentPlan, hasReachedDeviceLimit, isFeatureLocked, triggerDeviceLimitUpgrade, triggerFeatureLockUpgrade, triggerCriticalRiskUpgrade]);

  return {
    // Estado
    showModal: state.showModal,
    triggerReason: state.triggerReason,
    featureName: state.featureName,
    
    // Info do plano
    currentPlan,
    planLimits,
    isNearDeviceLimit,
    hasReachedDeviceLimit,
    
    // Ações
    isFeatureLocked,
    triggerDeviceLimitUpgrade,
    triggerFeatureLockUpgrade,
    triggerCriticalRiskUpgrade,
    closeModal,
    checkAndTriggerUpgrade,
  };
};
