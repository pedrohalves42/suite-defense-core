# Break Glass Emergency Access Procedure

| Field | Value |
|-------|-------|
| **Procedure Code** | PROC-BG-001 |
| **Version** | 1.0 |
| **Status** | Approved |
| **Owner** | Security Officer |
| **Effective Date** | 2025-01-01 |
| **Review Date** | 2026-01-01 |
| **Classification** | Confidential |

---

## 1. Purpose

This procedure defines the emergency "Break Glass" access mechanism for situations where normal authentication pathways are unavailable or insufficient for critical business operations.

---

## 2. Scope

Break Glass access applies when:
- All administrators are unavailable
- Critical system failure requires immediate access
- Disaster recovery scenarios
- Time-critical security incidents

---

## 3. Break Glass Account Characteristics

### 3.1 Configuration

| Setting | Value |
|---------|-------|
| Account Type | Dedicated break glass user |
| MFA Requirement | Exempt (controlled bypass) |
| Session Duration | 1 hour maximum |
| Concurrent Sessions | 1 only |
| Audit Level | Maximum (all actions logged) |

### 3.2 Account Storage

- Credentials stored in secure vault (physical or HSM)
- Split knowledge: password split between 2 custodians
- Location documented in business continuity plan
- Regular rotation every 90 days

---

## 4. Activation Process

### 4.1 Pre-Activation Checklist

Before activating Break Glass access:

- [ ] Confirm normal access paths are unavailable
- [ ] Document business justification
- [ ] Obtain verbal approval from 2 authorized personnel
- [ ] Notify security team (if possible)

### 4.2 Activation Steps

1. **Retrieve Credentials**
   - Contact first custodian for password part 1
   - Contact second custodian for password part 2
   - Combine to form complete password

2. **System Activation (Admin Panel)**
   ```
   Tenant Settings → Security → Break Glass → Activate
   ```
   
3. **Login**
   - Use break glass account credentials
   - System immediately sends alerts to:
     - All tenant admins
     - Security team
     - Compliance officer

4. **Perform Emergency Actions**
   - Only actions necessary for emergency resolution
   - All actions are logged with enhanced detail
   - Maximum session duration: 1 hour

### 4.3 API Activation (Emergency Only)

```typescript
// RPC call to activate break glass
const { data, error } = await supabase.rpc('activate_break_glass', {
  _tenant_id: tenantId,
  _reason: 'Emergency: all admins unavailable',
  _requester_id: userId
});
```

---

## 5. During Break Glass Session

### 5.1 Permitted Actions

- ✅ Reset user MFA
- ✅ Unlock user accounts
- ✅ View critical logs
- ✅ Emergency role assignment
- ✅ System configuration review

### 5.2 Prohibited Actions

- ❌ Delete audit logs
- ❌ Create new super_admin accounts
- ❌ Modify break glass configuration
- ❌ Export bulk data
- ❌ Disable security monitoring

### 5.3 Automatic Logging

Every action during break glass is logged with:
- Timestamp (millisecond precision)
- Full action details
- IP address and user agent
- Affected resources
- `break_glass = true` flag

---

## 6. Deactivation

### 6.1 Automatic Deactivation

Break Glass access automatically terminates after:
- 1 hour from activation
- Logout
- System detects anomalous behavior

### 6.2 Manual Deactivation

```
Tenant Settings → Security → Break Glass → Deactivate
```

### 6.3 Post-Deactivation Actions

1. Force password rotation for break glass account
2. Update vault with new credentials
3. Notify custodians of rotation

---

## 7. Post-Incident Review

### 7.1 Within 24 Hours

| Action | Responsible |
|--------|-------------|
| Document incident timeline | Break glass user |
| Review all actions taken | Security team |
| Verify no unauthorized access | Security team |
| Notify compliance | Admin |

### 7.2 Within 7 Days

| Action | Responsible |
|--------|-------------|
| Complete incident report | Security team |
| Root cause analysis | Admin + Security |
| Update procedures if needed | Security officer |
| Audit log review | Compliance |

### 7.3 Incident Report Template

```markdown
## Break Glass Incident Report

**Date/Time:** YYYY-MM-DD HH:MM UTC
**Duration:** X hours Y minutes
**Activator:** [Name]
**Approvers:** [Name 1], [Name 2]

### Justification
[Detailed reason for break glass activation]

### Actions Taken
1. [Action 1]
2. [Action 2]

### Root Cause
[Why was normal access unavailable?]

### Recommendations
[How to prevent future occurrences]
```

---

## 8. Monthly Verification

### 8.1 Test Procedure

1. Verify custodian availability
2. Confirm credential validity (test login, do not perform actions)
3. Review audit logs for previous usage
4. Update documentation if needed

### 8.2 Verification Checklist

- [ ] Both custodians accessible
- [ ] Credentials work correctly
- [ ] Alert notifications functioning
- [ ] Session timeout working
- [ ] Audit logging complete

---

## 9. Compliance Requirements

| Standard | Requirement | Evidence |
|----------|-------------|----------|
| SOC 2 CC6.3 | Emergency access procedures | This document |
| ISO 27001 A.9.2.3 | Privileged access rights | Audit logs |
| NIST 800-53 AC-2 | Account management | Break glass config |

---

## 10. Contacts

| Role | Contact | Availability |
|------|---------|--------------|
| Security Team | security@company.com | 24/7 |
| Custodian 1 | [Internal] | Business hours |
| Custodian 2 | [Internal] | Business hours |
| Compliance | compliance@company.com | Business hours |

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-01-01 | Security Team | Initial version |
