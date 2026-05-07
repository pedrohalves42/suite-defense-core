import { z } from 'https://esm.sh/zod@3.23.8';

export async function generateSHA256(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest("SHA-256", dataBuffer);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function generateHMAC(data: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function generateEvidenceHash(data: unknown): Promise<string> {
  const content = JSON.stringify(data);
  const hash = await generateSHA256(content);
  return hash.substring(0, 16);
}

export function generateAuditId(): string {
  const uuid = crypto.randomUUID().substring(0, 8).toUpperCase();
  return `LAUDO-${uuid}-${Date.now()}`;
}
