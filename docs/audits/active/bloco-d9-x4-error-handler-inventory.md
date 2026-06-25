# D9-X4 — Inventário `_shared/error-handler.ts`

## Comando
```bash
rg -n "error-handler|handleError|createError|jsonError|errorResponse|AppError|ApiError" supabase/functions
```

## Símbolos exportados
- `corsHeaders` (re-export)
- `ErrorCode` (enum: UNAUTHORIZED, BAD_REQUEST, NOT_FOUND, FORBIDDEN, INTERNAL_ERROR, VALIDATION_ERROR, AUTH_ERROR, CONFLICT)
- `ErrorContext` (interface: traceId, tenantId, agentId, operation, latency)
- `StandardError` (interface)
- `createStandardError(code, message, details?, requestId?, context?)`
- `createErrorResponse(...)` — **2 overloads**:
  1. `(StandardError, status?, origin?)`
  2. `(code, message, status, requestId?, origin?)`
- `handleException(error, requestId, functionName, context?, origin?)` → Response 500
- `handleExceptionWithContext(error, requestId, functionName, startTime, overrides?, origin?)`
- `createValidationError(message|ZodError, details?, requestId?, origin?)` → Response 400
- `handleValidationError` (alias de createValidationError)
- `createAuthError(message?, requestId?, origin?)` → Response 401
- `createNotFoundError(resource, requestId?, origin?)` → Response 404

## Consumers (públicos / internos)

### Públicos / tenant-facing
- `api-gateway/index.ts` — `handleExceptionWithContext`, `createErrorResponse`
- `ops-gateway/index.ts` — `handleExceptionWithContext`, `createErrorResponse`
- `build-agent-exe/index.ts` — `createErrorResponse`
- `upload-report/index.ts` — `handleException`, `handleValidationError`
- `enroll-agent/index.ts` — `handleValidationError`
- `auto-generate-enrollment/index.ts` — `handleValidationError`
- `saml-sso/index.ts` — `handleException`
- `register-agent-key/index.ts` — `handleException`
- `poll-jobs/index.ts` — `handleExceptionWithContext`
- `submit-job-result/index.ts` — `handleException`
- `submit-job-result/security.ts` — `corsHeaders` re-export

### Internos / helpers
- `_shared/serve-tenant.ts` — `handleExceptionWithContext`
- `_shared/serve-agent.ts` — `handleExceptionWithContext`
- `_shared/serve-public.ts` — `handleExceptionWithContext`, `createErrorResponse`, `ErrorCode`
- `_shared/domain/billing/use-cases/*.ts` (3 arquivos) — `handleExceptionWithContext`

## Formato de erro externo (preservado)
```json
{
  "error": {
    "code": "string",
    "message": "string",
    "details": "unknown | undefined",
    "timestamp": "ISO-8601",
    "requestId": "string | undefined",
    "context": "ErrorContext | undefined"
  }
}
```

## Status codes em uso
- 400 (VALIDATION_ERROR, BAD_REQUEST)
- 401 (AUTH_ERROR, UNAUTHORIZED)
- 403 (FORBIDDEN)
- 404 (NOT_FOUND)
- 500 (INTERNAL_ERROR)
- 503 (custom em build-agent-exe via createErrorResponse)

## Campos só em log (não vão pra resposta)
- `stack` (apenas em dev; em produção é omitido)
- `functionName`, `latency` em `errorDetails` (só em dev)
- `tenantId`, `agentId`, `traceId` (apenas no logger.error)

## Política produção vs dev (preservada)
`isProduction = ENV/ENVIRONMENT === 'production'`:
- mensagem pública mascarada (exceção: erros "Tenant isolation")
- `details` reduzido a `{ requestId }`
- `context` omitido na resposta

## Estado antes do PR
- `@ts-nocheck`: **ausente** (já limpo previamente)
- `any` explícito: **ausente**
- Casts (`as`): em 2 pontos do impl do overload `createErrorResponse` (passíveis de narrowing seguro)

## Erros pré-existentes mapeados (fora de escopo)
- `TS2394/TS2750` — overload 1 de `createErrorResponse` incompatível com a implementação (posição 3: origin vs status). Mexer altera o contrato público dos consumers — **deixar para PR separado**.
