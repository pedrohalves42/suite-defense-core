/**
 * Shared Zod schemas for agent submit endpoints.
 * Permissive by default (passthrough) to keep field-deployed agents working.
 * Tighten field-by-field as agent versions stabilize.
 */
import { z } from 'https://esm.sh/zod@3.23.8';

export const AgentSubmitSchema = z.object({}).passthrough();
export type AgentSubmitPayload = z.infer<typeof AgentSubmitSchema>;

export function validateAgentBody(body: unknown) {
  const parsed = AgentSubmitSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return {
      ok: false as const,
      response: new Response(
        JSON.stringify({ error: 'invalid_payload', details: parsed.error.flatten() }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      ),
    };
  }
  return { ok: true as const, data: parsed.data };
}
