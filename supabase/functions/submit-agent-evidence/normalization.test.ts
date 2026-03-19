import { assertEquals, assertExists } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { normalizeEvidenceEntry } from './normalization.ts';

Deno.test('normalizeEvidenceEntry accepts v5 batch format with type/data/timestamp', async () => {
  const normalized = await normalizeEvidenceEntry(
    {
      type: 'heartbeat',
      data: {
        cpu_percent: 21,
        memory_percent: 58,
      },
      severity: 'warning',
      timestamp: '2026-03-19T16:51:33.319Z',
      evidence_hash: 'abc123',
      state_before: 'idle',
      state_after: 'active',
      agent_name: 'pcteste1',
      agent_version: 'v5.0.15',
    },
    {
      agent_name: 'fallback-agent',
      agent_version: 'v0',
    },
  );

  assertEquals(normalized.event_type, 'heartbeat');
  assertEquals(normalized.event_data.cpu_percent, 21);
  assertEquals(normalized.event_data.memory_percent, 58);
  assertEquals(normalized.event_data.timestamp, '2026-03-19T16:51:33.319Z');
  assertEquals(normalized.evidence_hash, 'abc123');
  assertEquals(normalized.agent_name, 'pcteste1');
  assertEquals(normalized.agent_version, 'v5.0.15');
  assertEquals(normalized.state_before, 'idle');
  assertEquals(normalized.state_after, 'active');
  assertEquals(normalized.severity, 'warning');
});

Deno.test('normalizeEvidenceEntry preserves flat payload format and generates hash when missing', async () => {
  const normalized = await normalizeEvidenceEntry(
    {
      event_type: 'auto_repair',
      event_data: {
        event_name: 'baseline_rebuilt',
        repaired: true,
      },
      severity: 'info',
    },
    {
      agent_name: 'pcteste1',
      agent_version: 'v5.0.15',
    },
  );

  assertEquals(normalized.event_type, 'auto_repair');
  assertEquals(normalized.event_data.event_name, 'baseline_rebuilt');
  assertEquals(normalized.agent_name, 'pcteste1');
  assertEquals(normalized.agent_version, 'v5.0.15');
  assertExists(normalized.evidence_hash);
  assertEquals(normalized.evidence_hash.length, 64);
});

Deno.test('normalizeEvidenceEntry downgrades unknown types to security_event but keeps source data', async () => {
  const normalized = await normalizeEvidenceEntry(
    {
      type: 'local_detection_usb_inserted',
      data: {
        device: 'TOSHIBA',
      },
      severity: 'warning',
    },
    {
      agent_name: 'pcteste1',
    },
  );

  assertEquals(normalized.event_type, 'security_event');
  assertEquals(normalized.event_data.device, 'TOSHIBA');
  assertEquals(normalized.event_data.source_event_type, 'local_detection_usb_inserted');
  assertEquals(normalized.severity, 'warning');
});
