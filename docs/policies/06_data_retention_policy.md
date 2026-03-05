# Política de Classificação e Retenção de Dados

| Campo | Valor |
|-------|-------|
| **Código** | DRP-001 |
| **Versão** | 1.0 |
| **Status** | Aprovado |
| **Responsável** | Security Officer |
| **Data Efetiva** | 2025-01-01 |
| **Revisão** | 2026-01-01 |
| **Critério SOC 2** | CC5 |

---

## 1. Objetivo

Definir como os dados são classificados, protegidos e retidos.

---

## 2. Escopo

Esta política se aplica a todos os dados processados, armazenados ou transmitidos pelo CyberShield, incluindo:
- Dados operacionais
- Dados de auditoria
- Metadados de segurança
- Dados de usuários
- Configuração do sistema

---

## 3. Classificação de Dados

### 3.1 Níveis de Classificação

| Nível | Descrição | Exemplos | Proteção |
|-------|-----------|----------|----------|
| Público | Informação não sensível | Conteúdo de marketing | Padrão |
| Interno | Informação de negócios | Documentação | Controle de acesso |
| Confidencial | Dados sensíveis de negócios | Dados de clientes | Criptografia + controle de acesso |
| Restrito | Altamente sensível | Credenciais, chaves | Criptografia + acesso restrito |

### 3.2 Tipos de Dados

| Tipo de Dado | Classificação | Retenção | Localização |
|-------------|---------------|----------|-------------|
| Logs de auditoria | Confidencial | 7 anos | `audit_logs` |
| Eventos de segurança | Confidencial | 7 anos | `security_events` |
| Execuções de jobs | Interno | 2 anos | `job_executions` |
| Métricas do sistema | Interno | 1 ano | `agent_system_metrics` |
| Dados de agentes | Confidencial | Enquanto ativo | `agents` |
| Credenciais de usuários | Restrito | Enquanto ativo | Sistema de autenticação |

---

## 4. Requisitos de Retenção

### 4.1 Retenção por Conformidade
- LGPD: Direitos dos titulares respeitados
- SOC 2: Evidências de auditoria preservadas
- Retenções legais: Dados preservados conforme necessário

### 4.2 Cronograma de Retenção

| Categoria de Dados | Mínimo | Máximo | Método de Exclusão |
|--------------------|--------|--------|-------------------|
| Evidências de auditoria | 7 anos | 10 anos | Exclusão segura |
| Dados operacionais | 1 ano | 3 anos | Limpeza automatizada |
| Dados temporários | 24 horas | 7 dias | Limpeza automatizada |
| Dados de backup | 30 dias | 90 dias | Rotação |

### 4.3 Limpeza Automatizada
- Jobs de limpeza executam em cronograma
- Exclusão é registrada
- Confirmação antes da exclusão permanente

---

## 5. Manuseio de Dados

### 5.1 Armazenamento
- Dados são armazenados em bancos de dados seguros
- Criptografia em repouso quando aplicável
- Acesso controlado por RLS

### 5.2 Transmissão
- Todos os dados transmitidos via TLS
- Chamadas de API autenticadas
- HMAC para comunicação de agentes

### 5.3 Exclusão
- Soft delete utilizado quando auditoria é necessária
- Hard delete apenas após período de retenção
- Exclusão é registrada e verificada

---

## 6. Conformidade LGPD

### 6.1 Direitos dos Titulares
- Direito de acesso: Dados podem ser exportados
- Direito de retificação: Dados podem ser corrigidos
- Direito de exclusão: Processamento de solicitações definido
- Direito de portabilidade: Exportação em formato padrão

### 6.2 Registros de Processamento
- Todas as atividades de processamento documentadas
- Base legal identificada
- Justificativa de retenção fornecida

---

## 7. Evidências Técnicas

| Controle | Implementação | Evidência |
|----------|--------------|-----------|
| Separação de dados | Tabelas dedicadas | Design do schema |
| Retenção | Jobs de limpeza | Processos automatizados |
| Não-repúdio | Logs imutáveis | Políticas de logs |
| Prontidão LGPD | Soft delete | Flags de exclusão |

---

## 8. Backup

### 8.1 Cronograma de Backup
- Banco de dados: Diário
- Configuração: A cada mudança
- Logs: Contínuo

### 8.2 Retenção de Backup
- Backups diários: 7 dias
- Backups semanais: 4 semanas
- Backups mensais: 12 meses

### 8.3 Teste de Recuperação
- Restauração de backup testada trimestralmente
- Resultados documentados
- Problemas remediados

---

## Histórico

| Versão | Data | Autor | Alterações |
|--------|------|-------|------------|
| 1.0 | 2025-01-01 | CyberShield Security Team | Versão inicial |
