# 📡 CyberShield API — Documentação Pública

> **Base URL**: `https://<project-id>.supabase.co/functions/v1`  
> **Autenticação**: Bearer Token (JWT do agente ou API Key)  
> **Formato**: JSON  
> **Versão**: v5.x

---

## 🔐 Autenticação

Todas as requisições devem incluir os headers:

```
Authorization: Bearer <token>
apikey: <anon-key>
Content-Type: application/json
```

Para endpoints de agentes, o token é o `agent_token` gerado no enrollment.  
Para endpoints administrativos, use o JWT do usuário autenticado.

### HMAC (Agentes v5+)

Agentes v5+ também enviam assinatura HMAC:

```
X-HMAC-Signature: <sha256-hmac-hex>
X-HMAC-Timestamp: <unix-timestamp>
```

---

## 📋 Endpoints de Agentes

### `POST /heartbeat`

Envia sinal de vida do agente ao servidor.

**Body:**
```json
{
  "agent_name": "DESKTOP-ABC",
  "agent_version": "v5.0.7",
  "hostname": "DESKTOP-ABC",
  "os_version": "Windows 11 Pro 23H2",
  "cpu_usage": 45.2,
  "memory_usage": 67.8,
  "disk_usage": 52.1,
  "uptime_seconds": 86400,
  "public_ip": "203.0.113.1",
  "local_ip": "192.168.1.100"
}
```

**Resposta (200):**
```json
{
  "ok": true,
  "agentName": "DESKTOP-ABC",
  "timestamp": "2026-02-18T00:00:00Z",
  "pendingUpdate": null,
  "lightMode": null
}
```

---

### `POST /poll-jobs`

Busca jobs pendentes para o agente executar.

**Body:**
```json
{
  "agent_name": "DESKTOP-ABC"
}
```

**Resposta (200):**
```json
{
  "jobs": [
    {
      "id": "uuid",
      "type": "run_script",
      "payload": { "script": "Get-Process" },
      "created_at": "2026-02-18T00:00:00Z",
      "priority": "normal"
    }
  ]
}
```

---

### `POST /submit-job-result`

Envia resultado da execução de um job.

**Body:**
```json
{
  "job_id": "uuid",
  "execution_id": "uuid",
  "status": "completed",
  "output": { "result": "..." },
  "exit_code": 0,
  "duration_ms": 1500,
  "agent_name": "DESKTOP-ABC",
  "payload_hash": "sha256-hex"
}
```

**Resposta (200):**
```json
{
  "ok": true,
  "executionId": "uuid"
}
```

---

### `POST /enroll-agent`

Registra um novo agente no sistema usando enrollment key.

**Body:**
```json
{
  "enrollment_key": "ek_xxxxxxxxxxxx",
  "hostname": "NEW-PC",
  "os_version": "Windows 11",
  "agent_version": "v5.0.7"
}
```

**Resposta (201):**
```json
{
  "agent_id": "uuid",
  "agent_name": "NEW-PC",
  "agent_token": "jwt-token",
  "hmac_secret": "hex-secret",
  "tenant_id": "uuid"
}
```

---

### `POST /submit-system-metrics`

Envia métricas de sistema (CPU, RAM, disco, rede).

**Body:**
```json
{
  "agent_name": "DESKTOP-ABC",
  "cpu_percent": 45.2,
  "memory_percent": 67.8,
  "memory_total_gb": 16,
  "memory_used_gb": 10.8,
  "disk_metrics": [
    {
      "drive_letter": "C:",
      "total_gb": 500,
      "used_gb": 250,
      "free_gb": 250,
      "usage_percent": 50
    }
  ],
  "network_info": {
    "adapters": [],
    "connections": []
  }
}
```

---

### `POST /submit-antivirus-status`

Reporta status do antivírus instalado.

**Body:**
```json
{
  "agent_name": "DESKTOP-ABC",
  "antivirus_name": "Windows Defender",
  "antivirus_enabled": true,
  "antivirus_updated": true,
  "realtime_protection": true,
  "last_scan_date": "2026-02-17T12:00:00Z"
}
```

---

### `POST /submit-software-inventory`

Envia inventário de software instalado.

**Body:**
```json
{
  "agent_name": "DESKTOP-ABC",
  "software": [
    {
      "name": "Google Chrome",
      "version": "122.0.6261.94",
      "publisher": "Google LLC",
      "install_date": "2026-01-15"
    }
  ]
}
```

---

### `POST /submit-vuln-findings`

Reporta vulnerabilidades detectadas (CVEs).

**Body:**
```json
{
  "agent_name": "DESKTOP-ABC",
  "findings": [
    {
      "cve_id": "CVE-2026-1234",
      "software_name": "OpenSSL",
      "software_version": "3.0.1",
      "severity": "HIGH",
      "cvss_score": 8.5
    }
  ]
}
```

---

## 🛡️ Endpoints Administrativos

### `POST /create-job`

Cria um novo job para execução nos agentes.

**Headers**: JWT de admin autenticado

**Body:**
```json
{
  "agent_ids": ["uuid1", "uuid2"],
  "job_type": "run_script",
  "payload": { "script": "Get-Service" },
  "priority": "high"
}
```

---

### `POST /generate-enrollment-key`

Gera nova chave de enrollment.

**Body:**
```json
{
  "name": "Filial SP",
  "max_uses": 50,
  "expires_in_days": 30
}
```

**Resposta (200):**
```json
{
  "key": "ek_xxxxxxxxxxxx",
  "id": "uuid",
  "expires_at": "2026-03-20T00:00:00Z"
}
```

---

### `POST /check-agent-updates`

Verifica se há atualizações disponíveis para agentes.

**Body:**
```json
{
  "agent_id": "uuid",
  "current_version": "v5.0.5"
}
```

---

### `GET /health`

Health check do sistema. Não requer autenticação.

**Resposta (200):**
```json
{
  "status": "ok",
  "timestamp": "2026-02-18T00:00:00Z"
}
```

---

## ⚠️ Códigos de Erro

| Código | Significado |
|--------|-------------|
| 200 | Sucesso |
| 201 | Criado com sucesso |
| 400 | Requisição inválida (dados faltando ou malformados) |
| 401 | Não autenticado (token inválido ou expirado) |
| 403 | Sem permissão (HMAC inválido ou tenant incorreto) |
| 404 | Recurso não encontrado |
| 409 | Conflito (ex: `PAYLOAD_TAMPERED` — hash divergente) |
| 429 | Rate limit excedido |
| 500 | Erro interno do servidor |

---

## 🔒 Segurança

- **Zero-Trust**: Toda requisição é verificada com JWT + HMAC (agentes v5+)
- **Tenant Isolation**: Dados são isolados por tenant via RLS
- **Payload Integrity**: Hash SHA256 do payload é verificado em `submit-job-result`
- **Rate Limiting**: Endpoints possuem rate limiting por IP e por agente
- **Audit Trail**: Todas as operações são registradas em trilha de auditoria imutável

---

## 📊 Rate Limits

| Endpoint | Limite |
|----------|--------|
| `/heartbeat` | 1 req/min por agente |
| `/poll-jobs` | 1 req/min por agente |
| `/submit-job-result` | 10 req/min por agente |
| `/enroll-agent` | 5 req/min por IP |
| Endpoints admin | 60 req/min por usuário |

---

## 🔄 Webhooks (Stripe)

O endpoint `POST /stripe-webhook` recebe eventos do Stripe para:
- Criação/atualização de assinaturas
- Pagamentos concluídos/falhados
- Cancelamentos

**Não chame este endpoint diretamente** — ele é configurado no painel do Stripe.

---

*Última atualização: Fevereiro 2026*
