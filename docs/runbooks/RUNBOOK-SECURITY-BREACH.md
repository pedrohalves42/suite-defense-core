# Runbook: Resposta a Incidente de Seguranca

**Severidade**: Critica
**Meta MTTR**: < 1 hora (contencao)
**Escalacao**: Imediata para CISO + CTO
**Referencia**: PRI-001 (docs/procedures/incident_response_plan.md)

---

## Sintomas

- Alerta de `security-alert-dispatcher` com severidade `critical`
- Deteccao de acesso nao autorizado em `audit_logs`
- Agente reportando anomalia comportamental
- RLS bypass detectado em `security_events`
- HMAC signature invalida em volume
- Tentativas de login falhadas em massa (`failed_logins`)
- Token de agente comprometido
- Dados de tenant acessados por outro tenant

---

## Classificacao de Severidade

| Nivel | Descricao | Exemplos |
|-------|-----------|----------|
| P0 - Critico | Comprometimento confirmado, dados expostos | RLS bypass, token leak, data exfiltration |
| P1 - Alto | Ataque ativo, sem confirmacao de comprometimento | Brute force, anomalia comportamental, injection attempt |
| P2 - Medio | Vulnerabilidade explorada, sem acesso a dados | XSS, CSRF, misconfiguration |
| P3 - Baixo | Tentativa sem sucesso, superficie reduzida | Scan de portas, tentativa de auth bloqueada |

---

## Procedimento Imediato (Primeiros 15 minutos)

### 1. Confirmar o Incidente

```sql
-- Verificar eventos de seguranca recentes
SELECT * FROM security_events
WHERE severity IN ('critical', 'high')
  AND created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC
LIMIT 50;

-- Verificar audit trail
SELECT * FROM audit_logs
WHERE created_at > NOW() - INTERVAL '1 hour'
  AND (action LIKE '%unauthorized%' OR action LIKE '%denied%')
ORDER BY created_at DESC;
```

### 2. Contencao Imediata

#### Se token de agente comprometido:
```sql
-- Revogar token do agente
UPDATE agents SET status = 'quarantined',
  quarantine_reason = 'security_incident',
  updated_at = NOW()
WHERE id = '<agent_id>';

-- Invalidar enrollment keys associadas
UPDATE enrollment_keys SET is_revoked = true,
  revoked_at = NOW(),
  revocation_reason = 'security_incident'
WHERE tenant_id = '<tenant_id>'
  AND is_revoked = false;
```

#### Se credencial de usuario comprometida:
```sql
-- Bloquear usuario
UPDATE profiles SET status = 'suspended',
  updated_at = NOW()
WHERE id = '<user_id>';

-- Invalidar sessoes ativas
DELETE FROM active_sessions
WHERE user_id = '<user_id>';
```

#### Se RLS bypass detectado:
- **PARAR** todo acesso ao tenant afetado
- Ativar `emergency_mode` no tenant
- Notificar equipe de engenharia imediatamente

### 3. Preservar Evidencias

```sql
-- Exportar logs do periodo
SELECT * FROM audit_logs
WHERE created_at BETWEEN '<start_time>' AND '<end_time>'
  AND tenant_id = '<tenant_id>'
ORDER BY created_at;

-- Exportar execution chain para agentes afetados
SELECT * FROM agent_execution_chain
WHERE agent_id IN ('<agent_ids>');

-- Exportar evidence logs
SELECT * FROM agent_evidence_logs
WHERE tenant_id = '<tenant_id>'
  AND created_at > '<start_time>'
ORDER BY created_at;
```

---

## Investigacao (15-60 minutos)

### 1. Determinar Escopo

- Quantos tenants afetados?
- Quantos agentes comprometidos?
- Quais dados foram acessados?
- Qual vetor de ataque?
- Ha persistencia do atacante?

### 2. Analise de Impacto

```sql
-- Verificar acesso cross-tenant
SELECT DISTINCT tenant_id, agent_id, event_type
FROM security_events
WHERE created_at > '<start_time>'
  AND severity IN ('critical', 'high');

-- Verificar integridade da execution chain
SELECT agent_id, last_execution_index, last_execution_hash
FROM agent_execution_chain
WHERE agent_id IN ('<affected_agents>');
```

### 3. Timeline do Incidente

Construir timeline com:
- Primeiro indicador de comprometimento (IOC)
- Acao do atacante
- Deteccao
- Contencao
- Dados acessados

---

## Erradicacao e Recuperacao

### 1. Remover Acesso do Atacante
- Revogar todos os tokens comprometidos
- Rotacionar chaves de enrollment
- Forcar reset de senha para usuarios afetados
- Verificar e limpar backdoors

### 2. Restaurar Operacao Normal
- Reativar servicos contidos
- Monitorar de perto por 48h
- Verificar integridade dos dados

### 3. Comunicacao
- Notificar tenants afetados (conforme breach_communication_plan.md)
- Notificar DPO se dados pessoais envolvidos (LGPD: 72h)
- Documentar timeline para auditoria

---

## Pos-Incidente

| Acao | Prazo | Responsavel |
|------|-------|-------------|
| Post-mortem (blameless) | 48h | CISO |
| Correcao da vulnerabilidade | 72h | Engineering |
| Comunicacao a clientes | Conforme SLA | Produto |
| Notificacao ANPD (se LGPD) | 72h uteis | DPO |
| Atualizacao de controles | 7 dias | SecOps |
| Revisao de runbooks | 14 dias | Ops |

---

## Contatos de Emergencia

| Papel | Contato |
|-------|---------|
| CISO | ciso@cybershield.com.br |
| CTO | cto@cybershield.com.br |
| DPO | dpo@cybershield.com.br |
| SecOps Lead | secops@cybershield.com.br |
| Suporte Supabase | Painel de suporte |

---

## Historico

| Versao | Data | Autor | Alteracoes |
|--------|------|-------|------------|
| 1.0 | 2026-03-31 | CyberShield SecOps | Versao inicial |
