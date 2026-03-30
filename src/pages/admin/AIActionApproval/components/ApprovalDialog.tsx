import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { AlertTriangle, Shield, Loader2, CheckCircle } from 'lucide-react';
import { requiresFormalApproval } from '@/hooks/useAiActionApproval';

interface ApprovalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isSuspiciousPattern: boolean;
  selectedRiskLevel: string | null;
  approvalNotes: string;
  setApprovalNotes: (v: string) => void;
  reviewedDetails: boolean;
  setReviewedDetails: (v: boolean) => void;
  isPending: boolean;
  onConfirm: () => void;
}

export function ApprovalDialog({
  open, onOpenChange, isSuspiciousPattern, selectedRiskLevel,
  approvalNotes, setApprovalNotes, reviewedDetails, setReviewedDetails,
  isPending, onConfirm,
}: ApprovalDialogProps) {
  const needsNotes = isSuspiciousPattern || requiresFormalApproval(selectedRiskLevel);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isSuspiciousPattern ? (
              <><AlertTriangle className="h-5 w-5 text-amber-500" />Revisão Obrigatória - Padrão Suspeito Detectado</>
            ) : (
              <><Shield className="h-5 w-5 text-amber-500" />Aprovação Formal Requerida</>
            )}
          </DialogTitle>
          <DialogDescription>
            {isSuspiciousPattern ? (
              <><strong className="text-amber-600">⚠️ Taxa de aprovação em 100%.</strong> Para evitar fadiga de aprovação, você deve confirmar que revisou os detalhes desta ação.</>
            ) : (
              <>Esta ação requer aprovação formal por ser de alto risco. Por favor, adicione notas explicando sua decisão para fins de auditoria.</>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="flex items-start space-x-3 p-3 bg-muted/50 rounded-lg">
            <Checkbox id="reviewedDetails" checked={reviewedDetails} onCheckedChange={(checked) => setReviewedDetails(checked === true)} />
            <div className="grid gap-1.5 leading-none">
              <Label htmlFor="reviewedDetails" className="text-sm font-medium cursor-pointer">Confirmo que revisei os detalhes desta ação</Label>
              <p className="text-xs text-muted-foreground">Este registro será mantido para auditoria</p>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="approvalNotes">Notas de aprovação {needsNotes ? '(obrigatório)' : '(opcional)'}</Label>
            <Textarea id="approvalNotes" placeholder="Explique por que está aprovando esta ação..." value={approvalNotes} onChange={(e) => setApprovalNotes(e.target.value)} rows={4} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={onConfirm} disabled={isPending || !reviewedDetails || (needsNotes && !approvalNotes.trim())} className="gap-2">
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
            Confirmar Aprovação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
