import { useState, useCallback } from 'react';
import { toast } from 'sonner';

interface ActionConfig<TData, TVariables> {
  action: (variables: TVariables) => Promise<TData>;
  onSuccess?: (data: TData) => void;
  onError?: (error: Error) => void;
  successMessage?: string;
  errorMessage?: string;
  loadingMessage?: string;
}

interface ActionState<TData> {
  isLoading: boolean;
  error: Error | null;
  data: TData | null;
}

export function useActionWithFeedback<TData = unknown, TVariables = void>(
  config: ActionConfig<TData, TVariables>
) {
  const [state, setState] = useState<ActionState<TData>>({
    isLoading: false,
    error: null,
    data: null,
  });

  const execute = useCallback(
    async (variables: TVariables) => {
      setState({ isLoading: true, error: null, data: null });

      // Show loading toast if configured
      let loadingToastId: string | number | undefined;
      if (config.loadingMessage) {
        loadingToastId = toast.loading(config.loadingMessage);
      }

      try {
        const data = await config.action(variables);
        setState({ isLoading: false, error: null, data });

        // Dismiss loading toast
        if (loadingToastId) {
          toast.dismiss(loadingToastId);
        }

        // Show success toast
        if (config.successMessage) {
          toast.success(config.successMessage);
        }

        // Call success callback
        config.onSuccess?.(data);

        return data;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        setState({ isLoading: false, error: err, data: null });

        // Dismiss loading toast
        if (loadingToastId) {
          toast.dismiss(loadingToastId);
        }

        // Show error toast
        toast.error(config.errorMessage || 'Ocorreu um erro', {
          description: err.message,
        });

        // Call error callback
        config.onError?.(err);

        throw err;
      }
    },
    [config]
  );

  const reset = useCallback(() => {
    setState({ isLoading: false, error: null, data: null });
  }, []);

  return {
    ...state,
    execute,
    reset,
    isPending: state.isLoading,
  };
}

// Wrapper for simple button actions with visual feedback
export function useButtonAction(
  action: () => Promise<void>,
  options: {
    successMessage?: string;
    errorMessage?: string;
    loadingMessage?: string;
  } = {}
) {
  return useActionWithFeedback<void, void>({
    action,
    successMessage: options.successMessage || 'Ação concluída com sucesso',
    errorMessage: options.errorMessage || 'Erro ao executar ação',
    loadingMessage: options.loadingMessage,
  });
}
