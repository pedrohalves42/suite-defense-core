/**
 * Hexagonal Adapter: Supabase Feedback Aggregation
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import type {
  FeedbackAggregationPort,
  FeedbackSummary,
  ProviderFeedbackStats,
} from './feedback-port.ts';
import { logger } from '../logger.ts';

export class SupabaseFeedbackAdapter implements FeedbackAggregationPort {
  constructor(private readonly client: SupabaseClient) {}

  async getAggregatedFeedback(
    functionName: string,
    windowHours: number,
  ): Promise<FeedbackSummary | null> {
    try {
      const since = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();

      // Get feedback entries joined with insights
      const { data, error } = await this.client
        .from('ai_insight_feedback')
        .select('rating, comment, ai_insights!inner(source_function, provider)')
        .gte('created_at', since);

      if (error || !data || data.length === 0) return null;

      // Filter by function name from the joined insight
      const relevant = data.filter((d: any) => {
        const fn = d.ai_insights?.source_function || '';
        return fn.includes(functionName) || functionName === '*';
      });

      if (relevant.length === 0) return null;

      const ratings = relevant.map((d: any) => d.rating || 3);
      const avgRating = ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length;
      const positiveCount = ratings.filter((r: number) => r >= 4).length;
      const negativeCount = ratings.filter((r: number) => r <= 2).length;

      // Extract issues from negative feedback comments
      const issues = relevant
        .filter((d: any) => (d.rating || 3) <= 2 && d.comment)
        .map((d: any) => d.comment as string)
        .slice(0, 5);

      // Find best/worst provider
      const providerRatings: Record<string, number[]> = {};
      for (const d of relevant as any[]) {
        const provider = d.ai_insights?.provider;
        if (provider) {
          if (!providerRatings[provider]) providerRatings[provider] = [];
          providerRatings[provider].push(d.rating || 3);
        }
      }

      let bestProvider: string | null = null;
      let worstProvider: string | null = null;
      let bestAvg = 0;
      let worstAvg = 5;

      for (const [p, ratings] of Object.entries(providerRatings)) {
        const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;
        if (avg > bestAvg) { bestAvg = avg; bestProvider = p; }
        if (avg < worstAvg) { worstAvg = avg; worstProvider = p; }
      }

      return {
        functionName,
        totalFeedback: relevant.length,
        avgRating: Math.round(avgRating * 100) / 100,
        positiveCount,
        negativeCount,
        topIssues: issues,
        bestProvider,
        worstProvider,
      };
    } catch (err) {
      logger.warn('[FeedbackAdapter] getAggregatedFeedback failed', {
        error: (err as Error).message,
      });
      return null;
    }
  }

  async getProviderFeedbackStats(windowHours: number): Promise<ProviderFeedbackStats[]> {
    try {
      const since = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();

      const { data, error } = await this.client
        .from('ai_insight_feedback')
        .select('rating, ai_insights!inner(provider)')
        .gte('created_at', since);

      if (error || !data) return [];

      const byProvider: Record<string, number[]> = {};
      for (const d of data as any[]) {
        const provider = d.ai_insights?.provider || 'unknown';
        if (!byProvider[provider]) byProvider[provider] = [];
        byProvider[provider].push(d.rating || 3);
      }

      return Object.entries(byProvider).map(([provider, ratings]) => ({
        provider,
        avgRating: Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 100) / 100,
        totalResponses: ratings.length,
        positiveRate: Math.round((ratings.filter((r) => r >= 4).length / ratings.length) * 100) / 100,
      }));
    } catch (err) {
      logger.warn('[FeedbackAdapter] getProviderFeedbackStats failed', {
        error: (err as Error).message,
      });
      return [];
    }
  }

  async storePromptRefinement(params: {
    functionName: string;
    originalPromptHash: string;
    refinedPrompt: string;
    reason: string;
    feedbackScore: number;
  }): Promise<void> {
    try {
      // Store as a prompt registry update
      await this.client.from('ai_prompt_registry').upsert({
        function_name: params.functionName,
        prompt_hash: params.originalPromptHash,
        refined_prompt: params.refinedPrompt,
        refinement_reason: params.reason,
        feedback_score: params.feedbackScore,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'function_name',
        ignoreDuplicates: false,
      });
    } catch (err) {
      logger.warn('[FeedbackAdapter] storePromptRefinement failed', {
        error: (err as Error).message,
      });
    }
  }
}
