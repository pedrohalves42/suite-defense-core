# Política de Gestão de Mudanças

| Campo | Valor |
|-------|-------|
| **Código** | CMP-001 |
| **Versão** | 1.0 |
| **Status** | Aprovado |
| **Responsável** | Security Officer |
| **Data Efetiva** | 2025-01-01 |
| **Revisão** | 2026-01-01 |
| **Critério SOC 2** | CC8 |

---

## 1. Objetivo

Garantir que mudanças na plataforma CyberShield sejam controladas, revisadas e rastreáveis.

---

## 2. Escopo

Esta política se aplica a mudanças em:
- Código da aplicação
- Schema do banco de dados
- Releases de agentes
- Configuração de infraestrutura
- Configurações de segurança

---

## 3. Tipos de Mudança

### 3.1 Mudanças na Aplicação
- Todas as mudanças de código são versionadas
- Mudanças requerem revisão por pares antes do merge
- Testes automatizados validam as mudanças

### 3.2 Mudanças no Banco de Dados
- Mudanças de schema são gerenciadas por migrations
- Migrations são versionadas e rastreadas
- Mudanças são testadas em ambientes não-produtivos primeiro

### 3.3 Releases de Agentes
- Releases são assinadas criptograficamente (ECDSA)
- Cada release possui um hash único
- Agentes verificam assinaturas antes da atualização

### 3.4 Mudanças de Configuração
- Mudanças de infraestrutura seguem o mesmo processo de revisão
- Configuração é versionada
- Mudanças são documentadas

---

## 4. Controles

### 4.1 Controle de Versão
- Todas as mudanças são rastreadas no Git
- Histórico completo é mantido
- Nenhum commit direto na branch principal

### 4.2 Revisão de Código
- Todas as mudanças requerem pelo menos um revisor
- Mudanças sensíveis à segurança requerem revisão adicional
- Verificações automatizadas devem passar

### 4.3 Assinatura Criptográfica
- Releases de agentes são assinadas com ECDSA
- Assinaturas são verificadas antes do deploy
- Chaves de assinatura são protegidas

### 4.4 Processo de Deploy
- Deploys são automatizados
- Procedimentos de rollback são documentados
- Logs de deploy são retidos

---

## 5. Procedimentos de Rollback

### 5.1 Rollback da Aplicação
- Versões anteriores podem ser reimplantadas
- Rollback é automatizado
- Eventos de rollback são registrados

### 5.2 Rollback do Banco de Dados
- Migrations incluem scripts de rollback
- Backups do banco permitem recuperação point-in-time
- Rollback é testado

### 5.3 Rollback de Agentes
- Agentes mantêm a versão anterior
- Rollback automático em caso de falha
- Modo seguro previne falhas repetidas

---

## 6. Evidências Técnicas

| Controle | Implementação | Evidência |
|----------|--------------|-----------|
| Versionamento | Git + migrations | Histórico do repositório |
| Integridade de Release | Assinatura ECDSA | Tabela `agent_releases` |
| Rastreabilidade | `agent_releases` com hash | Registros de releases |
| Rollback | Histórico de versões | Tabela `agent_versions` |

---

## 7. Mudanças de Emergência

Mudanças de emergência podem contornar a revisão normal quando:
- Produção está fora do ar
- Brecha de segurança está ativa
- Perda de dados é iminente

Mudanças de emergência requerem:
- Revisão pós-mudança em até 24 horas
- Documentação da justificativa
- Relatório de incidente

---

## Histórico

| Versão | Data | Autor | Alterações |
|--------|------|-------|------------|
| 1.0 | 2025-01-01 | CyberShield Security Team | Versão inicial |
