import { CheckCircle, Shield, Lock, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';

interface SessionVerifiedScreenProps {
  showMFA?: boolean;
}

export function SessionVerifiedScreen({ showMFA = true }: SessionVerifiedScreenProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden">
      {/* Background gradients */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[70%] h-[70%] bg-cta-positive/5 rounded-full blur-[160px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-info/5 rounded-full blur-[140px]" />
      </div>

      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="flex flex-col items-center gap-10 relative z-10 glass-card p-12 rounded-[2.5rem] border-white/5 shadow-2xl"
      >
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ 
                type: "spring",
                stiffness: 260,
                damping: 20,
                delay: 0.2
              }}
              className="bg-cta-positive/10 p-4 rounded-full border border-cta-positive/20"
            >
              <CheckCircle className="h-12 w-12 text-cta-positive" />
            </motion.div>
            <motion.div 
              className="absolute -top-1 -right-1"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.5 }}
            >
              <Shield className="h-6 w-6 text-cta-positive fill-cta-positive/20" />
            </motion.div>
          </div>
          
          <h2 className="text-3xl font-display font-bold text-white tracking-tight">
            Sessão Validada
          </h2>
        </div>

        <div className="w-full space-y-3">
          <div className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.03] border border-white/5">
            <div className="flex items-center gap-3">
              <Lock className="h-4 w-4 text-cta-positive" />
              <span className="text-xs font-bold text-white/60 uppercase tracking-widest">Criptografia</span>
            </div>
            <span className="text-[10px] font-black text-cta-positive uppercase tracking-tighter">Ativa</span>
          </div>

          <div className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.03] border border-white/5">
            <div className="flex items-center gap-3">
              <Shield className="h-4 w-4 text-cta-positive" />
              <span className="text-xs font-bold text-white/60 uppercase tracking-widest">Identidade</span>
            </div>
            <span className="text-[10px] font-black text-cta-positive uppercase tracking-tighter">Verificada</span>
          </div>
        </div>

        <div className="flex flex-col items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-1.5 bg-cta-positive rounded-full animate-pulse" />
            <p className="text-xs font-medium text-white/40 italic">
              Redirecionando para o ambiente seguro...
            </p>
          </div>
          <ArrowRight className="h-5 w-5 text-cta-positive animate-bounce-horizontal" />
        </div>
      </motion.div>
    </div>
  );
}

