// Enhanced error handler with standardized responses and CORS support
import { corsHeaders } from './cors.ts';
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
  status?: number
): Response;
export function createErrorResponse(
  code: ErrorCode | string,
  message: string,
  status: number,
  requestId?: string
): Response;
export function createErrorResponse(
  errorOrCode: StandardError | ErrorCode | string,
  statusOrMessage?: number | string,
  status?: number,
  requestId?: string
): Response {
  // New signature: createErrorResponse(error, status)
  if (typeof errorOrCode === 'object' && 'error' in errorOrCode) {
    const error = errorOrCode;
    const statusCode = statusOrMessage as number || 500;
    return new Response(
      JSON.stringify(error),
      {
        status: statusCode,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
  
  // Old signature: createErrorResponse(code, message, status, requestId)
  const code = errorOrCode as string;
  const message = statusOrMessage as string;
  const statusCode = status || 500;
  
  const standardError = createStandardError(code, message, undefined, requestId);
  return new Response(
    JSON.stringify(standardError),
    {
      status: statusCode,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    }
  );
}

export function handleException(
  error: unknown,
  requestId: string,
  functionName: string,
  context?: ErrorContext
): Response {
  logger.error(`[${requestId}] [${functionName}] [${context?.operation || 'unknown'}] Exception:`, error, {
    requestId,
    traceId: context?.traceId,
    tenantId: context?.tenantId,
    agentId: context?.agentId
  });
  
  const message = error instanceof Error ? error.message : 'Unknown error occurred';
  const standardError = createStandardError(
    'INTERNAL_ERROR',
    message,
    { functionName, latency: context?.latency },
    requestId,
    context
  );
  
  return new Response(
    JSON.stringify(standardError),
    {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    }
  );
}

export function handleExceptionWithContext(
  error: unknown,
  requestId: string,
  functionName: string,
  startTime: number,
  overrides?: Partial<ErrorContext>
): Response {
  const latency = Date.now() - startTime;
  const context: ErrorContext = {
    operation: functionName,
    latency,
    traceId: requestId,
    ...overrides
  };
  return handleException(error, requestId, functionName, context);
}

export function createValidationError(
  message: string | ZodError,
  details?: unknown,
  requestId?: string
): Response {
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
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    }
  );
}

// Backward compatibility alias
export const handleValidationError = createValidationError;

export function createAuthError(
  message: string = 'Authentication required',
  requestId?: string
): Response {
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
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    }
  );
}

export function createNotFoundError(
  resource: string,
  requestId?: string
): Response {
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
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    }
  );
}
