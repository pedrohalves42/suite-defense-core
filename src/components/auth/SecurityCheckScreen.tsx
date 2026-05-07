import { Shield, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';

interface SecurityCheckScreenProps {
  message?: string;
}

export function SecurityCheckScreen({ message = 'Verificando integridade da sessão...' }: SecurityCheckScreenProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden">
      {/* Background gradients */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[70%] h-[70%] bg-cta-positive/5 rounded-full blur-[160px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-info/5 rounded-full blur-[140px]" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="flex flex-col items-center gap-8 relative z-10 glass-card p-12 rounded-[2.5rem] border-white/5 shadow-2xl"
      >
        <div className="relative">
          <div className="absolute inset-0 bg-cta-positive/20 rounded-full blur-2xl animate-pulse" />
          <motion.div
            animate={{ 
              scale: [1, 1.1, 1],
              rotate: [0, 5, -5, 0]
            }}
            transition={{ 
              duration: 4, 
              repeat: Infinity,
              ease: "easeInOut"
            }}
            className="relative p-4"
          >
            <Shield className="h-16 w-16 text-cta-positive drop-shadow-[0_0_15px_rgba(5,150,105,0.5)]" />
          </motion.div>
        </div>

        <div className="text-center space-y-4">
          <div className="flex flex-col items-center gap-2">
            <h3 className="text-2xl font-display font-bold text-white tracking-tight">
              Acesso em Validação
            </h3>
            <div className="h-1 w-12 bg-cta-positive/30 rounded-full" />
          </div>
          
          <div className="flex items-center justify-center gap-3 text-white/40">
            <Loader2 className="h-4 w-4 animate-spin text-cta-positive" />
            <p className="text-sm font-medium tracking-wide uppercase">
              {message}
            </p>
          </div>
        </div>

        <div className="pt-4 flex flex-col items-center gap-2">
          <div className="px-4 py-1.5 rounded-full bg-white/[0.03] border border-white/5">
            <p className="text-[10px] text-white/20 font-black uppercase tracking-[0.2em]">
              Protocolo de Segurança Ativo
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

