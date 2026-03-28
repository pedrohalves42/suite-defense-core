import { useState, useEffect } from 'react';

/**
 * Hook that tracks page visibility state.
 * Returns true when the page is visible, false when hidden.
 * Useful for pausing polling when the tab is not active.
 */
export function usePageVisibility(): boolean {
  const [isVisible, setIsVisible] = useState(() => 
    typeof document !== 'undefined' ? !document.hidden : true
  );

  useEffect(() => {
    const handler = () => setIsVisible(!document.hidden);
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);

  return isVisible;
}
