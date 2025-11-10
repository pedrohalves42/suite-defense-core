# Especificação HMAC - CyberShield Agent

## Visão Geral

O CyberShield utiliza assinatura HMAC-SHA256 para autenticar todas as requisições entre agentes e servidor, prevenindo ataques de replay e garantindo integridade dos dados.

## Formato do Payload

### Estrutura Obrigatória

```
${timestamp}:${nonce}:${body}
```

**Separador:** Dois pontos (`:`)

**Componentes:**
1. **timestamp** - Unix timestamp em **milissegundos**
2. **nonce** - UUID v4 único por requisição
3. **body** - JSON serializado ou string vazia

### Exemplo

```
1699123456789:550e8400-e29b-41d4-a716-446655440000:{"status":"active"}
```

## Implementação

### PowerShell (Agente Windows)

```powershell
# 1. Gerar componentes
$timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$nonce = [guid]::NewGuid().ToString()
$bodyJson = if ($Body) { $Body | ConvertTo-Json -Compress } else { "{}" }

# 2. Construir payload
$message = "${timestamp}:${nonce}:${bodyJson}"

# 3. Calcular HMAC
$hmacsha = New-Object System.Security.Cryptography.HMACSHA256
$hmacsha.Key = [Text.Encoding]::UTF8.GetBytes($HmacSecret)
$signature = $hmacsha.ComputeHash([Text.Encoding]::UTF8.GetBytes($message))
$signatureHex = [System.BitConverter]::ToString($signature).Replace('-', '').ToLower()

# 4. Enviar headers
$headers = @{
    "X-Agent-Token" = $AgentToken
    "X-HMAC-Signature" = $signatureHex
    "X-Timestamp" = $timestamp.ToString()
    "X-Nonce" = $nonce
}
```

### Bash (Agente Linux)

```bash
# 1. Gerar componentes
timestamp=$(date +%s%3N)  # Millisegundos
nonce=$(uuidgen)
body_json='{"status":"active"}'

# 2. Construir payload
message="${timestamp}:${nonce}:${body_json}"

# 3. Calcular HMAC
signature=$(echo -n "$message" | openssl dgst -sha256 -hmac "$HMAC_SECRET" | awk '{print $2}')

# 4. Enviar headers
curl -X POST "$SERVER_URL/functions/v1/heartbeat" \
  -H "X-Agent-Token: $AGENT_TOKEN" \
  -H "X-HMAC-Signature: $signature" \
  -H "X-Timestamp: $timestamp" \
  -H "X-Nonce: $nonce" \
  -H "Content-Type: application/json" \
  -d "$body_json"
```

### TypeScript/Node.js (Testes E2E)

```typescript
import crypto from 'crypto';

function generateHmac(secret: string, body: string, timestamp: string, nonce: string): string {
  const payload = `${timestamp}:${nonce}:${body}`;
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

// Uso
const timestamp = Date.now().toString();
const nonce = crypto.randomUUID();
const body = JSON.stringify({ status: 'active' });
const hmacSignature = generateHmac(hmacSecret, body, timestamp, nonce);

// Headers
const headers = {
  'X-Agent-Token': agentToken,
  'X-HMAC-Signature': hmacSignature,
  'X-Timestamp': timestamp,
  'X-Nonce': nonce,
  'Content-Type': 'application/json'
};
```

### Deno (Edge Functions - Backend)

```typescript
// supabase/functions/_shared/hmac.ts
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

export async function verifyHmacSignature(
  supabase: SupabaseClient,
  request: Request,
  agentName: string,
  hmacSecret: string
): Promise<{ valid: boolean; error?: string }> {
  const signature = request.headers.get('X-HMAC-Signature');
  const timestamp = request.headers.get('X-Timestamp');
  const nonce = request.headers.get('X-Nonce');

  if (!signature || !timestamp || !nonce) {
    return { valid: false, error: 'Headers HMAC ausentes' };
  }

  // Verificar timestamp (máximo 5 minutos de diferença)
  const requestTime = parseInt(timestamp);
  const now = Date.now();
  const maxDiff = 5 * 60 * 1000; // 5 minutos

  if (Math.abs(now - requestTime) > maxDiff) {
    return { valid: false, error: 'Timestamp expirado' };
  }

  // Construir payload
  let body = '';
  try {
    const clonedRequest = request.clone();
    body = await clonedRequest.text();
  } catch {
    body = '';
  }

  const payload = `${timestamp}:${nonce}:${body}`;

  // Verificar assinatura HMAC
  const encoder = new TextEncoder();
  const keyData = encoder.encode(hmacSecret);
  const messageData = encoder.encode(payload);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  const expectedSignature = Array.from(new Uint8Array(signatureBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  if (signature !== expectedSignature) {
    return { valid: false, error: 'Assinatura HMAC inválida' };
  }

  return { valid: true };
}
```

## Headers Obrigatórios

| Header | Tipo | Descrição | Exemplo |
|--------|------|-----------|---------|
| `X-Agent-Token` | UUID | Token único do agente | `550e8400-e29b-41d4-a716-446655440000` |
| `X-HMAC-Signature` | HEX | Assinatura HMAC-SHA256 | `a3b2c1d4e5f6...` (64 chars) |
| `X-Timestamp` | String | Unix timestamp em millisegundos | `1699123456789` |
| `X-Nonce` | UUID | UUID único por requisição | `123e4567-e89b-12d3-a456-426614174000` |

## Validações no Backend

### 1. Headers Presentes
```typescript
if (!signature || !timestamp || !nonce) {
  return 401; // Headers ausentes
}
```

### 2. Timestamp Válido
```typescript
const requestTime = parseInt(timestamp);
const now = Date.now();
const maxDiff = 5 * 60 * 1000; // 5 minutos

if (Math.abs(now - requestTime) > maxDiff) {
  return 401; // Timestamp expirado
}
```

### 3. Replay Attack Prevention
```typescript
const { data: usedSignature } = await supabase
  .from('hmac_signatures')
  .select('id')
  .eq('signature', signature)
  .single();

if (usedSignature) {
  return 401; // Assinatura já utilizada
}
```

### 4. Verificação HMAC
```typescript
const payload = `${timestamp}:${nonce}:${body}`;
const expectedSignature = crypto.subtle.sign('HMAC', cryptoKey, payload);

if (signature !== expectedSignature) {
  return 401; // Assinatura inválida
}
```

## Erros Comuns

### ❌ Formato Incorreto

```powershell
# ERRADO: sem separadores
$message = "$timestamp$nonce$bodyJson"

# CORRETO: com separadores
$message = "${timestamp}:${nonce}:${bodyJson}"
```

### ❌ Timestamp em Segundos

```powershell
# ERRADO: segundos
$timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()

# CORRETO: millisegundos
$timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
```

### ❌ Sem Nonce

```typescript
// ERRADO: sem nonce
const payload = `${timestamp}:${body}`;

// CORRETO: com nonce
const payload = `${timestamp}:${nonce}:${body}`;
```

### ❌ Body Diferente

```powershell
# ERRADO: usar body diferente no HMAC e na requisição
$message = "${timestamp}:${nonce}:{}"
Invoke-RestMethod -Body $actualBody  # ← body diferente!

# CORRETO: mesmo body
$bodyJson = $actualBody | ConvertTo-Json -Compress
$message = "${timestamp}:${nonce}:${bodyJson}"
Invoke-RestMethod -Body $bodyJson
```

## Testes de Validação

### Script de Validação Rápida

```powershell
.\tests\validate-hmac-format.ps1 -AgentScriptPath ".\agent-scripts\cybershield-agent-windows.ps1"
```

### Teste E2E

```bash
npx playwright test e2e/agent-flow.spec.ts
```

## Segurança

### Janela de Tempo

- **Máximo:** 5 minutos de diferença entre timestamp da requisição e servidor
- **Motivo:** Prevenir replay attacks antigos

### Nonce Único

- **Armazenamento:** `hmac_signatures` table
- **TTL:** 5 minutos (cleanup automático)
- **Motivo:** Prevenir replay exato da mesma requisição

### Secret Rotation

Para rotacionar HMAC secrets:

1. Gerar novo secret via `auto-generate-enrollment`
2. Atualizar agente com novo secret
3. Secret antigo continua válido por 24h (grace period)
4. Após 24h, secret antigo é invalidado

## Referências

- [RFC 2104 - HMAC: Keyed-Hashing for Message Authentication](https://datatracker.ietf.org/doc/html/rfc2104)
- [OWASP: HMAC Authentication](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html#hmac)
- [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)

## Suporte

Para questões sobre HMAC ou autenticação:
- Email: gamehousetecnologia@gmail.com
- WhatsApp: (34) 98443-2835
