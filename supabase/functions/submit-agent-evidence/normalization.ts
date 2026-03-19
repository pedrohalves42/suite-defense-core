const VALID_EVENT_TYPES = new Set([
  'state_change',
  'job_execution',
  'dns_block',
  'policy_sync',
  'auto_recovery',
  'heartbeat',
  'update_applied',
  'error',
  'policy_drift',
  'security_event',
  'auto_repair',
]);

const VALID_SEVERITIES = new Set(['debug', 'info', 'warning', 'error', 'critical']);

export interface NormalizedEvidenceEntry {
  agent_name: string;
  agent_version: string | null;
  event_type: string;
  event_data: Record<string, unknown>;
  evidence_hash: string;
  state_before: string | null;
  state_after: string | null;
  severity: string;
}

interface NormalizeFallbacks {
  agent_name: string;
  agent_version?: string | null;
}

export async function normalizeEvidenceEntry(
  rawEntry: Record<string, unknown>,
  fallbacks: NormalizeFallbacks,
): Promise<NormalizedEvidenceEntry> {
  const rawType = pickString(rawEntry.event_type) ?? pickString(rawEntry.type) ?? 'security_event';
  const normalizedType = VALID_EVENT_TYPES.has(rawType) ? rawType : 'security_event';
  const severity = normalizeSeverity(pickString(rawEntry.severity));
  const stateBefore = pickString(rawEntry.state_before);
  const stateAfter = pickString(rawEntry.state_after);
  const timestamp = pickString(rawEntry.timestamp);
  const agentName = pickString(rawEntry.agent_name) ?? fallbacks.agent_name;
  const agentVersion = pickString(rawEntry.agent_version) ?? fallbacks.agent_version ?? null;

  const baseEventData = toRecord(rawEntry.event_data, rawEntry.data);
  const eventData: Record<string, unknown> = { ...baseEventData };

  if (timestamp && eventData.timestamp === undefined) {
    eventData.timestamp = timestamp;
  }

  if (normalizedType === 'security_event' && rawType !== normalizedType && eventData.source_event_type === undefined) {
    eventData.source_event_type = rawType;
  }

  const evidenceHash =
    pickString(rawEntry.evidence_hash) ??
    await sha256Hex(
      JSON.stringify({
        agent_name: agentName,
        agent_version: agentVersion,
        event_type: rawType,
        event_data: eventData,
        state_before: stateBefore,
        state_after: stateAfter,
        severity,
        timestamp: timestamp ?? null,
      }),
    );

  return {
    agent_name: agentName,
    agent_version: agentVersion,
    event_type: normalizedType,
    event_data: eventData,
    evidence_hash: evidenceHash,
    state_before: stateBefore,
    state_after: stateAfter,
    severity,
  };
}

function pickString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function normalizeSeverity(value: string | null): string {
  return value && VALID_SEVERITIES.has(value) ? value : 'info';
}

function toRecord(...candidates: unknown[]): Record<string, unknown> {
  for (const candidate of candidates) {
    if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
      return { ...(candidate as Record<string, unknown>) };
    }
  }

  return {};
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
