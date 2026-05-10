// Limites de membros por plano (ajuste conforme necessario)
const PLAN_MEMBER_LIMITS = {
  free: 5,
  starter: 20,
  pro: 50,
  enterprise: null as number | null, // null = ilimitado
} as const;

export type PlanKey = keyof typeof PLAN_MEMBER_LIMITS;

export interface SubscriptionFeature {
  quota_limit: number | null;
}

export interface SubscriptionData {
  plan_id?: string | null;
  plan?: { id?: string | null } | null;
  plan_name?: string | null;
  features?: {
    max_users?: SubscriptionFeature | null;
  } | null;
  device_quantity?: number | null;
}

/**
 * Retorna o limite de membros do tenant:
 * - numero ? limite definido
 * - null   ? ilimitado
 */
export function getMemberLimit(
  subscription?: SubscriptionData | null,
  fallbackPlan: PlanKey = 'free',
): number | null {
  if (!subscription) return PLAN_MEMBER_LIMITS[fallbackPlan];

  // 1) Se a feature "max_users" tiver quota_limit definido, usa ela
  const quotaFromFeature = subscription.features?.max_users?.quota_limit;
  if (typeof quotaFromFeature === 'number') {
    return quotaFromFeature;
  }

  // 2) Caso contrário, tenta identificar o plano por nome ou ID
  // V-FIX: Se for um UUID ou valor desconhecido, não assume 'free' imediatamente se houver indícios de plano superior
  const planIdRaw =
    subscription.plan_name ||
    subscription.plan_id ||
    subscription.plan?.id ||
    '';

  const planId = planIdRaw.toLowerCase();

  // Mapeamento de nomes amigáveis para chaves de limites
  if (planId.includes('enterprise')) return PLAN_MEMBER_LIMITS.enterprise;
  if (planId.includes('pro')) return PLAN_MEMBER_LIMITS.pro;
  if (planId.includes('starter') || planId.includes('basic')) return PLAN_MEMBER_LIMITS.starter;
  if (planId.includes('free')) return PLAN_MEMBER_LIMITS.free;

  // 3) Se não reconheceu o nome mas tem device_quantity alto, pode ser um plano customizado
  if ((subscription.device_quantity ?? 0) > 20) return PLAN_MEMBER_LIMITS.pro;

  return PLAN_MEMBER_LIMITS[fallbackPlan];
}

/**
 * Helper para construir display name com fallback inteligente
 */
export function buildDisplayName(user: { email?: string; user_metadata?: { full_name?: string } } | null, profile?: { full_name?: string } | null): string {
  const email: string = user?.email ?? '';
  const emailName = email ? email.split('@')[0] : '';

  return (
    profile?.full_name?.trim() ||
    user?.user_metadata?.full_name?.trim() ||
    emailName ||
    'Usuario'
  );
}
