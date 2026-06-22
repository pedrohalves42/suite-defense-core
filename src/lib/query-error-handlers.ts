/**
 * Centraliza tratamento de erro do React Query.
 *
 * - QueryCache.onError: erros silenciosos viravam dados "vazios" sem feedback.
 *   Agora dispara toast (uma vez por queryKey) + log estruturado.
 * - MutationCache.onError: mutations sem onError local mostravam erro só no devtools.
 *   Agora sempre toast + log.
 * - Retry inteligente: não tenta de novo em 4xx (auth/validation/forbidden/notfound).
 *   Exponential backoff capado em 30s para falhas de rede.
 */
import { QueryCache, MutationCache, type Query, type Mutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { logger } from "@/lib/logger";

type ErrorLike = {
  status?: number;
  statusCode?: number;
  code?: string | number;
  message?: string;
};

function getStatus(err: unknown): number | undefined {
  if (!err || typeof err !== "object") return undefined;
  const e = err as ErrorLike;
  if (typeof e.status === "number") return e.status;
  if (typeof e.statusCode === "number") return e.statusCode;
  // PostgREST/Supabase HTTP codes arrive as string like "PGRST116"
  if (typeof e.code === "number") return e.code;
  return undefined;
}

function getMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message || fallback;
  if (err && typeof err === "object" && "message" in err) {
    const m = (err as ErrorLike).message;
    if (typeof m === "string" && m.length > 0) return m;
  }
  return fallback;
}

/**
 * Decide se uma query/mutation deve ser reexecutada após falhar.
 * - 401/403/404/422 e demais 4xx → não retry (erro do cliente/permissão)
 * - rede/5xx → até 2 retries com backoff exponencial
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  const status = getStatus(error);
  if (status !== undefined && status >= 400 && status < 500) return false;
  return failureCount < 2;
}

export function retryDelay(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 30_000);
}

// Dedupe toasts da mesma queryKey num curto intervalo para evitar spam
const recentQueryErrorToasts = new Map<string, number>();
const TOAST_DEDUPE_WINDOW_MS = 5_000;

function maybeToast(key: string, message: string) {
  const now = Date.now();
  const last = recentQueryErrorToasts.get(key);
  if (last && now - last < TOAST_DEDUPE_WINDOW_MS) return;
  recentQueryErrorToasts.set(key, now);
  // Limita o mapa para não vazar memória
  if (recentQueryErrorToasts.size > 100) {
    const cutoff = now - TOAST_DEDUPE_WINDOW_MS;
    for (const [k, t] of recentQueryErrorToasts) {
      if (t < cutoff) recentQueryErrorToasts.delete(k);
    }
  }
  toast.error(message);
}

export const queryCache = new QueryCache({
  onError: (error, query: Query) => {
    const status = getStatus(error);
    // 401/403 são tratados pelo AuthProvider (redirect/refresh); não toastar para não duplicar
    if (status === 401 || status === 403) {
      logger.warn("[react-query] auth error", { queryKey: query.queryKey, status });
      return;
    }
    // Queries silenciosas (meta.silent) — só log
    const meta = query.meta as { silent?: boolean; errorMessage?: string } | undefined;
    if (meta?.silent) {
      logger.warn("[react-query] silent query error", { queryKey: query.queryKey, error });
      return;
    }
    const message = meta?.errorMessage ?? getMessage(error, "Falha ao carregar dados");
    const key = JSON.stringify(query.queryKey);
    maybeToast(key, message);
    logger.error("[react-query] query error", error instanceof Error ? error : new Error(String(error)), {
      queryKey: query.queryKey,
      status,
    });
  },
});

export const mutationCache = new MutationCache({
  onError: (error, _variables, _context, mutation: Mutation) => {
    const status = getStatus(error);
    const meta = mutation.meta as { silent?: boolean; errorMessage?: string } | undefined;
    if (meta?.silent) {
      logger.warn("[react-query] silent mutation error", { mutationKey: mutation.options.mutationKey, error });
      return;
    }
    // Se a mutation tiver onError próprio, ainda toastamos como fallback,
    // mas pulamos quando o consumidor marcar meta.handled
    if (meta && "handled" in meta && (meta as Record<string, unknown>).handled === true) return;

    const message = meta?.errorMessage ?? getMessage(error, "Falha na operação");
    toast.error(message);
    logger.error("[react-query] mutation error", error instanceof Error ? error : new Error(String(error)), {
      mutationKey: mutation.options.mutationKey,
      status,
    });
  },
});
