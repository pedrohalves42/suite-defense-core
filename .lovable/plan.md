
# Plano: Pool Multi-Tenant + Habilitação de Flipping Manual

## Estado Atual Validado ✅
- **Feature flags**: `HONEYPOT_ENABLED=true`, `HONEYPOT_NATIVE_ENABLED=true`, `HONEYPOT_FLIPPED_ENABLED=false`, `HONEYPOT_AI_ENABLED=false`
- **Pool existente**: 2 agentes nativos no tenant `Atlaviamit` (75fd8eae)
- **Tenants disponíveis**: 16 tenants no sistema
- **Infraestrutura**: Edge functions (`honeypot-handler`, `activate-agent-honeypot`, `revert-agent-honeypot`, `create-honeypot-pool`) deployadas e funcionais
- **Controles**: Kill switch, cooldown 24h, step-up auth, rate limit bucket, IP hashing — todos operacionais

## Fase 1: Criar Pools em Todos os Tenants (5 min)

### 1.1 Invocar `create-honeypot-pool` sem `tenant_id`
- Cria 2 agentes nativos por tenant que ainda não tem
- Valida: `hmac_secret = NULL`, sem entradas em `agent_tokens`, `honeypot_mode = 'native'`
- **Custo**: 0 custo operacional adicional (agentes nativos não executam nada)

### 1.2 Verificação pós-criação
- Query: confirmar contagem de agentes nativos por tenant
- Validar que nenhum token foi criado para agentes nativos
- Confirmar `honeypot_interactions` continua registrando com tenant correto

## Fase 2: Habilitar `HONEYPOT_FLIPPED_ENABLED` (2 min)

### 2.1 Ativar flag global
```sql
UPDATE feature_flags SET enabled = true WHERE key = 'HONEYPOT_FLIPPED_ENABLED'
```

### 2.2 Validar gate no `serve-agent.ts`
- O gate já verifica `HONEYPOT_ENABLED` (global kill switch)
- O `activate-agent-honeypot` já verifica `HONEYPOT_ENABLED` antes de flipar
- Adicionar verificação de `HONEYPOT_FLIPPED_ENABLED` no `activate-agent-honeypot` para granularidade

## Fase 3: Validação End-to-End (5 min)

### 3.1 Teste do honeypot-handler (native)
- POST para `/honeypot-handler/heartbeat` — deve retornar 200 com resposta fake
- Confirmar 1 write em `honeypot_interactions`

### 3.2 Teste do flipping (via curl)
- Invocar `activate-agent-honeypot` com agent real + step-up header
- Confirmar `honeypot_mode = 'flipped'` no banco
- Confirmar audit_log registrado

### 3.3 Teste do revert
- Invocar `revert-agent-honeypot`
- Confirmar token rotacionado
- Confirmar `honeypot_mode = 'none'`

## Fase 4: Hardening do `activate-agent-honeypot` (3 min)

### 4.1 Adicionar check de `HONEYPOT_FLIPPED_ENABLED`
- Antes de flipar, verificar que `HONEYPOT_FLIPPED_ENABLED = true`
- Sem esta flag, flip é rejeitado com 503
- **Motivo**: Permite desabilitar flipping sem desabilitar o honeypot nativo

## Custos e Performance
- **Native**: 1 insert por request, 0 queries adicionais no hot path
- **Flipped**: 1 insert por request, 0 `agents.update`
- **Rate limit**: O(1) via bucket upsert
- **Pool**: 2 agentes × 16 tenants = 32 linhas em `agents` (custo zero)
