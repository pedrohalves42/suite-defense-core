/**
 * Sistema de Toast Humanizado - CyberShield
 * ==========================================
 * 
 * Wrapper para toasts que:
 * 1. Traduz mensagens técnicas automaticamente
 * 2. Padroniza tom de voz
 * 3. Sempre inclui ação quando relevante
 */

import { toast } from 'sonner';
import { UI_SENTENCES, UISentenceKey } from './ui-language';

// Mapeamento de erros técnicos para mensagens amigáveis
const ERROR_MAP: Record<string, { title: string; description: string }> = {
  // Erros de rede
  'network': {
    title: 'Problema de conexão',
    description: 'Verifique sua internet e tente novamente.',
  },
  'fetch': {
    title: 'Problema de conexão',
    description: 'Não conseguimos nos conectar. Tente novamente.',
  },
  'timeout': {
    title: 'Demorou demais',
    description: 'O servidor está demorando. Tente novamente em alguns minutos.',
  },
  'TIMEOUT': {
    title: 'Tempo esgotado',
    description: 'A operação demorou mais que o esperado.',
  },
  
  // Erros de autenticação
  'unauthorized': {
    title: 'Sessão expirada',
    description: 'Faça login novamente para continuar.',
  },
  '401': {
    title: 'Acesso negado',
    description: 'Você precisa fazer login para continuar.',
  },
  '403': {
    title: 'Sem permissão',
    description: 'Você não tem permissão para esta ação.',
  },
  'FORBIDDEN': {
    title: 'Sem permissão',
    description: 'Você não tem permissão para esta ação.',
  },
  
  // Erros de recursos
  '404': {
    title: 'Não encontrado',
    description: 'O que você procura não existe ou foi removido.',
  },
  'NOT_FOUND': {
    title: 'Não encontrado',
    description: 'Não conseguimos encontrar o que você procura.',
  },
  'AGENT_NOT_FOUND': {
    title: 'Computador não encontrado',
    description: 'Este computador não existe ou foi removido.',
  },
  'TENANT_NOT_FOUND': {
    title: 'Empresa não encontrada',
    description: 'Verifique suas permissões de acesso.',
  },
  
  // Erros de servidor
  '500': {
    title: 'Erro interno',
    description: 'Algo deu errado. Tente novamente em alguns minutos.',
  },
  '502': {
    title: 'Servidor indisponível',
    description: 'O serviço está temporariamente fora do ar.',
  },
  '503': {
    title: 'Serviço em manutenção',
    description: 'Estamos fazendo melhorias. Tente novamente em breve.',
  },
  
  // Erros de validação
  'VALIDATION_ERROR': {
    title: 'Dados inválidos',
    description: 'Verifique as informações e tente novamente.',
  },
  'INVALID_JSON': {
    title: 'Formato inválido',
    description: 'Os dados enviados estão em formato incorreto.',
  },
};

/**
 * Mapeia um erro técnico para mensagem amigável
 */
function mapErrorToHuman(error: Error | string | unknown): { title: string; description: string } {
  const errorMessage = error instanceof Error ? error.message : String(error);
  
  // Procura por códigos de erro conhecidos
  for (const [key, value] of Object.entries(ERROR_MAP)) {
    if (errorMessage.toLowerCase().includes(key.toLowerCase())) {
      return value;
    }
  }
  
  // Fallback para erro genérico
  return {
    title: 'Algo deu errado',
    description: 'Tente novamente. Se persistir, contate o suporte.',
  };
}

/**
 * Toast humanizado - wrapper que garante linguagem acessível
 */
export const hToast = {
  /**
   * Toast de sucesso
   * @param messageOrKey - Mensagem ou chave do dicionário UI_SENTENCES
   */
  success: (messageOrKey: UISentenceKey | string) => {
    const message = (UI_SENTENCES as Record<string, string>)[messageOrKey] || messageOrKey;
    toast.success(message);
  },
  
  /**
   * Toast de erro - sempre mapeia para linguagem amigável
   */
  error: (error: Error | string | unknown) => {
    const mapped = mapErrorToHuman(error);
    toast.error(mapped.title, { description: mapped.description });
  },
  
  /**
   * Toast de loading
   */
  loading: (action: string) => {
    return toast.loading(`${action}...`);
  },
  
  /**
   * Toast informativo
   */
  info: (messageOrKey: UISentenceKey | string) => {
    const message = (UI_SENTENCES as Record<string, string>)[messageOrKey] || messageOrKey;
    toast.info(message);
  },
  
  /**
   * Toast de aviso
   */
  warning: (messageOrKey: UISentenceKey | string) => {
    const message = (UI_SENTENCES as Record<string, string>)[messageOrKey] || messageOrKey;
    toast.warning(message);
  },
  
  /**
   * Toast com ação
   */
  action: (message: string, actionLabel: string, onAction: () => void) => {
    toast(message, {
      action: {
        label: actionLabel,
        onClick: onAction,
      },
    });
  },
  
  /**
   * Dismissar toast por ID
   */
  dismiss: (toastId?: string | number) => {
    toast.dismiss(toastId);
  },
  
  /**
   * Toast de promise (loading -> success/error)
   */
  promise: <T,>(
    promise: Promise<T>,
    messages: {
      loading: string;
      success: string;
      error: string;
    }
  ) => {
    return toast.promise(promise, {
      loading: messages.loading,
      success: messages.success,
      error: messages.error,
    });
  },
};

// Export helper para mapear erros em outros contextos
export { mapErrorToHuman };
