import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Search, Database, Code } from 'lucide-react';

export interface FalsificationCriterion {
  condition: string;
  impact: string;
  detection_method: string;
}

interface FalsificationCriteriaProps {
  criteria: FalsificationCriterion[];
}

export function FalsificationCriteria({ criteria }: FalsificationCriteriaProps) {
  if (!criteria || criteria.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-8">
          <AlertTriangle className="h-8 w-8 text-muted-foreground mb-3" />
          <p className="text-muted-foreground text-center text-sm">
            Nenhum critério de falsificação definido.
          </p>
        </CardContent>
      </Card>
    );
  }

  const getDetectionIcon = (method: string) => {
    if (method.toLowerCase().includes('select') || method.toLowerCase().includes('query')) {
      return <Database className="h-4 w-4" />;
    }
    if (method.toLowerCase().includes('log') || method.toLowerCase().includes('check')) {
      return <Search className="h-4 w-4" />;
    }
    return <Code className="h-4 w-4" />;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-yellow-500" />
          O Que Me Faria Reduzir Esta Nota
        </CardTitle>
        <CardDescription>
          Critérios de falsificação aumentam a credibilidade da análise
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {criteria.map((criterion, index) => (
            <div 
              key={index}
              className="border rounded-lg p-4 space-y-3"
            >
              <div className="flex items-start gap-2">
                <Badge variant="outline" className="shrink-0">
                  #{index + 1}
                </Badge>
                <p className="font-medium text-sm">{criterion.condition}</p>
              </div>
              
              <div className="grid gap-2 text-sm">
                <div className="flex items-start gap-2 text-muted-foreground">
                  <span className="font-medium text-destructive shrink-0">Impacto:</span>
                  <span>{criterion.impact}</span>
                </div>
                
                <div className="flex items-start gap-2 bg-muted/50 rounded p-2">
                  {getDetectionIcon(criterion.detection_method)}
                  <code className="text-xs flex-1 break-all">
                    {criterion.detection_method}
                  </code>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 p-4 bg-muted/30 rounded-lg">
          <h4 className="font-medium text-sm mb-2">Por que isso importa?</h4>
          <p className="text-xs text-muted-foreground">
            Critérios de falsificação mostram que a avaliação é baseada em evidências 
            e pode ser invalidada por fatos objetivos. Isso aumenta a confiança de 
            investidores, auditores e reguladores na análise.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
