# Política de Controle de Acesso

| Campo | Valor |
|-------|-------|
| **Código** | ACP-001 |
| **Versão** | 1.1 |
| **Status** | Aprovado |
| **Responsável** | Security Officer |
| **Data Efetiva** | 2025-01-01 |
| **Revisão** | 2026-01-01 |
| **Critério SOC 2** | CC1, CC6 |

---

## 1. Objetivo

Garantir que o acesso a sistemas e dados seja restrito com base na necessidade de negócio e no princípio do menor privilégio.

---

## 2. Escopo

Esta política se aplica a:
- Todas as contas e credenciais de usuários
- Contas de serviço do sistema
- Chaves de API e tokens
- Acesso ao banco de dados
- Acesso administrativo

---

## 3. Autenticação

### 3.1 Autenticação de Usuários
- Todos os usuários se autenticam via provedor de identidade centralizado
- Senhas devem atender aos requisitos de complexidade
- Autenticação multifator é obrigatória para acesso administrativo

### 3.2 Gestão de Tokens
- Tokens possuem períodos de expiração definidos
- Tokens são validados no servidor a cada request
- Tokens expirados são automaticamente rejeitados

### 3.3 Autenticação de Agentes
- Agentes se autenticam usando assinaturas HMAC
- Cada agente possui um segredo único
- Assinaturas incluem nonce para prevenir ataques de replay

---

## 4. Autorização

### 4.1 Controle de Acesso Baseado em Papéis (RBAC)
O sistema implementa os seguintes papéis:

| Papel | Permissões |
|-------|------------|
| super_admin | Acesso total ao sistema em todos os tenants |
| admin | Acesso total dentro do tenant atribuído |
| analyst | Acesso somente leitura com visibilidade de logs de auditoria (não pode modificar usuários/roles) |
| operator | Acesso operacional (jobs, agentes) dentro do tenant |
| viewer | Acesso somente leitura dentro do tenant |

### 4.2 Isolamento de Tenant
- Todas as consultas de dados são filtradas por tenant_id
- Row Level Security (RLS) aplica isolamento no nível do banco de dados
- Acesso cross-tenant é tecnicamente impossível

### 4.3 Verificação de Permissões
- Toda autorização é realizada no backend
- Permissões no frontend são apenas para exibição da interface
- Edge Functions validam permissões antes das operações

---

## 5. Acesso Administrativo

### 5.1 Acesso Privilegiado
- Acesso administrativo é limitado ao pessoal autorizado
- Acesso à produção requer aprovação explícita
- Todas as ações administrativas são registradas

### 5.2 Acesso Super Admin
- Contas super admin possuem visibilidade cross-tenant
- Uso é auditado e revisado
- Requer fatores de autenticação adicionais

### 5.3 Acesso Break Glass
- Mecanismo de acesso emergencial para situações críticas
- Requer autorização de duas pessoas
- Sessão limitada a 1 hora no máximo
- Log completo de ações com detalhes aprimorados
- Ver: [Procedimento Break Glass](../procedures/break_glass_procedure.md)

### 5.4 Restrições do Papel Analyst
O papel analyst é explicitamente impedido de:
- Criar ou modificar usuários
- Alterar papéis de usuários
- Modificar políticas de segurança
- Alterar configurações de MFA
Isso previne que auditores se tornem operadores.

---

## 6. Ciclo de Vida do Usuário

### 6.1 Provisionamento
- Acesso é provisionado mediante aprovação por escrito
- Atribuição de papéis segue o princípio do menor privilégio
- Credenciais iniciais são entregues de forma segura

### 6.2 Revisão de Acesso
- Direitos de acesso são revisados trimestralmente
- Contas inativas são desabilitadas após 90 dias
- Mudanças de papel requerem re-aprovação

### 6.3 Desprovisionamento
- Acesso é revogado imediatamente na rescisão
- Todos os tokens e credenciais são invalidados
- Logs de acesso são retidos para auditoria

---

## 7. Evidências Técnicas

| Requisito | Implementação | Evidência |
|-----------|--------------|-----------|
| RBAC | Tabela `user_roles` | Schema do banco |
| Menor Privilégio | Políticas baseadas em papéis | Definições de políticas RLS |
| Isolamento de Tenant | RLS + tenant_id | Políticas em todas as tabelas |
| Expiração de Token | Invalidação automática | Tabela `agent_tokens` |
| Proteção Cross-tenant | Verificações explícitas | Código de Edge Functions |

---

## 8. Procedimentos Relacionados

| Procedimento | Descrição |
|-------------|-----------|
| [Procedimento de Reset MFA](../procedures/mfa_reset_procedure.md) | Processo para redefinição de MFA do usuário |
| [Procedimento Break Glass](../procedures/break_glass_procedure.md) | Mecanismo de acesso emergencial |

---

## 9. Conformidade

Violações desta política resultarão em revogação imediata de acesso e podem levar a ações disciplinares.

---

## Histórico

| Versão | Data | Autor | Alterações |
|--------|------|-------|------------|
| 1.0 | 2025-01-01 | CyberShield Security Team | Versão inicial |
| 1.1 | 2025-01-04 | CyberShield Security Team | Adicionado papel analyst, break glass, procedimentos MFA |
