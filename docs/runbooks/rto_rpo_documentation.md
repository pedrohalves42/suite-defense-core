# RTO/RPO Documentation — CyberShield Enterprise

| Campo | Valor |
|-------|-------|
| **Documento** | DR-001 |
| **Versão** | 1.0 |
| **Data** | 2026-03-25 |
| **Responsável** | CTO / SRE Lead |
| **Próxima Revisão** | 2026-06-25 |

## 1. Definições

| Métrica | Definição | Target |
|---------|-----------|--------|
| **RTO** (Recovery Time Objective) | Tempo máximo aceitável para restaurar operações após uma falha | **< 4 horas** |
| **RPO** (Recovery Point Objective) | Perda máxima de dados aceitável em caso de falha | **< 15 minutos** |
| **MTTR** (Mean Time to Recovery) | Tempo médio de recuperação observado | Target: < 2 horas |
| **MTBF** (Mean Time Between Failures) | Tempo médio entre falhas | Target: > 720 horas (30 dias) |

## 2. Cenários de Disaster Recovery

### 2.1 Falha de Banco de Dados

| Item | Valor |
|------|-------|
| RTO | 30 minutos |
| RPO | < 5 minutos (PITR) |
| Procedimento | Restauração automática via PITR (Point-in-Time Recovery) |
| Responsável | SRE Lead |
| Teste | Trimestral |

### 2.2 Falha de Edge Functions

| Item | Valor |
|------|-------|
| RTO | 15 minutos |
| RPO | N/A (stateless) |
| Procedimento | Re-deploy automático via CI/CD |
| Responsável | DevOps |
| Teste | Mensal |

### 2.3 Falha de Região Completa

| Item | Valor |
|------|-------|
| RTO | 4 horas |
| RPO | 15 minutos |
| Procedimento | Failover para região secundária |
| Responsável | CTO + SRE |
| Teste | Semestral |

### 2.4 Comprometimento de Credenciais

| Item | Valor |
|------|-------|
| RTO | 1 hora |
| RPO | N/A |
| Procedimento | Rotação imediata de todas as chaves + revogação de sessões |
| Responsável | CISO |
| Teste | Trimestral |

### 2.5 Perda de Dados de Tenant

| Item | Valor |
|------|-------|
| RTO | 2 horas |
| RPO | < 15 minutos |
| Procedimento | Restauração seletiva via backup + PITR |
| Responsável | DBA + SRE |
| Teste | Trimestral |

## 3. Infraestrutura de Backup

| Componente | Estratégia | Frequência | Retenção |
|------------|-----------|------------|----------|
| Banco de dados | PITR contínuo + snapshot diário | Contínuo / Diário | 30 dias PITR, 90 dias snapshots |
| Edge Functions | Versionadas no Git | A cada commit | Ilimitada |
| Configurações | Git + Vault | A cada mudança | Ilimitada |
| Audit Logs | Backup diário para cold storage | Diário | 7 anos (compliance) |
| Secrets (Vault) | Backup criptografado | Diário | 90 dias |

## 4. Procedimento de DR — Passo a Passo

### Fase 1: Detecção (0-5 min)
1. Alarme disparado via health-check / SLI monitoring
2. On-call engineer notificado via PagerDuty
3. Incidente criado no sistema

### Fase 2: Triagem (5-15 min)
1. Identificar escopo do impacto (parcial vs total, single vs multi-tenant)
2. Classificar severidade (SEV1/SEV2/SEV3)
3. Ativar war room se SEV1

### Fase 3: Mitigação (15-60 min)
1. Aplicar runbook específico para o cenário
2. Se banco: iniciar PITR para timestamp anterior à falha
3. Se functions: rollback para versão estável anterior
4. Se região: ativar failover

### Fase 4: Restauração (1-4h)
1. Verificar integridade dos dados restaurados
2. Executar smoke tests automatizados
3. Validar RLS e isolamento de tenants
4. Re-habilitar tráfego gradualmente

### Fase 5: Post-Mortem (24-48h após)
1. Documentar timeline do incidente
2. Identificar causa raiz (Root Cause Analysis)
3. Definir ações preventivas
4. Atualizar runbooks se necessário
5. Comunicar stakeholders

## 5. Testes de DR

| Teste | Frequência | Último Teste | Próximo |
|-------|------------|-------------|---------|
| Restauração de backup | Trimestral | — | Q2 2026 |
| Failover de região | Semestral | — | Q2 2026 |
| Rotação de credenciais | Trimestral | — | Q2 2026 |
| Tabletop exercise (simulação) | Mensal | — | Abril 2026 |

## 6. Contatos de Emergência

| Nível | Responsável | Contato | Tempo de Resposta |
|-------|-------------|---------|-------------------|
| L1 | On-Call Engineer | PagerDuty | < 15 min |
| L2 | SRE Lead | PagerDuty escalation | < 30 min |
| L3 | CTO | Telefone direto | < 1h |
| L4 | CISO (se segurança) | Telefone direto | < 1h |

## 7. Conformidade

| Framework | Requisito | Status |
|-----------|-----------|--------|
| SOC 2 CC7.5 | Testes de recuperação documentados | ✅ Template pronto |
| ISO 27001 A.17 | Plano de continuidade | ✅ Documentado |
| LGPD Art. 46 | Proteção de dados pessoais | ✅ PITR + backup |
