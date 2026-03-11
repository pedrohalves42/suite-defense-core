// V4 Pricing - Plan Constants
// Created: 2025-12-27

// ============================================
// ACTIVE PLANS (can be purchased)
// ============================================
export const ACTIVE_PLANS = ['starter_compliance', 'business'] as const;
export type ActivePlan = typeof ACTIVE_PLANS[number];

// ============================================
// LEGACY PLANS (grandfathered, cannot purchase)
// ============================================
export const LEGACY_PLANS = [
  // Residential (frozen)
  'basico_residencial',
  'completo_residencial', 
  'avancado_residencial',
  'home_basic',
  'home_complete',
  'home_advanced',
  // Old business (frozen)
  'starter',
  'pro',
  'scale',
  // Old term plans (frozen)
  'starter_6m',
  'starter_12m',
  'starter_24m',
  'pro_6m',
  'pro_12m',
  'pro_24m',
  'scale_6m',
  'scale_12m',
  'scale_24m',
] as const;
export type LegacyPlan = typeof LEGACY_PLANS[number];

// ============================================
// PLAN DETAILS
// ============================================
export const PLAN_CONFIG = {
  starter_compliance: {
    name: 'Starter Compliance',
    displayName: 'CyberShield – Starter Compliance',
    baseDevices: 10,
    maxDevices: 50,
    basePriceCents: 24900, // R$ 249/mês
    addonPriceCents: 2900, // R$ 29/dispositivo adicional
    tier: 1,
    features: [
      'Até 10 dispositivos base',
      'Monitoramento em tempo real',
      'Inventário de software completo',
      'Status de antivírus',
      'Detecção de vulnerabilidades',
      'Dashboard centralizado',
      'Suporte por email',
    ],
  },
  business: {
    name: 'Business',
    displayName: 'CyberShield – Business',
    baseDevices: 20,
    maxDevices: 200,
    basePriceCents: 89900, // R$ 899/mês
    addonPriceCents: 2400, // R$ 24/dispositivo adicional
    tier: 2,
    features: [
      'Tudo do Starter, mais:',
      'Até 30 dispositivos base',
      'Scans avançados ilimitados',
      'Relatórios customizados',
      'Analytics avançado de riscos',
      'Evidências e histórico estendido',
      'Suporte prioritário',
      'API de integração',
    ],
  },
  enterprise: {
    name: 'Enterprise / MSP',
    displayName: 'CyberShield – Enterprise',
    baseDevices: 200,
    maxDevices: null, // unlimited
    basePriceCents: null, // contact sales
    addonPriceCents: null,
    tier: 3,
    features: [
      'Tudo do Business, mais:',
      'Dispositivos ilimitados',
      'Suporte dedicado 24/7',
      'SLA formal garantido',
      'Onboarding dedicado',
      'Multi-tenant para MSPs',
      'Descontos por volume (até 35%)',
    ],
  },
} as const;

// ============================================
// STRIPE MAPPING
// ============================================
export const STRIPE_PLAN_MAP = {
  // Base plans
  starter_compliance: {
    priceId: 'price_1Sj531FeHfNScQDP8kMvWUpP',
    productId: 'prod_TgRwgJlh0NC2mI',
    type: 'base' as const,
  },
  business: {
    priceId: 'price_1T9lV8FeHfNScQDPfQJhglVa',
    productId: 'prod_U81YkX1Yl5sjcV',
    type: 'base' as const,
  },
  // Device addons
  device_addon_starter: {
    priceId: 'price_1Sj53iFeHfNScQDPS7pve80k',
    productId: 'prod_TgRxLbexC5TDBS',
    type: 'addon' as const,
  },
  device_addon_business: {
    priceId: 'price_1Sj542FeHfNScQDPpgdjaKx1',
    productId: 'prod_TgRxsLyISsc36X',
    type: 'addon' as const,
  },
} as const;

// ============================================
// MSP COUPONS (volume discounts)
// ============================================
export const MSP_COUPONS = {
  level1: {
    couponId: '17IEYGD3',
    name: 'MSP Nível 1',
    percentOff: 15,
    minDevices: 100,
  },
  level2: {
    couponId: 'uJ5hLxn9',
    name: 'MSP Nível 2',
    percentOff: 25,
    minDevices: 300,
  },
  level3: {
    couponId: 'quY2WQ8h',
    name: 'MSP Nível 3',
    percentOff: 35,
    minDevices: 1000,
  },
} as const;

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Check if a plan is a legacy/grandfathered plan
 */
export function isLegacyPlan(planName: string): boolean {
  return LEGACY_PLANS.includes(planName as LegacyPlan);
}

/**
 * Check if a plan is an active, purchasable plan
 */
export function isActivePlan(planName: string): boolean {
  return ACTIVE_PLANS.includes(planName as ActivePlan);
}

/**
 * Get the appropriate MSP coupon for a device count
 */
export function getMspCoupon(totalDevices: number): typeof MSP_COUPONS[keyof typeof MSP_COUPONS] | null {
  if (totalDevices >= MSP_COUPONS.level3.minDevices) return MSP_COUPONS.level3;
  if (totalDevices >= MSP_COUPONS.level2.minDevices) return MSP_COUPONS.level2;
  if (totalDevices >= MSP_COUPONS.level1.minDevices) return MSP_COUPONS.level1;
  return null;
}

/**
 * Get addon price ID for a plan
 */
export function getAddonPriceId(plan: ActivePlan): string {
  return plan === 'starter_compliance' 
    ? STRIPE_PLAN_MAP.device_addon_starter.priceId
    : STRIPE_PLAN_MAP.device_addon_business.priceId;
}

/**
 * Calculate total price for a plan with extra devices
 */
export function calculatePlanPrice(
  plan: ActivePlan,
  extraDevices: number = 0
): { baseCents: number; addonCents: number; totalCents: number } {
  const config = PLAN_CONFIG[plan];
  const baseCents = config.basePriceCents;
  const addonCents = extraDevices * config.addonPriceCents;
  
  return {
    baseCents,
    addonCents,
    totalCents: baseCents + addonCents,
  };
}

/**
 * Format price in BRL
 */
export function formatBRL(cents: number): string {
  return `R$ ${(cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
}

/**
 * Get the recommended plan based on device count
 */
export function getRecommendedPlan(deviceCount: number): ActivePlan | 'enterprise' {
  if (deviceCount > 200) return 'enterprise';
  if (deviceCount > 50) return 'business';
  return 'starter_compliance';
}
