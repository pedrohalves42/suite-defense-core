/**
 * BLOCO 2: Compliance Evidence Bundle - Crypto Module
 * 
 * Funções criptográficas para integridade e autoria de relatórios.
 * - SHA256: Garante integridade (conteúdo não foi alterado)
 * - HMAC: Garante autoria (sistema/tenant que gerou)
 * 
 * Usa Web Crypto API (funciona em browser e Deno)
 */

/**
 * Gera hash SHA256 do conteúdo
 * @param content - String para calcular hash
 * @returns Hash SHA256 em hexadecimal (64 caracteres)
 */
export async function generateSHA256(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Gera assinatura HMAC-SHA256
 * @param content - String para assinar
 * @param secret - Chave secreta (tenant_id ou system key)
 * @returns Assinatura HMAC em hexadecimal (64 caracteres)
 */
export async function generateHMAC(
  content: string,
  secret: string
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(content)
  );
  const signatureArray = Array.from(new Uint8Array(signature));
  return signatureArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Verifica integridade de um relatório comparando hash
 * @param content - Conteúdo original (JSON serializado)
 * @param expectedHash - Hash esperado
 * @returns true se o hash corresponde
 */
export async function verifySHA256(
  content: string,
  expectedHash: string
): Promise<boolean> {
  const calculatedHash = await generateSHA256(content);
  return calculatedHash === expectedHash;
}

/**
 * Verifica assinatura HMAC de um relatório
 * @param content - Conteúdo original (JSON serializado)
 * @param secret - Chave secreta usada na assinatura
 * @param expectedSignature - Assinatura esperada
 * @returns true se a assinatura é válida
 */
export async function verifyHMAC(
  content: string,
  secret: string,
  expectedSignature: string
): Promise<boolean> {
  const calculatedSignature = await generateHMAC(content, secret);
  return calculatedSignature === expectedSignature;
}

/**
 * Gera audit_id único para relatório
 * @returns ID no formato LAUDO-{uuid.slice(0,8)}-{timestamp}
 */
export function generateAuditId(): string {
  const uuid = crypto.randomUUID().substring(0, 8).toUpperCase();
  const timestamp = Date.now();
  return `LAUDO-${uuid}-${timestamp}`;
}

/**
 * Calcula hash de evidência para rastreabilidade
 * @param evidenceData - Dados da evidência (qualquer objeto)
 * @returns Hash SHA256 truncado (16 caracteres)
 */
export async function generateEvidenceHash(
  evidenceData: unknown
): Promise<string> {
  const content = JSON.stringify(evidenceData);
  const fullHash = await generateSHA256(content);
  return fullHash.substring(0, 16);
}

/**
 * Serializa payload para cálculo de hash
 * Remove sha256 e hmac_signature do objeto antes de serializar
 * para permitir verificação posterior
 */
export function serializeForHash(payload: any): string {
  const { sha256, hmac_signature, ...rest } = payload;
  return JSON.stringify(rest, null, 2);
}
