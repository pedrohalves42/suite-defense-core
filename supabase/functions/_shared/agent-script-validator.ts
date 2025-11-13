/**
 * Agent Script Integrity Validator
 * Validates the agent script on Edge Function startup to fail fast if corrupted
 */

interface ValidationResult {
  valid: boolean;
  error?: string;
  details?: {
    size: number;
    hash: string;
    preview: string;
  };
}

/**
 * Validates the agent script integrity
 * @returns ValidationResult with validation status and details
 */
export async function validateAgentScript(): Promise<ValidationResult> {
  try {
    // Read the agent script
    const scriptPath = new URL('./agent-script-windows.ps1', import.meta.url).pathname;
    const scriptContent = await Deno.readTextFile(scriptPath);

    // Validation 1: Minimum size check (must be > 1KB)
    if (scriptContent.length < 1000) {
      return {
        valid: false,
        error: `Agent script is too small: ${scriptContent.length} bytes (expected > 1000)`,
      };
    }

    // Validation 2: Content signature check
    const requiredSignatures = [
      'CyberShield Agent',
      'Write-Log',
      'Send-Heartbeat',
      'Poll-Jobs',
    ];

    for (const signature of requiredSignatures) {
      if (!scriptContent.includes(signature)) {
        return {
          valid: false,
          error: `Agent script missing required signature: "${signature}"`,
        };
      }
    }

    // Validation 3: No placeholder text
    const dangerousPatterns = [
      /{{[A-Z_]+}}/,  // Unreplaced placeholders
      /\bPLACEHOLDER\b/i,
      /\bTODO\b.*script/i,
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(scriptContent)) {
        return {
          valid: false,
          error: `Agent script contains placeholder or incomplete content: ${pattern}`,
        };
      }
    }

    // Calculate SHA256 hash for logging
    const encoder = new TextEncoder();
    const data = encoder.encode(scriptContent);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    return {
      valid: true,
      details: {
        size: scriptContent.length,
        hash,
        preview: scriptContent.substring(0, 100).replace(/\r?\n/g, ' '),
      },
    };
  } catch (error) {
    return {
      valid: false,
      error: `Failed to read agent script: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Validates the agent script and throws if invalid (for critical startup checks)
 */
export async function validateAgentScriptOrThrow(): Promise<void> {
  const result = await validateAgentScript();
  
  if (!result.valid) {
    throw new Error(`Agent script validation failed: ${result.error}`);
  }

  console.log('[VALIDATION] Agent script validated successfully:', result.details);
}
