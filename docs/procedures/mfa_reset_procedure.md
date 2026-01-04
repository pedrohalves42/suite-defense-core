# MFA Reset Procedure

| Field | Value |
|-------|-------|
| **Procedure Code** | PROC-MFA-001 |
| **Version** | 1.0 |
| **Status** | Approved |
| **Owner** | Security Officer |
| **Effective Date** | 2025-01-01 |
| **Review Date** | 2026-01-01 |

---

## 1. Purpose

This procedure defines the process for resetting Multi-Factor Authentication (MFA) for users who have lost access to their authenticator device.

---

## 2. Scope

Applies to all users requiring MFA reset, including:
- Standard users
- Operators
- Analysts
- Administrators

---

## 3. Roles and Responsibilities

| Role | Responsibility |
|------|----------------|
| User | Request MFA reset via support ticket |
| Admin | Verify user identity and approve reset |
| Second Admin | Confirm reset (Two-Man-Rule) |
| Super Admin | Break glass access when needed |

---

## 4. Standard MFA Reset Process

### 4.1 User Initiates Request

1. User creates support ticket with:
   - Full name
   - Email address
   - Reason for reset (lost device, new phone, etc.)
   - Last successful login date (approximate)

### 4.2 Identity Verification

Admin must verify at least **2 of the following**:
- [ ] Verification of registered email ownership
- [ ] Video call verification (face match with profile)
- [ ] Secondary contact method (phone call to registered number)
- [ ] Knowledge verification (security questions, recent activity)
- [ ] Manager confirmation (for employees)

### 4.3 Two-Man-Rule Approval

1. First Admin verifies identity → marks as "Verified"
2. Second Admin reviews verification → approves reset
3. Both admins must be different users
4. Approval window: 24 hours

### 4.4 Execute Reset

```sql
-- Executed via admin panel or RPC
SELECT reset_user_mfa(_user_id := '<user-uuid>');
```

### 4.5 Post-Reset Actions

1. User receives email with reset confirmation
2. User must configure new MFA within 24 hours
3. System logs reset event in audit log
4. Notify security team of completed reset

---

## 5. Emergency Break Glass Procedure

**Use ONLY when:**
- No admins are available
- Critical business emergency
- User is sole admin of their tenant

### 5.1 Break Glass Activation

1. Contact designated break glass user
2. Break glass user authenticates with special credentials
3. System logs break glass activation
4. MFA bypass granted for 1 hour maximum

### 5.2 Break Glass Users

- Each tenant has ONE designated break glass user
- Break glass users are super_admin or designated admin
- Break glass activation sends immediate alert to:
  - All tenant admins
  - Security team
  - Compliance officer

### 5.3 Post-Break Glass

1. **Within 24 hours:**
   - Document reason for break glass use
   - Review audit logs
   - Reset break glass credentials
   
2. **Within 7 days:**
   - Security review of incident
   - Update procedures if needed

---

## 6. Offline Recovery Codes

### 6.1 Generation

Users should generate recovery codes during MFA setup:
- 10 single-use codes
- Stored securely by user (not in system)
- Each code valid for one login only

### 6.2 Using Recovery Codes

1. At MFA prompt, select "Use recovery code"
2. Enter one unused code
3. Code is consumed and cannot be reused
4. User should reconfigure MFA after login

---

## 7. Audit Requirements

All MFA resets must be logged with:
- Timestamp
- User ID
- Requester ID
- Approver IDs (both admins)
- Verification method used
- IP addresses
- Break glass flag (if applicable)

---

## 8. Security Considerations

### 8.1 Prohibited Actions

- ❌ Resetting MFA via email link alone
- ❌ Single-person approval
- ❌ Resetting without identity verification
- ❌ Sharing recovery codes

### 8.2 Rate Limits

- Maximum 1 MFA reset per user per 7 days
- Maximum 5 resets per tenant per day
- Break glass usage limited to 1 per month

---

## 9. Compliance

This procedure aligns with:
- SOC 2 CC6.1 (Logical access security)
- NIST 800-63B (Authentication guidelines)
- ISO 27001 A.9.4.2 (Secure log-on procedures)

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-01-01 | Security Team | Initial version |
