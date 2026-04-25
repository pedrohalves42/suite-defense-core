import { Lock, ShieldCheck } from 'lucide-react';

export function SecurityFooter() {
  return (
    <div className="text-[10px] text-white/10 text-center pt-8 border-t border-white/5 mt-10 flex flex-wrap items-center justify-center gap-4 font-bold uppercase tracking-[0.15em]">
      <span className="flex items-center gap-1.5 hover:text-white/30 transition-colors duration-300 cursor-default">
        <Lock className="h-2.5 w-2.5" />
        Encrypted
      </span>
      <span className="text-white/5">•</span>
      <span className="hover:text-white/30 transition-colors duration-300 cursor-default">AES-256</span>
      <span className="text-white/5">•</span>
      <span className="flex items-center gap-1.5 hover:text-white/30 transition-colors duration-300 cursor-default">
        <ShieldCheck className="h-2.5 w-2.5" />
        Zero Trust
      </span>
    </div>
  );
}

export function BrandSignature() {
  return null; // Integrated into the main Login card for a cleaner look
}
