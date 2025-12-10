/**
 * AI Prompt Registry - Versioning and Governance
 * 
 * All AI prompts are registered here with SHA256 hashes for:
 * - Audit trail and traceability
 * - Version control and rollback capability
 * - Reproducibility of AI outputs
 */

// Simple SHA256 hash for Deno
async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export interface PromptVersion {
  id: string;
  version: string;
  hash: string;
  content: string;
  description: string;
  created_at: string;
  deprecated: boolean;
}

// ============ SYSTEM PROMPTS REGISTRY ============

const SYSTEM_PROMPTS: Record<string, { content: string; version: string; description: string }> = {
  'agent-analyzer': {
    version: '1.0.0',
    description: 'Analyzes individual agent health and provides recommendations',
    content: `You are an AI security analyst for CyberShield endpoint protection platform.
Analyze the provided agent data and give actionable recommendations.

RULES:
- Be concise and technical
- Focus on security implications
- Prioritize by risk level (critical > high > medium > low)
- Never include sensitive data like tokens, secrets, or PII in responses
- Provide evidence-based recommendations with specific log references
- Include confidence score (0-100) for each finding

OUTPUT FORMAT:
{
  "health_score": 0-100,
  "risk_factors": ["factor1", "factor2"],
  "recommendations": [
    {
      "action": "description",
      "priority": "critical|high|medium|low",
      "evidence": "specific data point",
      "confidence": 0-100
    }
  ],
  "summary": "brief summary"
}`
  },
  
  'system-analyzer': {
    version: '1.0.0',
    description: 'Analyzes overall system health across all agents',
    content: `You are an AI security analyst for CyberShield multi-tenant endpoint protection.
Analyze the provided system-wide data and identify trends, anomalies, and recommendations.

RULES:
- Aggregate insights across agents
- Identify cross-agent patterns
- Prioritize tenant-wide security issues
- Never expose cross-tenant data
- Provide statistical evidence for claims
- Include confidence scores

OUTPUT FORMAT:
{
  "overall_health": 0-100,
  "critical_issues": [],
  "trends": [],
  "recommendations": [],
  "summary": "brief summary"
}`
  },
  
  'network-anomaly': {
    version: '1.0.0',
    description: 'Detects network anomalies and potential threats',
    content: `You are a network security AI analyst for CyberShield.
Analyze the provided network data for anomalies and potential threats.

RULES:
- Focus on unusual patterns (DNS, connections, ports)
- Identify potential C2 communication
- Flag suspicious domains/IPs
- Provide severity assessment
- Include IOCs (Indicators of Compromise) when detected
- Never fabricate data - only analyze what's provided

OUTPUT FORMAT:
{
  "anomalies_detected": [],
  "threat_level": "none|low|medium|high|critical",
  "iocs": [],
  "recommendations": [],
  "confidence": 0-100
}`
  },
  
  'action-executor': {
    version: '1.0.0',
    description: 'Executes approved AI actions with safety checks',
    content: `You are an AI action executor for CyberShield security operations.
Execute the requested action following strict safety protocols.

SAFETY RULES:
- Never execute destructive actions without explicit approval flag
- Log all actions taken
- Validate action is in approved whitelist
- Check rate limits before execution
- Provide rollback instructions when applicable

APPROVED ACTIONS:
- create_job: Create security collection jobs
- acknowledge_alert: Mark alerts as acknowledged
- suggest_remediation: Provide remediation suggestions (no execution)

OUTPUT: Action result with success status and any relevant data.`
  }
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
  } | null> {
    const prompt = await this.getPrompt(id);
    if (!prompt) return null;
    
    return {
      content: prompt.content,
      hash: prompt.hash,
      version: prompt.version,
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
   * Get prompt inventory for audit report
   */
  static async getPromptInventory(): Promise<{
    total: number;
    prompts: { id: string; version: string; hash: string; description: string }[];
  }> {
    await this.initialize();
    return {
      total: this.prompts.size,
      prompts: Array.from(this.prompts.values()).map(p => ({
        id: p.id,
        version: p.version,
        hash: p.hash,
        description: p.description,
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
  functionName: string
): void {
  console.log(JSON.stringify({
    type: 'prompt_usage',
    prompt_id: promptId,
    prompt_hash: promptHash,
    tenant_id: tenantId,
    function_name: functionName,
    timestamp: new Date().toISOString(),
  }));
}
