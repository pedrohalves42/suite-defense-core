import { logger } from './logger';

/**
 * Utility para gerenciar localStorage de forma segura
 * Preserva estado crítico entre quedas de conexão
 */

interface StorageItem<T> {
  value: T;
  timestamp: number;
  expiresAt?: number;
}

export const storage = {
  /**
   * Salva um item no localStorage com timestamp
   */
  set<T>(key: string, value: T, expiresInMs?: number): void {
    try {
      const item: StorageItem<T> = {
        value,
        timestamp: Date.now(),
        expiresAt: expiresInMs ? Date.now() + expiresInMs : undefined,
      };
      localStorage.setItem(key, JSON.stringify(item));
      logger.debug(`[storage] Item salvo: ${key}`);
    } catch (error) {
      logger.error(`[storage] Erro ao salvar ${key}`, error);
    }
  },

  /**
   * Recupera um item do localStorage
   * Retorna null se não existir ou estiver expirado
   */
  get<T>(key: string): T | null {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;

      const item: StorageItem<T> = JSON.parse(raw);

      // Check expiration
      if (item.expiresAt && Date.now() > item.expiresAt) {
        logger.debug(`[storage] Item expirado: ${key}`);
        localStorage.removeItem(key);
        return null;
      }

      return item.value;
    } catch (error) {
      logger.error(`[storage] Erro ao recuperar ${key}`, error);
      return null;
    }
  },

  /**
   * Remove um item do localStorage
   */
  remove(key: string): void {
    try {
      localStorage.removeItem(key);
      logger.debug(`[storage] Item removido: ${key}`);
    } catch (error) {
      logger.error(`[storage] Erro ao remover ${key}`, error);
    }
  },

  /**
   * Limpa todos os itens expirados
   */
  clearExpired(): void {
    try {
      const keys = Object.keys(localStorage);
      let cleared = 0;

      for (const key of keys) {
        const raw = localStorage.getItem(key);
        if (!raw) continue;

        try {
          const item: StorageItem<any> = JSON.parse(raw);
          if (item.expiresAt && Date.now() > item.expiresAt) {
            localStorage.removeItem(key);
            cleared++;
          }
        } catch {
          // Skip invalid items
        }
      }

      if (cleared > 0) {
        logger.info(`[storage] ${cleared} itens expirados removidos`);
      }
    } catch (error) {
      logger.error('[storage] Erro ao limpar expirados', error);
    }
  },
};

// Auto-cleanup expirados a cada 5 minutos
setInterval(() => storage.clearExpired(), 5 * 60 * 1000);
