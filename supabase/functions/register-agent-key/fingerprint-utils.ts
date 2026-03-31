/**
 * Fingerprint computation utilities for register-agent-key
 * Extraído de register-agent-key/index.ts
 */

export interface FingerprintCandidate {
  fingerprint: string;
  mode: string;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function normalizeBase64(value: string): string {
  let normalized = value.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  const padLength = normalized.length % 4;
  if (padLength > 0) {
    normalized = normalized.padEnd(normalized.length + (4 - padLength), '=');
  }
  return normalized;
}

function extractPemPayload(publicKey: string): string {
  if (!publicKey.includes('-----BEGIN')) return publicKey.trim();
  return publicKey.replace(/-----BEGIN [^-]+-----/g, '').replace(/-----END [^-]+-----/g, '').trim();
}

function utf16LeBytes(input: string): Uint8Array {
  const bytes = new Uint8Array(input.length * 2);
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    bytes[i * 2] = code & 0xff;
    bytes[i * 2 + 1] = code >> 8;
  }
  return bytes;
}

function dedupeCandidates(candidates: FingerprintCandidate[]): FingerprintCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = `${candidate.mode}:${candidate.fingerprint}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Computes SHA256 fingerprint candidates for the public key.
 */
export async function computeAllKeyFingerprints(publicKey: string): Promise<FingerprintCandidate[]> {
  const candidates: FingerprintCandidate[] = [];
  const rawTrimmed = publicKey.trim();
  const normalizedB64 = normalizeBase64(extractPemPayload(publicKey));

  try {
    const decoded = atob(normalizedB64);
    const decodedBytes = Uint8Array.from(decoded, (c) => c.charCodeAt(0));
    candidates.push({ fingerprint: await sha256Hex(decodedBytes), mode: 'decoded_bytes' });
  } catch (err) { console.warn('[fingerprint-utils] invalid base64 decode', err); }

  candidates.push({ fingerprint: await sha256Hex(new TextEncoder().encode(normalizedB64)), mode: 'normalized_base64_utf8' });
  candidates.push({ fingerprint: await sha256Hex(utf16LeBytes(normalizedB64)), mode: 'normalized_base64_utf16le' });

  if (rawTrimmed !== normalizedB64) {
    candidates.push({ fingerprint: await sha256Hex(new TextEncoder().encode(rawTrimmed)), mode: 'raw_trimmed_utf8' });
    candidates.push({ fingerprint: await sha256Hex(utf16LeBytes(rawTrimmed)), mode: 'raw_trimmed_utf16le' });
  }

  return dedupeCandidates(candidates);
}
