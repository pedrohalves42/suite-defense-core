import { Lock, ShieldCheck } from 'lucide-react';

export function SecurityFooter() {
  return (
    <div className="text-[11px] text-muted-foreground/50 text-center pt-6 border-t border-border/20 mt-6 flex flex-wrap items-center justify-center gap-3">
      <span className="flex items-center gap-1.5">
        <Lock className="h-3 w-3" />
        Conexão protegida
      </span>
      <span className="text-border/40">•</span>
      <span>Criptografia ponta a ponta</span>
      <span className="text-border/40">•</span>
      <span className="flex items-center gap-1">
        <ShieldCheck className="h-3 w-3" />
        Zero Trust
      </span>
    </div>
  );
}

export function BrandSignature() {
  return (
    <div className="text-center pt-4 text-[11px] text-muted-foreground/40">
      <p className="font-medium tracking-wide">CyberShield Cloud</p>
      <p className="text-[10px] tracking-[0.15em] uppercase mt-0.5">
        Security. Visibility. Control.
      </p>
    </div>
  );
}
