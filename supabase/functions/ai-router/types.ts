/**
 * Shared types for AI Router handlers.
 */
import { TenantContext } from '../../_shared/serve-tenant.ts';

/**
 * AI Handler function signature ? receives tenant context and parsed payload.
 */
export type AIHandler = (
  req: Request,
  ctx: TenantContext,
  payload: Record<string, unknown>
) => Promise<Response | Record<string, unknown> | unknown>;
