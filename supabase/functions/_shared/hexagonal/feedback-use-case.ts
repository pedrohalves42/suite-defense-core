/**
 * Hexagonal Use Case: Feedback-Driven Optimization
 * 
 * Aggregates user feedback to:
 * 1. Identify noisy/low-quality AI outputs per function
 * 2. Suggest provider weight adjustments
 * 3. Generate prompt refinement hints
 */

import type { FeedbackAggregationPort, FeedbackSummary, ProviderFeedbackStats } from './feedback-port.ts';
import { logger } from '../logger.ts';

// ─── Result Types ──────────────────────────────────────

export interface FeedbackAnalysisResult {
  overallHealth: 'healthy' | 'degraded' | 'critical';
  avgRating: number;
  totalFeedback: number;
  providerRecommendations: ProviderRecommendation[];
  promptIssues: PromptIssue[];
}

export interface ProviderRecommendation {
  provider: string;
  action: 'increase_weight' | 'decrease_weight' | 'disable' | 'keep';
  reason: string;
  currentRating: number;
}

export interface PromptIssue {
  functionName: string;
  issue: string;
  severity: 'low' | 'medium' | 'high';
  suggestedAction: string;
}

// ─── Use Case ──────────────────────────────────────────

export class FeedbackAnalysisUseCase {
  constructor(private readonly feedback: FeedbackAggregationPort) {}

  /**
   * Analyze feedback from the last N hours and produce recommendations.
   */
  async analyze(windowHours: number = 24): Promise<FeedbackAnalysisResult> {
    const [summary, providerStats] = await Promise.all([
      this.feedback.getAggregatedFeedback('*', windowHours),
      this.feedback.getProviderFeedbackStats(windowHours),
    ]);

    const avgRating = summary?.avgRating ?? 0;
    const totalFeedback = summary?.totalFeedback ?? 0;

    // Determine overall health
    let overallHealth: 'healthy' | 'degraded' | 'critical' = 'healthy';
    if (avgRating < 2.5 && totalFeedback >= 5) overallHealth = 'critical';
    else if (avgRating < 3.5 && totalFeedback >= 3) overallHealth = 'degraded';

    // Provider recommendations
    const providerRecommendations = this.analyzeProviders(providerStats);

    // Prompt issues from negative feedback
    const promptIssues = this.analyzePromptIssues(summary);

    logger.info('[FeedbackAnalysis] Completed', {
      overallHealth,
      avgRating,
      totalFeedback,
      recommendations: providerRecommendations.length,
      issues: promptIssues.length,
    });

    return {
      overallHealth,
      avgRating,
      totalFeedback,
      providerRecommendations,
      promptIssues,
    };
  }

  private analyzeProviders(stats: ProviderFeedbackStats[]): ProviderRecommendation[] {
    if (stats.length === 0) return [];

    const avgOverall = stats.reduce((sum, s) => sum + s.avgRating, 0) / stats.length;

    return stats.map((s) => {
      let action: ProviderRecommendation['action'] = 'keep';
      let reason = 'Performing within expected range';

      if (s.avgRating >= avgOverall + 0.5 && s.totalResponses >= 3) {
        action = 'increase_weight';
        reason = `Above average rating (${s.avgRating} vs ${avgOverall.toFixed(2)})`;
      } else if (s.avgRating <= avgOverall - 0.5 && s.totalResponses >= 3) {
        action = 'decrease_weight';
        reason = `Below average rating (${s.avgRating} vs ${avgOverall.toFixed(2)})`;
      } else if (s.avgRating < 2.0 && s.totalResponses >= 5) {
        action = 'disable';
        reason = `Consistently poor feedback (${s.avgRating}/5, ${s.totalResponses} responses)`;
      }

      return {
        provider: s.provider,
        action,
        reason,
        currentRating: s.avgRating,
      };
    });
  }

  private analyzePromptIssues(summary: FeedbackSummary | null): PromptIssue[] {
    if (!summary || summary.topIssues.length === 0) return [];

    return summary.topIssues.map((issue) => {
      const severity = summary.avgRating < 2.5 ? 'high' : summary.avgRating < 3.5 ? 'medium' : 'low';

      return {
        functionName: summary.functionName,
        issue,
        severity,
        suggestedAction: severity === 'high'
          ? 'Review and rewrite system prompt; add few-shot examples'
          : 'Add negative examples to reduce noise',
      };
    });
  }
}
