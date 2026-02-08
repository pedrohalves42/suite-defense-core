import { useState, useEffect, createContext, useContext } from 'react';

/**
 * Hook para alternar entre modo Técnico e modo Simples
 * 
 * - Modo Técnico: Interface completa com métricas, logs, detalhes técnicos
 * - Modo Simples: Interface resumida com status semáforo e linguagem de negócio
 * 
 * Persistido em localStorage para manter preferência do usuário
 */

export type ViewMode = 'technical' | 'simple';

const STORAGE_KEY = 'cybershield_view_mode';

export function useSimpleMode() {
  const [mode, setMode] = useState<ViewMode>(() => {
    if (typeof window === 'undefined') return 'technical';
    const stored = localStorage.getItem(STORAGE_KEY);
    return (stored as ViewMode) || 'technical';
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, mode);
  }, [mode]);

  const toggleMode = () => {
    setMode(prev => prev === 'technical' ? 'simple' : 'technical');
  };

  const setSimple = () => setMode('simple');
  const setTechnical = () => setMode('technical');

  return {
    mode,
    isSimple: mode === 'simple',
    isTechnical: mode === 'technical',
    toggleMode,
    setSimple,
    setTechnical,
  };
}

// Context para compartilhar estado globalmente
interface SimpleModeContextValue {
  mode: ViewMode;
  isSimple: boolean;
  isTechnical: boolean;
  toggleMode: () => void;
  setSimple: () => void;
  setTechnical: () => void;
}

export const SimpleModeContext = createContext<SimpleModeContextValue | null>(null);

export function useSimpleModeContext() {
  const ctx = useContext(SimpleModeContext);
  if (!ctx) {
    throw new Error('useSimpleModeContext must be used within SimpleModeProvider');
  }
  return ctx;
}
