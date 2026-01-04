import { CheckCircle, Shield, Lock } from 'lucide-react';

interface SessionVerifiedScreenProps {
  showMFA?: boolean;
}

export function SessionVerifiedScreen({ showMFA = true }: SessionVerifiedScreenProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-6 animate-fade-in">
        <div className="flex items-center gap-3 text-green-500/90">
          <CheckCircle className="h-8 w-8" />
          <span className="text-xl font-medium tracking-tight">Sessão validada</span>
        </div>
        <div className="text-sm text-muted-foreground/60 space-y-2 text-center">
          {showMFA && (
            <p className="flex items-center justify-center gap-2">
              <Shield className="h-4 w-4 text-green-500/70" />
              MFA confirmado
            </p>
          )}
          <p className="flex items-center justify-center gap-2">
            <Lock className="h-4 w-4 text-green-500/70" />
            Ambiente seguro
          </p>
        </div>
      </div>
    </div>
  );
}
