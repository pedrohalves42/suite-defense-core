# Inventário de Ativos

| Campo | Valor |
|-------|-------|
| **Código** | AST-001 |
| **Versão** | 1.0 |
| **Status** | Aprovado |
| **Responsável** | CTO |
| **Data Efetiva** | 2025-01-01 |
| **Revisão** | 2026-01-01 |

---

## 1. Objetivo

Manter inventário completo de todos os componentes técnicos do CyberShield para gestão de riscos, compliance e resposta a incidentes.

---

## 2. Componentes de Infraestrutura

| Componente | Provider | Tipo | Classificação |
|-----------|----------|------|---------------|
| Banco de Dados PostgreSQL | Lovable Cloud | PaaS | Crítico |
| Edge Functions (Deno) | Lovable Cloud | Serverless | Crítico |
| Autenticação (GoTrue) | Lovable Cloud | PaaS | Crítico |
| Storage | Lovable Cloud | PaaS | Alto |
| Frontend Hosting | Lovable CDN | CDN | Alto |
| DNS | Configurável | SaaS | Alto |
| CI/CD | GitHub Actions | SaaS | Médio |
| Pagamentos | Stripe | SaaS | Alto |

---

## 3. Edge Functions (Backend)

| Função | Finalidade | Criticidade | Autenticação |
|--------|-----------|-------------|--------------|
| `poll-jobs` | Entrega de jobs aos agentes | Crítica | X-Agent-Token |
| `submit-job-result` | Recebimento de resultados | Crítica | HMAC + Token |
| `heartbeat` | Telemetria do agente | Crítica | X-Agent-Token |
| `register-agent` | Registro de novos agentes | Alta | Enrollment Key |
| `register-agent-key` | Registro de chaves ECDSA | Alta | X-Agent-Token |
| `serve-installer` | Entrega de scripts de instalação | Alta | Enrollment Key |
| `upload-release-content` | Upload de releases | Alta | Internal Secret |
| `create-checkout` | Checkout Stripe | Média | JWT |
| `stripe-webhook` | Webhook de pagamentos | Alta | Stripe Signature |
| `notify-dispatch` | Despacho de notificações | Média | Internal Secret |
| `soar-execute` | Execução de playbooks SOAR | Alta | Internal Secret |

---

## 4. Tabelas do Banco de Dados

### 4.1 Tabelas Críticas (dados sensíveis)

| Tabela | Dados | RLS | Tenant Isolation |
|--------|-------|:---:|:----------------:|
| `agents` | Dados de agentes + HMAC secrets | ✅ | ✅ |
| `agent_tokens` | Hashes de tokens de autenticação | ✅ | ✅ |
| `enrollment_keys` | Chaves de provisionamento (hash) | ✅ | ✅ |
| `profiles` | Dados de usuários | ✅ | ✅ |
| `user_roles` | Roles e permissões | ✅ | ✅ |
| `api_keys` | Chaves de API (hash) | ✅ | ✅ |
| `agent_signing_keys` | Chaves ECDSA públicas | ✅ | ✅ |

### 4.2 Tabelas Operacionais

| Tabela | Dados | RLS | Tenant Isolation |
|--------|-------|:---:|:----------------:|
| `jobs` | Jobs/comandos para agentes | ✅ | ✅ |
| `job_executions` | Resultados de execução | ✅ | ✅ |
| `vuln_findings` | Vulnerabilidades detectadas | ✅ | ✅ |
| `soar_playbooks` | Playbooks de automação | ✅ | ✅ |
| `alert_rules` | Regras de alerta | ✅ | ✅ |

### 4.3 Tabelas de Auditoria (Imutáveis)

| Tabela | Proteção | Trigger |
|--------|----------|---------|
| `audit_logs` | Append-only | `BEFORE UPDATE/DELETE → RAISE EXCEPTION` |
| `security_logs` | Append-only | `BEFORE UPDATE/DELETE → RAISE EXCEPTION` |
| `agent_evidence_logs` | Append-only | `BEFORE UPDATE/DELETE → RAISE EXCEPTION` |
| `domain_events` | Append-only | `BEFORE UPDATE/DELETE → RAISE EXCEPTION` |

---

## 5. Views Seguras

| View | Finalidade | Security |
|------|-----------|----------|
| `agents_safe` | Dados de agentes sem secrets | `security_invoker=on`, `security_barrier=true` |
| `agents_public` | Dados públicos mínimos | `security_invoker=on`, `security_barrier=true` |
| `invites_safe` | Convites sem tokens | `security_invoker=on`, `security_barrier=true` |
| `enrollment_keys_safe` | Chaves mascaradas | `security_invoker=on`, `security_barrier=true` |
| `active_agents` | Agentes ativos (não arquivados) | `security_invoker=on`, `security_barrier=true` |

---

## 6. RPCs (Remote Procedure Calls)

| Categoria | Quantidade | Security |
|-----------|:----------:|----------|
| SECURITY DEFINER com tenant guard | 44+ | `_assert_caller_tenant()` |
| SECURITY DEFINER com super_admin guard | 8+ | `_assert_service_role_or_super_admin()` |
| Public RPCs | 0 | N/A |

---

## 7. Agente Windows

| Componente | Versão Atual | Tecnologia |
|-----------|-------------|------------|
| Script Principal | v5.0.13 | PowerShell 5.1+ |
| Assinatura de Releases | Ed25519 | Web Crypto API |
| Assinatura de Resultados | ECDSA-P256 | .NET |
| Tarefa Agendada | CyberShield Agent | Windows Task Scheduler |
| Diretório | C:\CyberShield\ | Hardcoded |

---

## 8. Integrações de Terceiros

| Serviço | Tipo | Dados Trocados | Risco |
|---------|------|----------------|-------|
| Stripe | Pagamentos | Email, nome, plano | Médio |
| GitHub Actions | CI/CD | Hashes de build | Baixo |
| Lovable Cloud | Infraestrutura | Todos os dados | Alto |

---

## 9. Secrets e Chaves

| Secret | Armazenamento | Rotação |
|--------|---------------|---------|
| `ED25519_PRIVATE_KEY` | CyberShield Cloud Vault | Anual |
| `INTERNAL_SECRET` | Supabase Vault | Trimestral |
| `STRIPE_SECRET_KEY` | Supabase Vault | Trimestral |
| `STRIPE_WEBHOOK_SECRET` | Supabase Vault | Por necessidade |
| HMAC Secrets (por agente) | DB (RLS protected) | Na reinstalação |

---

## 10. Manutenção

- Inventário revisado **trimestralmente**
- Novos componentes devem ser registrados **antes** do deploy em produção
- Componentes descontinuados devem ser marcados e removidos

---

## Histórico

| Versão | Data | Autor | Alterações |
|--------|------|-------|------------|
| 1.0 | 2025-01-01 | CyberShield Engineering | Versão inicial |
