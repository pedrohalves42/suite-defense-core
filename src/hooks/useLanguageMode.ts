import { useState, useEffect } from 'react';

const STORAGE_KEY = 'cybershield_technical_mode';

/**
 * Hook para alternar entre modo humano e técnico
 * 
 * Modo padrão: HUMANO (linguagem acessível)
 * Modo técnico: mostra termos técnicos originais
 * 
 * Persistido em localStorage
 */
export function useLanguageMode() {
  const [showTechnical, setShowTechnical] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(STORAGE_KEY) === 'true';
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(showTechnical));
  }, [showTechnical]);

  const toggleMode = () => {
    setShowTechnical(prev => !prev);
  };

  const setTechnicalMode = (value: boolean) => {
    setShowTechnical(value);
  };

  return { 
    showTechnical, 
    toggleMode,
    setTechnicalMode,
    // Helpers para uso em componentes
    isHumanMode: !showTechnical,
    modeLabel: showTechnical ? 'Técnico' : 'Simplificado',
  };
}
