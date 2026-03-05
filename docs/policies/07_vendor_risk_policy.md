# Política de Gestão de Riscos de Fornecedores

| Campo | Valor |
|-------|-------|
| **Código** | VRP-001 |
| **Versão** | 1.0 |
| **Status** | Aprovado |
| **Responsável** | Security Officer |
| **Data Efetiva** | 2025-01-01 |
| **Revisão** | 2026-01-01 |
| **Critério SOC 2** | CC9 |

---

## 1. Objetivo

Avaliar e gerenciar riscos relacionados a prestadores de serviço terceirizados.

---

## 2. Escopo

Esta política se aplica a todos os fornecedores terceirizados que:
- Processam, armazenam ou têm acesso a dados do CyberShield
- Fornecem infraestrutura ou serviços críticos
- Integram com os sistemas do CyberShield

---

## 3. Fornecedores Críticos

### 3.1 Categorias de Fornecedores

| Categoria | Exemplos | Criticidade |
|-----------|----------|-------------|
| Infraestrutura Cloud | Supabase, hospedagem | Crítica |
| Processamento de Pagamentos | Stripe | Crítica |
| Banco de Dados | PostgreSQL (Supabase) | Crítica |
| Serviços de Email | Provedor de email | Alta |
| Ferramentas de Desenvolvimento | GitHub, CI/CD | Média |
| Analytics | Ferramentas de monitoramento | Baixa |

### 3.2 Fornecedores Críticos Atuais

| Fornecedor | Serviços | Certificações | Data de Revisão |
|------------|----------|---------------|-----------------|
| Supabase | Banco de Dados, Auth, Storage | SOC 2 Type II | [DATA] |
| Stripe | Processamento de pagamentos | PCI-DSS, SOC 2 | [DATA] |
| [Provedor Cloud] | Hospedagem, CDN | SOC 2, ISO 27001 | [DATA] |

---

## 4. Avaliação de Fornecedores

### 4.1 Critérios de Seleção
Antes de contratar um fornecedor:
- Avaliação da postura de segurança
- Revisão de certificações de conformidade
- Acordos de nível de serviço
- Práticas de manuseio de dados
- Capacidades de resposta a incidentes

### 4.2 Processo de Avaliação
1. Completar questionário do fornecedor
2. Revisar documentação de segurança
3. Verificar certificações de conformidade
4. Avaliar práticas de manuseio de dados
5. Documentar aceitação de risco

### 4.3 Pontuação de Risco

| Pontuação | Nível | Ação |
|-----------|-------|------|
| 0-25 | Baixo | Revisão padrão |
| 26-50 | Médio | Monitoramento aprimorado |
| 51-75 | Alto | Mitigação de risco necessária |
| 76-100 | Crítico | Aprovação executiva necessária |

---

## 5. Monitoramento Contínuo

### 5.1 Cronograma de Revisão

| Criticidade | Frequência de Revisão |
|-------------|----------------------|
| Crítica | Trimestral |
| Alta | Semestral |
| Média | Anual |
| Baixa | A cada 2 anos |

### 5.2 Atividades de Revisão
- Verificar certificações atuais
- Revisar incidentes de segurança
- Avaliar desempenho em relação ao SLA
- Atualizar avaliação de risco

### 5.3 Notificação de Mudanças
Fornecedores devem notificar sobre:
- Incidentes de segurança que afetem nossos dados
- Mudanças materiais nos serviços
- Alterações no status de conformidade
- Mudanças de subprocessadores

---

## 6. Compartilhamento de Dados

### 6.1 Categorias de Dados Compartilhados

| Fornecedor | Tipos de Dados | Finalidade |
|------------|---------------|-----------|
| Supabase | Todos os dados da aplicação | Operação da plataforma |
| Stripe | Pagamento, info do cliente | Processamento de pagamentos |
| Email | Endereços de email | Notificações |

### 6.2 Requisitos de Proteção de Dados
- Acordos de processamento de dados em vigor
- Requisitos de criptografia especificados
- Requisitos de residência de dados atendidos
- Procedimentos de exclusão definidos

---

## 7. Requisitos Contratuais

Todos os contratos com fornecedores devem incluir:
- Requisitos de segurança
- Obrigações de conformidade
- Direitos de auditoria
- Requisitos de notificação de violação
- Provisões de retorno/exclusão de dados
- Provisões de responsabilidade

---

## 8. Saída de Fornecedor

Ao encerrar um fornecedor:
- Retorno de dados verificado
- Exclusão de dados confirmada
- Acesso revogado
- Saída documentada

---

## 9. Evidências Técnicas

| Controle | Implementação | Evidência |
|----------|--------------|-----------|
| Registro de fornecedores | `vendor_risk_registry` | Tabela do banco |
| Avaliação de risco | Avaliações documentadas | Registros de avaliação |
| Certificações | Documentação do fornecedor | Cópias de certificados |
| Revisões | Avaliações periódicas | Registros de revisão |

---

## Histórico

| Versão | Data | Autor | Alterações |
|--------|------|-------|------------|
| 1.0 | 2025-01-01 | CyberShield Security Team | Versão inicial |
