# ADR Index — Architecture Decision Records

| Campo | Valor |
|-------|-------|
| **Código** | ADR-IDX-001 |
| **Total de ADRs** | 42+ |
| **Última Atualização** | 2025-01-01 |

---

## Índice por Categoria

### 🔐 Segurança e Criptografia
| ADR | Título | Status |
|-----|--------|:------:|
| ADR-004 | Ed25519 Payload Signing (SSA-004) | ✅ Aceito |
| ADR-023 | RLS Hardening & Secure Views | ✅ Aceito |
| ADR-026 | Multi-Tenant Isolation Standard | ✅ Aceito |
| - | HMAC Validation Payload Standardization | ✅ Aceito |
| - | Agent Cryptographic Identity & Rotation | ✅ Aceito |
| - | Zero Trust Supply Chain (Ed25519) | ✅ Aceito |
| - | Security Invariants (INV-001 to INV-006) | ✅ Aceito |
| - | Audit Trail Immutability (Triggers) | ✅ Aceito |
| - | SECURITY DEFINER Hardening Standard | ✅ Aceito |

### 🤖 Agente
| ADR | Título | Status |
|-----|--------|:------:|
| - | Agent v5.0.13 Deployment Standards | ✅ Aceito |
| - | Agent TOCTOU Self-Healing | ✅ Aceito |
| - | Agent Update Verification (Fail-Open/Closed) | ✅ Aceito |
| - | Agent Fingerprint Validation (Method 0) | ✅ Aceito |
| - | Agent Script Header Integrity | ✅ Aceito |
| - | Agent Identity Recovery & Isolation | ✅ Aceito |
| - | Agent Local Detection & Remediation | ✅ Aceito |

### 🏗️ Infraestrutura
| ADR | Título | Status |
|-----|--------|:------:|
| - | Enrollment Key Security & Provisioning | ✅ Aceito |
| - | Edge Function Internal Security (X-Internal-Secret) | ✅ Aceito |
| - | Agent Script Delivery Endpoint Constraint | ✅ Aceito |
| - | Installer Script Robustness Standard | ✅ Aceito |
| - | Tenant Isolation Table Tiering | ✅ Aceito |

### ⚙️ Automação e Governança
| ADR | Título | Status |
|-----|--------|:------:|
| - | Automation Governance Safeguards v2 | ✅ Aceito |
| - | Zero-Gap Integrity Framework | ✅ Aceito |
| - | Super Admin Context Scoping | ✅ Aceito |
| - | Approval System RLS Governance | ✅ Aceito |

---

## Como Criar um Novo ADR

1. Criar arquivo em `docs/adr/ADR-XXX-titulo.md`
2. Usar template padrão (Contexto, Decisão, Consequências)
3. Status: Proposto → Aceito/Rejeitado → Superseded
4. Atualizar este índice

---

## Histórico

| Versão | Data | Autor | Alterações |
|--------|------|-------|------------|
| 1.0 | 2025-01-01 | CyberShield Engineering | Índice inicial |
