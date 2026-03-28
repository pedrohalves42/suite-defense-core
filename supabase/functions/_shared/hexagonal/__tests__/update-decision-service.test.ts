import { assertEquals, assertNotEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import {
  UpdateDecisionService,
  normalizeVersion,
  normalizeForWindows,
  calculateSha256,
  type AgentUpdateContext,
  type ReleaseInfo,
} from '../update-decision-service.ts';

// ??? normalizeVersion ???????????????????????????????????
Deno.test('normalizeVersion strips v prefix', () => {
  assertEquals(normalizeVersion('v5.0.3'), '5.0.3');
});

Deno.test('normalizeVersion strips build suffix', () => {
  assertEquals(normalizeVersion('5.0.3-hotfix'), '5.0.3');
});

Deno.test('normalizeVersion handles null', () => {
  assertEquals(normalizeVersion(null), '');
});

Deno.test('normalizeVersion handles undefined', () => {
  assertEquals(normalizeVersion(undefined), '');
});

Deno.test('normalizeVersion strips v prefix and suffix together', () => {
  assertEquals(normalizeVersion('v5.0.3-beta.1'), '5.0.3');
});

// ??? normalizeForWindows ????????????????????????????????
Deno.test('normalizeForWindows converts LF to CRLF', () => {
  assertEquals(normalizeForWindows('a\nb\nc'), 'a\r\nb\r\nc');
});

Deno.test('normalizeForWindows preserves existing CRLF', () => {
  assertEquals(normalizeForWindows('a\r\nb'), 'a\r\nb');
});

Deno.test('normalizeForWindows converts mixed line endings', () => {
  assertEquals(normalizeForWindows('a\r\nb\nc\rd'), 'a\r\nb\r\nc\r\nd');
});

// ??? calculateSha256 ????????????????????????????????????
Deno.test('calculateSha256 returns 64-char hex string', async () => {
  const hash = await calculateSha256('hello world');
  assertEquals(hash.length, 64);
  assertEquals(/^[a-f0-9]{64}$/.test(hash), true);
});

Deno.test('calculateSha256 is deterministic', async () => {
  const h1 = await calculateSha256('test content');
  const h2 = await calculateSha256('test content');
  assertEquals(h1, h2);
});

Deno.test('calculateSha256 differs for different content', async () => {
  const h1 = await calculateSha256('content A');
  const h2 = await calculateSha256('content B');
  assertNotEquals(h1, h2);
});

// ??? UpdateDecisionService ??????????????????????????????
const service = new UpdateDecisionService();

function makeAgent(overrides: Partial<AgentUpdateContext> = {}): AgentUpdateContext {
  return {
    agentId: 'agent-1',
    agentName: 'TestAgent',
    currentVersion: '5.0.3',
    platform: 'windows',
    ...overrides,
  };
}

function makeRelease(overrides: Partial<ReleaseInfo> = {}): ReleaseInfo {
  return {
    version: '5.1.0',
    scriptContent: '# PowerShell script content here',
    sha256: 'placeholder',
    ...overrides,
  };
}

Deno.test('evaluate returns upgrade when versions differ', async () => {
  const decision = await service.evaluate(
    makeAgent({ currentVersion: '5.0.3' }),
    makeRelease({ version: '5.1.0' }),
  );
  assertEquals(decision.action, 'upgrade');
  if (decision.action === 'upgrade') {
    assertEquals(decision.fromVersion, '5.0.3');
    assertEquals(decision.toVersion, '5.1.0');
  }
});

Deno.test('evaluate returns no_update when version and sha match', async () => {
  const content = '# test script';
  const sha = await calculateSha256(content);
  const decision = await service.evaluate(
    makeAgent({ currentVersion: '5.0.3', currentScriptSha256: sha }),
    makeRelease({ version: '5.0.3', scriptContent: content }),
  );
  assertEquals(decision.action, 'no_update');
});

Deno.test('evaluate returns hotfix on SHA mismatch same version', async () => {
  const decision = await service.evaluate(
    makeAgent({ currentVersion: '5.0.3', currentScriptSha256: 'a'.repeat(64) }),
    makeRelease({ version: '5.0.3', scriptContent: '# different content' }),
  );
  assertEquals(decision.action, 'hotfix');
});

Deno.test('evaluate returns no_update when same version no sha not recent', async () => {
  const decision = await service.evaluate(
    makeAgent({ currentVersion: '5.0.3' }),
    makeRelease({ version: '5.0.3', createdAt: '2020-01-01T00:00:00Z' }),
  );
  assertEquals(decision.action, 'no_update');
  if (decision.action === 'no_update') {
    assertEquals(decision.reason, 'version_match_no_sha256_not_recent');
  }
});

Deno.test('evaluate returns hotfix for recent release without sha', async () => {
  const decision = await service.evaluate(
    makeAgent({ currentVersion: '5.0.3' }),
    makeRelease({ version: '5.0.3', createdAt: new Date().toISOString() }),
  );
  assertEquals(decision.action, 'hotfix');
});

Deno.test('evaluate forces delivery for legacy agents', async () => {
  const decision = await service.evaluate(
    makeAgent({ currentVersion: '5.0.3' }),
    makeRelease({ version: '5.0.3' }),
    { forceLegacyDelivery: true },
  );
  assertEquals(decision.action, 'upgrade');
});

Deno.test('evaluate handles v-prefix in version comparison', async () => {
  const decision = await service.evaluate(
    makeAgent({ currentVersion: 'v5.1.0' }),
    makeRelease({ version: '5.1.0', createdAt: '2020-01-01T00:00:00Z' }),
  );
  assertEquals(decision.action, 'no_update');
});

Deno.test('evaluate handles null currentVersion as upgrade', async () => {
  const decision = await service.evaluate(
    makeAgent({ currentVersion: null }),
    makeRelease({ version: '5.1.0' }),
  );
  assertEquals(decision.action, 'upgrade');
  if (decision.action === 'upgrade') {
    assertEquals(decision.fromVersion, '0.0.0');
  }
});
