/**
 * Hook para usar traduções simplificadas em qualquer componente
 */
import { useCallback } from 'react';
import { 
  simplifyMessage, 
  formatErrorForUser, 
  translateTerm,
  humanizeStatus,
  getFailureExplanation,
  getAlertExplanation 
} from '@/lib/leigo-translator';

export function useSimplifiedMessage() {
  const simplify = useCallback((message: string) => simplifyMessage(message), []);
  const formatError = useCallback((error: Error | string | unknown) => formatErrorForUser(error), []);
  const translate = useCallback((term: string) => translateTerm(term), []);
  const humanize = useCallback((status: string) => humanizeStatus(status), []);
  const explainFailure = useCallback((failureClass: string) => getFailureExplanation(failureClass), []);
  const explainAlert = useCallback((alertType: string) => getAlertExplanation(alertType), []);
  
  return {
    simplify,
    formatError,
    translate,
    humanize,
    explainFailure,
    explainAlert,
  };
}
