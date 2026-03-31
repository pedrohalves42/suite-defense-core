/**
 * Hexagonal Adapter: Supabase AI Response Cache
 * 
 * Implements AICachePort using the ai_response_cache table.
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import type {
  AICachePort,
  CachedAIResponse,
  CacheAIResponseCommand,
} from './ai-cache-port.ts';
import { logger } from '../logger.ts';

export class SupabaseAICacheAdapter implements AICachePort {
  constructor(private readonly client: SupabaseClient) {}

  async lookup(
    promptHash: string,
    taskCategory: string,
    tenantId?: string,
  ): Promise<CachedAIResponse | null> {
    try {
      let query = this.client
        .from('ai_response_cache')
        .select('*')
        .eq('prompt_hash', promptHash)
        .eq('task_category', taskCategory)
        .gt('expires_at', new Date().toISOString())
        .limit(1);

      if (tenantId) {
        query = query.eq('tenant_id', tenantId);
      } else {
        query = query.is('tenant_id', null);
      }

      const { data, error } = await query.maybeSingle();

      if (error) {
        logger.warn('[AICacheAdapter] Lookup error', { error: error.message });
        return null;
      }

      if (!data) return null;

      return {
        id: data.id,
        promptHash: data.prompt_hash,
        taskCategory: data.task_category,
        responseContent: data.response_content,
        provider: data.provider,
        model: data.model,
        tokensUsed: data.tokens_used || 0,
        costUsd: Number(data.cost_usd) || 0,
        hitCount: data.hit_count || 0,
        createdAt: data.created_at,
        expiresAt: data.expires_at,
      };
    } catch (err) {
      logger.warn('[AICacheAdapter] Lookup exception', {
        error: (err as Error).message,
      });
      return null;
    }
  }

  async store(command: CacheAIResponseCommand): Promise<void> {
    try {
      const ttlMinutes = command.ttlMinutes ?? 360; // 6 hours default
      const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();

      // PostgREST doesn't support COALESCE in onConflict.
      // Use a two-step approach: try update first, then insert if not found.
      const tenantKey = command.tenantId || null;
      
      // Check if entry already exists
      let existsQuery = this.client
        .from('ai_response_cache')
        .select('id')
        .eq('prompt_hash', command.promptHash)
        .eq('task_category', command.taskCategory);
      
      if (tenantKey) {
        existsQuery = existsQuery.eq('tenant_id', tenantKey);
      } else {
        existsQuery = existsQuery.is('tenant_id', null);
      }
      
      const { data: existing } = await existsQuery.maybeSingle();
      
      if (existing) {
        // Update existing entry
        await this.client
          .from('ai_response_cache')
          .update({
            response_content: command.responseContent,
            provider: command.provider,
            model: command.model,
            tokens_used: command.tokensUsed,
            cost_usd: command.costUsd,
            function_name: command.functionName || null,
            latency_ms: command.latencyMs,
            hit_count: 0,
            expires_at: expiresAt,
          })
          .eq('id', existing.id);
      } else {
        // Insert new entry
        const { error: insertError } = await this.client.from('ai_response_cache').insert({
          prompt_hash: command.promptHash,
          task_category: command.taskCategory,
          system_prompt_hash: command.systemPromptHash || null,
          response_content: command.responseContent,
          provider: command.provider,
          model: command.model,
          tokens_used: command.tokensUsed,
          cost_usd: command.costUsd,
          tenant_id: tenantKey,
          function_name: command.functionName || null,
          latency_ms: command.latencyMs,
          hit_count: 0,
          expires_at: expiresAt,
        });

        if (insertError) {
          logger.warn('[AICacheAdapter] Insert failed', { error: insertError.message });
        }
      }

      logger.info('[AICacheAdapter] Stored cache entry', {
        promptHash: command.promptHash.substring(0, 16) + '...',
        category: command.taskCategory,
        ttlMinutes,
      });
    } catch (err) {
      // Cache write failure is non-critical
      logger.warn('[AICacheAdapter] Store failed', {
        error: (err as Error).message,
      });
    }
  }

  async recordHit(cacheId: string): Promise<void> {
    try {
      await this.client.rpc('increment_ai_cache_hit', { cache_id: cacheId });
    } catch (err) {
      logger.warn('[AICacheAdapter] Hit recording failed', {
        error: (err as Error).message,
      });
    }
  }

  async getStats(): Promise<{
    totalEntries: number;
    totalHits: number;
    avgHitCount: number;
    oldestEntry: string | null;
  }> {
    try {
      const { count } = await this.client
        .from('ai_response_cache')
        .select('*', { count: 'exact', head: true })
        .gt('expires_at', new Date().toISOString());

      const { data: statsData } = await this.client
        .from('ai_response_cache')
        .select('hit_count, created_at')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: true })
        .limit(1);

      const totalEntries = count || 0;
      const totalHits = 0; // Would need aggregate query
      const avgHitCount = 0;
      const oldestEntry = statsData?.[0]?.created_at || null;

      return { totalEntries, totalHits, avgHitCount, oldestEntry };
    } catch (err) {
      logger.warn('[ai-cache-adapter] getStats failed', err);
      return { totalEntries: 0, totalHits: 0, avgHitCount: 0, oldestEntry: null };
    }
  }
}
