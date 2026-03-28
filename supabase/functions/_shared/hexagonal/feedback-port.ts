/**
 * Hexagonal Port: AI Feedback Aggregation
 * 
 * Defines the contract for collecting and using user feedback
 * to automatically tune AI prompts and provider weights.
 */

export interface FeedbackSummary {
  functionName: string;
  totalFeedback: number;
  avgRating: number;
  positiveCount: number;
  negativeCount: number;
  topIssues: string[];
  bestProvider: string | null;
  worstProvider: string | null;
}

export interface ProviderFeedbackStats {
  provider: string;
  avgRating: number;
  totalResponses: number;
  positiveRate: number;
}

// ??? Output Port ???????????????????????????????????????
export interface FeedbackAggregationPort {
  /**
   * Fetch aggregated feedback for a specific function/category.
   */
  getAggregatedFeedback(functionName: string, windowHours: number): Promise<FeedbackSummary | null>;

  /**
   * Fetch per-provider feedback stats.
   */
  getProviderFeedbackStats(windowHours: number): Promise<ProviderFeedbackStats[]>;

  /**
   * Store a prompt refinement suggestion based on feedback.
   */
  storePromptRefinement(params: {
    functionName: string;
    originalPromptHash: string;
    refinedPrompt: string;
    reason: string;
    feedbackScore: number;
  }): Promise<void>;
}
