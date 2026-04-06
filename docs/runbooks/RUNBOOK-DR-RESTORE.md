# Runbook: Teste de Restore / Disaster Recovery

| Campo | Valor |
|-------|-------|
| **Código** | RB-DR-001 |
| **Versão** | 1.0 |
| **Controle SOC 2** | A1.2 — Availability: Backup/Restore Testing |

---

## 1. Objetivo

Validar que os backups do banco de dados podem ser restaurados com sucesso dentro do RTO (Recovery Time Objective) definido, garantindo a disponibilidade e integridade dos dados.

## 2. Frequência

**Trimestral** (mínimo) ou após mudanças significativas de infraestrutura.

## 3. Procedimento de Teste

### 3.1 — Preparação

```
1. Identificar o backup mais recente disponível
2. Provisionar ambiente de staging isolado
3. Documentar o horário de início do teste
```

### 3.2 — Execução do Restore

```bash
# 1. Exportar dump do banco de produção
supabase db dump -f backup_$(date +%Y%m%d).sql

# 2. Calcular hash do backup
sha256sum backup_$(date +%Y%m%d).sql

# 3. Restaurar em ambiente de staging
supabase db restore backup_$(date +%Y%m%d).sql --linked

# 4. Registrar tempo de conclusão
```

### 3.3 — Verificação de Integridade

```sql
-- Verificar contagem de tabelas
SELECT count(*) FROM information_schema.tables 
WHERE table_schema = 'public';

-- Verificar tabelas críticas
SELECT 'agents' AS tbl, count(*) FROM agents
UNION ALL SELECT 'tenants', count(*) FROM tenants
UNION ALL SELECT 'audit_logs', count(*) FROM audit_logs
UNION ALL SELECT 'user_roles', count(*) FROM user_roles;

-- Verificar integridade da cadeia de hash
SELECT * FROM verify_log_chain(
  '<tenant_id>', 
  NOW() - INTERVAL '30 days', 
  NOW()
);
```

## 4. Registro de Evidência

Após o teste, inserir registro na tabela `backup_verifications`:

```sql
INSERT INTO backup_verifications (
  test_id, backup_hash, backup_size_bytes,
  restore_duration_seconds, restored_at, restored_by,
  verification_status, verification_details,
  evidence_path, report_generated_at, tenant_id
) VALUES (
  'DR-TEST-YYYY-QN-NNN',
  'sha256:<hash_do_backup>',
  <tamanho_bytes>,
  <duracao_segundos>,
  NOW(),
  '<email_do_operador>',
  'success', -- ou 'failure'
  '{
    "test_type": "full_restore",
    "environment": "staging",
    "tables_verified": <N>,
    "rows_verified": <N>,
    "integrity_check": "passed",
    "rto_target_minutes": 60,
    "rto_actual_minutes": <N>,
    "notes": "<observações>"
  }'::jsonb,
  'docs/runbooks/RUNBOOK-DR-RESTORE.md',
  NOW(),
  '<tenant_id>'
);
```

## 5. Consulta de Evidência

```sql
SELECT test_id, verification_status, 
       restore_duration_seconds,
       verification_details->>'rto_actual_minutes' AS rto_minutes,
       verification_details->>'integrity_check' AS integrity,
       restored_at
FROM backup_verifications 
ORDER BY restored_at DESC 
LIMIT 5;
```

## 6. Critérios de Sucesso

- [ ] Backup restaurado sem erros
- [ ] Tempo de restore dentro do RTO (< 60 minutos)
- [ ] Contagem de tabelas e registros consistente
- [ ] Cadeia de hash de auditoria íntegra
- [ ] RLS policies funcionais após restore
- [ ] Evidência registrada em `backup_verifications`

## 7. Plano de Ação em Caso de Falha

```
1. Documentar erro detalhado no campo verification_details
2. Definir verification_status = 'failure'
3. Abrir incidente de severidade P1
4. Investigar causa raiz
5. Corrigir e re-executar dentro de 48h
6. Atualizar este runbook com lições aprendidas
```

---

## Histórico

| Versão | Data | Autor | Alterações |
|--------|------|-------|------------|
| 1.0 | 2026-04-06 | CyberShield Security | Versão inicial |
