# Plano de Recuperação de Desastres (DRP)

| Campo | Valor |
|-------|-------|
| **Código** | DRP-001 |
| **Versão** | 1.0 |
| **Status** | Aprovado |
| **Responsável** | CTO / DevOps Lead |
| **Data Efetiva** | 2025-01-01 |
| **Revisão** | 2026-01-01 |
| **Política Pai** | BCP-008 (Business Continuity) |

---

## 1. Objetivo

Definir procedimentos técnicos para recuperação de serviços em caso de desastre, garantindo continuidade operacional conforme os SLAs definidos.

---

## 2. Classificação de Desastres

| Categoria | Exemplos | RTO | RPO |
|-----------|----------|:---:|:---:|
| **Cat 1 - Menor** | Falha de Edge Function individual | 15min | 0 |
| **Cat 2 - Moderada** | Degradação de performance do banco | 1h | 5min |
| **Cat 3 - Severa** | Indisponibilidade total da plataforma | 4h | 15min |
| **Cat 4 - Catastrófica** | Perda completa da infraestrutura | 24h | 1h |

**RTO** = Recovery Time Objective (tempo máximo para restaurar)
**RPO** = Recovery Point Objective (perda máxima de dados aceitável)

---

## 3. Infraestrutura e Dependências

| Componente | Provider | Região | Redundância |
|-----------|----------|--------|-------------|
| Banco de Dados | CyberShield Cloud (Supabase/AWS) | us-east-1 | Multi-AZ |
| Edge Functions | CyberShield Cloud (Deno Deploy) | Global Edge | Automática |
| Autenticação | CyberShield Cloud (GoTrue) | us-east-1 | Multi-AZ |
| Frontend | CyberShield CDN | Global | Multi-POP |
| Pagamentos | Stripe | Global | N/A |
| CI/CD | GitHub Actions | Global | N/A |

---

## 4. Procedimentos de Recuperação

### 4.1 Cat 1: Falha de Edge Function

```
1. DETECTAR
   - Alertas de edge-function-logs (erro 500/503)
   - Monitoramento de latência > SLO

2. DIAGNOSTICAR
   - Verificar logs: supabase--edge-function-logs
   - Identificar função afetada

3. CORRIGIR
   - Rollback do deploy se causado por mudança recente
   - Fix e redeploy da função
   - Verificar com curl_edge_functions

4. VALIDAR
   - Confirmar retorno ao SLO
   - Notificar equipe
```

### 4.2 Cat 2: Degradação do Banco

```
1. DETECTAR
   - Queries > 5s
   - Connection pool esgotado

2. DIAGNOSTICAR
   - supabase--analytics-query para métricas
   - Identificar queries problemáticas

3. CORRIGIR
   - Kill de queries travadas
   - Otimização de índices
   - Scaling vertical se necessário

4. VALIDAR
   - Performance dentro do SLO
   - Sem dados perdidos
```

### 4.3 Cat 3: Indisponibilidade Total

```
1. ATIVAR CSIRT
   - Notificar equipe via cadeia de escalação
   - Ativar Break Glass se necessário
   - Comunicar clientes via status page

2. DIAGNOSTICAR
   - Verificar status do provider (Lovable Cloud)
   - Identificar causa raiz
   - Estimar tempo de recuperação

3. RECUPERAR
   - Se falha do provider: aguardar + monitorar
   - Se falha nossa: restaurar de backup
   - Verificar integridade dos dados (hash encadeado)

4. VALIDAR
   - Executar smoke tests em todas as Edge Functions
   - Verificar RLS e isolamento de tenant
   - Executar assert_rls_hardening.sql
   - Confirmar agentes reconectando (heartbeat)

5. COMUNICAR
   - Atualizar status page
   - Post-mortem em 48h
```

### 4.4 Cat 4: Perda Catastrófica

```
1. ATIVAR PLANO DE EMERGÊNCIA
   - Toda a liderança notificada
   - Comunicação externa preparada

2. AVALIAR
   - Extensão da perda
   - Dados recuperáveis vs perdidos
   - Timeline estimada

3. RECONSTRUIR
   - Novo projeto Lovable Cloud (se necessário)
   - Restaurar esquema via migrations (versionadas)
   - Restaurar dados de backup mais recente
   - Reconfigurar Edge Functions
   - Reconfigurar secrets e API keys

4. REVALIDAR
   - Suite completa de testes
   - Validação de integridade de dados
   - Verificação de RLS em todas as tabelas
   - Teste de todos os fluxos críticos

5. RECONECTAR
   - Atualizar DNS se necessário
   - Agentes reconectarão automaticamente (retry built-in)
   - Monitorar reconexão da frota
```

---

## 5. Backups

| Item | Frequência | Retenção | Tipo |
|------|-----------|----------|------|
| Banco de dados | Diário (automático) | 30 dias | Snapshot |
| Point-in-time Recovery | Contínuo | 7 dias | WAL |
| Migrations (schema) | Versionado (Git) | Indefinido | Código |
| Edge Functions | Versionado (Git) | Indefinido | Código |
| Configurações | Versionado (Git) | Indefinido | Código |
| Secrets | Manual (documentado) | N/A | Vault |

---

## 6. Testes do DRP

| Tipo de Teste | Frequência | Escopo |
|-------------|-----------|--------|
| **Tabletop** | Trimestral | Simulação de cenários em mesa |
| **Restore Test** | Semestral | Restauração de backup em ambiente isolado |
| **Failover Test** | Anual | Simulação de indisponibilidade completa |

### 6.1 Registro de Testes

| Data | Tipo | Cenário | Resultado | RTO Real | Ações |
|------|------|---------|-----------|----------|-------|
| - | - | - | - | - | Primeiro teste pendente |

---

## 7. Contatos de Emergência

| Papel | Responsável | Contato |
|-------|-------------|---------|
| Líder DRP | CTO | cto@cybershield.com.br |
| DevOps | DevOps Lead | devops@cybershield.com.br |
| Segurança | CISO | ciso@cybershield.com.br |
| Comunicação | Head de Produto | product@cybershield.com.br |
| Provider | Lovable Cloud Support | Via portal |

---

## Histórico

| Versão | Data | Autor | Alterações |
|--------|------|-------|------------|
| 1.0 | 2025-01-01 | CyberShield DevOps | Versão inicial |
