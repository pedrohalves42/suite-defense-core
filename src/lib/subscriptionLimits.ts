// Limites de membros por plano (ajuste conforme necessário)
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
 * - número → limite definido
 * - null   → ilimitado
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

  // 2) Caso contrário, usa o limite do plano
  const planIdRaw =
    subscription.plan_name ||
    subscription.plan_id ||
    subscription.plan?.id ||
    fallbackPlan;

  const planId = (planIdRaw || fallbackPlan).toLowerCase() as PlanKey;

  if (planId in PLAN_MEMBER_LIMITS) {
    return PLAN_MEMBER_LIMITS[planId];
  }

  // 3) Se cair aqui, usa fallback
  return PLAN_MEMBER_LIMITS[fallbackPlan];
}

/**
 * Helper para construir display name com fallback inteligente
 */
export function buildDisplayName(user: any, profile?: any): string {
  const email: string = user?.email ?? '';
  const emailName = email ? email.split('@')[0] : '';

  return (
    profile?.full_name?.trim() ||
    user?.user_metadata?.full_name?.trim() ||
    emailName ||
    'Usuário'
  );
}
