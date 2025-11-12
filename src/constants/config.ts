/**
 * CORREÇÃO: Constantes centralizadas do sistema
 * Facilita manutenção e evita números mágicos no código
 */

// Paginação
export const ITEMS_PER_PAGE = 20;
export const DEFAULT_PAGE = 0;

// Timeouts e Delays
export const DEBOUNCE_DELAY_MS = 500;
export const RETRY_INITIAL_DELAY_MS = 2000;
export const MAX_RETRIES = 3;

// Validação de Agentes
export const AGENT_NAME_MIN_LENGTH = 3;
export const AGENT_NAME_MAX_LENGTH = 50;
export const AGENT_NAME_REGEX = /^[a-zA-Z0-9\-_]+$/;

// Cache (React Query)
export const CACHE_STALE_TIME_MS = 5 * 60 * 1000; // 5 minutos
export const CACHE_GC_TIME_MS = 10 * 60 * 1000; // 10 minutos

// CORREÇÃO: Roles movidos para src/types/roles.ts (centralizado)

// Feature Flags (se necessário)
export const FEATURES = {
  ENABLE_ANALYTICS: true,
  ENABLE_SUPER_ADMIN: true,
  ENABLE_ONE_CLICK_INSTALL: true,
} as const;
