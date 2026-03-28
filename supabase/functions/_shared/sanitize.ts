/**
 * SSA-007: Output Sanitization
 * Sanitiza dados de texto provenientes do agente antes de gravar no DB
 * Previne Stored XSS e injecao de logs
 */

// Caracteres de controle perigosos
const CONTROL_CHAR_REGEX = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

// Padroes de script injection
const SCRIPT_PATTERNS = [
  /<script\b[^>]*>[\s\S]*?<\/script>/gi,
  /javascript:/gi,
  /on\w+\s*=/gi, // onclick=, onerror=, etc.
  /data:\s*text\/html/gi,
  /<iframe\b[^>]*>/gi,
  /<object\b[^>]*>/gi,
  /<embed\b[^>]*>/gi,
  /<svg\b[^>]*onload/gi,
];

/**
 * Sanitiza uma string para armazenamento seguro
 * @param input String a sanitizar
 * @param maxLength Tamanho maximo (default: 500)
 * @returns String sanitizada
 */
export function sanitizeForStorage(input: unknown, maxLength: number = 500): string {
  if (input === null || input === undefined) {
    return '';
  }

  let str = String(input);

  // 1. Remover caracteres de controle
  str = str.replace(CONTROL_CHAR_REGEX, '');

  // 2. Remover padroes de script injection
  for (const pattern of SCRIPT_PATTERNS) {
    str = str.replace(pattern, '[SANITIZED]');
  }

  // 3. Escapar HTML entities basicas
  str = str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');

  // 4. Truncar para tamanho maximo
  if (str.length > maxLength) {
    str = str.substring(0, maxLength) + '... [truncated]';
  }

  return str;
}

/**
 * Sanitiza um objeto recursivamente
 * @param obj Objeto a sanitizar
 * @param maxDepth Profundidade maxima (default: 5)
 * @param maxStringLength Tamanho maximo de strings (default: 500)
 * @returns Objeto sanitizado
 */
export function sanitizeObject(
  obj: unknown,
  maxDepth: number = 5,
  maxStringLength: number = 500
): unknown {
  if (maxDepth <= 0) {
    return '[MAX_DEPTH_EXCEEDED]';
  }

  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return sanitizeForStorage(obj, maxStringLength);
  }

  if (typeof obj === 'number' || typeof obj === 'boolean') {
    return obj;
  }

  if (Array.isArray(obj)) {
    // Limitar arrays muito grandes
    const maxArrayLength = 1000;
    const trimmed = obj.slice(0, maxArrayLength);
    return trimmed.map((item) => sanitizeObject(item, maxDepth - 1, maxStringLength));
  }

  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    const keys = Object.keys(obj as Record<string, unknown>);
    
    // Limitar numero de chaves
    const maxKeys = 100;
    const trimmedKeys = keys.slice(0, maxKeys);

    for (const key of trimmedKeys) {
      // Sanitizar chave tambem
      const safeKey = sanitizeForStorage(key, 50);
      result[safeKey] = sanitizeObject(
        (obj as Record<string, unknown>)[key],
        maxDepth - 1,
        maxStringLength
      );
    }

    return result;
  }

  return String(obj);
}

/**
 * Valida se um JSON output e seguro para armazenamento
 * @param output Output do job
 * @returns Output sanitizado ou null se invalido
 */
export function sanitizeJobOutput(output: unknown): Record<string, unknown> | null {
  if (!output) {
    return null;
  }

  try {
    // Se for string, tentar parsear como JSON
    let parsed = output;
    if (typeof output === 'string') {
      parsed = JSON.parse(output);
    }

    if (typeof parsed !== 'object' || parsed === null) {
      return { raw: sanitizeForStorage(String(output), 1000) };
    }

    // Sanitizar recursivamente
    return sanitizeObject(parsed, 5, 500) as Record<string, unknown>;
  } catch (e) {
    // Se falhar o parse, retornar como string sanitizada
    return { raw: sanitizeForStorage(String(output), 1000) };
  }
}

/**
 * Sanitiza uma mensagem de erro
 * @param error Mensagem de erro
 * @returns Erro sanitizado (max 500 chars)
 */
export function sanitizeErrorMessage(error: unknown): string {
  return sanitizeForStorage(error, 500);
}
