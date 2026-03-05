# Runbook: Modo de Emergência (Kill Switch)

**Severidade**: Crítica  
**Meta MTTR**: < 5 minutos (ativação), < 15 minutos (recuperação completa)  
**Autoridade**: Requer Engenheiro Sênior ou superior

---

## Estados do Modo de Emergência

| Estado | Descrição | Comportamento |
|--------|-----------|---------------|
| `normal` | Sistema operando normalmente | Todas as funcionalidades habilitadas |
| `restricted` | Operações limitadas | Funcionalidades não-críticas desabilitadas |
| `emergency_stop` | Modo de emergência total | Todas as mutações bloqueadas, somente leitura |

---

## Quando Ativar o Modo de Emergência

### Ativar Imediatamente Para:

- ❌ **Brecha de segurança ativa** (exfiltração de dados, acesso não autorizado)
- ❌ **Corrupção massiva de dados** (exclusões em cascata, atualizações incorretas)
- ❌ **Automação descontrolada** (loops infinitos, triggers recursivos)
- ❌ **Falha crítica de infraestrutura** (tempestade de conexões DB)

### Considerar Ativação Para:

- ⚠️ **Taxas altas e sustentadas de erro** (> 50% de falhas por 5+ min)
- ⚠️ **Padrões de acesso incomuns** (potencial ataque)
- ⚠️ **Performance degradada** afetando todos os usuários

---

## Procedimento de Ativação

### Passo 1: Ativar Modo de Emergência

```sql
-- CRÍTICO: Execute isso para bloquear todas as mutações
UPDATE system_global_state 
SET 
  mode = 'emergency_stop',
  updated_at = NOW(),
  changed_by = 'NOME_OPERADOR - ID_INCIDENTE'
WHERE id = (SELECT id FROM system_global_state LIMIT 1);
```

### Passo 2: Verificar Ativação

```sql
SELECT * FROM is_emergency_mode();
-- Deve retornar: true

SELECT * FROM get_system_mode_safe();
-- Deve retornar: 'emergency_stop'
```

### Passo 3: Notificar Equipe

1. Postar no canal #incidentes do Slack
2. Acionar engenheiro de plantão se não já envolvido
3. Registrar incidente no sistema

### Passo 4: Documentar no Log de Auditoria

```sql
INSERT INTO audit_logs (event_type, actor_id, details, tenant_id)
VALUES (
  'emergency_mode_activated',
  'USER_ID_OPERADOR',
  jsonb_build_object(
    'motivo', 'MOTIVO_BREVE',
    'incident_id', 'ID_INCIDENTE',
    'ativado_em', NOW()
  ),
  NULL  -- Nível de sistema, sem tenant
);
```

---

## O Que Acontece no Modo de Emergência

### Edge Functions

- Retornam HTTP 503 com `Retry-After: 300`
- Resposta inclui `error: 'SYSTEM_EMERGENCY_MODE'`
- Middleware de health probe bloqueia processamento

### Jobs Agendados

- `assert_system_allows_jobs()` lança exceção
- Jobs abortam antes da execução
- Registrado na tabela de falhas de jobs

### Banco de Dados

- Operações de escrita bloqueadas por políticas RLS (se configurado)
- Operações de leitura continuam para monitoramento
- Logs de auditoria ainda podem ser escritos

### Interface do Usuário

- Deve exibir banner de emergência
- Formulários desabilitados
- Ações mostram mensagem "Sistema em manutenção"

---

## Procedimento de Recuperação

### Checklist Pré-Recuperação

- [ ] Causa raiz identificada
- [ ] Correção implantada ou problema mitigado
- [ ] Nenhum ataque/corrupção em andamento
- [ ] Equipe pronta para monitorar

### Passo 1: Mudar para Modo Restrito Primeiro

```sql
-- Não vá diretamente para normal - teste com restrito primeiro
UPDATE system_global_state 
SET 
  mode = 'restricted',
  updated_at = NOW(),
  changed_by = 'NOME_OPERADOR - RECUPERACAO'
WHERE id = (SELECT id FROM system_global_state LIMIT 1);
```

### Passo 2: Verificar Funções Críticas

```bash
# Testar Edge Functions principais
curl -X POST "${SUPABASE_URL}/functions/v1/health" \
  -H "Authorization: Bearer ${SUPABASE_ANON_KEY}"

# Deve retornar 200, não 503
```

### Passo 3: Mudar para Modo Normal

```sql
UPDATE system_global_state 
SET 
  mode = 'normal',
  updated_at = NOW(),
  changed_by = 'NOME_OPERADOR - RECUPERACAO_COMPLETA'
WHERE id = (SELECT id FROM system_global_state LIMIT 1);
```

### Passo 4: Verificar Recuperação Completa

```sql
SELECT * FROM is_emergency_mode();
-- Deve retornar: false

SELECT * FROM get_system_mode_safe();
-- Deve retornar: 'normal'
```

### Passo 5: Documentar Recuperação

```sql
INSERT INTO audit_logs (event_type, actor_id, details, tenant_id)
VALUES (
  'emergency_mode_deactivated',
  'USER_ID_OPERADOR',
  jsonb_build_object(
    'incident_id', 'ID_INCIDENTE',
    'duracao_minutos', EXTRACT(EPOCH FROM (NOW() - tempo_ativacao)) / 60,
    'causa_raiz', 'DESCRICAO_BREVE',
    'desativado_em', NOW()
  ),
  NULL
);
```

---

## Monitoramento Durante Emergência

### Queries Principais

```sql
-- Verificar alertas do sistema criados durante emergência
SELECT * FROM system_alerts 
WHERE created_at > 'TIMESTAMP_ATIVACAO'
ORDER BY created_at DESC;

-- Verificar operações que falharam
SELECT * FROM security_logs
WHERE severity = 'high' 
AND created_at > 'TIMESTAMP_ATIVACAO'
ORDER BY created_at DESC
LIMIT 100;

-- Verificar falhas de jobs
SELECT * FROM scheduled_jobs
WHERE status = 'failed'
AND updated_at > 'TIMESTAMP_ATIVACAO';
```

### Itens do Dashboard

- Taxas de erro de Edge Functions
- Contagem de conexões do banco
- Percentis de latência da API
- Sessões ativas de usuários

---

## Pós-Incidente

### Ações Obrigatórias

1. **Relatório de incidente** em até 24 horas
2. **Post-mortem** para incidentes > 15 minutos
3. **Atualizar runbook** se novo cenário descoberto
4. **Adicionar detecção automatizada** se aplicável

### Template de Relatório de Incidente

```markdown
## Resumo do Incidente
- **Data/Hora**: 
- **Duração**: 
- **Impacto**: 
- **Causa Raiz**: 

## Linha do Tempo
- HH:MM - Problema detectado
- HH:MM - Modo de emergência ativado
- HH:MM - Causa raiz identificada
- HH:MM - Correção implantada
- HH:MM - Modo normal restaurado

## O Que Funcionou Bem
- 

## O Que Pode Melhorar
- 

## Itens de Ação
- [ ] 
```

---

## Contatos de Emergência

| Papel | Método de Contato |
|-------|------------------|
| Engenheiro de Plantão | PagerDuty |
| Equipe de Segurança | #seguranca Slack |
| DBA | #banco-de-dados Slack |
| Líder de Engenharia | Mensagem direta |

---

## Runbooks Relacionados

- [RUNBOOK-EDGE-500.md](./RUNBOOK-EDGE-500.md)
- [RUNBOOK-SCHEMA-DRIFT.md](./RUNBOOK-SCHEMA-DRIFT.md)
- [RUNBOOK-CRON-SILENT.md](./RUNBOOK-CRON-SILENT.md)
