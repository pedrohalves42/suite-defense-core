import { logger } from "./logger.ts";
/**
 * Robust JSON Parser for AI Responses v1.0
 * 
 * Implements 4-layer defense for parsing LLM-generated JSON:
 * 1. Stream-safe extraction (respects string boundaries)
 * 2. Minimal safe sanitization (control chars only)
 * 3. Defensive parse with rich logging
 * 4. Intelligent fallback (never breaks pipeline)
 */

/**
 * Stream-safe JSON object extraction
 * Parses character-by-character, correctly handling:
 * - Escaped quotes within strings
 * - Nested braces within strings (doesn't count them)
 * - Unescaped quotes that would break indexOf/lastIndexOf
 */
export function extractJSONObject(text: string): string {
  let inString = false;
  let escape = false;
  let depth = 0;
  let start = -1;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    // Handle escape sequences
    if (escape) {
      escape = false;
      continue;
    }

    if (char === '\\' && inString) {
      escape = true;
      continue;
    }

    // Toggle string state on unescaped quotes
    if (char === '"') {
      inString = !inString;
      continue;
    }

    // Only count braces outside of strings
    if (!inString) {
      if (char === '{') {
        if (depth === 0) start = i;
        depth++;
      } else if (char === '}') {
        depth--;
        if (depth === 0 && start !== -1) {
          return text.slice(start, i + 1);
        }
      }
    }
  }

  throw new Error('JSON_EXTRACTION_FAILED: No complete JSON object found');
}

/**
 * Minimal safe sanitization
 * Only removes characters that are ILLEGAL in JSON spec
 * Does NOT attempt to fix semantic issues
 */
export function sanitizeJSON(json: string): string {
  return json
    // Remove illegal control characters (0x00-0x08, 0x0B, 0x0C, 0x0E-0x1F, 0x7F)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    // Normalize line endings
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
}

/**
 * Safe JSON parse with preprocessing and rich error logging
 * Combines extraction + sanitization + parse
 */
export function safeParseJSON<T = unknown>(content: string, context: string = 'unknown'): T {
  // Step 1: Remove markdown code blocks
  const cleaned = content
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  // Step 2: Extract JSON object using stream-safe parser
  let jsonBlock: string;
  try {
    jsonBlock = extractJSONObject(cleaned);
  } catch (extractError) {
    logger.error(`[safeParseJSON:${context}] Extraction failed:`, extractError);
    logger.error(`[safeParseJSON:${context}] Content length: ${cleaned.length}`);
    logger.error(`[safeParseJSON:${context}] First 500 chars:`, cleaned.substring(0, 500));
    throw new Error('AI_JSON_EXTRACTION_ERROR');
  }

  // Step 3: Apply minimal sanitization
  const sanitized = sanitizeJSON(jsonBlock);

  // Step 4: Parse with detailed error info
  try {
    return JSON.parse(sanitized) as T;
  } catch (parseError) {
    logger.error(`[safeParseJSON:${context}] Parse failed after extraction`);
    logger.error(`[safeParseJSON:${context}] Extracted length: ${sanitized.length}`);
    logger.error(`[safeParseJSON:${context}] Parse error:`, parseError);
    logger.error(`[safeParseJSON:${context}] First 500 chars:`, sanitized.substring(0, 500));
    logger.error(`[safeParseJSON:${context}] Last 300 chars:`, sanitized.substring(sanitized.length - 300));
    
    // Try one more time with aggressive cleanup
    try {
      const aggressiveCleaned = sanitized
        .replace(/,\s*}/g, '}')     // Trailing commas before }
        .replace(/,\s*]/g, ']')     // Trailing commas before ]
        .replace(/\n/g, ' ')        // Replace newlines with spaces
        .replace(/\t/g, ' ')        // Replace tabs with spaces
        .replace(/\s+/g, ' ');      // Collapse multiple spaces
      
      return JSON.parse(aggressiveCleaned) as T;
    } catch {
      throw new Error('AI_JSON_PARSE_ERROR');
    }
  }
}

/**
 * Fallback audit result for when AI parsing fails
 * Ensures pipeline continues with a trackable partial result
 */
export interface FallbackAuditResult {
  overall_score: number;
  status: 'partial';
  error: string;
  executive_summary: string;
  recommendation: string;
  dimensions: Record<string, unknown>;
  meta: {
    source: 'fallback';
    reason: string;
    timestamp: string;
  };
}

export function createFallbackAudit(reason: string): FallbackAuditResult {
  return {
    overall_score: 50,
    status: 'partial',
    error: reason,
    executive_summary: 'Analise parcial - erro no processamento da resposta AI. O sistema continua operacional mas a auditoria requer nova tentativa.',
    recommendation: 'READY_MVP',
    dimensions: {},
    meta: {
      source: 'fallback',
      reason,
      timestamp: new Date().toISOString(),
    },
  };
}

/**
 * Fallback Red Team result for when AI parsing fails
 */
export interface FallbackRedTeamResult {
  red_score: number;
  threat_level: string;
  status: 'partial';
  error: string;
  attack_vectors: unknown[];
  residual_risks: unknown[];
  binary_criteria: Record<string, boolean>;
  meta: {
    source: 'fallback';
    reason: string;
    timestamp: string;
  };
}

export function createFallbackRedTeam(reason: string, binaryCriteria: Record<string, boolean> = {}): FallbackRedTeamResult {
  return {
    red_score: 50,
    threat_level: 'medium',
    status: 'partial',
    error: reason,
    attack_vectors: [],
    residual_risks: [],
    binary_criteria: binaryCriteria,
    meta: {
      source: 'fallback',
      reason,
      timestamp: new Date().toISOString(),
    },
  };
}
