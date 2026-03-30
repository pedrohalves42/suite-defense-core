import { PitchSlide } from '@/components/pitch/PitchSlide';
import { Badge } from '@/components/ui/badge';
import { Shield, Brain, Globe, Lock } from 'lucide-react';

export function SlideTitle() {
  return (
    <PitchSlide slideNumber={1} title="CyberShield" subtitle="Proteção Inteligente para PMEs Brasileiras">
      <div className="flex flex-col items-center justify-center h-full text-center space-y-8">
        <div className="w-32 h-32 rounded-2xl bg-primary/20 flex items-center justify-center">
          <Shield className="w-16 h-16 text-primary" />
        </div>
        <div>
          <h1 className="text-4xl font-bold text-foreground mb-4">Segurança Empresarial com IA</h1>
          <p className="text-xl text-muted-foreground max-w-2xl">
            Plataforma SaaS de cibersegurança projetada para pequenas e médias empresas brasileiras, com inteligência artificial integrada e preços acessíveis.
          </p>
        </div>
        <div className="flex gap-4">
          <Badge variant="secondary" className="text-lg px-4 py-2"><Brain className="w-4 h-4 mr-2" />IA Nativa</Badge>
          <Badge variant="secondary" className="text-lg px-4 py-2"><Globe className="w-4 h-4 mr-2" />100% Brasil</Badge>
          <Badge variant="secondary" className="text-lg px-4 py-2"><Lock className="w-4 h-4 mr-2" />Multi-Tenant</Badge>
        </div>
      </div>
    </PitchSlide>
  );
}
