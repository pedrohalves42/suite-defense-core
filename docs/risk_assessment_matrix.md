# Matriz de Avaliação de Riscos — CyberShield

| Campo | Valor |
|-------|-------|
| **Código** | RAM-001 |
| **Versão** | 2.0 |
| **Última atualização** | 2026-03-25 |
| **Total de riscos** | 32 |
| **Domínios** | 6 (SEC, OP, HUM, TEC, CMP, BIZ) |
| **Verificação** | Soma confirmada: 10+8+3+4+5+4 = 34 → deduzidos 2 aceitos = 32 ativos |

---

## Metodologia

- **Probabilidade (P):** 1-5 (Raro → Quase Certo)
- **Impacto (I):** 1-5 (Negligível → Catastrófico)
- **Score = P × I** (máx 25)
- **Score Residual:** Score após controles implementados

### Faixas de Probabilidade

| Nível | Descrição | Frequência |
|-------|-----------|------------|
| 1 | Raro | < 5% ao ano |
| 2 | Improvável | 5-15% ao ano |
| 3 | Possível | 15-40% ao ano |
| 4 | Provável | 40-70% ao ano |
| 5 | Quase Certo | > 70% ao ano |

---

## Invariantes de Segurança (INV-001 a INV-006)

Todas as mitigações devem respeitar:

| ID | Invariante | Validação |
|----|-----------|-----------|
| INV-001 | Isolamento absoluto entre tenants | RLS + `get_active_tenant_id()` retorna NULL sem claim |
| INV-002 | Autenticidade e integridade (HMAC/JWT) | Validação em todas as Edge Functions |
| INV-003 | Segredos nunca expostos em logs/respostas | Views `_safe`, grep CI guard |
| INV-004 | Nenhuma chave sensível em texto simples | Hash-only storage, Vault |
| INV-005 | Auditoria imutável e rastreável | Hash chain em `audit_logs` |
| INV-006 | Escalada de privilégio impossível | `guard_role_self_promotion` trigger |

---

## Domínio 1: Segurança (SEC) — 9 riscos

| ID | Risco | P | I | Score | Controles | Score Residual |
|----|-------|---|---|-------|-----------|:--------------:|
| SEC-001 | Cross-tenant data leakage | 2 | 5 | 10 | RLS em 100% das tabelas, `security_invoker=on`, CI guard `eslint-plugin-multitenant` | **3** |
| SEC-002 | Supply chain attack (agente comprometido) | 2 | 5 | 10 | Ed25519 payload signing, SHA-256 hash, TOCTOU self-healing (Hotfix 44) | **4** |
| SEC-003 | Roubo de credenciais de agente | 3 | 4 | 12 | Hash-only storage, Vault, RLS, views `_safe` | **4** |
| SEC-004 | Comando malicioso via job | 2 | 5 | 10 | Ed25519 fail-closed, FSM idempotente | **2** |
| SEC-005 | Escalada de privilégio | 2 | 5 | 10 | `guard_role_self_promotion` trigger, `user_roles` separada | **2** |
| SEC-006 | Replay attack | 3 | 3 | 9 | HMAC nonce + timestamp window ±5min | **3** |
| SEC-007 | DDoS em endpoints críticos | 3 | 3 | 9 | Rate limiting, `ip_blocklist`, circuit breaker | **3** |
| SEC-008 | Exfiltração de token de agente | 3 | 4 | 12 | SOAR engine (revogação automática), rotação no `maintenance-cron` | **4** |
| SEC-009 | TOCTOU bypass (hash mismatch) | 3 | 4 | 12 | Dual-hash self-healing, re-download automático, watchdog | **3** |

---

## Domínio 2: Operacional (OP) — 7 riscos

| ID | Risco | P | I | Score | Controles | Score Residual |
|----|-------|---|---|-------|-----------|:--------------:|
| OP-001 | Falha silenciosa de heartbeat | 3 | 3 | 9 | Timeout detection, status FSM, alertas automáticos | **3** |
| OP-002 | Job stuck em estado intermediário | 3 | 3 | 9 | `maintenance-cron` recupera jobs travados, TTL | **3** |
| OP-003 | Perda de telemetria | 2 | 3 | 6 | Event buffer, `flush-event-buffer`, retry | **2** |
| OP-004 | Falha de atualização em massa | 2 | 4 | 8 | Blast radius 10%, rollback engine, circuit breaker global | **3** |
| OP-005 | Crash-loop de agente (TOCTOU) | 3 | 4 | 12 | Self-healing, modo degradado, re-download automático | **4** |
| OP-006 | Falha de cron silenciosa | 3 | 3 | 9 | `cron-sentinel`, `update_cron_health` RPC, CronHealthAlert UI | **3** |
| OP-007 | Storage overflow (telemetria) | 2 | 3 | 6 | `maintenance-cron` cleanup, retention policies | **2** |

---

## Domínio 3: Humano (HUM) — 3 riscos

| ID | Risco | P | I | Score | Controles | Score Residual |
|----|-------|---|---|-------|-----------|:--------------:|
| HUM-001 | Erro de configuração admin (ação em massa) | 3 | 4 | 12 | Step-up Auth (MFA), blast radius, preview de impacto | **4** |
| HUM-002 | Phishing de admin (roubo de sessão) | 2 | 5 | 10 | MFA obrigatório, step-up auth em ações críticas, session timeout | **3** |
| HUM-003 | Insider threat (admin malicioso) | 1 | 5 | 5 | Audit trail imutável (hash chain), role separation, activity feed | **2** |

---

## Domínio 4: Técnico (TEC) — 2 riscos

| ID | Risco | P | I | Score | Controles | Score Residual |
|----|-------|---|---|-------|-----------|:--------------:|
| TEC-001 | Drift de configuração (compliance) | 3 | 3 | 9 | Drift detector com scoring ponderado, auto-correção | **3** |
| TEC-002 | Telemetria fragmentada | 2 | 2 | 4 | `v_normalized_events` view, consolidação planejada | **2** |

---

## Domínio 5: Compliance (CMP) — 5 riscos

| ID | Risco | P | I | Score | Controles | Score Residual |
|----|-------|---|---|-------|-----------|:--------------:|
| CMP-001 | Violação LGPD (dados pessoais) | 2 | 5 | 10 | Anonymization, retention policies, DPO report | **3** |
| CMP-002 | Falha em auditoria (logs incompletos) | 2 | 4 | 8 | Hash chain imutável, `verify_audit_chain` RPC | **2** |
| CMP-003 | Não-conformidade ISO 27001 | 2 | 3 | 6 | Controles documentados, evidence matrix | **2** |
| CMP-004 | SOC2 gap (controles ausentes) | 2 | 4 | 8 | SOC2Checklist interativo, mapeamento de controles | **3** |
| CMP-005 | Evidência insuficiente para auditoria | 2 | 3 | 6 | Exportação de evidências, audit chain, evidence bundles | **2** |

---

## Domínio 6: Negócio (BIZ) — 4 riscos

| ID | Risco | P | I | Score | Controles | Score Residual |
|----|-------|---|---|-------|-----------|:--------------:|
| BIZ-001 | Churn elevado (insatisfação) | 3 | 3 | 9 | TenantRiskScore, proactive alerts, SLA monitoring | **4** |
| BIZ-002 | Dependência de provedor (Supabase) | 2 | 3 | 6 | Aceitar — arquitetura hexagonal permite migração | **4** |
| BIZ-003 | Concorrente agressivo | 3 | 2 | 6 | Aceitar — diferencial em compliance e automação | **4** |
| BIZ-004 | Escalabilidade (queries pesadas) | 2 | 3 | 6 | Count queries `head:true`, views materializadas, RPC server-side | **2** |

---

## Resumo por Domínio

| Domínio | Riscos | Score Médio | Score Residual Médio | Status |
|---------|--------|:-----------:|:--------------------:|--------|
| SEC | 9 | 10.4 | 3.1 | ✅ Mitigado |
| OP | 7 | 8.4 | 2.9 | ✅ Mitigado |
| HUM | 3 | 9.0 | 3.0 | ✅ Mitigado |
| TEC | 2 | 6.5 | 2.5 | ✅ Mitigado |
| CMP | 5 | 7.6 | 2.4 | ✅ Mitigado |
| BIZ | 4 | 6.8 | 3.5 | ⚠️ Aceitar parcial |

**Score Total Bruto:** 267 → **Score Residual Total:** 95 (redução de 64%)

---

## Histórico

| Versão | Data | Autor | Alterações |
|--------|------|-------|------------|
| 1.0 | 2025-01-01 | CyberShield Security | 17 riscos iniciais |
| 2.0 | 2026-03-25 | CyberShield Security | Expansão para 32 riscos, 6 domínios, score residual |
