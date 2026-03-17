import { Shield } from 'lucide-react';

interface SecurityCheckScreenProps {
  message?: string;
}

export function SecurityCheckScreen({ message = 'Verificando integridade da sessão...' }: SecurityCheckScreenProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-6 animate-fade-in">
        <div className="relative">
          <Shield className="h-16 w-16 text-cta-positive" />
          <div className="absolute inset-0 animate-ping opacity-30">
            <Shield className="h-16 w-16 text-cta-positive/40" />
          </div>
        </div>
        <div className="text-center space-y-2">
          <p className="text-lg font-medium text-foreground/90 tracking-tight">
            {message}
          </p>
          <p className="text-sm text-muted-foreground/60">
            Avaliação de segurança em andamento
          </p>
        </div>
      </div>
    </div>
  );
}
