# Política de Logging e Monitoramento

| Campo | Valor |
|-------|-------|
| **Código** | LMP-001 |
| **Versão** | 1.0 |
| **Status** | Aprovado |
| **Responsável** | Security Officer |
| **Data Efetiva** | 2025-01-01 |
| **Revisão** | 2026-01-01 |
| **Critério SOC 2** | CC4, CC7 |

---

## 1. Objetivo

Garantir que eventos relevantes de segurança sejam registrados, protegidos e monitorados.

---

## 2. Escopo

Esta política se aplica a:
- Logs da aplicação
- Eventos de segurança
- Trilhas de auditoria
- Métricas do sistema
- Logs de acesso

---

## 3. Requisitos de Logging

### 3.1 Eventos a Registrar
- Eventos de autenticação (login, logout, falhas)
- Decisões de autorização (acesso concedido/negado)
- Ações de aplicação de políticas
- Execução de jobs (início, conclusão, falha)
- Violações de segurança
- Mudanças de configuração
- Ações administrativas

### 3.2 Conteúdo do Log
Cada entrada de log deve incluir:
- Timestamp (UTC)
- Tipo de evento
- Ator (usuário, agente, sistema)
- Recurso alvo
- Ação realizada
- Resultado (sucesso/falha)
- Contexto relevante

### 3.3 Dados Sensíveis
- Senhas nunca são registradas
- PII é minimizado nos logs
- Segredos são ofuscados

---

## 4. Proteção de Logs

### 4.1 Imutabilidade
- Logs de auditoria não podem ser modificados
- Exclusão é prevenida por políticas RLS
- Triggers de banco de dados garantem imutabilidade

### 4.2 Integridade
- Logs incluem hashes criptográficos
- Cadeia de hash permite verificação
- Adulteração é detectável

### 4.3 Controle de Acesso
- Acesso a logs é restrito ao pessoal autorizado
- Acesso a logs é registrado
- Super admin necessário para logs cross-tenant

---

## 5. Retenção

### 5.1 Períodos de Retenção

| Tipo de Log | Retenção | Justificativa |
|-------------|----------|---------------|
| Eventos de segurança | 7 anos | Conformidade |
| Logs de auditoria | 7 anos | Conformidade |
| Execuções de jobs | 2 anos | Operacional |
| Métricas do sistema | 1 ano | Performance |
| Logs da aplicação | 90 dias | Debugging |

### 5.2 Exclusão
- Logs são excluídos apenas após o período de retenção
- Exclusão é automatizada e registrada
- Cópias de backup seguem a mesma retenção

---

## 6. Monitoramento

### 6.1 Monitoramento em Tempo Real
- Eventos de segurança disparam alertas
- Violações de limites são sinalizadas
- Anomalias são detectadas

### 6.2 Revisão Periódica
- Logs de segurança revisados diariamente
- Logs de auditoria revisados semanalmente
- Auditoria completa mensalmente

### 6.3 Alertas
- Eventos críticos disparam notificação imediata
- Procedimentos de escalação de alertas definidos
- Redução contínua de falsos positivos

---

## 7. Evidências Técnicas

| Controle | Implementação | Evidência |
|----------|--------------|-----------|
| Imutabilidade | RLS sem DELETE/UPDATE | Definições de políticas |
| Integridade | Hash + nonce | Registros de logs |
| Autenticidade | HMAC | Verificação de assinatura |
| Rastreabilidade | `job_executions` | Registros de execução |

---

## 8. Conformidade

Dados de logs suportam conformidade com:
- Requisitos de auditoria SOC 2
- Registros de processamento de dados LGPD
- Controles ISO 27001
- Investigações internas

---

## Histórico

| Versão | Data | Autor | Alterações |
|--------|------|-------|------------|
| 1.0 | 2025-01-01 | CyberShield Security Team | Versão inicial |
