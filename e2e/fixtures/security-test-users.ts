/**
 * Security Test User Fixtures
 * 
 * Defines test users with different roles for E2E security testing.
 * These users should be created in the database before running security tests.
 */

export interface TestUser {
  email: string;
  password: string;
  role: 'super_admin' | 'admin' | 'operator' | 'viewer' | 'member';
  fullName: string;
  tenantSlug: string;
}

/**
 * Test users for security E2E tests
 * These are defined with specific roles for testing access control
 */
export const SECURITY_TEST_USERS: Record<string, TestUser> = {
  // Super admin with cross-tenant access
  superAdmin: {
    email: process.env.TEST_SUPER_ADMIN_EMAIL || 'super@cybershield.test',
    password: process.env.TEST_SUPER_ADMIN_PASSWORD || 'SuperSecure123!',
    role: 'super_admin',
    fullName: 'Super Admin Test',
    tenantSlug: 'test-tenant-a',
  },
  
  // Regular admin for Tenant A
  adminTenantA: {
    email: process.env.TEST_ADMIN_EMAIL || 'admin@test.com',
    password: process.env.TEST_ADMIN_PASSWORD || 'Test1234!',
    role: 'admin',
    fullName: 'Admin Tenant A',
    tenantSlug: 'test-tenant-a',
  },
  
  // Regular admin for Tenant B (for cross-tenant tests)
  adminTenantB: {
    email: process.env.TEST_ADMIN_B_EMAIL || 'admin-b@test.com',
    password: process.env.TEST_ADMIN_B_PASSWORD || 'Test1234!',
    role: 'admin',
    fullName: 'Admin Tenant B',
    tenantSlug: 'test-tenant-b',
  },
  
  // Operator with limited permissions
  operator: {
    email: process.env.TEST_OPERATOR_EMAIL || 'operator@test.com',
    password: process.env.TEST_OPERATOR_PASSWORD || 'Test1234!',
    role: 'operator',
    fullName: 'Operator Test',
    tenantSlug: 'test-tenant-a',
  },
  
  // Viewer with read-only access
  viewer: {
    email: process.env.TEST_VIEWER_EMAIL || 'viewer@test.com',
    password: process.env.TEST_VIEWER_PASSWORD || 'Test1234!',
    role: 'viewer',
    fullName: 'Viewer Test',
    tenantSlug: 'test-tenant-a',
  },
  
  // Regular member
  member: {
    email: process.env.TEST_MEMBER_EMAIL || 'member@test.com',
    password: process.env.TEST_MEMBER_PASSWORD || 'Test1234!',
    role: 'member',
    fullName: 'Member Test',
    tenantSlug: 'test-tenant-a',
  },
};

/**
 * Test tenants for multi-tenant isolation tests
 */
export const SECURITY_TEST_TENANTS = {
  tenantA: {
    id: 'a0000000-0000-0000-0000-000000000001',
    name: 'Test Tenant A',
    slug: 'test-tenant-a',
  },
  tenantB: {
    id: 'b0000000-0000-0000-0000-000000000002',
    name: 'Test Tenant B',
    slug: 'test-tenant-b',
  },
};

/**
 * Expected behaviors for security tests
 */
export const SECURITY_EXPECTATIONS = {
  // HTTP status codes
  unauthorized: 401,
  forbidden: 403,
  notFound: 404,
  rateLimited: 429,
  success: 200,
  created: 201,
  noContent: 204,
  
  // Rate limits
  maxPendingApprovals: 10,
  maxPasswordAttempts: 5,
  rateLimitWindowSeconds: 3600,
  
  // Audit log actions
  auditActions: {
    approvalCreated: 'approval_created',
    approvalApproved: 'approval_approved',
    approvalRejected: 'approval_rejected',
    rateLimitExceeded: 'rate_limit_exceeded',
    unauthorizedAccess: 'unauthorized_access',
    crossTenantAttempt: 'cross_tenant_attempt',
  },
};

/**
 * Attack vectors for Red Team tests
 */
export const RED_TEAM_VECTORS = {
  // RLS bypass attempts
  rlsBypass: {
    directUpdate: 'Direct UPDATE via REST API',
    directInsert: 'Direct INSERT via REST API',
    statusManipulation: 'Status field manipulation',
    tokenForging: 'Approval token forging',
  },
  
  // Injection attempts
  injection: {
    sqlInPayload: "'; DROP TABLE agents; --",
    xssInMetadata: '<script>alert("xss")</script>',
    pathTraversal: '../../../etc/passwd',
    commandInjection: '; rm -rf /',
  },
  
  // Authentication bypass
  authBypass: {
    noToken: 'Request without Authorization header',
    invalidToken: 'Request with invalid JWT',
    expiredToken: 'Request with expired JWT',
    forgedSecret: 'Request with forged X-Internal-Secret',
  },
};

export default {
  SECURITY_TEST_USERS,
  SECURITY_TEST_TENANTS,
  SECURITY_EXPECTATIONS,
  RED_TEAM_VECTORS,
};
