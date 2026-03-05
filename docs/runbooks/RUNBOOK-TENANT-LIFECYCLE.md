# Runbook: Tenant Onboarding / Offboarding

| Campo | Valor |
|-------|-------|
| **Código** | RB-TENANT-001 |
| **Versão** | 1.0 |

---

## Onboarding

### 1. Criação do Tenant
1. Criar registro em `tenants` (nome, plano, configurações)
2. Criar convite para admin do tenant (`invites`)
3. Admin aceita convite → `profiles` + `user_roles` criados
4. Configurar `tenant_settings` (timezone, idioma, retenção)

### 2. Provisionamento de Agentes
1. Criar Enrollment Key para o tenant
2. Fornecer one-liner de instalação (via `serve-installer`)
3. Agentes registram-se automaticamente via enrollment key
4. Verificar heartbeat dos primeiros agentes

### 3. Configuração Inicial
1. Configurar alert rules padrão
2. Ativar playbooks SOAR recomendados
3. Configurar notificações (email, webhook)
4. Treinamento do operador MSP

### 4. Validação
- [ ] Tenant isolado (RLS verificado)
- [ ] Admin com acesso correto
- [ ] Agentes reportando heartbeat
- [ ] Alertas funcionando
- [ ] Dashboard carregando dados corretos

---

## Offboarding

### 1. Notificação (D-30)
1. Notificar MSP sobre encerramento
2. Oferecer exportação de dados (JSON/CSV)
3. Confirmar data de desativação

### 2. Desativação (D-0)
1. Revogar todos os tokens de agente
2. Desativar enrollment keys
3. Suspender sessões ativas
4. Marcar tenant como `inactive`

### 3. Retenção (D+0 a D+90)
1. Dados mantidos por 90 dias (período de exportação)
2. Acesso read-only para exportação mediante solicitação
3. Logs de auditoria retidos conforme política (5 anos)

### 4. Deleção (D+90)
1. Deletar dados operacionais (agentes, jobs, telemetria)
2. Anonimizar dados em logs de auditoria
3. Certificado de deleção emitido ao MSP
4. Registro em `audit_logs`

---

## Histórico

| Versão | Data | Autor | Alterações |
|--------|------|-------|------------|
| 1.0 | 2025-01-01 | CyberShield Operations | Versão inicial |
