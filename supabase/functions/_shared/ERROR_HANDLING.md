# Error Handling Guide

## Overview

This guide explains the centralized error handling system used across all edge functions.

## Error Handler Module

Location: `_shared/error-handler.ts`

### Key Features

1. **Standardized Error Codes**: All errors map to predefined codes (BAD_REQUEST, UNAUTHORIZED, FORBIDDEN, etc.)
2. **Safe Response Format**: Client only receives `{ error: { code, message, requestId, fields? } }`
3. **Server-Side Logging**: Full error details (stack traces, messages) logged only on server
4. **No Schema Leakage**: Database table names, constraints, and schema details never exposed to client

## Error Response Structure

```typescript
interface ErrorResponse {
  error: {
    code: ErrorCode;        // Standardized code (e.g., "BAD_REQUEST")
    message: string;        // Generic, safe message
    requestId: string;      // UUID for tracing
    fields?: string[];      // Only for validation errors (field names only)
  };
}
```

## Error Codes

| Code | HTTP Status | Use Case |
|------|-------------|----------|
| `BAD_REQUEST` | 400 | Invalid input, validation errors |
| `UNAUTHORIZED` | 401 | Missing or invalid authentication |
| `FORBIDDEN` | 403 | Valid auth but insufficient permissions |
| `NOT_FOUND` | 404 | Resource doesn't exist |
| `CONFLICT` | 409 | Duplicate resource (safe to expose) |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Unexpected server errors |

## Usage

### Basic Exception Handling

```typescript
import { handleException } from '../_shared/error-handler.ts';

try {
  // Your edge function logic
} catch (error) {
  return handleException(error, requestId, 'function-name');
}
```

### Validation Errors (Zod)

```typescript
import { handleValidationError } from '../_shared/error-handler.ts';
import { MySchema } from '../_shared/validation.ts';

const validation = MySchema.safeParse(data);
if (!validation.success) {
  // Only returns field names, never validation rules
  return handleValidationError(validation.error, requestId);
}
```

### Explicit Error Responses

```typescript
import { createErrorResponse, ErrorCode } from '../_shared/error-handler.ts';

if (!authHeader) {
  return createErrorResponse(
    ErrorCode.UNAUTHORIZED, 
    'Não autorizado', 
    401, 
    requestId
  );
}
```

## Error Mapping

### Zod Validation Errors
- **Code**: `BAD_REQUEST`
- **Status**: 400
- **Message**: "Dados inválidos"
- **Fields**: Array of field names only (never validation rules)

### Authentication Errors
- **Code**: `UNAUTHORIZED`
- **Status**: 401
- **Message**: "Não autorizado"
- **Triggers**: "jwt", "invalid token", "unauthorized"

### Permission Errors
- **Code**: `FORBIDDEN`
- **Status**: 403
- **Message**: "Acesso negado"
- **Triggers**: "forbidden", "permission", "access denied"

### Not Found Errors
- **Code**: `NOT_FOUND`
- **Status**: 404
- **Message**: "Recurso não encontrado"
- **Triggers**: "not found", "does not exist"

### Conflict/Duplicate Errors
- **Code**: `CONFLICT`
- **Status**: 409
- **Message**: "Recurso já existe"
- **Triggers**: "duplicate", "already exists", "unique constraint"

### Database Constraint Errors
- **Code**: `BAD_REQUEST`
- **Status**: 400
- **Message**: "Dados inválidos"
- **Triggers**: "foreign key", "check constraint", "not-null violation"
- **Note**: Never exposes actual constraint names or table structure

## Security Principles

### ✅ DO

- Use `handleException()` for all catch blocks
- Return only generic error messages to clients
- Log full error details server-side with `console.error`
- Include `requestId` for error tracing
- Use `ErrorCode` enum for standardized codes

### ❌ DON'T

- Expose database table names or column names
- Return raw error messages from database
- Include validation rules in response (only field names)
- Leak internal paths, function names, or stack traces
- Use different error formats across functions

## Examples

### Good Example ✅

```typescript
try {
  const { data, error } = await supabase
    .from('sensitive_table')
    .insert({ column: value });
  
  if (error) throw error;
  
  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: corsHeaders
  });
} catch (error) {
  // Client receives: { error: { code: "INTERNAL_ERROR", message: "Ocorreu um erro...", requestId: "..." } }
  // Server logs: Full error with stack trace and actual message
  return handleException(error, requestId, 'my-function');
}
```

### Bad Example ❌

```typescript
try {
  const { data, error } = await supabase
    .from('sensitive_table')
    .insert({ column: value });
  
  if (error) {
    // ❌ Exposes table name and constraint!
    return new Response(JSON.stringify({ 
      error: error.message  // "duplicate key value violates unique constraint users_email_key"
    }), { status: 400 });
  }
} catch (error) {
  // ❌ Exposes internal error details!
  return new Response(JSON.stringify({ 
    error: String(error),
    stack: error.stack
  }), { status: 500 });
}
```

## Migration from Old System

Old `handleError()` from `errors.ts` → New `handleException()` from `error-handler.ts`

### Before

```typescript
import { handleError, corsHeaders } from '../_shared/errors.ts';

try {
  // ...
} catch (error) {
  return handleError(error, requestId);
}
```

### After

```typescript
import { handleException, corsHeaders } from '../_shared/error-handler.ts';

try {
  // ...
} catch (error) {
  return handleException(error, requestId, 'function-name');
}
```

## Testing Error Responses

All error responses should:
1. Have status code matching the error type
2. Contain only `{ error: { code, message, requestId } }` structure
3. Never expose internal details like table names or stack traces
4. Include field names only (not rules) for validation errors

## Debugging

Use `requestId` to trace errors in logs:

```bash
# Find error in logs
grep "requestId-value" logs.txt

# Server logs will contain:
# [ERROR] { requestId: "uuid", context: "function-name", errorType: "...", message: "...", stack: "..." }
```
