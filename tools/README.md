# 🛠️ CyberShield Tools

Ferramentas de teste e diagnóstico para desenvolvimento e troubleshooting.

---

## 📋 Scripts Disponíveis

### 1. `test-track-installation-event.sh`
**Testa a edge function `track-installation-event`**

Valida que o endpoint aceita corretamente:
- Event types: `post_installation`, `post_installation_unverified`
- Platforms: `macos`, `windows`, `linux`
- Rejeita payloads inválidos com schema correto

**Pré-requisitos:**
```bash
export SUPABASE_URL="https://iavbnmduxpxhwubqrzzn.supabase.co"
export ACCESS_TOKEN="eyJhbGc..."  # JWT de usuário autenticado
```

**Como rodar:**
```bash
chmod +x tools/test-track-installation-event.sh
./tools/test-track-installation-event.sh
```

**Resultado esperado:**
```
🎉 TODOS OS TESTES PASSARAM!
✅ track-installation-event aceita post_installation + macos
✅ Validação de schema funciona corretamente
```

---

## 🔍 Queries SQL de Diagnóstico

### Smoke Tests de Lifecycle

Arquivos em `tools/sql/`:

1. **`smoke-test-lifecycle.sql`**
   - Visão geral de agentes por OS e lifecycle stage (24h)
   - Identifica agentes problemáticos
   - Útil para debug rápido de instalações

2. **`smoke-test-installation-health.sql`**
   - Taxa de sucesso de instalação por platform
   - Tempo médio de instalação
   - Top 5 erros mais comuns

**Como usar:**
```bash
psql "$DATABASE_URL" < tools/sql/smoke-test-lifecycle.sql
```

Ou no Supabase SQL Editor:
1. Abrir `Cloud` → `Database` → `SQL Editor`
2. Copiar conteúdo do arquivo `.sql`
3. Executar query

---

## 🧪 Como Gerar ACCESS_TOKEN para Testes

### Opção 1: Via Dashboard (Recomendado)
1. Login no CyberShield como admin
2. Abrir DevTools → Console
3. Rodar:
   ```javascript
   supabase.auth.getSession().then(d => console.log(d.data.session.access_token))
   ```
4. Copiar token gerado

### Opção 2: Via curl (Signup/Login)
```bash
# Signup
curl -X POST "$SUPABASE_URL/auth/v1/signup" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "test123456"}'

# Login (retorna access_token)
curl -X POST "$SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "test123456"}'
```

### Opção 3: Service Role Key (APENAS PARA TESTES LOCAIS)
⚠️ **NUNCA use SERVICE_ROLE_KEY em CI/CD público ou logs!**
```bash
export ACCESS_TOKEN="$SUPABASE_SERVICE_ROLE_KEY"
```

---

## 📊 Interpretando Resultados

### Script de testes passou ✅
```
🎉 TODOS OS TESTES PASSARAM!
```
Significa que a edge function está aceitando corretamente os novos event types e platforms.

### Script falhou ❌
```
❌ macOS post_installation FALHOU (esperado 2xx, recebido 422)
```

**Possíveis causas:**
1. Schema do Zod não atualizado com `post_installation` / `macos`
2. Endpoint retornando erro de validação
3. ACCESS_TOKEN inválido ou expirado

**Como debugar:**
```bash
# Ver logs da edge function
supabase functions logs track-installation-event --limit 50

# Testar manualmente com curl
curl -v -X POST "$SUPABASE_URL/functions/v1/track-installation-event" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{"agent_name": "test", "event_type": "post_installation", "platform": "macos"}'
```

---

## 🔧 Troubleshooting

### Erro: "SUPABASE_URL not set"
```bash
export SUPABASE_URL="https://iavbnmduxpxhwubqrzzn.supabase.co"
```

### Erro: "ACCESS_TOKEN not set"
Gerar token conforme seção "Como Gerar ACCESS_TOKEN" acima.

### Erro: "401 Unauthorized"
Token expirado. Gerar novo token.

### Erro: "422 Unprocessable Entity"
Payload inválido. Verificar schema do Zod em:
`supabase/functions/track-installation-event/index.ts`

---

## 📖 Documentação Relacionada

- [TESTING_INSTALLATION_HEALTH.md](../docs/TESTING_INSTALLATION_HEALTH.md) - Guia completo de validação
- [AGENT_V3_UPGRADE_GUIDE.md](../docs/AGENT_V3_UPGRADE_GUIDE.md) - Mudanças do v3.0.0
- [VALIDATION_GUIDE.md](../VALIDATION_GUIDE.md) - Validação manual end-to-end
