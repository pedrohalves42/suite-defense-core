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
    description: 'Para empresas que precisam de proteção essencial e conformidade básica.',
    price: `R$ ${(PLAN_CONFIG.starter_compliance.basePriceCents / 100).toFixed(0)}`,
    priceNote: `Base: ${PLAN_CONFIG.starter_compliance.baseDevices} dispositivos • +R$ ${(PLAN_CONFIG.starter_compliance.addonPriceCents / 100).toFixed(0)}/adicional`,
    features: [
      `Até ${PLAN_CONFIG.starter_compliance.maxDevices} dispositivos`,
      'Gestão de endpoints',
      'Monitoramento contínuo',
      'Relatórios de compliance',
      'Automação básica',
      'Suporte em português',
      'Evidências auditáveis',
    ],
  },
  business: {
    icon: Crown,
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-500/10',
    description: 'O plano mais escolhido: EDR completo, honeypot, logs imutáveis e automação avançada em um só lugar.',
    price: `R$ ${(PLAN_CONFIG.business.basePriceCents / 100).toFixed(0)}`,
    priceNote: `Base: ${PLAN_CONFIG.business.baseDevices} dispositivos • +R$ ${(PLAN_CONFIG.business.addonPriceCents / 100).toFixed(0)}/adicional`,
    features: [
      `Até ${PLAN_CONFIG.business.maxDevices} dispositivos`,
      'EDR com 100 regras MITRE ATT&CK',
      'Honeypot inteligente integrado',
      'Logs imutáveis com cadeia hash',
      'Automação com blast radius adaptativo',
      'Operação multi-tenant completa',
      'Governança e rastreabilidade total',
    ],
    popular: true,
  },
  enterprise: {
    icon: Building2,
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
    description: 'Para MSPs e grandes operações com +200 dispositivos.',
    price: 'Sob consulta',
    priceNote: 'Para empresas +200 dispositivos ou MSPs',
    features: [
      'Dispositivos ilimitados',
      'Tudo do Business +',
      'SLA dedicado',
      'Onboarding personalizado',
      'API e integrações customizadas',
      'Desconto progressivo MSP',
    ],
  },
};
