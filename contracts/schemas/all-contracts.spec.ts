import { test, expect } from '@playwright/test';
import { createAnonClient, hasRequiredEnvVars } from '../utils/supabase';
import { assertTableContract, assertViewContract } from '../utils/schemaAssert';
import { auditLogsContract } from './audit_logs.contract';
import { systemAlertsContract } from './system_alerts.contract';
import { agentsContract, agentsSafeViewContract, agentsPublicViewContract } from './agents.contract';
import { invitesContract, invitesSafeViewContract } from './invites.contract';

test.describe('Schema Contracts', () => {
  test.beforeAll(() => {
    if (!hasRequiredEnvVars()) {
      test.skip();
    }
  });

  test.describe('Table Contracts', () => {
    test('audit_logs schema is valid and actor_type is forbidden', async () => {
      const supabase = createAnonClient();
      await assertTableContract(supabase, auditLogsContract);
    });

    test('system_alerts schema is valid', async () => {
      const supabase = createAnonClient();
      await assertTableContract(supabase, systemAlertsContract);
    });

    test('agents schema has required columns', async () => {
      const supabase = createAnonClient();
      await assertTableContract(supabase, agentsContract);
    });

    test('invites schema has required columns', async () => {
      const supabase = createAnonClient();
      await assertTableContract(supabase, invitesContract);
    });
  });

  test.describe('View Contracts - Sensitive Data Exclusion', () => {
    test('agents_safe view excludes hmac_secret', async () => {
      const supabase = createAnonClient();
      await assertViewContract(supabase, agentsSafeViewContract);
    });

    test('agents_public view excludes hmac_secret', async () => {
      const supabase = createAnonClient();
      await assertViewContract(supabase, agentsPublicViewContract);
    });

    test('invites_safe view excludes token', async () => {
      const supabase = createAnonClient();
      await assertViewContract(supabase, invitesSafeViewContract);
    });
  });
});
