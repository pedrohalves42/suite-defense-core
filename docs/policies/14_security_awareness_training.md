# Programa de Treinamento e Conscientização em Segurança

| Campo | Valor |
|-------|-------|
| **Código** | SAT-001 |
| **Versão** | 1.0 |
| **Status** | Aprovado |
| **Responsável** | CISO |
| **Data Efetiva** | 2025-01-01 |
| **Revisão** | 2026-01-01 |
| **Critério SOC 2** | CC1.4 |

---

## 1. Objetivo

Garantir que todos os membros da equipe compreendam suas responsabilidades de segurança e estejam preparados para proteger a plataforma e os dados dos clientes.

---

## 2. Público-Alvo

| Grupo | Treinamento | Frequência |
|-------|-----------|-----------|
| **Novos Funcionários** | Onboarding de segurança | Na admissão |
| **Engineering** | Secure coding, OWASP Top 10, RLS | Semestral |
| **DevOps** | Hardening, secrets management, DRP | Semestral |
| **Todos** | Phishing, engenharia social, LGPD | Anual |
| **Liderança** | Gestão de riscos, compliance | Anual |
| **Operadores MSP** | Uso seguro da plataforma, LGPD | No onboarding |

---

## 3. Módulos de Treinamento

### 3.1 Onboarding de Segurança (Obrigatório — Dia 1)

| Tópico | Duração |
|--------|---------|
| Visão geral das políticas de segurança | 30min |
| Invariantes de segurança (INV-001 a INV-006) | 30min |
| Gestão de credenciais e MFA | 15min |
| Política de uso aceitável | 15min |
| Reporte de incidentes | 15min |
| **Total** | **1h45** |

### 3.2 Desenvolvimento Seguro (Engineering — Semestral)

| Tópico | Duração |
|--------|---------|
| OWASP Top 10 aplicado ao CyberShield | 1h |
| RLS: padrões, armadilhas e testes | 1h |
| SECURITY DEFINER vs SECURITY INVOKER | 30min |
| Criptografia aplicada (HMAC, Ed25519, ECDSA) | 1h |
| Multi-tenant isolation patterns | 30min |
| Code review focado em segurança | 30min |
| **Total** | **4h30** |

### 3.3 LGPD e Privacidade (Todos — Anual)

| Tópico | Duração |
|--------|---------|
| Princípios da LGPD | 30min |
| Direitos dos titulares | 30min |
| Bases legais utilizadas no CyberShield | 30min |
| Incidentes de dados pessoais (o que fazer) | 30min |
| **Total** | **2h** |

### 3.4 Resposta a Incidentes (CSIRT — Trimestral)

| Tópico | Duração |
|--------|---------|
| Tabletop exercise (cenário rotativo) | 2h |
| Revisão de playbooks | 30min |
| Lições aprendidas de incidentes recentes | 30min |
| **Total** | **3h** |

---

## 4. Avaliação

| Método | Nota Mínima | Consequência de Reprovação |
|--------|:-----------:|--------------------------|
| Quiz pós-treinamento | 80% | Retreinamento em 15 dias |
| Simulação de phishing | N/A | Treinamento focado |
| Exercício prático (engineering) | Aprovação | Mentoria 1:1 |

---

## 5. Registro e Evidências

| Evidência | Armazenamento | Retenção |
|-----------|--------------|----------|
| Certificado de conclusão | Pasta do funcionário | Duração do contrato |
| Resultado de quiz | Sistema de treinamento | 3 anos |
| Registro de participação | Planilha assinada | 3 anos |
| Resultados de phishing test | Relatório confidencial | 1 ano |

---

## 6. Calendário

| Mês | Atividade |
|-----|-----------|
| Janeiro | Reciclagem anual (todos) + LGPD |
| Março | Tabletop exercise (CSIRT) |
| Abril | Simulação de phishing |
| Junho | Secure coding (engineering) + Tabletop |
| Setembro | Tabletop exercise (CSIRT) |
| Outubro | Simulação de phishing |
| Dezembro | Tabletop exercise + Revisão anual |

---

## Histórico

| Versão | Data | Autor | Alterações |
|--------|------|-------|------------|
| 1.0 | 2025-01-01 | CyberShield Security | Versão inicial |
