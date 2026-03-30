import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Shield, Usb, Package, Globe, ShieldCheck, XCircle, FileWarning, Database, Wifi } from 'lucide-react';

interface PolicyTutorialProps {
  showTutorial: boolean;
  onToggle: () => void;
}

export function PolicyTutorial({ showTutorial, onToggle }: PolicyTutorialProps) {
  return (
    <Card className="mb-6 border-primary/20 bg-primary/5">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Como usar Políticas de Segurança
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={onToggle}>
            {showTutorial ? 'Ocultar' : 'Ver Tutorial'}
          </Button>
        </div>
      </CardHeader>
      {showTutorial && (
        <CardContent className="space-y-4 text-sm">
          <div className="grid gap-4 md:grid-cols-3">
            {[
              { step: 1, title: 'Criar Política', desc: 'Clique em "Nova" para criar uma política. Dê um nome descritivo e defina a prioridade (políticas com maior prioridade têm precedência).' },
              { step: 2, title: 'Adicionar Regras', desc: 'Selecione a política e clique em "Adicionar Regra". Escolha o tipo de regra (USB, software, website, etc.), a ação (bloquear, permitir, monitorar) e o alvo.' },
              { step: 3, title: 'Atribuir a Grupos', desc: 'Na aba "Grupos Atribuídos", vincule a política aos grupos de computadores desejados. As regras serão aplicadas automaticamente.' },
            ].map(({ step, title, desc }) => (
              <div key={step} className="space-y-2 p-3 bg-background rounded-lg border">
                <div className="font-semibold flex items-center gap-2">
                  <span className="bg-primary text-primary-foreground w-6 h-6 rounded-full flex items-center justify-center text-xs">{step}</span>
                  {title}
                </div>
                <p className="text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>

          <Separator />

          <div className="space-y-3">
            <h4 className="font-semibold">Tipos de Regras Disponíveis:</h4>
            <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
              {[
                { icon: Usb, label: 'Controle USB' },
                { icon: Package, label: 'Restrição de Software' },
                { icon: Globe, label: 'Bloqueio de Sites' },
                { icon: ShieldCheck, label: 'Regras de Firewall' },
                { icon: XCircle, label: 'Bloqueio de Processos' },
                { icon: FileWarning, label: 'Acesso a Arquivos' },
                { icon: Database, label: 'Proteção de Registro' },
                { icon: Wifi, label: 'Restrição de Rede' },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="flex items-center gap-2 text-muted-foreground">
                  <Icon className="h-4 w-4" /> <span>{label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="font-semibold">Dicas:</h4>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Use <code className="bg-muted px-1 rounded">*</code> como wildcard. Ex: <code className="bg-muted px-1 rounded">*.facebook.com</code> bloqueia todos os subdomínios.</li>
              <li>Políticas podem ser ativadas/desativadas sem excluí-las.</li>
              <li>Um grupo pode ter múltiplas políticas. A de maior prioridade prevalece em conflitos.</li>
            </ul>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
