import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle, Shield, Target, Skull } from 'lucide-react';
import { 
  RedTeamAssessment, 
  getThreatLevelColor, 
  getThreatLevelBg 
} from '@/hooks/useRedTeamAssessment';

interface RedTeamSummaryProps {
  assessment: RedTeamAssessment | null;
}

export function RedTeamSummary({ assessment }: RedTeamSummaryProps) {
  if (!assessment) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Skull className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground text-center">
            Nenhuma análise Red Team disponível.
            <br />
            Execute uma análise para ver os resultados.
          </p>
        </CardContent>
      </Card>
    );
  }

  const threatLevelLabels: Record<string, string> = {
    low: 'Baixo',
    medium: 'Médio',
    high: 'Alto',
    critical: 'Crítico',
  };

  return (
    <div className="space-y-6">
      {/* Main Score Card */}
      <Card className={`${getThreatLevelBg(assessment.threat_level)} border`}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Skull className={`h-6 w-6 ${getThreatLevelColor(assessment.threat_level)}`} />
              <CardTitle>Avaliação Adversarial</CardTitle>
            </div>
            <Badge variant="outline" className={getThreatLevelColor(assessment.threat_level)}>
              {threatLevelLabels[assessment.threat_level]}
            </Badge>
          </div>
          <CardDescription>
            Perspectiva Red Team sobre vulnerabilidades do sistema
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="text-4xl font-bold">
              {assessment.red_score}
              <span className="text-lg text-muted-foreground">/100</span>
            </div>
            <div className="flex-1">
              <Progress 
                value={100 - assessment.red_score} 
                className="h-3"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Quanto menor o score, mais seguro o sistema
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Executive Summary */}
      {assessment.executive_threat_summary && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              Resumo de Ameaças
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {assessment.executive_threat_summary}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Attack Vectors */}
      {assessment.attack_vectors && assessment.attack_vectors.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Target className="h-5 w-5 text-red-500" />
              Vetores de Ataque Identificados
            </CardTitle>
            <CardDescription>
              {assessment.attack_vectors.length} vetores analisados
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {assessment.attack_vectors.map((vector, index) => (
                <div 
                  key={index} 
                  className="border rounded-lg p-4 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">{vector.name}</h4>
                    <div className="flex gap-2">
                      <Badge variant="outline" className="text-xs">
                        {vector.difficulty}
                      </Badge>
                      <Badge 
                        variant={vector.impact === 'critical' ? 'destructive' : 'secondary'}
                        className="text-xs"
                      >
                        {vector.impact}
                      </Badge>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">{vector.description}</p>
                  {vector.gap && (
                    <div className="text-sm bg-destructive/10 rounded p-2 mt-2">
                      <span className="font-medium text-destructive">Gap: </span>
                      {vector.gap}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Worst Case Scenario */}
      {assessment.worst_case_scenario && (
        <Card className="border-red-500/20 bg-red-500/5">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2 text-red-500">
              <Skull className="h-5 w-5" />
              Pior Cenário
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">
              {assessment.worst_case_scenario}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Hardening Recommendations */}
      {assessment.recommended_hardening && assessment.recommended_hardening.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Shield className="h-5 w-5 text-green-500" />
              Recomendações de Hardening
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {assessment.recommended_hardening.map((rec, index) => (
                <div 
                  key={index}
                  className="flex items-start gap-3 border-b pb-3 last:border-0"
                >
                  <Badge 
                    variant={rec.priority === 'critical' ? 'destructive' : 'secondary'}
                    className="shrink-0"
                  >
                    {rec.priority}
                  </Badge>
                  <div className="flex-1">
                    <p className="text-sm">{rec.action}</p>
                    <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
                      <span>Esforço: {rec.effort}</span>
                      <span>Reduz score em: {rec.reduces_score_by} pts</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
