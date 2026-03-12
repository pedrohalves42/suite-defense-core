import { Server, Monitor, Download, ArrowRight, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

interface DashboardEmptyStateProps {
  tenantName: string;
}

export function DashboardEmptyState({ tenantName }: DashboardEmptyStateProps) {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-3xl mx-auto space-y-8 pt-12">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-cyber rounded-xl border border-primary/20 shadow-glow-primary">
            <Server className="h-8 w-8 text-primary animate-pulse-glow" />
          </div>
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Painel Principal
            </h1>
            <p className="text-sm text-muted-foreground">{tenantName}</p>
          </div>
        </div>

        <Card className="border-2 border-dashed border-primary/30 bg-primary/5">
          <CardContent className="py-16 text-center">
            <div className="inline-flex p-5 rounded-full bg-primary/10 mb-6">
              <Monitor className="h-14 w-14 text-primary" />
            </div>
            <h2 className="text-2xl font-bold text-foreground mb-3">Nenhum computador cadastrado ainda</h2>
            <p className="text-muted-foreground max-w-md mx-auto mb-8">
              Para começar a monitorar e proteger seus computadores, instale o agente de proteção nos equipamentos da sua empresa.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button size="lg" onClick={() => navigate('/installer')} className="gap-2">
                <Download className="h-5 w-5" />Instalar Agente de Proteção<ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Info className="h-5 w-5 text-primary" />Como começar
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { step: '1', title: 'Instale o agente', desc: 'Baixe e execute o instalador nos computadores que deseja proteger' },
                { step: '2', title: 'Aguarde a conexão', desc: 'O agente se conectará automaticamente em poucos minutos' },
                { step: '3', title: 'Monitore tudo aqui', desc: 'Este painel mostrará o status de proteção em tempo real' },
              ].map(({ step, title, desc }) => (
                <div key={step} className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-sm font-bold text-primary">{step}</div>
                  <div>
                    <p className="font-medium text-foreground">{title}</p>
                    <p className="text-sm text-muted-foreground">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
