# Access Control Policy

| Field | Value |
|-------|-------|
| **Policy Code** | ACP-001 |
| **Version** | 1.0 |
| **Status** | Draft |
| **Owner** | [OWNER_NAME] |
| **Effective Date** | [DATE] |
| **Review Date** | [DATE + 1 YEAR] |
| **SOC 2 Criteria** | CC6 |

---

## 1. Purpose

To ensure that access to systems and data is restricted based on business need and the principle of least privilege.

---

## 2. Scope

This policy applies to:
- All user accounts and credentials
- System service accounts
- API keys and tokens
- Database access
- Administrative access

---

## 3. Authentication

### 3.1 User Authentication
- All users authenticate via a centralized identity provider
- Passwords must meet complexity requirements
- Multi-factor authentication is required for administrative access

### 3.2 Token Management
- Tokens have defined expiration periods
- Tokens are validated server-side for every request
- Expired tokens are automatically rejected

### 3.3 Agent Authentication
- Agents authenticate using HMAC signatures
- Each agent has a unique secret
- Signatures include nonce to prevent replay attacks

---

## 4. Authorization

### 4.1 Role-Based Access Control (RBAC)
The system implements the following roles:

| Role | Permissions |
|------|-------------|
| super_admin | Full system access across all tenants |
| admin | Full access within assigned tenant |
| operator | Operational access (jobs, agents) within tenant |
| viewer | Read-only access within tenant |

### 4.2 Tenant Isolation
- All data queries are filtered by tenant_id
- Row Level Security (RLS) enforces isolation at database level
- Cross-tenant access is technically impossible

### 4.3 Permission Checks
- All authorization is performed on the backend
- Frontend permissions are for UI display only
- Edge Functions validate permissions before operations

---

## 5. Administrative Access

### 5.1 Privileged Access
- Administrative access is limited to authorized personnel
- Production access requires explicit approval
- All administrative actions are logged

### 5.2 Super Admin Access
- Super admin accounts have cross-tenant visibility
- Usage is audited and reviewed
- Requires additional authentication factors

---

## 6. User Lifecycle

### 6.1 Provisioning
- Access is provisioned upon written approval
- Role assignment follows least privilege principle
- Initial credentials are securely delivered

### 6.2 Access Review
- Access rights are reviewed quarterly
- Inactive accounts are disabled after 90 days
- Role changes require re-approval

### 6.3 Deprovisioning
- Access is revoked immediately upon termination
- All tokens and credentials are invalidated
- Access logs are retained for audit

---

## 7. Technical Evidences

| Requirement | Implementation | Evidence |
|-------------|----------------|----------|
| RBAC | `user_roles` table | Database schema |
| Least Privilege | Role-based policies | RLS policy definitions |
| Tenant Isolation | RLS + tenant_id | All table policies |
| Token Expiration | Automatic invalidation | `agent_tokens` table |
| Cross-tenant Protection | Explicit checks | Edge Function code |

---

## 8. Compliance

Violations of this policy will result in immediate access revocation and may lead to disciplinary action.

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | [DATE] | [AUTHOR] | Initial version |
