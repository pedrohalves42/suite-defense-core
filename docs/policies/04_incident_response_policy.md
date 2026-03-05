# Política de Resposta a Incidentes

| Campo | Valor |
|-------|-------|
| **Código** | IRP-001 |
| **Versão** | 1.0 |
| **Status** | Aprovado |
| **Responsável** | Security Officer |
| **Data Efetiva** | 2025-01-01 |
| **Revisão** | 2026-01-01 |
| **Critério SOC 2** | CC7 |

---

## 1. Objetivo

Definir como o CyberShield detecta, responde e documenta incidentes de segurança.

---

## 2. Escopo

Esta política se aplica a:
- Todos os incidentes de segurança
- Interrupções de serviço
- Violações de dados
- Tentativas de acesso não autorizado
- Violações de políticas

---

## 3. Classificação de Incidentes

### 3.1 Níveis de Severidade

| Nível | Descrição | Tempo de Resposta | Exemplo |
|-------|-----------|-------------------|---------|
| Crítico | Serviço fora do ar ou violação de dados | 1 hora | Exploração ativa, exfiltração de dados |
| Alto | Risco significativo de segurança | 4 horas | Tentativa de acesso não autorizado, vulnerabilidade |
| Médio | Potencial preocupação de segurança | 24 horas | Atividade suspeita, violação de política |
| Baixo | Questão menor de segurança | 72 horas | Alerta informativo, falso positivo |

### 3.2 Tipos de Incidente
- Acesso não autorizado
- Malware/ransomware
- Violação de dados
- Negação de serviço
- Comprometimento de sistema
- Violação de política

---

## 4. Processo de Resposta

### 4.1 Detecção
- Monitoramento automatizado detecta anomalias
- Usuários reportam atividade suspeita
- Terceiros reportam problemas

### 4.2 Contenção
- Isolar sistemas afetados
- Bloquear atores maliciosos
- Preservar evidências

### 4.3 Investigação
- Determinar escopo e impacto
- Identificar causa raiz
- Coletar e preservar logs

### 4.4 Remediação
- Corrigir vulnerabilidades
- Restaurar sistemas
- Implementar medidas preventivas

### 4.5 Documentação
- Criar relatório de incidente
- Atualizar procedimentos
- Notificar partes interessadas

---

## 5. Comunicação

### 5.1 Comunicação Interna
- Incidentes são registrados no sistema
- Equipes relevantes são notificadas
- Atualizações de status são fornecidas

### 5.2 Comunicação Externa
- Clientes afetados são notificados conforme requisitos legais
- Órgãos reguladores são notificados se necessário
- Comunicação pública segue processo de aprovação

### 5.3 Notificação de Partes Interessadas

| Severidade | Interna | Cliente | Regulatório |
|:----------:|:-------:|:-------:|:-----------:|
| Crítico | Imediata | Em até 24h | Conforme necessário |
| Alto | Em até 4h | Em até 48h | Conforme necessário |
| Médio | Em até 24h | Conforme necessário | N/A |
| Baixo | Relatório semanal | N/A | N/A |

---

## 6. Evidências Técnicas

| Controle | Implementação | Evidência |
|----------|--------------|-----------|
| Detecção | Tabela `security_events` | Logs de eventos |
| Registro | Logs imutáveis | `audit_logs` |
| Classificação | Campo de severidade | Registros de eventos |
| Investigação | Trilha de auditoria | Execuções de jobs, logs |
| Prevenção | Rate limiting + bloqueios | Edge Functions |

---

## 7. Revisão Pós-Incidente

Após cada incidente Crítico ou Alto:
- Conduzir post-mortem em até 5 dias úteis
- Documentar lições aprendidas
- Atualizar procedimentos e controles
- Compartilhar descobertas com a equipe

---

## 8. Testes

Procedimentos de resposta a incidentes são testados:
- Exercícios tabletop trimestralmente
- Simulações completas anualmente
- Após mudanças significativas no sistema

---

## Histórico

| Versão | Data | Autor | Alterações |
|--------|------|-------|------------|
| 1.0 | 2025-01-01 | CyberShield Security Team | Versão inicial |
