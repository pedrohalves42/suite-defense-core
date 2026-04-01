import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Download } from 'lucide-react';

interface OnboardingHeaderProps {
  agentCount: number;
  hasOnlineAgent: boolean;
  onBack: () => void;
}

export function OnboardingHeader({ agentCount, hasOnlineAgent, onBack }: OnboardingHeaderProps) {
  return (
    <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-lg font-semibold">Guia de Início Rápido</h1>
            <p className="text-xs text-muted-foreground">CyberShield • Documentação</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={hasOnlineAgent ? 'default' : 'secondary'}>
            {agentCount} agente{agentCount !== 1 ? 's' : ''} instalado{agentCount !== 1 ? 's' : ''}
          </Badge>
          <Button asChild size="sm">
            <Link to="/installer">
              <Download className="h-4 w-4 mr-2" />
              Instalar Agente
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
