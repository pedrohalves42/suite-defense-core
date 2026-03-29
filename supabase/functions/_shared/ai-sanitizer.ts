import { logger } from "./logger.ts";
/**
 * AI Sanitizer - Protecao contra Prompt Injection e vazamento de dados
 * 
 * Implementa:
 * - Bloqueio de padroes de prompt injection
 * - Limitacao de tamanho de input
 * - Remocao de caracteres de controle
 * - Anonimizacao de dados sensiveis
 */

// Padroes conhecidos de prompt injection a bloquear
const INJECTION_PATTERNS = [
  /\[IGNORE.*?INSTRUCTIONS?\]/gi,
  /\[SYSTEM\]/gi,
  /\[ASSISTANT\]/gi,
  /\[USER\]/gi,
  /<script[^>]*>.*?<\/script>/gis,
  /<\/script>/gi,
  /javascript:/gi,
  /data:text\/html/gi,
  /on\w+\s*=/gi,  // Event handlers like onclick=
  /\{\{.*?\}\}/g,  // Template injection attempts
  /\$\{.*?\}/g,    // Template literal injection
  /\\x[0-9a-fA-F]{2}/g,  // Hex escape sequences
  /\\u[0-9a-fA-F]{4}/g,  // Unicode escape sequences
  /system:\s*override/gi,
  /ignore\s+previous/gi,
  /forget\s+.*?instructions/gi,
  /new\s+instructions?:/gi,
  /you\s+are\s+now/gi,
  /act\s+as\s+if/gi,
  /pretend\s+you/gi,
  /reveal\s+.*?secret/gi,
  /show\s+.*?prompt/gi,
  /output\s+.*?system/gi,
];

// Limite maximo de caracteres por input (10KB)
const MAX_INPUT_LENGTH = 10240;

// Limite maximo de itens em arrays para prompts
const MAX_ARRAY_ITEMS = 50;

interface SanitizeOptions {
  maxLength?: number;
  maxArrayItems?: number;
  anonymizeAgentNames?: boolean;
  removeHostnames?: boolean;
  logBlocked?: boolean;
}

interface SanitizeResult {
  sanitized: string;
  blocked: boolean;
  blockedPatterns: string[];
  truncated: boolean;
  originalLength: number;
}

/**
 * Sanitiza texto para uso seguro em prompts de IA
 */
export function sanitizeForAI(
  input: string,
  options: SanitizeOptions = {}
): SanitizeResult {
  const {
    maxLength = MAX_INPUT_LENGTH,
    logBlocked = true,
  } = options;

  const result: SanitizeResult = {
    sanitized: '',
    blocked: false,
    blockedPatterns: [],
    truncated: false,
    originalLength: input.length,
  };

  if (!input || typeof input !== 'string') {
    return result;
  }

  let text = input;

  // 1. Remover caracteres de controle (exceto newlines e tabs)
  text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // 2. Detectar e bloquear padroes de injection
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      const patternName = pattern.source.substring(0, 30);
      result.blockedPatterns.push(patternName);
      
      // Remover o padrao malicioso
      text = text.replace(pattern, '[BLOCKED]');
    }
    // Reset regex lastIndex for global patterns
    pattern.lastIndex = 0;
  }

  if (result.blockedPatterns.length > 0) {
    result.blocked = true;
    if (logBlocked) {
      logger.warn('[ai-sanitizer] Blocked patterns detected:', result.blockedPatterns);
    }
  }

  // 3. Truncar se exceder limite
  if (text.length > maxLength) {
    text = text.substring(0, maxLength) + '... [TRUNCATED]';
    result.truncated = true;
  }

  // 4. Normalizar espacos em branco excessivos
  text = text.replace(/\s{3,}/g, '  ');

  result.sanitized = text;
  return result;
}

/**
 * Sanitiza um objeto JSON para uso em prompts
 */
export function sanitizeObjectForAI<T extends Record<string, any>>(
  obj: T,
  options: SanitizeOptions = {}
): { sanitized: T; warnings: string[] } {
  const { maxArrayItems = MAX_ARRAY_ITEMS } = options;
  const warnings: string[] = [];

  function sanitizeValue(value: unknown, path: string = ''): unknown {
    if (value === null || value === undefined) {
      return value;
    }

    if (typeof value === 'string') {
      const result = sanitizeForAI(value, { ...options, logBlocked: false });
      if (result.blocked) {
        warnings.push(`Blocked injection attempt at ${path}`);
      }
      return result.sanitized;
    }

    if (Array.isArray(value)) {
      if (value.length > maxArrayItems) {
        warnings.push(`Array at ${path} truncated from ${value.length} to ${maxArrayItems} items`);
        value = value.slice(0, maxArrayItems);
      }
      return value.map((item: unknown, idx: number) => sanitizeValue(item, `${path}[${idx}]`));
    }

    if (typeof value === 'object') {
      const sanitized: Record<string, any> = {};
      for (const [key, val] of Object.entries(value)) {
        sanitized[key] = sanitizeValue(val, `${path}.${key}`);
      }
      return sanitized;
    }

    return value;
  }

  const sanitized = sanitizeValue(obj, 'root') as T;
  
  if (warnings.length > 0) {
    logger.warn('[ai-sanitizer] Object sanitization warnings:', warnings);
  }

  return { sanitized, warnings };
}

/**
 * Anonimiza nomes de agentes para evitar vazamento de PII
 */
export function anonymizeAgentName(agentName: string): string {
  if (!agentName) return 'unknown';
  
  // Criar hash curto do nome (primeiros 8 chars de um hash simples)
  let hash = 0;
  for (let i = 0; i < agentName.length; i++) {
    const char = agentName.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  const hashStr = Math.abs(hash).toString(16).padStart(8, '0').substring(0, 8);
  return `agent-${hashStr}`;
}

/**
 * Remove informacoes sensiveis de um contexto antes de enviar a IA
 */
export function removeSensitiveData(text: string): string {
  // Remover possiveis emails
  text = text.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]');
  
  // Remover possiveis IPs
  text = text.replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '[IP]');
  
  // Remover possiveis UUIDs
  text = text.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '[UUID]');
  
  // Remover possiveis tokens/secrets (strings longas alfanumericas)
  text = text.replace(/\b[a-zA-Z0-9]{32,}\b/g, '[TOKEN]');
  
  return text;
}

/**
 * Valida se uma resposta da IA e segura para exibicao
 */
export function validateAIResponse(response: string): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  // Verificar se contem codigo executavel
  if (/<script/i.test(response)) {
    issues.push('Response contains script tags');
  }

  // Verificar se contem possiveis dados vazados
  if (/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(response)) {
    issues.push('Response may contain email addresses');
  }

  // Verificar tamanho excessivo (possivel ataque de exfiltracao)
  if (response.length > 50000) {
    issues.push('Response exceeds maximum safe length');
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

// Re-export from ai-anomaly-detector for backward compatibility
export { 
  validateAIBehavior, 
  logAnomaly, 
  processAnomalies,
  estimateTokenCount,
  type AIContext,
  type AIResponse,
  type AnomalyFlag,
  type BehaviorValidation,
} from './ai-anomaly-detector.ts';
