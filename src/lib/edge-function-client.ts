import { supabase } from '@/integrations/supabase/client';
import { logger } from './logger';

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

  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY!,
        'Content-Type': 'application/json',
      },
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
      switch (response.status) {
        case 400:
          throw new Error(`Requisicao invalida: ${errorMessage}`);
        case 401:
          throw new Error('Nao autorizado. Faca login novamente.');
        case 403:
          throw new Error('Acesso negado. Voce nao tem permissao para esta operacao.');
        case 404:
          throw new Error(`Funcao nao encontrada: ${functionName}`);
        case 429:
          throw new Error('Muitas requisicoes. Aguarde um momento e tente novamente.');
        case 500:
        case 502:
        case 503:
        case 504:
          throw new Error(`Erro no servidor: ${errorMessage}`);
        default:
          throw new Error(errorMessage);
      }
    }

    const data = await response.json();
    
    logger.info(`[${requestId}] Edge Function executada com sucesso`);
    
    return data as T;
  } catch (error: any) {
    logger.error(`[${requestId}] Erro ao chamar Edge Function`, {
      function: functionName,
      error: error.message,
      stack: error.stack
    });
    
    // Se ja for um erro que lancamos, re-throw
    if (error.message.includes('Requisicao invalida') || 
        error.message.includes('Nao autorizado') ||
        error.message.includes('Acesso negado') ||
        error.message.includes('Muitas requisicoes') ||
        error.message.includes('Erro no servidor')) {
      throw error;
    }
    
    // Se for erro de rede
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      throw new Error('Erro de conexao. Verifique sua internet e tente novamente.');
    }
    
    // Erro generico
    throw new Error(`Erro ao executar ${functionName}: ${error.message}`);
  }
}
