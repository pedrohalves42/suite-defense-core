import { supabase } from '@/integrations/supabase/client';
import { logger } from './logger';

/**
 * FASE 2: Helper unificado para chamadas Edge Functions
 * Garante headers de autenticação corretos e tratamento de erros padronizado
 */
export async function callEdgeFunction<T = any>(
  functionName: string,
  payload?: any,
  method: 'GET' | 'POST' = 'POST'
): Promise<T> {
  const requestId = crypto.randomUUID();
  
  // Obter sessão atual
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  
  if (sessionError) {
    logger.error(`[${requestId}] Erro ao obter sessão`, sessionError);
    throw new Error('Erro ao obter sessão de autenticação');
  }
  
  if (!session) {
    logger.error(`[${requestId}] Usuário não autenticado`);
    throw new Error('Usuário não autenticado. Faça login novamente.');
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
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY!,
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
      
      // Mensagens amigáveis por status
      switch (response.status) {
        case 400:
          throw new Error(`Requisição inválida: ${errorMessage}`);
        case 401:
          throw new Error('Não autorizado. Faça login novamente.');
        case 403:
          throw new Error('Acesso negado. Você não tem permissão para esta operação.');
        case 404:
          throw new Error(`Função não encontrada: ${functionName}`);
        case 429:
          throw new Error('Muitas requisições. Aguarde um momento e tente novamente.');
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
    
    // Se já for um erro que lançamos, re-throw
    if (error.message.includes('Requisição inválida') || 
        error.message.includes('Não autorizado') ||
        error.message.includes('Acesso negado') ||
        error.message.includes('Muitas requisições') ||
        error.message.includes('Erro no servidor')) {
      throw error;
    }
    
    // Se for erro de rede
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      throw new Error('Erro de conexão. Verifique sua internet e tente novamente.');
    }
    
    // Erro genérico
    throw new Error(`Erro ao executar ${functionName}: ${error.message}`);
  }
}
