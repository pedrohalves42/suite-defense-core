import { ReactNode } from 'react';
import { SimpleModeContext, useSimpleMode } from '@/hooks/useSimpleMode';

interface SimpleModeProviderProps {
  children: ReactNode;
}

/**
 * Provider que envolve a aplicação para compartilhar estado de modo simples/técnico
 */
export function SimpleModeProvider({ children }: SimpleModeProviderProps) {
  const simpleModeState = useSimpleMode();

  return (
    <SimpleModeContext.Provider value={simpleModeState}>
      {children}
    </SimpleModeContext.Provider>
  );
}
