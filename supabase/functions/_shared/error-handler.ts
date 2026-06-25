// Enhanced error handler with standardized responses and CORS support
import { buildCorsHeaders, corsHeaders } from './cors.ts';
import { ZodError } from 'https://esm.sh/zod@3.23.8';
import { logger } from './logger.ts';

export { corsHeaders };

export interface ErrorContext {
  traceId?: string;
  tenantId?: string;
  agentId?: string;
  operation: string;
  latency?: number;
}

export interface StandardError {
  error: {
    code: string;
    message: string;
    details?: unknown;
    timestamp: string;
    requestId?: string;
    context?: ErrorContext;
  };
}

// Error codes for backward compatibility
export enum ErrorCode {
  UNAUTHORIZED = 'UNAUTHORIZED',
  BAD_REQUEST = 'BAD_REQUEST',
  NOT_FOUND = 'NOT_FOUND',
  FORBIDDEN = 'FORBIDDEN',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  AUTH_ERROR = 'AUTH_ERROR',
  CONFLICT = 'CONFLICT',
}

export function createStandardError(
  code: string,
  message: string,
  details?: unknown,
  requestId?: string,
  context?: ErrorContext
): StandardError {
  return {
    error: {
      code,
      message,
      details,
      timestamp: new Date().toISOString(),
      requestId,
      context,
    }
  };
}

export function createErrorResponse(
  error: StandardError,
  status?: number,
  origin?: string | null
): Response;
export function createErrorResponse(
  code: ErrorCode | string,
  message: string,
  status: number,
  requestId?: string,
  origin?: string | null
): Response;
export function createErrorResponse(
  errorOrCode: StandardError | ErrorCode | string,
  statusOrMessage?: number | string,
  statusOrOrigin?: number | string | null,
  requestId?: string,
  origin?: string | null
): Response {
  // New signature: createErrorResponse(error, status?, origin?)
  if (typeof errorOrCode === 'object' && errorOrCode !== null && 'error' in errorOrCode) {
    const error: StandardError = errorOrCode;
    const statusCode: number = typeof statusOrMessage === 'number' ? statusOrMessage : 500;
    // In overload 1, position 3 is `origin?: string | null`
    const resolvedOrigin: string | null =
      typeof statusOrOrigin === 'string' ? statusOrOrigin : null;
    const headers = buildCorsHeaders(resolvedOrigin);
    return new Response(
      JSON.stringify(error),
      {
        status: statusCode,
        headers: { ...headers, 'Content-Type': 'application/json' }
      }
    );
  }

  // Old signature: createErrorResponse(code, message, status, requestId?, origin?)
  const code: string = typeof errorOrCode === 'string' ? errorOrCode : String(errorOrCode);
  const message: string = typeof statusOrMessage === 'string' ? statusOrMessage : '';
  const statusCode: number = typeof statusOrOrigin === 'number' ? statusOrOrigin : 500;
  const headers = buildCorsHeaders(origin ?? null);

  const standardError = createStandardError(code, message, undefined, requestId);
  return new Response(
    JSON.stringify(standardError),
    {
      status: statusCode,
      headers: { ...headers, 'Content-Type': 'application/json' }
    }
  );
}

export function handleException(
  error: unknown,
  requestId: string,
  functionName: string,
  context?: ErrorContext,
  origin?: string | null
): Response {
  const headers = buildCorsHeaders(origin || null);

  // Always log the full error internally for observability
  logger.error(`[${requestId}] [${functionName}] [${context?.operation || 'unknown'}] Exception:`, error, {
    requestId,
    traceId: context?.traceId,
    tenantId: context?.tenantId,
    agentId: context?.agentId,
    stack: error instanceof Error ? error.stack : undefined
  });
  
  const env = Deno.env.get('ENV') || Deno.env.get('ENVIRONMENT');
  const isProduction = env === 'production';
  
  // In production, mask internal details to prevent information leakage
  const message = isProduction 
    ? (error instanceof Error && error.message.includes('Tenant isolation') ? error.message : 'Internal server error')
    : (error instanceof Error ? error.message : 'Unknown error occurred');
    
  const errorDetails = isProduction 
    ? { requestId } 
    : { functionName, latency: context?.latency, stack: error instanceof Error ? error.stack : undefined };

  const standardError = createStandardError(
    'INTERNAL_ERROR',
    message,
    errorDetails,
    requestId,
    isProduction ? undefined : context
  );
  
  return new Response(
    JSON.stringify(standardError),
    {
      status: 500,
      headers: { ...headers, 'Content-Type': 'application/json' }
    }
  );
}

export function handleExceptionWithContext(
  error: unknown,
  requestId: string,
  functionName: string,
  startTime: number,
  overrides?: Partial<ErrorContext>,
  origin?: string | null
): Response {
  const latency = Date.now() - startTime;
  const context: ErrorContext = {
    operation: functionName,
    latency,
    traceId: requestId,
    ...overrides
  };
  return handleException(error, requestId, functionName, context, origin);
}

export function createValidationError(
  message: string | ZodError,
  details?: unknown,
  requestId?: string,
  origin?: string | null
): Response {
  const headers = buildCorsHeaders(origin || null);

  let errorMessage: string;
  let errorDetails: unknown;

  if (typeof message === 'string') {
    errorMessage = message;
    errorDetails = details;
  } else {
    // ZodError
    errorMessage = 'Validation failed';
    errorDetails = message.issues;
  }

  const error = createStandardError(
    'VALIDATION_ERROR',
    errorMessage,
    errorDetails,
    requestId
  );
  return new Response(
    JSON.stringify(error),
    {
      status: 400,
      headers: { ...headers, 'Content-Type': 'application/json' }
    }
  );
}

// Backward compatibility alias
export const handleValidationError = createValidationError;

export function createAuthError(
  message: string = 'Authentication required',
  requestId?: string,
  origin?: string | null
): Response {
  const headers = buildCorsHeaders(origin || null);

  const error = createStandardError(
    'AUTH_ERROR',
    message,
    undefined,
    requestId
  );
  return new Response(
    JSON.stringify(error),
    {
      status: 401,
      headers: { ...headers, 'Content-Type': 'application/json' }
    }
  );
}

export function createNotFoundError(
  resource: string,
  requestId?: string,
  origin?: string | null
): Response {
  const headers = buildCorsHeaders(origin || null);

  const error = createStandardError(
    'NOT_FOUND',
    `${resource} not found`,
    undefined,
    requestId
  );
  return new Response(
    JSON.stringify(error),
    {
      status: 404,
      headers: { ...headers, 'Content-Type': 'application/json' }
    }
  );
}
