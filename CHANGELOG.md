# Changelog

Todas as mudanças significativas no CyberShield são documentadas neste arquivo.

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/).
Versionamento segue [Semantic Versioning](https://semver.org/lang/pt-BR/).

## [2.1.0] - 2026-03-25

### Adicionado
- **FIDO2 Authentication**: Login com chaves de segurança (YubiKey, Google Titan, Touch ID, Windows Hello) — SOC2 CC6.1
- **Rate Limit Middleware**: Proteção centralizada por tier (free/pro/enterprise) em Edge Functions
- **IP Allowlist Enforcement**: Restrição de acesso admin a IPs autorizados via `admin_ip_whitelist`
- **Ed25519 Job Verification**: Verificação criptográfica completa (`openssl pkeyutl`) em agentes Linux/macOS
- **Política #15**: Segurança Física e Gestão de Ativos (POL-015) — ISO 27001 A.11
- **CHANGELOG versionado**: Rastreabilidade de mudanças conforme SOC2 CC8.1

### Corrigido
- **SEC-010**: Ed25519 fail-closed aplicado também em agentes Linux/macOS (não aceita update sem assinatura)

## [2.0.0] - 2026-03-25

### Enterprise Release

#### Adicionado
- **FIDO2/WebAuthn Registration**: Registro de hardware keys com `fido2-register` Edge Function
- **Token Rotation**: Rotação automática de tokens de agente a cada 30 dias com grace period
- **Drift Detection**: Monitoramento automático de compliance com scoring e alertas (`drift-detect`)
- **EDR Pipeline**: 51 regras MITRE ATT&CK com detecção comportamental e correlação
- **SOAR Engine**: Automação de resposta a incidentes com blast radius adaptativo
- **SLI/SLO Dashboard**: Métricas de disponibilidade, latência e error budget
- **Multi-Tenant RLS**: Isolamento completo via Row-Level Security em todas as tabelas
- **Audit Trail**: Hash chain imutável para evidência forense (INV-005)
- **SAML 2.0 SSO**: Suporte a Okta, Azure AD, Google Workspace
- **Agent Self-Healing**: Watchdog com re-download automático e verificação TOCTOU

#### Segurança
- Ed25519 supply chain para scripts e releases de agente
- ECDSA-P256 para autenticação bidirecional agente↔servidor
- HMAC-SHA256 com tolerância de clock skew (±5min)
- MFA obrigatório para admins (ADR-008)
- Rate limiting com `check_rate_limit_atomic` RPC
- Circuit breaker para Edge Functions críticas

#### Documentação
- 20 políticas de segurança (POL-001 a POL-020)
- Runbooks para incidentes críticos
- Matriz de riscos com 34 riscos rastreados

## [1.0.0] - 2025-12-01

### Release Inicial

#### Adicionado
- Agente PowerShell para Windows com coleta de telemetria
- Dashboard de segurança com visualizações em tempo real
- Sistema de jobs com entrega e execução
- Autenticação com Supabase Auth
- Multi-tenancy básico
