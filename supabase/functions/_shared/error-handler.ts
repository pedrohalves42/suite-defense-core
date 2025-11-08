import { ZodError } from 'https://deno.land/x/zod@v3.23.8/mod.ts';

// Standardized error codes
export enum ErrorCode {
  BAD_REQUEST = 'BAD_REQUEST',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  RATE_LIMITED = 'RATE_LIMITED',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

// Error response structure
export interface ErrorResponse {
  error: {
    code: ErrorCode;
    message: string;
    requestId: string;
    fields?: string[]; // Only field names for validation errors
  };
}

// CORS headers
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-agent-token, x-admin-secret, x-hmac-signature',
};

/**
 * Centralized error handler for edge functions
 * Maps all error types to safe, generic responses
 * Logs full details server-side only
 */
export function handleException(
  error: unknown,
  requestId?: string,
  context?: string
): Response {
  const reqId = requestId || crypto.randomUUID();

  // Log full details server-side (never sent to client)
  console.error('[ERROR]', {
    requestId: reqId,
    context: context || 'unknown',
    errorType: error?.constructor?.name || typeof error,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    timestamp: new Date().toISOString(),
  });

  // Determine error code and safe message
  let statusCode = 500;
  let errorCode = ErrorCode.INTERNAL_ERROR;
  let message = 'Ocorreu um erro ao processar sua solicitação';
  let fields: string[] | undefined;

  // Map Zod validation errors
  if (error instanceof ZodError) {
    statusCode = 400;
    errorCode = ErrorCode.BAD_REQUEST;
    message = 'Dados inválidos';
    // Extract only field names, not validation rules
    fields = error.issues.map(issue => issue.path.join('.'));
  }
  // Map authorization errors
  else if (error instanceof Error) {
    const errorMsg = error.message.toLowerCase();

    // Authentication errors
    if (
      errorMsg.includes('unauthorized') ||
      errorMsg.includes('not authorized') ||
      errorMsg.includes('invalid token') ||
      errorMsg.includes('jwt')
    ) {
      statusCode = 401;
      errorCode = ErrorCode.UNAUTHORIZED;
      message = 'Não autorizado';
    }
    // Permission/authorization errors
    else if (
      errorMsg.includes('forbidden') ||
      errorMsg.includes('access denied') ||
      errorMsg.includes('permission')
    ) {
      statusCode = 403;
      errorCode = ErrorCode.FORBIDDEN;
      message = 'Acesso negado';
    }
    // Not found errors
    else if (
      errorMsg.includes('not found') ||
      errorMsg.includes('does not exist')
    ) {
      statusCode = 404;
      errorCode = ErrorCode.NOT_FOUND;
      message = 'Recurso não encontrado';
    }
    // Conflict/duplicate errors (safe to expose)
    else if (
      errorMsg.includes('duplicate') ||
      errorMsg.includes('already exists') ||
      errorMsg.includes('unique constraint')
    ) {
      statusCode = 409;
      errorCode = ErrorCode.CONFLICT;
      message = 'Recurso já existe';
    }
    // Rate limit errors
    else if (
      errorMsg.includes('rate limit') ||
      errorMsg.includes('too many requests')
    ) {
      statusCode = 429;
      errorCode = ErrorCode.RATE_LIMITED;
      message = 'Muitas requisições. Tente novamente em alguns instantes';
    }
    // Database constraint errors (map to generic messages)
    else if (
      errorMsg.includes('foreign key') ||
      errorMsg.includes('check constraint') ||
      errorMsg.includes('not-null violation')
    ) {
      statusCode = 400;
      errorCode = ErrorCode.BAD_REQUEST;
      message = 'Dados inválidos';
    }
  }

  // Build safe response
  const response: ErrorResponse = {
    error: {
      code: errorCode,
      message,
      requestId: reqId,
      ...(fields && fields.length > 0 ? { fields } : {}),
    },
  };

  return new Response(JSON.stringify(response), {
    status: statusCode,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Create standardized error response
 * Use for explicit error cases (not exceptions)
 */
export function createErrorResponse(
  code: ErrorCode,
  message: string,
  statusCode: number,
  requestId?: string,
  fields?: string[]
): Response {
  const response: ErrorResponse = {
    error: {
      code,
      message,
      requestId: requestId || crypto.randomUUID(),
      ...(fields && fields.length > 0 ? { fields } : {}),
    },
  };

  return new Response(JSON.stringify(response), {
    status: statusCode,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Handle Zod validation errors specifically
 * Returns only field names, never validation rules or schema details
 */
export function handleValidationError(
  error: ZodError,
  requestId?: string
): Response {
  const fields = error.issues.map(issue => issue.path.join('.'));
  
  console.error('[VALIDATION ERROR]', {
    requestId: requestId || crypto.randomUUID(),
    fields,
    // Log issues server-side only
    issues: error.issues.map(i => ({ path: i.path, message: i.message })),
    timestamp: new Date().toISOString(),
  });

  return createErrorResponse(
    ErrorCode.BAD_REQUEST,
    'Dados inválidos',
    400,
    requestId,
    fields
  );
}
