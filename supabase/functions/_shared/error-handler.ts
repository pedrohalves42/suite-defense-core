// Enhanced error handler with standardized responses
export { corsHeaders } from './cors.ts';
import { ZodError } from 'https://deno.land/x/zod@v3.23.8/mod.ts';

export interface StandardError {
  error: {
    code: string;
    message: string;
    details?: any;
    timestamp: string;
    requestId?: string;
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
  details?: any,
  requestId?: string
): StandardError {
  return {
    error: {
      code,
      message,
      details,
      timestamp: new Date().toISOString(),
      requestId,
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
        headers: { 'Content-Type': 'application/json' }
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
      headers: { 'Content-Type': 'application/json' }
    }
  );
}

export function handleException(
  error: unknown,
  requestId: string,
  functionName: string
): Response {
  console.error(`[${requestId}] [${functionName}] Exception:`, error);
  
  const message = error instanceof Error ? error.message : 'Unknown error occurred';
  const standardError = createStandardError(
    'INTERNAL_ERROR',
    message,
    { functionName },
    requestId
  );
  
  return createErrorResponse(standardError, 500);
}

export function createValidationError(
  message: string | ZodError,
  details?: any,
  requestId?: string
): Response {
  let errorMessage: string;
  let errorDetails: any;

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
  return createErrorResponse(error, 400);
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
  return createErrorResponse(error, 401);
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
  return createErrorResponse(error, 404);
}
