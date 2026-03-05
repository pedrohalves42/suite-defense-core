# 📚 CyberShield API Documentation

> Documentação técnica completa das APIs públicas do CyberShield

**Versão:** 1.0.0  
**Última atualização:** 2026-02-08  
**Base URL:** `https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1`

---

## 📋 Índice

1. [Visão Geral](#1-visão-geral)
2. [Autenticação](#2-autenticação)
3. [Rate Limiting](#3-rate-limiting)
4. [Endpoints da API](#4-endpoints-da-api)
   - [Tenant Info](#41-tenant-info)
   - [Tenant Stats](#42-tenant-stats)
   - [Tenant Features](#43-tenant-features)
5. [Códigos de Erro](#5-códigos-de-erro)
6. [Exemplos de Integração](#6-exemplos-de-integração)
7. [SDKs e Bibliotecas](#7-sdks-e-bibliotecas)

---

## 1. Visão Geral

A API CyberShield permite integrar funcionalidades de monitoramento de segurança em sistemas externos. Todas as APIs utilizam REST sobre HTTPS e retornam JSON.

### Características

| Característica | Descrição |
|---------------|-----------|
| **Protocolo** | HTTPS (TLS 1.2+) |
| **Formato** | JSON |
| **Encoding** | UTF-8 |
| **Autenticação** | Bearer Token (API Key) |
| **Rate Limit** | 100 requests/minuto |

### Headers Obrigatórios

```http
Authorization: Bearer sk_your_api_key_here
Content-Type: application/json
```

### Headers de Resposta

```http
Access-Control-Allow-Origin: *
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-Request-ID: uuid-da-requisição
X-Response-Time: tempo-em-ms
```

---

## 2. Autenticação

### API Keys

A autenticação é feita via API Keys no formato `sk_` (secret key).

```bash
# Formato da API Key
sk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### Obter uma API Key

1. Acesse o Dashboard CyberShield como administrador
2. Navegue até **Configurações > API Keys**
3. Clique em **Criar Nova Chave**
4. Defina os escopos necessários (`read`, `write`, `admin`)
5. Guarde a chave em local seguro (exibida apenas uma vez)

### Escopos Disponíveis

| Escopo | Descrição | Endpoints Permitidos |
|--------|-----------|---------------------|
| `read` | Leitura de dados | GET em todos endpoints |
| `write` | Escrita de dados | POST, PUT, DELETE |
| `admin` | Acesso completo | Todos os endpoints |

### Exemplo de Requisição Autenticada

```bash
curl -X GET \
  https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/api-tenant-info \
  -H "Authorization: Bearer sk_your_api_key_here" \
  -H "Content-Type: application/json"
```

### Resposta de Erro de Autenticação

```json
{
  "error": "Invalid API key"
}
```

**Códigos HTTP:**
- `401 Unauthorized` - Chave inválida, expirada ou ausente
- `403 Forbidden` - Escopo insuficiente para o endpoint

---

## 3. Rate Limiting

A API implementa rate limiting para proteger contra abusos.

### Limites Padrão

| Endpoint | Limite | Janela | Bloqueio |
|----------|--------|--------|----------|
| Todos | 100 requests | 1 minuto | 5 minutos |

### Resposta de Rate Limit Excedido

```http
HTTP/1.1 429 Too Many Requests
Content-Type: application/json
```

```json
{
  "error": "Rate limit exceeded",
  "resetAt": "2026-02-08T12:35:00.000Z"
}
```

### Headers de Rate Limit

```http
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1707400500
```

### Boas Práticas

- Implemente retry com backoff exponencial
- Cache respostas quando possível
- Agrupe requisições em lotes

---

## 4. Endpoints da API

### 4.1 Tenant Info

Retorna informações básicas do tenant associado à API Key.

**Endpoint:** `GET /api-tenant-info`

**Escopo Requerido:** `read`

#### Request

```bash
curl -X GET \
  https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/api-tenant-info \
  -H "Authorization: Bearer sk_your_api_key_here"
```

#### Response (200 OK)

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Empresa ABC",
  "slug": "empresa-abc",
  "created_at": "2025-01-15T10:30:00.000Z",
  "updated_at": "2026-02-01T14:22:00.000Z"
}
```

#### Campos de Resposta

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | UUID | Identificador único do tenant |
| `name` | string | Nome da organização |
| `slug` | string | Identificador URL-friendly |
| `created_at` | ISO8601 | Data de criação |
| `updated_at` | ISO8601 | Última atualização |

---

### 4.2 Tenant Stats

Retorna estatísticas consolidadas de segurança do tenant.

**Endpoint:** `GET /api-tenant-stats`

**Escopo Requerido:** `read`

#### Request

```bash
curl -X GET \
  https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/api-tenant-stats \
  -H "Authorization: Bearer sk_your_api_key_here"
```

#### Response (200 OK)

```json
{
  "agents": {
    "total": 150,
    "active": 142,
    "offline": 8
  },
  "scans": {
    "total": 45230,
    "malicious": 127,
    "clean": 45103
  },
  "quarantine": {
    "total": 89,
    "quarantined": 76,
    "restored": 13
  },
  "jobs": {
    "total": 12540,
    "completed": 12400,
    "pending": 120,
    "failed": 20
  },
  "timestamp": "2026-02-08T12:00:00.000Z"
}
```

#### Campos de Resposta

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `agents.total` | number | Total de agentes registrados |
| `agents.active` | number | Agentes online (heartbeat < 5 min) |
| `agents.offline` | number | Agentes offline |
| `scans.total` | number | Total de scans realizados |
| `scans.malicious` | number | Arquivos maliciosos detectados |
| `scans.clean` | number | Arquivos limpos |
| `quarantine.total` | number | Total de quarentenas |
| `quarantine.quarantined` | number | Atualmente em quarentena |
| `quarantine.restored` | number | Restaurados da quarentena |
| `jobs.total` | number | Total de jobs |
| `jobs.completed` | number | Jobs concluídos com sucesso |
| `jobs.pending` | number | Jobs aguardando execução |
| `jobs.failed` | number | Jobs falhados |
| `timestamp` | ISO8601 | Momento da coleta |

#### Notas de Implementação

- Dados limitados a 1000 registros por categoria
- Cache recomendado: 5 minutos
- Agentes são considerados "active" se `last_heartbeat` < 5 minutos

---

### 4.3 Tenant Features

Retorna as features habilitadas e quotas do tenant.

**Endpoint:** `GET /api-tenant-features`

**Escopo Requerido:** `read`

#### Request

```bash
curl -X GET \
  https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/api-tenant-features \
  -H "Authorization: Bearer sk_your_api_key_here"
```

#### Response (200 OK)

```json
{
  "features": [
    {
      "feature_key": "ai_analysis",
      "enabled": true,
      "quota_limit": 1000,
      "quota_used": 450,
      "metadata": {
        "model": "gemini-2.5-flash",
        "version": "1.0"
      }
    },
    {
      "feature_key": "threat_intelligence",
      "enabled": true,
      "quota_limit": null,
      "quota_used": null,
      "metadata": null
    },
    {
      "feature_key": "compliance_reports",
      "enabled": false,
      "quota_limit": 10,
      "quota_used": 0,
      "metadata": {
        "formats": ["pdf", "csv"]
      }
    }
  ]
}
```

#### Campos de Resposta

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `feature_key` | string | Identificador da feature |
| `enabled` | boolean | Se está habilitada |
| `quota_limit` | number\|null | Limite de uso (null = ilimitado) |
| `quota_used` | number\|null | Uso atual |
| `metadata` | object\|null | Configurações adicionais |

#### Features Disponíveis

| Feature Key | Descrição |
|-------------|-----------|
| `ai_analysis` | Análise de ameaças por IA |
| `threat_intelligence` | Feed de inteligência de ameaças |
| `compliance_reports` | Relatórios de conformidade |
| `dns_filtering` | Filtro DNS corporativo |
| `auto_quarantine` | Quarentena automática |
| `executive_reports` | Relatórios executivos |

---

## 5. Códigos de Erro

### Códigos HTTP

| Código | Significado | Descrição |
|--------|-------------|-----------|
| 200 | OK | Requisição bem-sucedida |
| 400 | Bad Request | Parâmetros inválidos |
| 401 | Unauthorized | API key ausente ou inválida |
| 403 | Forbidden | Escopo insuficiente |
| 404 | Not Found | Recurso não encontrado |
| 429 | Too Many Requests | Rate limit excedido |
| 500 | Internal Server Error | Erro interno do servidor |

### Formato de Erro

```json
{
  "error": "Descrição do erro",
  "code": "ERROR_CODE",
  "details": {
    "field": "informação adicional"
  }
}
```

### Códigos de Erro Comuns

| Código | Descrição | Solução |
|--------|-----------|---------|
| `MISSING_API_KEY` | Header Authorization ausente | Adicionar `Authorization: Bearer sk_...` |
| `INVALID_API_KEY` | Chave mal formatada | Verificar formato `sk_xxx` |
| `EXPIRED_API_KEY` | Chave expirada | Gerar nova chave no dashboard |
| `INACTIVE_API_KEY` | Chave desativada | Reativar no dashboard |
| `INSUFFICIENT_SCOPE` | Escopo insuficiente | Verificar permissões da chave |
| `RATE_LIMIT_EXCEEDED` | Limite de taxa excedido | Aguardar `resetAt` |
| `TENANT_NOT_FOUND` | Tenant não encontrado | Verificar associação da chave |

---

## 6. Exemplos de Integração

### Node.js / TypeScript

```typescript
import axios from 'axios';

const api = axios.create({
  baseURL: 'https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1',
  headers: {
    'Authorization': `Bearer ${process.env.CYBERSHIELD_API_KEY}`,
    'Content-Type': 'application/json'
  }
});

// Obter estatísticas
async function getStats() {
  try {
    const response = await api.get('/api-tenant-stats');
    console.log('Agentes ativos:', response.data.agents.active);
    return response.data;
  } catch (error) {
    if (error.response?.status === 429) {
      const resetAt = new Date(error.response.data.resetAt);
      console.log('Rate limited. Reset em:', resetAt);
    }
    throw error;
  }
}

// Com retry exponencial
async function fetchWithRetry(fn: () => Promise<any>, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      if (error.response?.status === 429 && i < maxRetries - 1) {
        const waitMs = Math.pow(2, i) * 1000;
        await new Promise(resolve => setTimeout(resolve, waitMs));
        continue;
      }
      throw error;
    }
  }
}
```

### Python

```python
import requests
import time
import os

class CyberShieldAPI:
    def __init__(self, api_key: str = None):
        self.base_url = "https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1"
        self.api_key = api_key or os.environ.get("CYBERSHIELD_API_KEY")
        self.session = requests.Session()
        self.session.headers.update({
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        })
    
    def get_tenant_info(self) -> dict:
        """Retorna informações do tenant."""
        response = self.session.get(f"{self.base_url}/api-tenant-info")
        response.raise_for_status()
        return response.json()
    
    def get_tenant_stats(self) -> dict:
        """Retorna estatísticas do tenant."""
        response = self.session.get(f"{self.base_url}/api-tenant-stats")
        response.raise_for_status()
        return response.json()
    
    def get_tenant_features(self) -> dict:
        """Retorna features habilitadas."""
        response = self.session.get(f"{self.base_url}/api-tenant-features")
        response.raise_for_status()
        return response.json()

# Uso
api = CyberShieldAPI()
stats = api.get_tenant_stats()
print(f"Agentes ativos: {stats['agents']['active']}")
print(f"Ameaças detectadas: {stats['scans']['malicious']}")
```

### cURL (Bash)

```bash
#!/bin/bash

API_KEY="sk_your_api_key_here"
BASE_URL="https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1"

# Função para fazer requisições
cybershield_api() {
  local endpoint="$1"
  curl -s -X GET \
    "${BASE_URL}/${endpoint}" \
    -H "Authorization: Bearer ${API_KEY}" \
    -H "Content-Type: application/json"
}

# Obter stats
echo "=== Tenant Stats ==="
cybershield_api "api-tenant-stats" | jq .

# Obter info
echo "=== Tenant Info ==="
cybershield_api "api-tenant-info" | jq .

# Obter features
echo "=== Tenant Features ==="
cybershield_api "api-tenant-features" | jq '.features[] | select(.enabled == true) | .feature_key'
```

### PowerShell

```powershell
$ApiKey = $env:CYBERSHIELD_API_KEY
$BaseUrl = "https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1"

$Headers = @{
    "Authorization" = "Bearer $ApiKey"
    "Content-Type" = "application/json"
}

function Get-CyberShieldStats {
    $response = Invoke-RestMethod -Uri "$BaseUrl/api-tenant-stats" -Headers $Headers -Method Get
    return $response
}

function Get-CyberShieldInfo {
    $response = Invoke-RestMethod -Uri "$BaseUrl/api-tenant-info" -Headers $Headers -Method Get
    return $response
}

# Exemplo de uso
$stats = Get-CyberShieldStats
Write-Host "Agentes ativos: $($stats.agents.active)"
Write-Host "Arquivos em quarentena: $($stats.quarantine.quarantined)"
```

---

## 7. SDKs e Bibliotecas

### SDK Oficial (Em desenvolvimento)

```bash
# Node.js
npm install @cybershield/sdk

# Python
pip install cybershield-sdk
```

### Integrações Disponíveis

| Plataforma | Status | Link |
|------------|--------|------|
| Zapier | ✅ Disponível | [Zap Integration](https://zapier.com) |
| Power Automate | 🔄 Em breve | - |
| n8n | ✅ Disponível | [n8n Node](https://n8n.io) |
| Slack | ✅ Disponível | [Slack App](https://slack.com) |
| Teams | 🔄 Em breve | - |

---

## Changelog

### v1.0.0 (2026-02-08)
- Lançamento inicial da API pública
- Endpoints: tenant-info, tenant-stats, tenant-features
- Rate limiting: 100 req/min
- Autenticação via API Keys
