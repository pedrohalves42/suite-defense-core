#!/usr/bin/env tsx
/**
 * P0-01 — Cross-tenant RLS runner (CLI wrapper).
 *
 * Convenience entrypoint. The real assertions live in
 * `tests/security/cross-tenant-rls.spec.ts` (vitest). This script only
 * invokes vitest with the correct filter so operators can run:
 *
 *   npx tsx scripts/security/test-cross-tenant-isolation.ts
 *
 * Env vars required — see e2e/.env.test.example.
 * Evidence artifacts land in docs/audits/active/evidence/P0-01-rls/.
 */
import { spawn } from 'node:child_process';

const child = spawn(
  'npx',
  ['vitest', 'run', 'tests/security/cross-tenant-rls.spec.ts', '--reporter=verbose'],
  { stdio: 'inherit', env: process.env }
);
child.on('exit', code => process.exit(code ?? 1));
