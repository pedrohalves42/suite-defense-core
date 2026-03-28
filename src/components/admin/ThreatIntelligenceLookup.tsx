import { useState, useEffect } from 'react';
import { formatBrazilDateTime } from '@/lib/date-utils';
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { 
  Shield, 
  Search, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  HelpCircle,
  Globe,
  Server,
  Link2,
  ExternalLink,
  Clock,
} from 'lucide-react';
import { toast } from 'sonner';

interface ThreatIntelSource {
  name: string;
  verdict: string;
  confidence: number;
  details?: any;
}

interface ThreatIntelResult {
  target: string;
  target_type: 'url' | 'ip' | 'domain';
  reputation: 'clean' | 'suspicious' | 'malicious' | 'unknown';
  risk_score: number;
  sources: ThreatIntelSource[];
  whois_data?: any;
  ssl_data?: any;
  cached: boolean;
  cached_at?: string;
}

interface ThreatIntelligenceLookupProps {
  initialTarget?: string;
  onAnalyze?: (result: ThreatIntelResult) => void;
}

export default function ThreatIntelligenceLookup({ initialTarget, onAnalyze }: ThreatIntelligenceLookupProps) {
  const [target, setTarget] = useState(initialTarget || '');
  const [result, setResult] = useState<ThreatIntelResult | null>(null);
  
  const lookupMutation = useMutation({
    mutationFn: async (targetValue: string) => {
      const response = await supabase.functions.invoke('threat-intelligence-lookup', {
        body: { target: targetValue },
      });
      
      if (response.error) throw response.error;
      return response.data as ThreatIntelResult;
    },
    onSuccess: (data) => {
      setResult(data);
      onAnalyze?.(data);
      if (data.reputation === 'malicious') {
        toast.error('Ameaça detectada! Este alvo foi identificado como malicioso.');
      } else if (data.reputation === 'suspicious') {
        toast.warning('Atividade suspeita detectada para este alvo.');
      } else if (data.reputation === 'clean') {
        toast.success('Nenhuma ameaça detectada para este alvo.');
      }
    },
    onError: (error) => {
      toast.error(`Erro na análise: ${error.message}`);
    },
  });
  
  // Auto-trigger analysis when initialTarget changes
  useEffect(() => {
    if (initialTarget && initialTarget !== target) {
      setTarget(initialTarget);
      lookupMutation.mutate(initialTarget.trim());
    }
  }, [initialTarget]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!target.trim()) {
      toast.error('Por favor, insira uma URL, domínio ou IP');
      return;
    }
    lookupMutation.mutate(target.trim());
  };
  
  const getReputationConfig = (reputation: string) => {
    switch (reputation) {
      case 'malicious':
        return { 
          icon: XCircle, 
          color: 'text-destructive', 
          bg: 'bg-destructive/10', 
          border: 'border-destructive/20',
          badge: 'destructive' as const,
          label: 'Malicioso',
        };
      case 'suspicious':
        return { 
          icon: AlertTriangle, 
          color: 'text-yellow-500', 
          bg: 'bg-yellow-500/10', 
          border: 'border-yellow-500/20',
          badge: 'secondary' as const,
          label: 'Suspeito',
        };
      case 'clean':
        return { 
          icon: CheckCircle, 
          color: 'text-green-500', 
          bg: 'bg-green-500/10', 
          border: 'border-green-500/20',
          badge: 'default' as const,
          label: 'Limpo',
        };
      default:
        return { 
          icon: HelpCircle, 
          color: 'text-muted-foreground', 
          bg: 'bg-muted', 
          border: 'border-muted',
          badge: 'outline' as const,
          label: 'Desconhecido',
        };
    }
  };
  
  const getTargetIcon = (type: string) => {
    switch (type) {
      case 'url': return Link2;
      case 'ip': return Server;
      case 'domain': return Globe;
      default: return Globe;
    }
  };
  
  const reputationConfig = result ? getReputationConfig(result.reputation) : null;
  const TargetIcon = result ? getTargetIcon(result.target_type) : Globe;
  const ReputationIcon = reputationConfig?.icon || HelpCircle;
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Análise de Threat Intelligence
        </CardTitle>
        <CardDescription>
          Verifique URLs, domínios ou IPs contra múltiplas fontes de inteligência de ameaças
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex gap-2 mb-6">
          <Input
            placeholder="Ex: google.com, 8.8.8.8, https://example.com"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="flex-1"
          />
          <Button type="submit" disabled={lookupMutation.isPending}>
            <Search className="h-4 w-4 mr-2" />
            {lookupMutation.isPending ? 'Analisando...' : 'Analisar'}
          </Button>
        </form>
        
        {lookupMutation.isPending && (
          <div className="space-y-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        )}
        
        {result && !lookupMutation.isPending && (
          <div className="space-y-4">
            {/* Main Result Card */}
            <div className={`p-6 rounded-lg border ${reputationConfig?.bg} ${reputationConfig?.border}`}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-full ${reputationConfig?.bg}`}>
                    <ReputationIcon className={`h-8 w-8 ${reputationConfig?.color}`} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <TargetIcon className="h-4 w-4 text-muted-foreground" />
                      <span className="font-mono text-sm">{result.target}</span>
                      <Badge variant="outline" className="text-xs">
                        {result.target_type.toUpperCase()}
                      </Badge>
                    </div>
                    <Badge variant={reputationConfig?.badge} className="mt-1">
                      {reputationConfig?.label}
                    </Badge>
                  </div>
                </div>
                
                <div className="text-right">
                  <div className="text-3xl font-bold">{result.risk_score}</div>
                  <div className="text-xs text-muted-foreground">Score de Risco</div>
                </div>
              </div>
              
              {/* Risk Score Progress */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Baixo</span>
                  <span>Alto</span>
                </div>
                <Progress 
                  value={result.risk_score} 
                  className={`h-2 ${
                    result.risk_score >= 70 ? '[&>div]:bg-destructive' :
                    result.risk_score >= 30 ? '[&>div]:bg-yellow-500' :
                    '[&>div]:bg-green-500'
                  }`}
                />
              </div>
              
              {result.cached && (
                <div className="flex items-center gap-1 mt-3 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  Resultado em cache
                  {result.cached_at && ` - ${formatBrazilDateTime(result.cached_at, 'full')}`}
                </div>
              )}
            </div>
            
            {/* Sources */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Fontes Consultadas</CardTitle>
              </CardHeader>
              <CardContent>
                {result.sources.length > 0 ? (
                  <div className="space-y-3">
                    {result.sources.map((source, index) => {
                      const sourceConfig = getReputationConfig(source.verdict);
                      const SourceIcon = sourceConfig.icon;
                      
                      return (
                        <div 
                          key={index}
                          className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
                        >
                          <div className="flex items-center gap-3">
                            <SourceIcon className={`h-5 w-5 ${sourceConfig.color}`} />
                            <div>
                              <div className="font-medium">{source.name}</div>
                              <div className="text-xs text-muted-foreground">
                                Confiança: {source.confidence}%
                              </div>
                            </div>
                          </div>
                          <Badge variant={sourceConfig.badge}>
                            {sourceConfig.label}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-4 text-muted-foreground">
                    <HelpCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>Nenhuma fonte retornou dados para este alvo</p>
                  </div>
                )}
              </CardContent>
            </Card>
            
            {/* Recommendation */}
            <Card className={`${reputationConfig?.bg} ${reputationConfig?.border}`}>
              <CardContent className="pt-4">
                <div className="flex items-start gap-3">
                  <ReputationIcon className={`h-5 w-5 mt-0.5 ${reputationConfig?.color}`} />
                  <div>
                    <div className="font-medium mb-1">Recomendação</div>
                    <p className="text-sm text-muted-foreground">
                      {result.reputation === 'malicious' && (
                        'Este alvo foi identificado como malicioso por múltiplas fontes. Recomendamos bloquear o acesso imediatamente e investigar qualquer interação prévia.'
                      )}
                      {result.reputation === 'suspicious' && (
                        'Este alvo apresenta comportamento suspeito. Monitore atividades relacionadas e considere bloquear preventivamente.'
                      )}
                      {result.reputation === 'clean' && (
                        'Nenhuma ameaça foi detectada para este alvo. Continue monitorando regularmente.'
                      )}
                      {result.reputation === 'unknown' && (
                        'Não foi possível determinar a reputação deste alvo. Proceda com cautela e monitore atividades.'
                      )}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            {/* External Links */}
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" asChild>
                <a 
                  href={`https://www.virustotal.com/gui/search/${encodeURIComponent(result.target)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="h-3 w-3 mr-1" />
                  VirusTotal
                </a>
              </Button>
              {result.target_type === 'ip' && (
                <Button variant="outline" size="sm" asChild>
                  <a 
                    href={`https://www.abuseipdb.com/check/${result.target}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="h-3 w-3 mr-1" />
                    AbuseIPDB
                  </a>
                </Button>
              )}
              {result.target_type === 'domain' && (
                <Button variant="outline" size="sm" asChild>
                  <a 
                    href={`https://who.is/whois/${result.target}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="h-3 w-3 mr-1" />
                    WHOIS
                  </a>
                </Button>
              )}
            </div>
          </div>
        )}
        
        {!result && !lookupMutation.isPending && (
          <div className="text-center py-8 text-muted-foreground">
            <Shield className="h-12 w-12 mx-auto mb-3 opacity-20" />
            <p>Insira uma URL, domínio ou IP para análise</p>
            <p className="text-sm mt-1">
              Consultamos VirusTotal, AbuseIPDB, URLhaus e PhishTank
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
