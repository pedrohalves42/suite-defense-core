# Security Invariants Changelog

> **Histórico de Alterações dos Invariantes de Segurança**  
> Referência: [SECURITY_INVARIANTS.md](./SECURITY_INVARIANTS.md)

---

## Política de Versionamento

### Semântica de Versão

- **MAJOR** (X.0.0): Breaking change em invariante existente
- **MINOR** (0.X.0): Novo invariante ou expansão de cobertura
- **PATCH** (0.0.X): Correção de documentação ou clarificação

### Breaking Changes

Um breaking change ocorre quando:
1. Um invariante é **removido** ou **relaxado**
2. A definição formal é **alterada** de forma incompatível
3. Testes existentes precisam ser **reescritos**

---

## Histórico de Versões

### [1.4.0] - 2026-01-31

#### Added
- **Histórico de Remediações Vellum** (V-601 a V-610)
  - Documentação completa de todas as correções de auditoria
  - Rastreabilidade de severidade e resolução

#### Fixed
- **V-609**: View `v_risk_debt_summary` corrigida com filtro explícito `tenant_id = get_active_tenant_id()`
- **V-610**: Trigger DLQ corrigido com `RETURNING id INTO v_event_id` para `decision_event_id`
  - 100% dos novos registros resolvidos têm rastreabilidade
  - Backfill de 2.047 registros históricos

#### Changed
- **INV-005**: Atualizada evidência de conformidade para incluir DLQ audit trail
  - Trigger V-610 funcional com RETURNING clause
  - Coverage de hash em audit_logs mantida em 100%

### [1.1.0] - 2025-12-17

#### Added
- **INV-006: Deterministic Network Enforcement** (v1.0.0)
  - Garantia de que domínios bloqueados retornam NXDOMAIN
  - Testes E2E para DNS Local Filter
  - CWE-441, CWE-923

- **Versionamento Individual** por invariante
- **Mapeamento CWE/OWASP** completo
- **CI Gate obrigatório** bloqueando merge
- **Artefato de Evidência Imutável** (JSON + SHA256 + Meta)

#### Changed
- **INV-002**: Adicionada validação estrita de 64 caracteres hex
  - Versão: 1.0.0 → 1.1.0
  - Removido fallback UTF-8

### [1.0.0] - 2025-12-17

#### Added
- **INV-001: Cross-Tenant Isolation** (v1.0.0)
  - Isolamento absoluto entre tenants
  - RLS + Views + Edge Functions
  - CWE-284, CWE-639, CWE-862

- **INV-002: HMAC Authentication** (v1.0.0)
  - Autenticação obrigatória para agentes
  - Proteção contra replay attacks
  - CWE-294, CWE-345, CWE-347

- **INV-003: Script Integrity** (v1.0.0)
  - Verificação SHA256 de scripts
  - Validação de versões registradas
  - CWE-494, CWE-354

- **INV-004: AI Data Isolation** (v1.0.0)
  - Sanitização de inputs para IA
  - Isolamento de dados por tenant
  - CWE-89, CWE-200, CWE-209

- **INV-005: Fail-Closed Behavior** (v1.0.0)
  - Negação em caso de erro
  - Circuit breakers em serviços críticos
  - CWE-754, CWE-636

- Testes E2E de violação (`e2e/security-invariants.spec.ts`)
- Documentação formal matemática

---

## Mapeamento CWE/OWASP Completo

| Invariante | CWE IDs | OWASP Top 10 |
|------------|---------|--------------|
| INV-001 | CWE-284, CWE-639, CWE-862 | A01:2021 Broken Access Control |
| INV-002 | CWE-294, CWE-345, CWE-347 | A07:2021 Identification and Authentication Failures |
| INV-003 | CWE-494, CWE-354 | A08:2021 Software and Data Integrity Failures |
| INV-004 | CWE-89, CWE-200, CWE-209 | A03:2021 Injection |
| INV-005 | CWE-754, CWE-636 | A05:2021 Security Misconfiguration |
| INV-006 | CWE-441, CWE-923 | A01:2021 Broken Access Control |

---

## CWE Details

### CWE-284: Improper Access Control
- **Invariante**: INV-001
- **Mitigação**: RLS policies em 100% das tabelas

### CWE-294: Authentication Bypass by Capture-replay
- **Invariante**: INV-002
- **Mitigação**: Nonce único por requisição + tabela `hmac_signatures`

### CWE-345: Insufficient Verification of Data Authenticity
- **Invariante**: INV-002
- **Mitigação**: HMAC-SHA256 com validação estrita de formato

### CWE-347: Improper Verification of Cryptographic Signature
- **Invariante**: INV-002
- **Mitigação**: Validação de 64 caracteres hex, sem fallback

### CWE-354: Improper Validation of Integrity Check Value
- **Invariante**: INV-003
- **Mitigação**: SHA256 recalculado antes de servir scripts

### CWE-441: Unintended Proxy or Intermediary
- **Invariante**: INV-006
- **Mitigação**: DNS resolver local retorna NXDOMAIN para bloqueados

### CWE-494: Download of Code Without Integrity Check
- **Invariante**: INV-003
- **Mitigação**: Agente valida hash antes de aplicar atualização

### CWE-636: Not Failing Securely
- **Invariante**: INV-005
- **Mitigação**: Fail-closed em todas as validações de segurança

### CWE-639: Authorization Bypass Through User-Controlled Key (IDOR)
- **Invariante**: INV-001
- **Mitigação**: RLS + tenant_id obrigatório em todas as queries

### CWE-754: Improper Check for Unusual or Exceptional Conditions
- **Invariante**: INV-005
- **Mitigação**: Erros de segurança sempre negam acesso

### CWE-862: Missing Authorization
- **Invariante**: INV-001
- **Mitigação**: Views com security_invoker = on

### CWE-923: Improper Restriction of Communication Channel to Intended Endpoints
- **Invariante**: INV-006
- **Mitigação**: Bloqueio determinístico via hosts + DNS

---

## Responsáveis

| Versão | Autor | Aprovador | Data |
|--------|-------|-----------|------|
| 1.4.0 | CyberShield Security | Security Lead | 2026-01-31 |
| 1.1.0 | CyberShield Security | Security Lead | 2025-12-17 |
| 1.0.0 | CyberShield Security | Security Lead | 2025-12-17 |

---

## Referências

- [CWE Top 25 Most Dangerous Software Weaknesses](https://cwe.mitre.org/top25/)
- [OWASP Top 10:2021](https://owasp.org/Top10/)
- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework)
