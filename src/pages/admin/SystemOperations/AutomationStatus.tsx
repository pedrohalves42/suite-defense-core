import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Database, CheckCircle } from 'lucide-react';

const AUTOMATIONS = [
  { name: 'Limpeza HMAC', desc: 'A cada hora - Remove assinaturas > 6h' },
  { name: 'Limpeza Rate Limits', desc: 'A cada hora - Remove registros > 30min' },
  { name: 'Detecção Jobs Travados', desc: 'A cada 15 min - Alerta jobs > 30min' },
  { name: 'Verificação de Quotas', desc: 'A cada 6h - Alerta quando > 80%' },
  { name: 'Limpeza de Jobs Antigos', desc: 'Diário - Remove jobs completed > 30 dias' },
  { name: 'Métricas Edge Functions', desc: 'Semanal - Remove métricas > 7 dias' },
] as const;

export function AutomationStatus() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5 text-blue-500" />Status de Automação
        </CardTitle>
        <CardDescription>Tarefas agendadas e limpeza automática</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-3">
          {AUTOMATIONS.map((auto) => (
            <div key={auto.name} className="p-4 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span className="font-medium">{auto.name}</span>
              </div>
              <p className="text-sm text-muted-foreground">{auto.desc}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
