# Edge Functions — Documentação

> Atualizado em 13/03/2026 | Sprint 21

## Visão Geral

O CyberShield utiliza Edge Functions (Deno) para lógica de backend. Após a consolidação do Sprint 21, as funções são organizadas nas categorias abaixo.

---

## 🔧 Funções Consolidadas (Sprint 21)

### `system-maintenance`
**Substitui:** `cleanup-stale-updates`, `cleanup-stale-reports`, `cleanup-stale-playbooks`, `cleanup-stuck-builds`, `cleanup-stuck-jobs`, `cleanup-offline-agents-jobs`, `security-cleanup-cron`

| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| `tasks` | `string[]` | Tarefas a executar. Se omitido, executa todas. |

**Tarefas disponíveis:** `stale_updates`, `stale_reports`, `stale_playbooks`, `stuck_builds`, `stuck_jobs`, `offline_agents_jobs`, `security_cleanup`

**Auth:** Internal (cron / service_role / X-Internal-Secret)

---

### `notification-dispatcher`
**Substitui:** `send-alert-email`, `send-health-alert`, `send-security-alert`, `send-security-notification`, `send-system-alert`, `send-brute-force-alert`, `send-notification`, `send-report-notification`, `send-trial-reminder`, `send-welcome-email`

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `channel` | `email\|telegram\|whatsapp\|in_app` | ✅ | Canal de envio |
| `type` | `string` | ✅ | Tipo (alert, health, security, welcome, etc.) |
| `tenant_id` | `uuid` | ✅ | Tenant destino |
| `message` | `string` | ✅ | Corpo da notificação |
| `subject` | `string` | ❌ | Assunto |
| `severity` | `info\|warning\|critical` | ❌ | Severidade (padrão: info) |
| `recipients` | `string[]` | ❌ | Destinatários específicos |
| `metadata` | `object` | ❌ | Dados adicionais |

**Auth:** Internal ou JWT com role admin/super_admin  
**Fallback:** Se canal externo não configurado, grava como `in_app`

---

### `release-sync`
**Substitui:** `sync-release-content`, `sync-release-from-codebase`, `sync-release-from-repo`, `sync-agent-script`, `sync-scripts-direct`

| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| `action` | `sync_content\|sync_from_repo\|sync_all\|validate` | Ação (padrão: sync_all) |
| `platform` | `windows\|linux` | Filtro por plataforma |
| `version` | `string` | Filtro por versão |

**Auth:** Internal (cron / service_role / X-Internal-Secret)

---

## 📂 Categorias de Funções

### 🤖 Agente (Comunicação)
| Função | Descrição | Auth |
|--------|-----------|------|
| `agent-heartbeat` | Recebe heartbeat dos agentes | Agent Token |
| `agent-health-check` | Verifica saúde do agente | Agent Token |
| `agent-snapshot` | Captura snapshot do estado | Agent Token |
| `enroll-agent` | Enrollment de novo agente | Enrollment Key |
| `poll-jobs` | Agente busca jobs pendentes | Agent Token |
| `ack-job` | Agente confirma recebimento | Agent Token |
| `submit-job-result` | Agente envia resultado | Agent Token |
| `get-agent-config` | Configuração do agente | Agent Token |
| `get-agent-policy` | Política aplicada | Agent Token |
| `serve-agent-update` | Serve binário de atualização | Agent Token |

### 🔐 Autenticação & Usuários
| Função | Descrição | Auth |
|--------|-----------|------|
| `change-password` | Altera senha | JWT |
| `admin-create-user` | Admin cria usuário | JWT (admin) |
| `update-user-role` | Altera role do usuário | JWT (admin) |
| `update-user-status` | Ativa/desativa usuário | JWT (admin) |
| `list-users` | Lista usuários do tenant | JWT |
| `send-invite` | Envia convite | JWT (admin) |
| `validate-invite` | Valida token de convite | Public |
| `accept-invite` | Aceita convite | Public |

### 🛡️ Segurança & Remediação
| Função | Descrição | Auth |
|--------|-----------|------|
| `auto-remediate` | Executa remediação automática | Internal |
| `auto-quarantine` | Quarentena automática | Internal |
| `create-job` | Cria job de remediação | JWT (admin) |
| `evaluate-automation-rules` | Avalia regras SOAR | Internal |
| `rollback-remediation` | Reverte remediação | JWT (admin) |
| `scan-vulnerabilities` | Scan de vulnerabilidades | Internal |
| `block-website` | Bloqueia website | JWT (admin) |

### 🧠 IA & Análise
| Função | Descrição | Auth |
|--------|-----------|------|
| `ai-get-insights` | Insights de IA | JWT |
| `ai-analyze-agent` | Análise de agente | JWT |
| `ai-security-copilot` | Copiloto de segurança | JWT |
| `ai-correlate-alerts` | Correlação de alertas | Internal |
| `ai-predict-agent-failure` | Predição de falhas | Internal |
| `ai-full-audit` | Auditoria completa | JWT (admin) |

### 💰 Billing & Stripe
| Função | Descrição | Auth |
|--------|-----------|------|
| `create-checkout` | Cria sessão Stripe Checkout | JWT |
| `stripe-webhook` | Webhook do Stripe | Stripe Signature |
| `check-subscription` | Verifica assinatura | JWT |
| `manage-subscription` | Gerencia assinatura | JWT |

### 📊 Relatórios
| Função | Descrição | Auth |
|--------|-----------|------|
| `generate-executive-report` | Relatório executivo PDF | JWT (admin) |
| `generate-compliance-report` | Relatório de compliance | JWT (admin) |
| `generate-security-report` | Relatório de segurança | JWT (admin) |
| `auto-generate-report` | Geração automática | Internal |

### 🔄 Manutenção (Cron)
| Função | Descrição | Auth |
|--------|-----------|------|
| `system-maintenance` | **Consolidada** — 7 cleanups em 1 | Internal |
| `maintenance-cron` | Orquestrador de manutenção | Internal |
| `cron-sentinel` | Monitora saúde dos crons | Internal |
| `reset-daily-quotas` | Reset de cotas diárias | Internal |

### 📨 Notificações
| Função | Descrição | Auth |
|--------|-----------|------|
| `notification-dispatcher` | **Consolidada** — 10 notificações em 1 | Internal/JWT |
| `dispatch-notification` | Dispatcher legado (mantido por compatibilidade) | Internal/JWT |
| `dispatch-webhook-notification` | Webhooks externos | Internal |

### 📦 Release & Deploy
| Função | Descrição | Auth |
|--------|-----------|------|
| `release-sync` | **Consolidada** — 5 syncs em 1 | Internal |
| `register-agent-release` | Registra nova release | JWT (admin) |
| `sign-release` | Assina release (Ed25519) | Internal |
| `build-agent-exe` | Compila agente | JWT (admin) |
| `generate-enrollment-key` | Gera chave de enrollment | JWT (admin) |

---

## 🔒 Padrões de Segurança

1. **serve-tenant.ts** — Middleware padrão para funções user-facing (valida JWT + tenant)
2. **assert-internal-caller.ts** — Guard para funções cron/internas
3. **Isolamento multi-tenant** — Todas as queries filtram por `tenant_id`
4. **HMAC** — Comunicação agente↔servidor autenticada
5. **Rate limiting** — `rate-limit-check` para proteção de endpoints

---

## 📋 Variáveis de Ambiente Necessárias

| Variável | Obrigatória | Descrição |
|----------|-------------|-----------|
| `SUPABASE_URL` | ✅ | URL do projeto (auto-configurada) |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Chave service_role (auto-configurada) |
| `SUPABASE_ANON_KEY` | ✅ | Chave anon (auto-configurada) |
| `INTERNAL_FUNCTION_SECRET` | ✅ | Secret para chamadas internas |
| `TELEGRAM_BOT_TOKEN` | ❌ | Token do bot Telegram |
| `ED25519_PRIVATE_KEY` | ❌ | Chave para assinatura de releases |
| `STRIPE_SECRET_KEY` | ❌ | Chave do Stripe |
| `STRIPE_WEBHOOK_SECRET` | ❌ | Secret do webhook Stripe |
