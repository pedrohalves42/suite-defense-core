import { supabase } from '@/integrations/supabase/client';
import { logger } from './logger';

/**
 * Custom error class for Edge Function failures.
 * Eliminates fragile string-matching for error re-throwing.
 */
export class EdgeFunctionError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly functionName: string
  ) {
    super(message);
    this.name = 'EdgeFunctionError';
  }
}

/**
 * FASE 2: Helper unificado para chamadas Edge Functions
 * Garante headers de autenticacao corretos e tratamento de erros padronizado
 */
export async function callEdgeFunction<T = any>(
  functionName: string,
  payload?: any,
  method: 'GET' | 'POST' = 'POST'
): Promise<T> {
  const requestId = crypto.randomUUID();
  
  // Obter sessao atual
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  
  if (sessionError) {
    logger.error(`[${requestId}] Erro ao obter sessao`, sessionError);
    throw new Error('Erro ao obter sessao de autenticacao');
  }
  
  if (!session) {
    logger.error(`[${requestId}] Usuario nao autenticado`);
    throw new Error('Usuario nao autenticado. Faca login novamente.');
  }

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${functionName}`;
  
  logger.info(`[${requestId}] Chamando Edge Function`, {
    function: functionName,
    method,
    hasPayload: !!payload
  });

  // Get active tenant from JWT metadata (not localStorage - V-802 security fix)
  const activeTenantId = session.user?.app_metadata?.active_tenant_id ?? null;

  try {
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY!,
      'Content-Type': 'application/json',
    };

    // Add tenant header if available (for multi-tenant users)
    if (activeTenantId) {
      headers['x-tenant-id'] = activeTenantId;
    }

    const response = await fetch(url, {
      method,
      headers,
      body: payload ? JSON.stringify(payload) : undefined,
    });

    // Log da resposta
    logger.info(`[${requestId}] Resposta recebida`, {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ 
        error: { message: 'Unknown error', code: 'UNKNOWN' } 
      }));
      
      logger.error(`[${requestId}] Edge Function retornou erro`, {
        status: response.status,
        error: errorData
      });

      const errorMessage = errorData.error?.message || errorData.message || `HTTP ${response.status}`;
      
      // Mensagens amigaveis por status
      const friendlyMessages: Record<number, string> = {
        400: `Requisicao invalida: ${errorMessage}`,
        401: 'Nao autorizado. Faca login novamente.',
        403: 'Acesso negado. Voce nao tem permissao para esta operacao.',
        404: `Funcao nao encontrada: ${functionName}`,
        429: 'Muitas requisicoes. Aguarde um momento e tente novamente.',
      };
      
      const message = friendlyMessages[response.status] 
        ?? (response.status >= 500 ? `Erro no servidor: ${errorMessage}` : errorMessage);
      
      throw new EdgeFunctionError(message, response.status, functionName);
    }

    const data = await response.json();
    
    logger.info(`[${requestId}] Edge Function executada com sucesso`);
    
    return data as T;
  } catch (error: unknown) {
    logger.error(`[${requestId}] Erro ao chamar Edge Function`, {
      function: functionName,
      error: error.message,
      stack: error.stack
    });
    
    // Re-throw our own typed errors directly
    if (error instanceof EdgeFunctionError) {
      throw error;
    }
    
    // Network errors
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      throw new EdgeFunctionError('Erro de conexao. Verifique sua internet e tente novamente.', 0, functionName);
    }
    
    // Generic
    throw new EdgeFunctionError(`Erro ao executar ${functionName}: ${error.message}`, 0, functionName);
  }
}
