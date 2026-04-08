
## Migração de Edge Functions para Middleware Padronizado

### Diagnóstico Atual
Das 75 edge functions do projeto:
- **61 já usam middleware** (serveTenant, servePublic, serveAgent, serveInternal) ✅
- **6 são exceções justificadas** (HMAC/raw body): `enroll-agent`, `poll-jobs`, `register-agent-key`, `submit-job-result`, `heartbeat`, `submit-processes` — precisam de acesso ao body raw para verificação HMAC
- **3 são gateways/roteadores** justificados: `api-gateway`, `ops-gateway`, `public-gateway`
- **4 são integrações externas** justificadas: `saml-sso`, `scim-provisioning`, `stripe-webhook`
- **2 precisam migrar para `serveTenant`**: `check-subscription`, `create-checkout` (autenticação JWT do usuário)
- **2 precisam migrar para `serveInternal`**: `check-tenant-abuse` (cron interno, sem tenant)

### Plano de Execução (3 Batches)

#### Batch 1 — `serveTenant` (funções chamadas pelo frontend com JWT do usuário)
| Função | Linhas | Middleware Alvo | Motivo |
|--------|--------|----------------|--------|
| `check-subscription` | 127 | `serveTenant` | Valida JWT + tenant para checar Stripe |
| `create-checkout` | 91 | `serveTenant` | Valida JWT + tenant para criar sessão Stripe |

**O que muda:**
- Remove boilerplate manual: CORS, auth JWT, criação de supabase client
- `ctx.tenantId`, `ctx.userId`, `ctx.supabase` vêm prontos do middleware
- Mantém lógica Stripe intacta

#### Batch 2 — `serveInternal` (funções internas/cron)
| Função | Linhas | Middleware Alvo | Motivo |
|--------|--------|----------------|--------|
| `check-tenant-abuse` | 140 | `serveInternal` | Chamada por cron, sem contexto de tenant |

**O que muda:**
- Remove validação manual de service_role
- `ctx.supabase` (service_role) vem do middleware
- Mantém lógica de detecção de abuso intacta

#### Batch 3 — Validação e Deploy
1. Deploy das 3 funções migradas
2. Testar cada uma via `curl_edge_functions`
3. Verificar logs de execução

### Exceções Documentadas (13 funções — NÃO migrar)
| Função | Justificativa |
|--------|--------------|
| `enroll-agent` | HMAC body raw |
| `poll-jobs` | HMAC body raw |
| `register-agent-key` | HMAC body raw |
| `submit-job-result` | HMAC body raw |
| `heartbeat` | HMAC body raw |
| `submit-processes` | HMAC body raw + agent auth custom |
| `api-gateway` | Roteador gateway |
| `ops-gateway` | Roteador gateway |
| `public-gateway` | Roteador gateway |
| `saml-sso` | Protocolo SAML custom |
| `scim-provisioning` | Protocolo SCIM custom |
| `stripe-webhook` | Webhook signature verification |

### Ganhos
- **Eliminação de ~200 linhas** de boilerplate duplicado (CORS, auth, client creation)
- **Segurança**: Validação de tenant e rate-limiting centralizados
- **Observabilidade**: requestId e logging estruturado automáticos
- **Zero breaking changes**: Assinaturas HTTP permanecem idênticas
