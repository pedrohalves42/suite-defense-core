import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Rocket, CheckCircle2, Download, Monitor, BarChart3, AlertTriangle, HelpCircle,
} from 'lucide-react';

const SECTIONS = [
  { id: 'intro', label: 'Introdução', icon: Rocket },
  { id: 'requirements', label: 'Requisitos', icon: CheckCircle2 },
  { id: 'installation', label: 'Instalação', icon: Download },
  { id: 'verification', label: 'Verificação', icon: Monitor },
  { id: 'next-steps', label: 'Próximos Passos', icon: BarChart3 },
  { id: 'troubleshooting', label: 'Problemas', icon: AlertTriangle },
  { id: 'support', label: 'Suporte', icon: HelpCircle },
];

interface OnboardingSidebarProps {
  activeSection: string;
  setActiveSection: (id: string) => void;
  progress: number;
}

export function OnboardingSidebar({ activeSection, setActiveSection, progress }: OnboardingSidebarProps) {
  return (
    <aside className="lg:col-span-1">
      <Card className="sticky top-20">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Seu Progresso</CardTitle>
          <Progress value={progress} className="h-2" />
          <CardDescription className="text-xs">{progress}% concluído</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <nav className="space-y-1">
            {SECTIONS.map((section) => (
              <button
                key={section.id}
                onClick={() => {
                  setActiveSection(section.id);
                  document.getElementById(section.id)?.scrollIntoView({ behavior: 'smooth' });
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors ${
                  activeSection === section.id
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                }`}
              >
                <section.icon className="h-4 w-4" />
                {section.label}
              </button>
            ))}
          </nav>
        </CardContent>
      </Card>
    </aside>
  );
}
