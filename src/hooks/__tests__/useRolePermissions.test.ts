import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getPermissionsForRole } from '@/hooks/useRolePermissions';

describe('getPermissionsForRole', () => {
  it('super_admin has all permissions', () => {
    const perms = getPermissionsForRole('super_admin');
    expect(perms).toContain('manage_all_tenants');
    expect(perms).toContain('view_dashboard');
    expect(perms).toContain('manage_users');
  });

  it('admin has management permissions', () => {
    const perms = getPermissionsForRole('admin');
    expect(perms).toContain('manage_users');
    expect(perms).toContain('manage_roles');
    expect(perms).toContain('view_dashboard');
    expect(perms).not.toContain('manage_all_tenants');
    expect(perms).not.toContain('impersonate_user');
  });

  it('analyst has analysis permissions but not user management', () => {
    const perms = getPermissionsForRole('analyst');
    expect(perms).toContain('view_dashboard');
    expect(perms).toContain('view_audit_logs');
    expect(perms).toContain('approve_policy_deploy');
    expect(perms).not.toContain('manage_users');
    expect(perms).not.toContain('manage_roles');
  });

  it('operator can execute playbooks and manage jobs', () => {
    const perms = getPermissionsForRole('operator');
    expect(perms).toContain('execute_playbooks');
    expect(perms).toContain('manage_jobs');
    expect(perms).toContain('manage_agents');
    expect(perms).not.toContain('manage_users');
  });

  it('viewer has only view permissions', () => {
    const perms = getPermissionsForRole('viewer');
    expect(perms).toContain('view_dashboard');
    expect(perms).toContain('view_reports');
    expect(perms).toContain('view_agents');
    expect(perms).not.toContain('execute_playbooks');
    expect(perms).not.toContain('manage_agents');
    expect(perms).not.toContain('manage_users');
  });
});
