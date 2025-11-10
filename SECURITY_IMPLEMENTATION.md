# Implementação de Segurança - CyberShield

## Visão Geral

Este documento detalha todas as medidas de segurança implementadas no CyberShield para proteger contra ataques comuns de injeção e abuso do sistema.

---

## 1. Validação de Input com Zod

### Endpoints Protegidos

Todos os endpoints críticos possuem validação rigorosa usando Zod:

#### **auto-generate-enrollment**
- ✅ Nome do agente: 3-64 caracteres
- ✅ Formato: `^[a-zA-Z0-9][a-zA-Z0-9-_]*[a-zA-Z0-9]$`
- ✅ Bloqueio de SQL injection patterns
- ✅ Bloqueio de nomes reservados (admin, root, system)
- ✅ Bloqueio de repetições excessivas (>5 caracteres)
- ✅ Bloqueio de caracteres de controle

#### **create-job**
- ✅ Nome do agente validado
- ✅ Tipo de job restrito a enum
- ✅ Payload validado contra XSS
- ✅ Validação de recurrence pattern

#### **upload-report**
- ✅ Tipo de report validado
- ✅ Nome de arquivo validado
- ✅ Bloqueio de path traversal
- ✅ Bloqueio de extensões executáveis (.exe, .bat, .sh)
- ✅ Validação de tamanho (máx 10MB)

### Padrões Bloqueados

**SQL Injection:**
```
'; DROP TABLE agents; --
admin' OR '1'='1
UNION SELECT * FROM users
```

**Path Traversal:**
```
../../../etc/passwd
..\\..\\windows\\system32
```

**XSS:**
```
<script>alert(1)</script>
javascript:alert('XSS')
<img src=x onerror=alert(1)>
```

**Caracteres de Controle:**
```
\x00 (null byte)
\x1B (escape)
\r\n (CRLF injection)
```

---

## 2. Rate Limiting

### Implementação Multi-Camadas

#### **Rate Limiting por Usuário**
- `create-job`: 60 requisições/minuto
- `heartbeat`: 2 requisições/minuto
- `upload-report`: 10 requisições/minuto

#### **Rate Limiting por IP**
- `auto-generate-enrollment`: 10 requisições/hora
  - Bloqueia por 2 horas se exceder
  - Previne ataques de força bruta

#### **IP Blocklist Automática**
- 5+ tentativas bloqueadas na última hora = bloqueio temporário
- Duração do bloqueio: 1 hora
- Logs detalhados de todas as tentativas

### Configuração

Todos os rate limits são configurados em `_shared/rate-limit.ts`:

```typescript
interface RateLimitConfig {
  maxRequests: number;    // Máximo de requisições
  windowMinutes: number;  // Janela de tempo em minutos
  blockMinutes?: number;  // Duração do bloqueio (opcional)
}
```

---

## 3. Logging de Segurança

### Tabela: security_logs

Todos os eventos de segurança são registrados com:

**Campos:**
- `ip_address`: IP de origem
- `endpoint`: Endpoint atacado
- `attack_type`: Tipo de ataque
- `severity`: low | medium | high | critical
- `blocked`: Se foi bloqueado ou não
- `details`: Detalhes JSON do ataque
- `user_agent`: User agent do request
- `tenant_id`: Tenant afetado (se aplicável)

**Tipos de Ataque Logados:**
- `sql_injection`: Tentativas de injeção SQL
- `xss`: Cross-Site Scripting
- `path_traversal`: Travessia de diretórios
- `rate_limit`: Limite de taxa excedido
- `invalid_input`: Entrada inválida/mal formatada
- `brute_force`: Força bruta (múltiplas tentativas)
- `unauthorized`: Acesso não autorizado
- `control_characters`: Caracteres de controle

**Retenção:**
- Logs mantidos por 90 dias
- Limpeza automática via função `cleanup_old_security_logs()`

---

## 4. Dashboard de Segurança

### Localização
`/admin/security`

### Métricas em Tempo Real

**Cards de Estatísticas (últimas 24h):**
- Total de Eventos
- Ataques Críticos
- Tentativas Bloqueadas
- IPs Únicos

**Tabela de Logs:**
- Auto-refresh a cada 10 segundos
- Últimos 100 eventos
- Filtros por severidade
- Detalhes de cada ataque

**Alertas:**
- Alerta vermelho quando eventos críticos são detectados
- Notificação visual para atenção imediata

### Acesso
- Apenas admins podem acessar
- RLS policy: `has_role(auth.uid(), 'admin')`
- Super admins veem logs de todos os tenants

---

## 5. HMAC Signature Verification

### Implementação
- Usado em todos os endpoints de agents
- Previne replay attacks
- Timestamp validation (requisições expiram)

**Algoritmo:**
```
payload = timestamp + ":" + request_body
signature = HMAC-SHA256(hmac_secret, payload)
```

**Headers Requeridos:**
```
X-Agent-Token: <token>
X-HMAC-Signature: <signature>
X-Timestamp: <unix_timestamp>
```

### Proteções
- ✅ Assinaturas são únicas por request
- ✅ Não podem ser reutilizadas (replay protection)
- ✅ Timestamp validation previne ataques tardios
- ✅ Secret armazenado com hash

---

## 6. RLS (Row Level Security)

### Políticas Implementadas

**security_logs:**
- Admins: Leitura no próprio tenant
- Super Admins: Leitura global
- Ninguém pode modificar ou deletar logs

**agents:**
- Admins: CRUD completo no próprio tenant
- Super Admins: Leitura global

**jobs:**
- Admins/Operators: CRUD no próprio tenant
- Viewers: Apenas leitura

**enrollment_keys:**
- Admins: CRUD no próprio tenant
- Operators: Leitura limitada

### Funções Security Definer
- `has_role()`: Verifica role do usuário
- `is_super_admin()`: Verifica se é super admin
- `current_user_tenant_id()`: Retorna tenant do usuário

---

## 7. Testes de Segurança

### Suite: input-validation.spec.ts

15 testes automatizados validando:
- ✓ SQL injection (5 variações)
- ✓ Path traversal (4 variações)
- ✓ XSS attempts (4 variações)
- ✓ Control characters (4 variações)
- ✓ Reserved names (5 nomes)
- ✓ Excessive repetition
- ✓ Invalid length (short/long)
- ✓ Invalid start/end characters
- ✓ Comment characters
- ✓ Edge cases (empty, null, whitespace)

### Executar Testes

```bash
# Todos os testes de validação
npx playwright test input-validation

# Com output detalhado
npx playwright test input-validation --reporter=line

# Apenas SQL injection
npx playwright test input-validation -g "SQL injection"
```

---

## 8. Monitoramento e Alertas

### Logs Automáticos

Todos os eventos de segurança são automaticamente logados:
1. Request recebido
2. Validação executada
3. Se falhar: Log criado em `security_logs`
4. Dashboard atualizado em tempo real

### Métricas Disponíveis

No Dashboard de Segurança (`/admin/security`):
- Gráficos de eventos por tipo
- Mapa de IPs atacantes
- Timeline de tentativas
- Top 10 endpoints atacados
- Taxa de bloqueio

---

## 9. Best Practices Implementadas

### ✅ Defense in Depth
- Validação client-side (React Hook Form)
- Validação server-side (Zod)
- RLS policies (Supabase)
- Rate limiting (Multi-camadas)
- Logging (Auditoria completa)

### ✅ Principle of Least Privilege
- Usuários só veem dados do próprio tenant
- Operators têm acesso limitado
- Viewers apenas leitura
- Super admins acesso total auditado

### ✅ Fail Secure
- Default: Negar acesso
- Validação falha = Bloquear
- Rate limit excedido = Bloquear
- Token inválido = Negar

### ✅ Audit Trail
- Todos os eventos críticos são logados
- Logs imutáveis (não podem ser editados/deletados)
- Retenção de 90 dias
- IP e user agent capturados

---

## 10. Roadmap de Segurança

### Próximas Implementações
- [ ] WAF (Web Application Firewall) rules
- [ ] Geolocation-based blocking
- [ ] Honeypot endpoints
- [ ] CAPTCHA para múltiplas falhas
- [ ] 2FA (Two-Factor Authentication)
- [ ] Notificações por email de eventos críticos
- [ ] Dashboard de ameaças em tempo real
- [ ] Integração com SIEM

### Auditorias Regulares
- Semanal: npm audit
- Mensal: Penetration testing
- Trimestral: Security review completo

---

## Contato

Para reportar vulnerabilidades:
- Email: gamehousetecnologia@gmail.com
- Processo: Responsible disclosure

**Não divulgue vulnerabilidades publicamente antes de reportar.**

---

## Referências

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Supabase RLS Documentation](https://supabase.com/docs/guides/auth/row-level-security)
- [Zod Validation](https://zod.dev/)
- [Rate Limiting Best Practices](https://www.cloudflare.com/learning/bots/what-is-rate-limiting/)
