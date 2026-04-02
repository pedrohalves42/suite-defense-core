# ADR-026: Honeypot Inteligente para CyberShield

## Status
Aprovado

## Contexto
O CyberShield precisa detectar e conter ataques passivamente, sem expor a operação real de agentes e jobs. Um honeypot integrado permite capturar inteligência sobre técnicas de ataque, desviar atacantes de ativos reais e treinar modelos de IA — tudo com custo mínimo e separação dura do pipeline operacional.

## Decisão

### Modos suportados
- **`none`**: agente normal, operação real
- **`native`**: isca server-side, sem instalação real, sem token/HMAC
- **`flipped`**: agente real desviado para resposta falsa, autenticação preservada

### Princípios de arquitetura
1. **Separação dura entre isca e operação real** — honeypot nunca toca `jobs`, `job_queue`, `job_results`, `automation_rules`
2. **Custo previsível** — 1 insert por request, 0 IA no hot path, 0 `count(*)` histórico, 0 joins pesados
3. **Segurança por contenção** — nunca executa nada, nunca devolve informação interna útil
4. **Automação tardia** — primeiro provar captura, reversão, falso positivo e custo
5. **Feature flag em tudo** — global, por tenant, por modo, kill switch sem deploy

### Componentes principais
- `serveHoneypot` — middleware dedicado (8KB body cap, allowlist headers, IP hash)
- `honeypot-handler` — endpoint público para `native`
- `agent-handler` — handler fake para `flipped` (via gate no `serveAgent`)
- `honeypot_interactions` — telemetria isolada, retenção curta
- `honeypot_hourly_stats` — agregados para dashboard
- `honeypot_rate_buckets` + `honeypot_blocks` — rate limit O(1)
- Kill switch via `feature_flags` com suporte global + tenant

### Segurança
- `native` não cria token/HMAC (hmac_secret = NULL)
- `flipped` preserva autenticação real
- Flip/revert exigem step-up auth + motivo + cooldown 24h
- Rotação de token obrigatória na reversão
- IP armazenado como SHA-256 hash + prefixo
- Headers filtrados por allowlist
- Body truncado (1KB snippet)
- Kill switch global desativa sem deploy

### Desempenho
- p95 handler < 120ms
- 1 write por request (zero `agents.update` no hot path)
- `last_honeypot_interaction_at` derivado por cron
- Dashboard baseado em agregados horários
- Rate limit bucket atômico (upsert, sem `count(*)`)

## Consequências
- **Positivas**: Coleta de inteligência; desvio de atacantes; treinamento de IA; custo controlado
- **Negativas**: Complexidade operacional; storage adicional
- **Mitigações**: Retenção 30 dias; rate limit agressivo; rollout progressivo; kill switch
