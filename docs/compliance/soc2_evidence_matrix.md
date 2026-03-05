# SOC 2 Evidence Matrix

| Campo | Valor |
|-------|-------|
| **Código** | SOC2-MAT-001 |
| **Versão** | 1.0 |
| **Target** | SOC 2 Type I → Type II |

---

## CC1 — Control Environment

| Controle | Evidência | Localização |
|----------|----------|-------------|
| CC1.1 Commitment to integrity | Política ISP-001 | `docs/policies/01_information_security_policy.md` |
| CC1.2 Board oversight | Risk Assessment Matrix | `docs/compliance/risk_assessment_matrix.md` |
| CC1.3 Organizational structure | RBAC (`user_roles`) | Database schema |
| CC1.4 Competence | Training Program SAT-001 | `docs/policies/14_security_awareness_training.md` |
| CC1.5 Accountability | Audit trail imutável | `audit_logs` + triggers |

## CC2 — Communication & Information

| Controle | Evidência | Localização |
|----------|----------|-------------|
| CC2.1 Internal communication | Políticas documentadas | `docs/policies/*` |
| CC2.2 External communication | Privacy Policy PDP-001 | `docs/policies/10_privacy_lgpd_policy.md` |
| CC2.3 External parties | DPA, ToS, Vendor Risk | `docs/legal/*`, `docs/policies/07_vendor_risk_policy.md` |

## CC3 — Risk Assessment

| Controle | Evidência | Localização |
|----------|----------|-------------|
| CC3.1 Risk objectives | Risk Matrix RAM-001 | `docs/compliance/risk_assessment_matrix.md` |
| CC3.2 Risk identification | 17 riscos mapeados | RAM-001 |
| CC3.3 Fraud risk | Security invariants INV-001-006 | `docs/SECURITY_INVARIANTS.md` |
| CC3.4 Change risk | Change Management Policy | `docs/policies/03_change_management_policy.md` |

## CC6 — Logical & Physical Access

| Controle | Evidência | Localização |
|----------|----------|-------------|
| CC6.1 Logical access | RBAC + RLS | `user_roles`, RLS policies |
| CC6.2 Authentication | JWT + HMAC + MFA | Auth system, `agents.hmac_secret` |
| CC6.3 Registration/authorization | Enrollment keys, invite system | `enrollment_keys`, `invites` |
| CC6.4 Access restrictions | Least privilege roles | ACP-001 |
| CC6.5 Access removal | Deprovisioning procedure | ACP-001 §6.3 |
| CC6.6 System boundaries | Network isolation, TLS 1.3 | Infrastructure |
| CC6.7 Threat management | Vuln management VMP-001 | `docs/policies/12_vulnerability_management_policy.md` |
| CC6.8 Cryptographic controls | CRP-001 | `docs/policies/11_cryptography_policy.md` |

## CC7 — System Operations

| Controle | Evidência | Localização |
|----------|----------|-------------|
| CC7.1 Infrastructure monitoring | Logging Policy LMP-005 | `docs/policies/05_logging_monitoring_policy.md` |
| CC7.2 Anomaly detection | Circuit breaker, alert rules | `check_global_circuit_breaker`, `alert_rules` |
| CC7.3 Security incident management | PRI-001 + 7 playbooks | `docs/procedures/incident_response_plan.md` |
| CC7.4 Business continuity | BCP-008 + DRP-001 | `docs/policies/08_*`, `docs/procedures/disaster_recovery_plan.md` |
| CC7.5 Recovery from incidents | DRP procedures | DRP-001 |

## CC8 — Change Management

| Controle | Evidência | Localização |
|----------|----------|-------------|
| CC8.1 Change authorization | CAB Charter, ADRs | `docs/compliance/cab_charter.md`, `docs/adr/` |

## CC9 — Risk Mitigation

| Controle | Evidência | Localização |
|----------|----------|-------------|
| CC9.1 Vendor risk | Vendor Risk Policy | `docs/policies/07_vendor_risk_policy.md` |
| CC9.2 Vendor assessment | Third-party map TIM-001 | `docs/compliance/third_party_integrations_map.md` |

## PI1 — Privacy

| Controle | Evidência | Localização |
|----------|----------|-------------|
| PI1.1 Privacy notice | PDP-001 | `docs/policies/10_privacy_lgpd_policy.md` |
| PI1.2 Consent/choice | LIA documented | PDP-001 §13 |
| PI1.3 Collection limitation | Data minimization | ROPA-001 |
| PI1.4 Use limitation | Purpose limitation | ROPA-001 |
| PI1.5 Retention | Retention policy | `docs/policies/06_data_retention_policy.md` |
| PI1.6 Access rights | Titular rights Art. 18 | PDP-001 §8 |

---

## Histórico

| Versão | Data | Autor | Alterações |
|--------|------|-------|------------|
| 1.0 | 2025-01-01 | CyberShield Security | Versão inicial |
