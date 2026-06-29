/**
 * Security Test Users Fixtures
 * 
 * Defines test users for E2E security testing with different roles and tenants.
 * These users must be created via tests/setup-test-users.ts and seed SQL.
 */

export interface TestUser {
  email: string;
  password: string;
  role: 'super_admin' | 'admin' | 'operator' | 'viewer' | 'member';
  fullName: string;
  tenantSlug: string;
  tenantId: string;
}

export interface TestTenant {
  id: string;
  name: string;
  slug: string;
}

/**
 * All test users organized by role
 * Credentials can be overridden via environment variables
 */
export const SECURITY_TEST_USERS: Record<string, TestUser> = {
  super_admin: {
    email: process.env.TEST_SUPER_ADMIN_EMAIL || 'super@cybershield.test',
    password: process.env.TEST_SUPER_ADMIN_PASSWORD || 'SupZ9!kV2pQrW8tN',
    role: 'super_admin',
    fullName: 'Super Admin Test',
    tenantSlug: 'test-tenant-a',
    tenantId: 'a0000000-0000-0000-0000-000000000001',
  },
  admin: {
    email: process.env.TEST_ADMIN_EMAIL || 'admin@test.com',
    password: process.env.TEST_ADMIN_PASSWORD || 'Test1234!',
    role: 'admin',
    fullName: 'Admin Tenant A',
    tenantSlug: 'test-tenant-a',
    tenantId: 'a0000000-0000-0000-0000-000000000001',
  },
  admin_b: {
    email: process.env.TEST_ADMIN_B_EMAIL || 'admin-b@test.com',
    password: process.env.TEST_ADMIN_B_PASSWORD || 'Test1234!',
    role: 'admin',
    fullName: 'Admin Tenant B',
    tenantSlug: 'test-tenant-b',
    tenantId: 'b0000000-0000-0000-0000-000000000002',
  },
  operator: {
    email: process.env.TEST_OPERATOR_EMAIL || 'operator@test.com',
    password: process.env.TEST_OPERATOR_PASSWORD || 'Test1234!',
    role: 'operator',
    fullName: 'Operator Test',
    tenantSlug: 'test-tenant-a',
    tenantId: 'a0000000-0000-0000-0000-000000000001',
  },
  viewer: {
    email: process.env.TEST_VIEWER_EMAIL || 'viewer@test.com',
    password: process.env.TEST_VIEWER_PASSWORD || 'Test1234!',
    role: 'viewer',
    fullName: 'Viewer Test',
    tenantSlug: 'test-tenant-a',
    tenantId: 'a0000000-0000-0000-0000-000000000001',
  },
  member: {
    email: process.env.TEST_MEMBER_EMAIL || 'member@test.com',
    password: process.env.TEST_MEMBER_PASSWORD || 'Test1234!',
    role: 'member',
    fullName: 'Member Test',
    tenantSlug: 'test-tenant-a',
    tenantId: 'a0000000-0000-0000-0000-000000000001',
  },
};

// Legacy aliases for backwards compatibility
export const SECURITY_TEST_USERS_LEGACY: Record<string, TestUser> = {
  superAdmin: SECURITY_TEST_USERS.super_admin,
  adminTenantA: SECURITY_TEST_USERS.admin,
  adminTenantB: SECURITY_TEST_USERS.admin_b,
  operator: SECURITY_TEST_USERS.operator,
  viewer: SECURITY_TEST_USERS.viewer,
  member: SECURITY_TEST_USERS.member,
};

/**
 * Test tenants for multi-tenant testing
 */
export const SECURITY_TEST_TENANTS: Record<string, TestTenant> = {
  tenantA: {
    id: process.env.TEST_TENANT_A_ID || 'a0000000-0000-0000-0000-000000000001',
    name: 'Test Tenant A',
    slug: process.env.TEST_TENANT_A_SLUG || 'test-tenant-a',
  },
  tenantB: {
    id: process.env.TEST_TENANT_B_ID || 'b0000000-0000-0000-0000-000000000002',
    name: 'Test Tenant B',
    slug: process.env.TEST_TENANT_B_SLUG || 'test-tenant-b',
  },
};

/**
 * Expected security behaviors for assertions
 */
export const SECURITY_EXPECTATIONS = {
  httpStatus: {
    unauthorized: 401,
    forbidden: 403,
    notFound: 404,
    rateLimited: 429,
    ok: 200,
    created: 201,
    noContent: 204,
  },
  rateLimit: {
    maxAttempts: 5,
    blockDurationMinutes: 5,
    maxPendingApprovals: 10,
    rateLimitWindowSeconds: 3600,
  },
  auditLog: {
    loginSuccess: 'auth.login_success',
    loginFailed: 'auth.login_failed',
    roleChange: 'update_role',
    dataAccess: 'data_access',
    privilegeEscalation: 'privilege_escalation_attempt',
    approvalCreated: 'approval_created',
    approvalApproved: 'approval_approved',
    approvalRejected: 'approval_rejected',
    rateLimitExceeded: 'rate_limit_exceeded',
    unauthorizedAccess: 'unauthorized_access',
    crossTenantAttempt: 'cross_tenant_attempt',
  },
};

/**
 * Attack vectors for red team testing
 */
export const RED_TEAM_VECTORS = {
  rlsBypass: [
    "'; DROP TABLE users; --",
    "1' OR '1'='1",
    "admin'--",
    "' UNION SELECT * FROM auth.users--",
  ],
  injection: [
    '<script>alert("xss")</script>',
    '{{constructor.constructor("return this")()}}',
    '${7*7}',
    '#{7*7}',
    '../../../etc/passwd',
    '; rm -rf /',
  ],
  authBypass: [
    { Authorization: '' },
    { Authorization: 'Bearer invalid_token' },
    { Authorization: 'Bearer null' },
    { Authorization: 'Bearer undefined' },
  ],
};

/**
 * Helper to get user by role
 */
export function getUserByRole(role: TestUser['role']): TestUser {
  const user = Object.values(SECURITY_TEST_USERS).find(u => u.role === role);
  if (!user) {
    throw new Error(`Test user with role '${role}' not found`);
  }
  return user;
}

/**
 * Helper to get users by tenant
 */
export function getUsersByTenant(tenantSlug: string): TestUser[] {
  return Object.values(SECURITY_TEST_USERS).filter(u => u.tenantSlug === tenantSlug);
}

/**
 * Helper to get tenant by slug
 */
export function getTenantBySlug(slug: string): TestTenant {
  const tenant = Object.values(SECURITY_TEST_TENANTS).find(t => t.slug === slug);
  if (!tenant) {
    throw new Error(`Test tenant with slug '${slug}' not found`);
  }
  return tenant;
}

export default {
  SECURITY_TEST_USERS,
  SECURITY_TEST_USERS_LEGACY,
  SECURITY_TEST_TENANTS,
  SECURITY_EXPECTATIONS,
  RED_TEAM_VECTORS,
  getUserByRole,
  getUsersByTenant,
  getTenantBySlug,
};
