# Política de Backup e Restore

| Campo | Valor |
|-------|-------|
| **Código** | BKP-001 |
| **Versão** | 1.0 |
| **Status** | Aprovado |
| **Responsável** | Security Officer |
| **Data Efetiva** | 2026-03-05 |
| **Revisão** | 2027-03-05 |
| **Critério SOC 2** | CC7.4, CC7.5 |

---

## 1. Objetivo

Definir requisitos formais para backup, retenção e restauração de dados do CyberShield, garantindo que os objetivos de RPO (Recovery Point Objective) e RTO (Recovery Time Objective) sejam atendidos e testados regularmente.

---

## 2. Escopo

| Ativo | Incluído | Responsável |
|-------|:--------:|------------|
| Banco de dados de produção | ✅ | Infraestrutura |
| Configurações de sistema | ✅ | DevOps |
| Código-fonte (Git) | ✅ | Engenharia |
| Documentação | ✅ | Compliance |
| Logs de auditoria | ✅ | Segurança |
| Dados de agentes | ✅ | Operações |
| Secrets e chaves criptográficas | ✅ | Segurança |
| Dados temporários / cache | ❌ | N/A |

---

## 3. Objetivos de Recuperação

### 3.1 Metas por Criticidade

| Classificação | RPO | RTO | Exemplos |
|:------------:|:---:|:---:|----------|
| Crítico | 1 hora | 4 horas | Banco de produção, auth, audit_logs |
| Alto | 4 horas | 8 horas | Job executions, agent metrics |
| Médio | 24 horas | 24 horas | Documentação, configurações |
| Baixo | 72 horas | 48 horas | Dados de desenvolvimento, staging |

### 3.2 Definições

- **RPO**: Quantidade máxima de dados que pode ser perdida (janela de tempo)
- **RTO**: Tempo máximo aceitável para restaurar o serviço

---

## 4. Estratégia de Backup

### 4.1 Tipos de Backup

| Tipo | Frequência | Retenção | Método |
|------|-----------|----------|--------|
| Snapshot completo | Diário (02:00 UTC) | 30 dias | Automático (provedor cloud) |
| Point-in-Time Recovery (PITR) | Contínuo (WAL) | 7 dias | Automático |
| Backup lógico (pg_dump) | Semanal (dom 03:00 UTC) | 90 dias | Automático |
| Backup de configuração | A cada mudança | 1 ano | Git + automação |
| Backup de secrets | A cada rotação | Indefinido | Vault criptografado |

### 4.2 Armazenamento de Backups

| Controle | Requisito |
|----------|-----------|
| Localização primária | Mesma região do provedor cloud |
| Localização secundária | Região geográfica diferente |
| Criptografia em repouso | AES-256 |
| Criptografia em trânsito | TLS 1.3 |
| Controle de acesso | Somente equipe de infraestrutura |
| Imutabilidade | Backups não podem ser alterados ou excluídos antes do período de retenção |

### 4.3 Exclusões

Dados **não** incluídos nos backups:
- Cache de aplicação (regenerável)
- Sessões temporárias (efêmeras)
- Dados de ambiente de desenvolvimento local
- Logs de debug em staging

---

## 5. Procedimento de Restauração

### 5.1 Fluxo de Restauração

```
1. Detecção de necessidade de restore
   ↓
2. Avaliação de impacto (qual RPO/RTO aplicável)
   ↓
3. Seleção do backup adequado (snapshot vs PITR)
   ↓
4. Restauração em ambiente isolado (validação)
   ↓
5. Verificação de integridade dos dados
   ↓
6. Promoção para produção (se aplicável)
   ↓
7. Validação pós-restore (smoke tests)
   ↓
8. Documentação do evento
```

### 5.2 Cenários de Restauração

| Cenário | Método | RTO Esperado |
|---------|--------|:------------:|
| Corrupção de tabela específica | PITR para ponto anterior | < 1 hora |
| Exclusão acidental de dados | PITR + consulta seletiva | < 2 horas |
| Falha completa do banco | Snapshot mais recente | < 4 horas |
| Desastre regional | Backup cross-region | < 8 horas |
| Ransomware / comprometimento | Backup imutável + investigação | < 24 horas |

### 5.3 Autorização

| Ação | Quem Pode Executar | Aprovação Necessária |
|------|-------------------|---------------------|
| Restore em staging | Engenharia | Nenhuma |
| Restore parcial em produção | Infraestrutura | 1 admin |
| Restore completo em produção | Infraestrutura | Security Officer + CTO |
| Restore de emergência (break glass) | Qualquer admin autorizado | Documentação post-facto |

---

## 6. Testes de Restauração

### 6.1 Cronograma de Testes

| Tipo de Teste | Frequência | Escopo | Responsável |
|--------------|-----------|--------|------------|
| Restore de tabela individual | Mensal | 1 tabela aleatória | Engenharia |
| Restore completo em staging | Trimestral | Banco inteiro | Infraestrutura |
| Simulação de desastre (DR drill) | Semestral | Cenário end-to-end | Todas as equipes |
| Validação de integridade | Semanal | Checksums de backup | Automático |

### 6.2 Critérios de Sucesso

Cada teste deve verificar:
- [ ] Backup foi localizado e acessível
- [ ] Tempo de restauração dentro do RTO
- [ ] Dados restaurados estão íntegros (checksums, contagem de registros)
- [ ] Aplicação funciona corretamente com dados restaurados
- [ ] Nenhum dado posterior ao RPO foi perdido
- [ ] Resultado documentado com timestamp e responsável

### 6.3 Documentação de Testes

Cada teste de restore deve produzir um registro contendo:

| Campo | Obrigatório |
|-------|:-----------:|
| Data e hora do teste | ✅ |
| Tipo de backup utilizado | ✅ |
| Tempo total de restauração | ✅ |
| Volume de dados restaurados | ✅ |
| Resultado (sucesso/falha) | ✅ |
| Problemas encontrados | ✅ |
| Ações corretivas (se houver) | ✅ |
| Responsável pelo teste | ✅ |

---

## 7. Monitoramento e Alertas

### 7.1 Monitoramento Contínuo

| Métrica | Alerta Se |
|---------|----------|
| Backup diário não executado | > 26 horas sem backup |
| Tamanho do backup | Variação > 20% vs média |
| Tempo de execução do backup | > 2x a média histórica |
| Espaço de armazenamento | > 80% utilizado |
| WAL lag (PITR) | > 30 minutos |

### 7.2 Notificações

| Severidade | Canal | Responsável |
|:----------:|-------|------------|
| Crítico (backup falhou) | Slack + Email + SMS | Infraestrutura + Security |
| Alto (atraso > 4h) | Slack + Email | Infraestrutura |
| Médio (anomalia de tamanho) | Slack | Infraestrutura |

---

## 8. Retenção e Exclusão

### 8.1 Períodos de Retenção

| Tipo de Dado | Retenção Mínima | Retenção Máxima | Base Legal |
|-------------|:--------------:|:--------------:|-----------|
| Audit logs | 7 anos | 10 anos | SOC 2, LGPD |
| Dados operacionais | 1 ano | 3 anos | Contratual |
| Backups diários | 30 dias | 90 dias | Operacional |
| Backups semanais | 90 dias | 1 ano | Operacional |
| Backups mensais | 1 ano | 3 anos | Compliance |

### 8.2 Exclusão Segura

- Backups expirados são excluídos automaticamente
- Exclusão registrada em audit log
- Dados em mídias físicas: destruição certificada
- Verificação mensal de aderência à política de retenção

---

## 9. Evidências Técnicas

| Controle | Implementação | Evidência |
|----------|--------------|-----------|
| Backup automatizado | Snapshots diários | Logs do provedor cloud |
| PITR | WAL streaming | Configuração do banco |
| Criptografia | AES-256 em repouso | Configuração de storage |
| Teste de restore | Procedimento trimestral | Relatórios de teste |
| Monitoramento | Alertas automáticos | Dashboard de operações |
| Imutabilidade | Object lock | Configuração de storage |

---

## 10. Conformidade

| Framework | Controle | Status |
|-----------|----------|:------:|
| SOC 2 | CC7.4 — Business continuity | ✅ |
| SOC 2 | CC7.5 — Recovery from incidents | ✅ |
| LGPD | Art. 46 — Medidas de segurança | ✅ |
| LGPD | Art. 48 — Comunicação de incidentes | ✅ |
| ISO 27001 | A.12.3 — Backup | ✅ |

---

## Referências

- [Política de Continuidade de Negócios](./08_business_continuity_policy.md) (BCP-001)
- [Política de Retenção de Dados](./06_data_retention_policy.md) (DRP-001)
- [Procedimento de Recuperação de Desastres](../procedures/disaster_recovery_procedure.md)
- [Runbook: Modo de Emergência](../runbooks/RUNBOOK-EMERGENCY-MODE.md)

---

## Histórico

| Versão | Data | Autor | Alterações |
|--------|------|-------|------------|
| 1.0 | 2026-03-05 | CyberShield Security | Versão inicial |
