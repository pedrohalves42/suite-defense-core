import { Zap, Crown, Building2 } from 'lucide-react';
import { PLAN_CONFIG } from '@/constants/plans';

export interface Plan {
  id: string;
  name: string;
  max_users: number;
  max_agents: number | null;
  max_scans_per_month: number | null;
  price_per_device: number;
  max_devices: number;
  stripe_price_id: string | null;
  trial_days: number | null;
}

export interface PlanDetails {
  icon: typeof Zap;
  color: string;
  bgColor: string;
  description: string;
  price: string;
  priceNote?: string;
  features: string[];
  popular?: boolean;
}

export const PLAN_ORDER = ['free', 'starter_compliance', 'business', 'enterprise'];

export const PLAN_DETAILS: Record<string, PlanDetails> = {
  free: {
    icon: Zap,
    color: 'text-muted-foreground',
    bgColor: 'bg-muted',
    description: 'Perfeito para testar',
    price: 'Grátis',
    priceNote: '14 dias para avaliar',
    features: [
      'Até 3 dispositivos',
      'Dashboard básico',
      'Inventário de software',
      'Status do antivírus',
    ],
  },
  starter_compliance: {
    icon: Zap,
    color: 'text-primary',
    bgColor: 'bg-primary/10',
    description: 'Ideal para pequenas empresas',
    price: `R$ ${(PLAN_CONFIG.starter_compliance.basePriceCents / 100).toFixed(0)}`,
    priceNote: `/mês • até ${PLAN_CONFIG.starter_compliance.baseDevices} dispositivos base`,
    features: [...PLAN_CONFIG.starter_compliance.features],
    popular: true,
  },
  business: {
    icon: Crown,
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-500/10',
    description: 'Para empresas em crescimento',
    price: `R$ ${(PLAN_CONFIG.business.basePriceCents / 100).toFixed(0)}`,
    priceNote: `/mês • até ${PLAN_CONFIG.business.baseDevices} dispositivos base`,
    features: [...PLAN_CONFIG.business.features],
  },
  enterprise: {
    icon: Building2,
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
    description: 'Para grandes organizações e MSPs',
    price: 'A partir de R$ 2.000/mês',
    features: [...PLAN_CONFIG.enterprise.features],
  },
};
