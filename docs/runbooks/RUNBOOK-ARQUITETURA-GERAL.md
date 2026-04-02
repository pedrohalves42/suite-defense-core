# Documentação: Arquitetura Geral do CyberShield

> **Versão:** 5.0.15 | **Última atualização:** 2026-04-02 | **Autor:** Equipe CyberShield

---

## Índice

1. [Visão Geral](#visão-geral)
2. [Componentes Principais](#componentes)
3. [Fluxos de Dados](#fluxos)
4. [Endpoints da API](#endpoints)
5. [Tabelas Críticas](#tabelas)
6. [Processos em Background](#processos-background)
7. [Segurança](#segurança)
8. [Monitoramento](#monitoramento)
9. [Backup e Restore](#backup-restore)
10. [Incidentes Comuns](#incidentes)
11. [Contato com Suporte](#suporte)

---

## Visão Geral

O CyberShield é uma plataforma de **EDR/EPP (Endpoint Detection & Response / Endpoint Protection Platform)** multi-tenant que gerencia agentes de segurança em endpoints Windows, Linux e macOS.

### Arquitetura de Alto Nível

```
┌─────────────┐     ┌──────────────────────┐     ┌──────────────┐
│   Dashboard │────▶│   Backend (Cloud)     │◀────│   Agentes    │
│   (React)   │     │                      │     │ (Win/Lin/Mac)│
└─────────────┘     │  ┌────────────────┐  │     └──────────────┘
                    │  │ Edge Functions  │  │
                    │  │ (Deno Runtime)  │  │
                    │  └────────────────┘  │
                    │  ┌────────────────┐  │
                    │  │   PostgreSQL   │  │
                    │  │   (RLS + RPC)  │  │
                    │  └────────────────┘  │
                    └──────────────────────┘
```

### Stack Tecnológico

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React 18, TypeScript, Tailwind CSS, Vite |
| Backend Functions | Deno (Edge Functions) |
| Banco de Dados | PostgreSQL com RLS |
| Autenticação | Auth integrado + HMAC-SHA256 |
| Agente Windows | PowerShell 5.1+ |
| Agente Unix | Bash 4+ com OpenSSL |

## Componentes Principais {#componentes}

### 1. Dashboard (Frontend)

- SPA React com roteamento client-side
- Arquitetura hexagonal: Domain → Ports → Adapters
- `CryptoPort` / `HmacCryptoAdapter` para operações criptográficas no browser
- Circuit Breaker para resiliência (`src/lib/circuit-breaker.ts`)

### 2. Edge Functions (Backend)

Funções serverless que processam requisições:

| Função | Responsabilidade |
|--------|-----------------|
| `agent-heartbeat` | Recebe heartbeats dos agentes |
| `execute-job` | Despacha jobs para agentes |
| `process-dlq-retries` | Reprocessa jobs da DLQ |
| `auto-remediate` | Motor de remediação automática |
| `register-agent-key` | Registro de chaves públicas ECDSA |
| `force-update` | Força atualização de agentes |
| `evaluate-automation-rules` | Avaliação de regras SOAR |

### 3. Banco de Dados

PostgreSQL com **Row-Level Security (RLS)** para isolamento multi-tenant. Todas as tabelas utilizam `get_active_tenant_id()` para isolamento.

### 4. Agentes

Softwares instalados nos endpoints que:
- Enviam heartbeats periódicos
- Executam jobs (scans, remediações)
- Coletam telemetria (CPU, disco, certificados, software)
- Assinam resultados criptograficamente

## Fluxos de Dados {#fluxos}

### Heartbeat

```
Agente ──(HMAC-SHA256 + nonce)──► Edge Function ──► PostgreSQL
                                                       │
                                                  Atualiza last_seen_at
                                                  Verifica blast radius
```

### Execução de Job

```
Admin cria job ──► PostgreSQL (PENDING)
                      │
Agente faz poll ◄─────┘
    │
Executa comando (whitelist)
    │
Resultado ──(assinado)──► Edge Function
                              │
                         Verifica assinatura
                         Atualiza status (COMPLETED/FAILED)
                              │
                         Se falha 3x ──► DLQ
```

## Endpoints da API {#endpoints}

### Públicos (sem autenticação)

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/functions/v1/health` | GET | Health check |

### Agente (autenticação HMAC)

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/functions/v1/agent-heartbeat` | POST | Heartbeat do agente |
| `/functions/v1/register-agent-key` | POST | Registro de chave pública |
| `/functions/v1/execute-job` | POST | Reportar resultado de job |

### Administrativos (autenticação JWT)

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/functions/v1/force-update` | POST | Forçar atualização de agente |
| `/functions/v1/auto-remediate` | POST | Trigger de remediação |

## Tabelas Críticas {#tabelas}

| Tabela | Descrição | Sensibilidade |
|--------|-----------|---------------|
| `agents` | Cadastro de agentes (contém `hmac_secret`) | **Alta** — service_role only |
| `agent_tokens` | Tokens de autenticação | **Crítica** — service_role only |
| `jobs` | Fila de trabalho (9 estados FSM) | Média |
| `failed_jobs_dlq` | Dead-letter queue | Média |
| `agent_evidence_logs` | Logs de evidência com hash de integridade | Alta |
| `agent_execution_chain` | Cadeia de execução (anti-tampering) | Alta |
| `agent_behavioral_baseline` | Baselines para detecção de anomalias | Média |
| `agent_file_integrity` | Verificação de integridade de arquivos | Alta |
| `audit_logs` | Trilha de auditoria imutável | **Crítica** |
| `tenants` | Cadastro de inquilinos | Alta |
| `enrollment_keys` | Chaves de enrollment | **Alta** |
| `adaptive_blast_radius_config` | Configuração de blast radius | Média |

### Views Importantes

| View | Descrição |
|------|-----------|
| `agents_safe` | Dados de agentes sem campos sensíveis |
| `agents_public` | Dados públicos de agentes |
| `hmac_agent_secrets` | Segredos HMAC (security_invoker=true) |
| `v_problematic_agents` | Agentes com problemas |
| `v_agent_lifecycle_state` | Estado do ciclo de vida |
| `v_agent_execution_health` | Saúde de execução |

## Processos em Background {#processos-background}

| Processo | Frequência | Descrição |
|----------|------------|-----------|
| `process-dlq-retries` | A cada 5 min | Reprocessa jobs da DLQ |
| `auto-remediate` | Event-driven | Remediação automática |
| `evaluate-automation-rules` | Event-driven | Avaliação de regras SOAR |
| Purge de sessões expiradas | Diário | Limpa `active_sessions` expiradas |
| Rotação de logs | Diário | Compacta logs antigos |
| Verificação de drift | Periódica | Detecta desvios de baseline |

## Segurança

### Princípios

1. **Princípio de Kerckhoffs** — Segurança baseada em chaves, não em obscuridade
2. **Zero Trust** — Toda requisição é verificada
3. **Fail-closed** — Em caso de dúvida, bloquear
4. **Isolamento multi-tenant** — RLS em todas as tabelas

### Mecanismos

| Mecanismo | Implementação |
|-----------|--------------|
| Autenticação de agente | HMAC-SHA256 com nonce e `timingSafeEqual` |
| Isolamento de dados | RLS com `get_active_tenant_id()` |
| Integridade de execução | Cadeia de hashes (`agent_execution_chain`) |
| Proteção contra replay | Nonce + tolerância de clock ±5 min |
| Blast radius | Limite de 10% da frota por automação |
| Circuit breaker global | Pausa se >30% afetados em 10 min |

## Monitoramento {#monitoramento}

### Métricas Recomendadas

| Métrica | Alerta |
|---------|--------|
| Agentes offline > 15 min | > 5% da frota |
| Jobs na DLQ | > 100/hora |
| Circuit breaker OPEN | Qualquer ocorrência |
| Falhas de HMAC | > 10/min |
| Latência de heartbeat | p95 > 5s |
| Erros 5xx em edge functions | > 1% |

## Backup e Restore {#backup-restore}

### Política

- **RPO (Recovery Point Objective):** < 15 minutos
- **RTO (Recovery Time Objective):** < 4 horas
- Backups verificados automaticamente via `backup_verifications`

### Procedimento de Restore

1. Identificar o ponto de restauração
2. Executar restore do banco de dados
3. Verificar integridade com validação matemática de logs
4. Redeployar edge functions
5. Verificar conectividade dos agentes
6. Confirmar que heartbeats estão sendo recebidos

## Incidentes Comuns {#incidentes}

| Incidente | Ação Imediata | Runbook |
|-----------|--------------|---------|
| Agentes offline em massa | Verificar backend e rede | [RUNBOOK-FALHAS-AGENTE](./RUNBOOK-FALHAS-AGENTE.md) |
| DLQ crescendo | Verificar saúde dos agentes | [RUNBOOK-DLQ](./RUNBOOK-DLQ.md) |
| Circuit breaker aberto | Identificar serviço degradado | [RUNBOOK-CIRCUIT-BREAKER](./RUNBOOK-CIRCUIT-BREAKER.md) |
| Lentidão no dashboard | Verificar queries e índices | [RUNBOOK-DATABASE-FAILOVER](./RUNBOOK-DATABASE-FAILOVER.md) |
| Fila de jobs crescendo | Verificar agentes e despacho | [RUNBOOK-AGENT-OFFLINE](./RUNBOOK-AGENT-OFFLINE.md) |

## Contato com Suporte {#suporte}

### Informações necessárias ao abrir chamado

1. **`trace_id`** — Identificador da requisição (presente nos logs)
2. **`tenant_id`** — Identificador do inquilino
3. **Horário exato** do início do problema (UTC)
4. **Logs relevantes** — Últimas 100 linhas do agente + edge function
5. **Ação que causou o problema** — O que estava sendo feito
6. **Impacto** — Quantos agentes/usuários afetados

---

**Referências:**
- ADR-042 — Governança de Automação
- ADR-023 — Hardening de RLS
- Política 05 — Logging e Monitoramento
- Política 08 — Continuidade de Negócios
