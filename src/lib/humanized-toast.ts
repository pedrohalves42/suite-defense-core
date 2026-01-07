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

// Mapeamento de erros técnicos para mensagens amigáveis (linguagem para leigos)
const ERROR_MAP: Record<string, { title: string; description: string }> = {
  // Erros de rede - simplificados
  'network': {
    title: 'Sem conexão',
    description: 'Verifique sua internet e tente de novo.',
  },
  'fetch': {
    title: 'Falha na conexão',
    description: 'Não conseguimos conectar. Tente novamente.',
  },
  'timeout': {
    title: 'Demorou demais',
    description: 'O computador não respondeu a tempo. Tente de novo.',
  },
  'TIMEOUT': {
    title: 'Tempo esgotado',
    description: 'A operação demorou mais que o esperado.',
  },
  'connection refused': {
    title: 'Computador não respondeu',
    description: 'Verifique se o computador está ligado.',
  },
  'ECONNRESET': {
    title: 'Conexão interrompida',
    description: 'A conexão caiu no meio do caminho.',
  },
  
  // Erros de autenticação - simplificados
  'unauthorized': {
    title: 'Você foi desconectado',
    description: 'Entre novamente para continuar.',
  },
  '401': {
    title: 'Sessão expirou',
    description: 'Faça login novamente.',
  },
  '403': {
    title: 'Você não pode fazer isso',
    description: 'Fale com um administrador.',
  },
  'FORBIDDEN': {
    title: 'Ação bloqueada',
    description: 'Você não tem permissão.',
  },
  
  // Erros de recursos - simplificados
  '404': {
    title: 'Não existe',
    description: 'O que você procura não foi encontrado.',
  },
  'NOT_FOUND': {
    title: 'Não encontramos',
    description: 'Isso não existe ou foi removido.',
  },
  'AGENT_NOT_FOUND': {
    title: 'Computador não encontrado',
    description: 'Esse computador não está mais cadastrado.',
  },
  'TENANT_NOT_FOUND': {
    title: 'Empresa não encontrada',
    description: 'Verifique se você está na conta certa.',
  },
  'AGENT_OFFLINE': {
    title: 'Computador desligado',
    description: 'O computador não está respondendo agora.',
  },
  
  // Erros de servidor - simplificados
  '500': {
    title: 'Erro interno',
    description: 'Algo deu errado. Tente em alguns minutos.',
  },
  '502': {
    title: 'Servidor indisponível',
    description: 'O sistema está temporariamente fora.',
  },
  '503': {
    title: 'Em manutenção',
    description: 'Voltamos em breve.',
  },
  
  // Erros de validação - simplificados
  'VALIDATION_ERROR': {
    title: 'Dados incorretos',
    description: 'Confira as informações e tente de novo.',
  },
  'INVALID_JSON': {
    title: 'Formato errado',
    description: 'Os dados estão incorretos.',
  },
  'RATE_LIMIT': {
    title: 'Muitas tentativas',
    description: 'Aguarde um momento antes de tentar novamente.',
  },
  'QUOTA_EXCEEDED': {
    title: 'Limite atingido',
    description: 'Você atingiu o limite do seu plano.',
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
