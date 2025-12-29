# Data Classification & Retention Policy

| Field | Value |
|-------|-------|
| **Policy Code** | DRP-001 |
| **Version** | 1.0 |
| **Status** | Draft |
| **Owner** | [OWNER_NAME] |
| **Effective Date** | [DATE] |
| **Review Date** | [DATE + 1 YEAR] |
| **SOC 2 Criteria** | CC5 |

---

## 1. Purpose

To define how data is classified, protected, and retained.

---

## 2. Scope

This policy applies to all data processed, stored, or transmitted by [TENANT_NAME], including:
- Operational data
- Audit data
- Security metadata
- User data
- System configuration

---

## 3. Data Classification

### 3.1 Classification Levels

| Level | Description | Examples | Protection |
|-------|-------------|----------|------------|
| Public | Non-sensitive information | Marketing content | Standard |
| Internal | Business information | Documentation | Access control |
| Confidential | Sensitive business data | Customer data | Encryption + access control |
| Restricted | Highly sensitive | Credentials, keys | Encryption + strict access |

### 3.2 Data Types

| Data Type | Classification | Retention | Location |
|-----------|---------------|-----------|----------|
| Audit logs | Confidential | 7 years | `audit_logs` |
| Security events | Confidential | 7 years | `security_events` |
| Job executions | Internal | 2 years | `job_executions` |
| System metrics | Internal | 1 year | `agent_system_metrics` |
| Agent data | Confidential | While active | `agents` |
| User credentials | Restricted | While active | Auth system |

---

## 4. Retention Requirements

### 4.1 Compliance-Driven Retention
- LGPD: Data subject rights respected
- SOC 2: Audit evidence preserved
- Legal holds: Data preserved as required

### 4.2 Retention Schedule

| Data Category | Minimum | Maximum | Deletion Method |
|---------------|---------|---------|-----------------|
| Audit evidence | 7 years | 10 years | Secure delete |
| Operational data | 1 year | 3 years | Automated cleanup |
| Temporary data | 24 hours | 7 days | Automated cleanup |
| Backup data | 30 days | 90 days | Rotation |

### 4.3 Automated Cleanup
- Cleanup jobs run on schedule
- Deletion is logged
- Confirmation before permanent deletion

---

## 5. Data Handling

### 5.1 Storage
- Data is stored in secure databases
- Encryption at rest where applicable
- Access controlled by RLS

### 5.2 Transmission
- All data transmitted over TLS
- API calls authenticated
- HMAC for agent communication

### 5.3 Deletion
- Soft delete used where audit required
- Hard delete only after retention period
- Deletion is logged and verified

---

## 6. LGPD Compliance

### 6.1 Data Subject Rights
- Right to access: Data can be exported
- Right to rectification: Data can be corrected
- Right to deletion: Request processing defined
- Right to portability: Export in standard format

### 6.2 Processing Records
- All processing activities documented
- Legal basis identified
- Retention justification provided

---

## 7. Technical Evidences

| Control | Implementation | Evidence |
|---------|----------------|----------|
| Data separation | Dedicated tables | Schema design |
| Retention | Cleanup jobs | Automated processes |
| Non-repudiation | Immutable logs | Log policies |
| LGPD readiness | Soft delete | Delete flags |

---

## 8. Backup

### 8.1 Backup Schedule
- Database: Daily
- Configuration: On change
- Logs: Continuous

### 8.2 Backup Retention
- Daily backups: 7 days
- Weekly backups: 4 weeks
- Monthly backups: 12 months

### 8.3 Recovery Testing
- Backup restoration tested quarterly
- Results documented
- Issues remediated

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | [DATE] | [AUTHOR] | Initial version |
