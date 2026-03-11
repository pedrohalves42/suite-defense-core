// CyberShield V4 Pricing - Stripe IDs
// Criado em: 2025-12-27

export const STRIPE_PRODUCTS = {
  // Starter Compliance - R$ 499/mês base (10 dispositivos)
  starterCompliance: {
    productId: "prod_TgRwgJlh0NC2mI",
    name: "CyberShield – Starter Compliance",
    prices: {
      monthly: "price_1Sj531FeHfNScQDP8kMvWUpP", // R$ 499/mês
    },
    baseDevices: 10,
    maxDevices: 50,
    basePriceCents: 49900,
  },

  // Business - R$ 899/mês base (20 dispositivos)
  business: {
    productId: "prod_U81YkX1Yl5sjcV",
    name: "CyberShield – Business",
    prices: {
      monthly: "price_1T9lV8FeHfNScQDPfQJhglVa", // R$ 899/mês
    },
    baseDevices: 20,
    maxDevices: 200,
    basePriceCents: 89900,
  },

  // Dispositivo Adicional Starter - R$ 39/dispositivo
  deviceAddonStarter: {
    productId: "prod_TgRxLbexC5TDBS",
    name: "CyberShield – Dispositivo Adicional Starter",
    prices: {
      monthly: "price_1Sj53iFeHfNScQDPS7pve80k", // R$ 39/dispositivo
    },
    priceCentsPerUnit: 3900,
  },

  // Dispositivo Adicional Business - R$ 24/dispositivo
  deviceAddonBusiness: {
    productId: "prod_TgRxsLyISsc36X",
    name: "CyberShield – Dispositivo Adicional Business",
    prices: {
      monthly: "price_1Sj542FeHfNScQDPpgdjaKx1", // R$ 24/dispositivo
    },
    priceCentsPerUnit: 2400,
  },
} as const;

// Cupons MSP (IDs privados)
export const MSP_COUPONS = {
  level1: {
    id: "17IEYGD3",
    name: "MSP Nível 1 - 15% Desconto",
    percentOff: 15,
    minDevices: 100,
  },
  level2: {
    id: "uJ5hLxn9",
    name: "MSP Nível 2 - 25% Desconto",
    percentOff: 25,
    minDevices: 300,
  },
  level3: {
    id: "quY2WQ8h",
    name: "MSP Nível 3 - 35% Desconto",
    percentOff: 35,
    minDevices: 1000,
  },
} as const;

// Mapeamento de plano para produto
export const PLAN_TO_PRODUCT = {
  starter: STRIPE_PRODUCTS.starterCompliance,
  business: STRIPE_PRODUCTS.business,
} as const;

// Helper para calcular preço total
export function calculateTotalPrice(
  plan: "starter" | "business",
  devices: number
): { basePriceCents: number; addonPriceCents: number; totalPriceCents: number } {
  const product = PLAN_TO_PRODUCT[plan];
  const baseDevices = product.baseDevices;
  const extraDevices = Math.max(0, devices - baseDevices);
  
  const addonProduct = plan === "starter" 
    ? STRIPE_PRODUCTS.deviceAddonStarter 
    : STRIPE_PRODUCTS.deviceAddonBusiness;
  
  const addonPriceCents = extraDevices * addonProduct.priceCentsPerUnit;
  
  return {
    basePriceCents: product.basePriceCents,
    addonPriceCents,
    totalPriceCents: product.basePriceCents + addonPriceCents,
  };
}

// Helper para formatar preço em BRL
export function formatBRL(cents: number): string {
  return `R$ ${(cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
}
