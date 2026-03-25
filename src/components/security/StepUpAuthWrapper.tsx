import { MFAVerificationDialog } from '@/components/mfa/MFAVerificationDialog';
import { useStepUpAuth } from '@/hooks/useStepUpAuth';

interface StepUpAuthWrapperProps {
  children: (executeWithStepUp: (action: () => Promise<void>) => Promise<void>) => React.ReactNode;
  reason?: string;
  windowMs?: number;
}

/**
 * Wrapper component that provides step-up auth to children via render prop.
 * 
 * Usage:
 * <StepUpAuthWrapper reason="Ação crítica requer verificação">
 *   {(executeWithStepUp) => (
 *     <Button onClick={() => executeWithStepUp(async () => { ... })}>
 *       Executar ação crítica
 *     </Button>
 *   )}
 * </StepUpAuthWrapper>
 */
export function StepUpAuthWrapper({ children, reason, windowMs }: StepUpAuthWrapperProps) {
  const {
    executeWithStepUp,
    needsVerification,
    onVerificationSuccess,
    onVerificationCancel,
  } = useStepUpAuth({ reason, windowMs });

  return (
    <>
      {children(executeWithStepUp)}
      <MFAVerificationDialog
        open={needsVerification}
        onOpenChange={(open) => !open && onVerificationCancel()}
        onSuccess={onVerificationSuccess}
        onCancel={onVerificationCancel}
      />
    </>
  );
}
