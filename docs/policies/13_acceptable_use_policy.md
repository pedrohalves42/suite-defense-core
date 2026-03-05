# Política de Uso Aceitável (AUP)

| Campo | Valor |
|-------|-------|
| **Código** | AUP-001 |
| **Versão** | 1.0 |
| **Status** | Aprovado |
| **Responsável** | CISO |
| **Data Efetiva** | 2025-01-01 |
| **Revisão** | 2026-01-01 |

---

## 1. Objetivo

Definir as regras de uso aceitável da plataforma CyberShield por operadores MSP, administradores e demais usuários autorizados.

---

## 2. Uso Permitido

2.1. Monitoramento de segurança de endpoints sob gestão legítima do MSP

2.2. Execução de jobs de compliance e remediação nos endpoints autorizados

2.3. Consulta e exportação de dados de telemetria do próprio tenant

2.4. Configuração de alertas, playbooks e automações de segurança

2.5. Geração de relatórios de compliance e auditoria

2.6. Gestão de usuários e roles dentro do tenant

---

## 3. Uso Proibido

3.1. **Acesso Cross-Tenant:** Tentar acessar dados de outros tenants

3.2. **Engenharia Reversa:** Descompilar, reverter ou analisar o código-fonte da plataforma

3.3. **Abuso de API:** Enviar requests automatizados acima dos rate limits

3.4. **Uso Malicioso:** Utilizar o agente para vigilância, espionagem ou monitoramento não autorizado de funcionários

3.5. **Compartilhamento de Credenciais:** Compartilhar tokens, API keys ou credenciais de acesso

3.6. **Instalação Não Autorizada:** Instalar o agente em dispositivos sem autorização do proprietário

3.7. **Evasão de Segurança:** Tentar desabilitar controles de segurança, RLS ou auditoria

3.8. **Armazenamento Indevido:** Armazenar dados pessoais sensíveis (saúde, religião, orientação) via campos customizados

3.9. **Uso Ilegal:** Qualquer uso que viole leis locais, LGPD ou regulamentações aplicáveis

---

## 4. Responsabilidades dos Operadores MSP

4.1. Garantir base legal para monitoramento dos endpoints de seus clientes

4.2. Informar os funcionários dos clientes sobre o monitoramento

4.3. Manter credenciais em sigilo

4.4. Reportar vulnerabilidades descobertas via Responsible Disclosure

4.5. Não exceder os limites do plano contratado

---

## 5. Monitoramento e Enforcement

5.1. Todas as ações são registradas em `audit_logs` (imutável)

5.2. Tentativas de acesso cross-tenant são registradas em `security_logs`

5.3. Circuit breaker ativado em caso de abuso de automação

5.4. Violações resultam em: aviso → suspensão → rescisão

---

## 6. Violações

| Severidade | Exemplo | Consequência |
|:----------:|---------|-------------|
| **Leve** | Exceder rate limit temporariamente | Aviso formal |
| **Moderada** | Compartilhar credenciais | Suspensão de 7 dias |
| **Grave** | Tentar acesso cross-tenant | Rescisão imediata |
| **Crítica** | Uso para espionagem/vigilância ilegal | Rescisão + ação legal |

---

## Histórico

| Versão | Data | Autor | Alterações |
|--------|------|-------|------------|
| 1.0 | 2025-01-01 | CyberShield Legal & Security | Versão inicial |
