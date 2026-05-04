/**
 * Hexagonal Use Case: Dispatch API Action
 * 
 * Orchestrates the validation, routing, and execution of platform actions.
 */

import { RouterPort, ActionMetadata } from '../ports/router-port.ts';
import { logger } from '../../../../_shared/logger.ts';

export interface DispatchResult {
  success: boolean;
  data?: unknown;
  status: number;
  error?: string;
  details?: unknown;
}

export class ActionDispatcherUseCase {
  constructor(private readonly router: RouterPort) {}

  async dispatch(
    action: string,
    payload: unknown,
    context: {
      supabase: any;
      requestId: string;
      userId?: string;
      tenantId?: string;
      req: Request;
      forwardHeaders: (req: Request, requestId: string) => Record<string, string>;
    }
  ): Promise<Response | unknown> {
    const metadata = this.router.getAction(action);
    
    if (!metadata) {
      return {
        error: `Unknown action: ${action}`,
        available_namespaces: ['admin', 'billing', 'security', 'build', 'agent'],
        __status: 400
      };
    }

    // 1. Execute Inlined Handler
    if (!metadata.isProxy && metadata.handler) {
      logger.info(`[api-gateway] Inline: ${action}`, { requestId: context.requestId });
      const handlerCtx = { 
        req: context.req, 
        userId: context.userId, 
        tenantId: context.tenantId 
      };
      
      const result = await metadata.handler(context.supabase, context.requestId, payload, handlerCtx);
      return result;
    }

    // 2. Execute Proxy to another Edge Function
    if (metadata.isProxy && metadata.target) {
      logger.info(`[api-gateway] Proxy: ${action} → ${metadata.target}`, { requestId: context.requestId });
      const headers = context.forwardHeaders(context.req, context.requestId);
      return await this.router.proxyAction(metadata.target, payload, headers);
    }

    throw new Error(`Inconsistent metadata for action ${action}`);
  }
}
