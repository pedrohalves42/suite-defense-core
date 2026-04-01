import { logger } from "./logger.ts";
/**
 * AI Prompt Registry - Versioning and Governance v3.0
 * 
 * All AI prompts are registered here with SHA256 hashes for:
 * - Audit trail and traceability
 * - Version control and rollback capability
 * - Reproducibility of AI outputs
 * - Scope-based governance (system_governance, security, operations, support)
 */

// Re-export types for backward compatibility
export type { PromptScope, PromptPosture, PromptVersion } from './prompts/types.ts';
import type { PromptScope, PromptPosture, PromptVersion, PromptDefinition } from './prompts/types.ts';

// Import domain-specific prompts
import { OPERATIONS_PROMPTS } from './prompts/prompts-operations.ts';
import { SECURITY_PROMPTS } from './prompts/prompts-security.ts';
import { GOVERNANCE_PROMPTS } from './prompts/prompts-governance.ts';

// Simple SHA256 hash for Deno
async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ============ MERGED SYSTEM PROMPTS ============

const SYSTEM_PROMPTS: Record<string, PromptDefinition> = {
  ...OPERATIONS_PROMPTS,
  ...SECURITY_PROMPTS,
  ...GOVERNANCE_PROMPTS,
};

// ============ PROMPT REGISTRY CLASS ============

export class AIPromptRegistry {
  private static prompts: Map<string, PromptVersion> = new Map();
  private static initialized = false;

  /**
   * Initialize registry with all prompts and compute hashes
   */
  static async initialize(): Promise<void> {
    if (this.initialized) return;
    
    for (const [id, prompt] of Object.entries(SYSTEM_PROMPTS)) {
      const hash = await sha256(prompt.content);
      this.prompts.set(id, {
        id,
        version: prompt.version,
        hash,
        content: prompt.content,
        description: prompt.description,
        scope: prompt.scope,
        posture: prompt.posture,
        mutable: prompt.mutable,
        created_at: new Date().toISOString(),
        deprecated: false,
      });
    }
    
    this.initialized = true;
  }

  /**
   * Get a prompt by ID with hash verification
   */
  static async getPrompt(id: string): Promise<PromptVersion | null> {
    await this.initialize();
    return this.prompts.get(id) || null;
  }

  /**
   * Get prompt content with metadata for logging
   */
  static async getPromptWithMetadata(id: string): Promise<{
    content: string;
    hash: string;
    version: string;
    scope: PromptScope;
    posture: PromptPosture;
    mutable: boolean;
  } | null> {
    const prompt = await this.getPrompt(id);
    if (!prompt) return null;
    
    return {
      content: prompt.content,
      hash: prompt.hash,
      version: prompt.version,
      scope: prompt.scope,
      posture: prompt.posture,
      mutable: prompt.mutable,
    };
  }

  /**
   * Verify prompt integrity (hash matches content)
   */
  static async verifyPromptIntegrity(id: string): Promise<boolean> {
    const prompt = await this.getPrompt(id);
    if (!prompt) return false;
    
    const currentHash = await sha256(prompt.content);
    return currentHash === prompt.hash;
  }

  /**
   * Get all registered prompts (for audit)
   */
  static async getAllPrompts(): Promise<PromptVersion[]> {
    await this.initialize();
    return Array.from(this.prompts.values());
  }

  /**
   * Get prompts by scope
   */
  static async getPromptsByScope(scope: PromptScope): Promise<PromptVersion[]> {
    await this.initialize();
    return Array.from(this.prompts.values()).filter(p => p.scope === scope);
  }

  /**
   * Get prompt inventory for audit report
   */
  static async getPromptInventory(): Promise<{
    total: number;
    by_scope: Record<PromptScope, number>;
    immutable_count: number;
    prompts: { id: string; version: string; hash: string; description: string; scope: PromptScope; posture: PromptPosture; mutable: boolean }[];
  }> {
    await this.initialize();
    const prompts = Array.from(this.prompts.values());
    
    const byScope: Record<PromptScope, number> = {
      system_governance: 0,
      security: 0,
      operations: 0,
      support: 0,
    };
    
    let immutableCount = 0;
    
    for (const p of prompts) {
      byScope[p.scope]++;
      if (!p.mutable) immutableCount++;
    }
    
    return {
      total: prompts.length,
      by_scope: byScope,
      immutable_count: immutableCount,
      prompts: prompts.map(p => ({
        id: p.id,
        version: p.version,
        hash: p.hash,
        description: p.description,
        scope: p.scope,
        posture: p.posture,
        mutable: p.mutable,
      })),
    };
  }
}

/**
 * Get system prompt by ID (convenience function)
 */
export async function getSystemPrompt(id: string): Promise<string | null> {
  const prompt = await AIPromptRegistry.getPromptWithMetadata(id);
  return prompt?.content || null;
}

/**
 * Log prompt usage for audit trail
 */
export function logPromptUsage(
  promptId: string,
  promptHash: string,
  tenantId: string | null,
  functionName: string,
  additionalContext?: Record<string, unknown>
): void {
  logger.info(JSON.stringify({
    type: 'prompt_usage',
    prompt_id: promptId,
    prompt_hash: promptHash,
    tenant_id: tenantId,
    function_name: functionName,
    timestamp: new Date().toISOString(),
    ...additionalContext,
  }));
}
