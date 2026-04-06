import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Package, 
  ShieldAlert, 
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Info,
  ExternalLink,
  RefreshCw
} from 'lucide-react';
import { formatBrazilDateTime } from '@/lib/date-utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { motion } from 'framer-motion';

// Help tooltip component
const HelpTooltip = ({ children, term }: { children: React.ReactNode; term: string }) => {
  const explanations: Record<string, string> = {
    'CVE': 'CVE (Common Vulnerabilities and Exposures) é um identificador único para falhas de segurança conhecidas. Exemplo: CVE-2024-1234',
    'CVSS': 'CVSS (Common Vulnerability Scoring System) é uma pontuação de 0 a 10 que indica a gravidade da vulnerabilidade. Quanto maior, mais grave.',
    'Vulnerabilidade': 'Uma vulnerabilidade é uma falha de segurança em um programa que pode ser explorada por hackers.',
    'Antivírus': 'Software que protege seu computador contra vírus e malware. Deve estar sempre ativo e atualizado.'
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1 cursor-help">
            {children}
            <HelpCircle className="h-3 w-3 text-muted-foreground" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p className="text-sm">{explanations[term] || term}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export const ClientSecurityStatus = () => {
  const { tenant } = useTenant();

  const { data, isLoading } = useQuery({
    queryKey: ['client-security-status', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return null;

      // Software inventory
      const { data: software } = await supabase
        .from('software_inventory')
        .select('id, name, version, publisher, install_count')
        .eq('tenant_id', tenant.id)
        .order('install_count', { ascending: false })
        .limit(20);

      // Vulnerabilities
      const { data: vulnerabilities } = await supabase
        .from('vuln_findings')
        .select('id, cve_id, software_name, severity, cvss_score, description')
        .eq('tenant_id', tenant.id)
        .order('cvss_score', { ascending: false })
        .limit(20);

      // Antivirus status
      const { data: antivirus } = await supabase
        .from('antivirus_status')
        .select('id, agent_id, engine_name, status, last_scan_at, last_update_at, threats_found')
        .eq('tenant_id', tenant.id);

      // Count by severity
      const { data: vulnBySeverity } = await supabase
        .from('vuln_findings')
        .select('severity')
        .eq('tenant_id', tenant.id);

      const severityCounts = {
        critical: vulnBySeverity?.filter(v => v.severity?.toLowerCase() === 'critical').length || 0,
        high: vulnBySeverity?.filter(v => v.severity?.toLowerCase() === 'high').length || 0,
        medium: vulnBySeverity?.filter(v => v.severity?.toLowerCase() === 'medium').length || 0,
        low: vulnBySeverity?.filter(v => v.severity?.toLowerCase() === 'low').length || 0
      };

      return {
        software: software || [],
        vulnerabilities: vulnerabilities || [],
        antivirus: antivirus || [],
        severityCounts,
        totalVulnerabilities: vulnBySeverity?.length || 0
      };
    },
    enabled: !!tenant?.id
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  const getSeverityColor = (severity: string) => {
    switch (severity?.toLowerCase()) {
      case 'critical': return 'bg-red-500/10 text-red-600';
      case 'high': return 'bg-orange-500/10 text-orange-600';
      case 'medium': return 'bg-yellow-500/10 text-yellow-600';
      case 'low': return 'bg-green-500/10 text-green-600';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getProtectionLevel = () => {
    const critical = data?.severityCounts.critical || 0;
    const high = data?.severityCounts.high || 0;
    const avDisabled = data?.antivirus?.filter(a => a.status !== 'enabled').length || 0;

    if (critical > 0 || avDisabled > 0) {
      return { level: 'Baixa', color: 'text-red-500', bg: 'bg-red-500/10' };
    }
    if (high > 0) {
      return { level: 'Média', color: 'text-yellow-500', bg: 'bg-yellow-500/10' };
    }
    return { level: 'Alta', color: 'text-green-500', bg: 'bg-green-500/10' };
  };

  const protection = getProtectionLevel();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Status de Segurança</h1>
        <p className="text-muted-foreground">
          Veja o que está instalado e possíveis vulnerabilidades
        </p>
      </div>

      {/* Summary Card */}
      <Card className={protection.bg}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-full ${protection.bg}`}>
                <ShieldCheck className={`h-8 w-8 ${protection.color}`} />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Nível de Proteção</p>
                <p className={`text-2xl font-bold ${protection.color}`}>{protection.level}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold">{data?.software?.length || 0}</p>
                <p className="text-xs text-muted-foreground">Programas</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-red-500">{data?.severityCounts.critical || 0}</p>
                <p className="text-xs text-muted-foreground">Críticas</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-orange-500">{data?.severityCounts.high || 0}</p>
                <p className="text-xs text-muted-foreground">Altas</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{data?.antivirus?.length || 0}</p>
                <p className="text-xs text-muted-foreground">Antivírus</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="software" className="space-y-4">
        <TabsList>
          <TabsTrigger value="software" className="gap-2">
            <Package className="h-4 w-4" />
            Programas
          </TabsTrigger>
          <TabsTrigger value="vulnerabilities" className="gap-2">
            <ShieldAlert className="h-4 w-4" />
            <HelpTooltip term="Vulnerabilidade">Vulnerabilidades</HelpTooltip>
          </TabsTrigger>
          <TabsTrigger value="antivirus" className="gap-2">
            <ShieldCheck className="h-4 w-4" />
            <HelpTooltip term="Antivírus">Antivírus</HelpTooltip>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="software">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Programas Instalados</CardTitle>
            </CardHeader>
            <CardContent>
              {data?.software && data.software.length > 0 ? (
                <div className="space-y-2">
                  {data.software.map((sw, index: number) => (
                    <motion.div 
                      key={sw.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.03 }}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                    >
                      <div>
                        <p className="font-medium">{sw.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {sw.publisher && `${sw.publisher} • `}
                          {sw.version}
                        </p>
                      </div>
                      <Badge variant="secondary">
                        {sw.install_count || 1} máquina(s)
                      </Badge>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-8">
                  Nenhum programa inventariado ainda
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="vulnerabilities">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">
                  <HelpTooltip term="Vulnerabilidade">Vulnerabilidades Detectadas</HelpTooltip>
                </CardTitle>
                {data?.totalVulnerabilities ? (
                  <Badge variant="outline">
                    {data.totalVulnerabilities} total
                  </Badge>
                ) : null}
              </div>
            </CardHeader>
            <CardContent>
              {/* What to do card */}
              {data?.vulnerabilities && data.vulnerabilities.length > 0 && (
                <Card className="mb-4 bg-blue-500/5 border-blue-500/20">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <Info className="h-5 w-5 text-blue-500 mt-0.5" />
                      <div>
                        <p className="font-medium text-sm">O que fazer?</p>
                        <p className="text-sm text-muted-foreground">
                          Vulnerabilidades são falhas de segurança em programas. 
                          <strong> Atualize os programas afetados</strong> para a versão mais recente ou 
                          <strong> desinstale</strong> se não for mais necessário.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {data?.vulnerabilities && data.vulnerabilities.length > 0 ? (
                <div className="space-y-2">
                  {data.vulnerabilities.map((vuln: Record<string, unknown>, index: number) => (
                    <motion.div 
                      key={vuln.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.03 }}
                      className={`p-3 rounded-lg ${
                        vuln.severity?.toLowerCase() === 'critical' 
                          ? 'bg-red-500/5 border border-red-500/20' 
                          : 'bg-muted/50'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className={`h-4 w-4 ${
                            vuln.severity?.toLowerCase() === 'critical' ? 'text-red-500' : 'text-orange-500'
                          }`} />
                          <HelpTooltip term="CVE">
                            <span className="font-medium">{vuln.cve_id}</span>
                          </HelpTooltip>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={getSeverityColor(vuln.severity)}>
                            {vuln.severity}
                          </Badge>
                          {vuln.cvss_score && (
                            <HelpTooltip term="CVSS">
                              <Badge variant="outline">
                                CVSS: {vuln.cvss_score}
                              </Badge>
                            </HelpTooltip>
                          )}
                          {vuln.cve_id && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              asChild
                            >
                              <a 
                                href={`https://nvd.nist.gov/vuln/detail/${vuln.cve_id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <ExternalLink className="h-3 w-3 mr-1" />
                                Detalhes
                              </a>
                            </Button>
                          )}
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {vuln.software_name}
                      </p>
                      {vuln.description && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {vuln.description}
                        </p>
                      )}
                      {vuln.severity?.toLowerCase() === 'critical' && (
                        <div className="mt-2 pt-2 border-t border-red-500/20">
                          <p className="text-xs text-red-600 font-medium">
                            💡 Ação recomendada: Atualize {vuln.software_name} para a versão mais recente
                          </p>
                        </div>
                      )}
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
                  <p className="text-muted-foreground">
                    Nenhuma vulnerabilidade encontrada
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="antivirus">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                <HelpTooltip term="Antivírus">Status do Antivírus</HelpTooltip>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data?.antivirus && data.antivirus.length > 0 ? (
                <div className="space-y-2">
                  {data.antivirus.map((av: Record<string, unknown>, index: number) => (
                    <motion.div 
                      key={av.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className={`p-3 rounded-lg ${
                        av.status !== 'enabled' 
                          ? 'bg-red-500/5 border border-red-500/20' 
                          : 'bg-muted/50'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <ShieldCheck className={`h-4 w-4 ${
                            av.status === 'enabled' ? 'text-green-500' : 'text-red-500'
                          }`} />
                          <span className="font-medium">{av.engine_name}</span>
                        </div>
                        <Badge 
                          variant={av.status === 'enabled' ? 'default' : 'destructive'}
                          className={av.status === 'enabled' ? 'bg-green-500/10 text-green-600' : ''}
                        >
                          {av.status === 'enabled' ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </div>
                      {av.status !== 'enabled' && (
                        <div className="mb-3 p-3 bg-red-500/10 rounded-lg border border-red-500/20">
                          <p className="text-sm text-red-600 font-medium mb-2">
                            ⚠️ Seu antivírus está desativado!
                          </p>
                          <p className="text-xs text-muted-foreground mb-2">
                            Isso deixa seu computador vulnerável a vírus e malware.
                          </p>
                          <div className="flex gap-2">
                            <Button size="sm" variant="destructive" className="text-xs h-7">
                              <RefreshCw className="h-3 w-3 mr-1" />
                              Como ativar?
                            </Button>
                          </div>
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                        {av.last_scan_at && (
                          <p>Última verificação: {formatBrazilDateTime(av.last_scan_at)}</p>
                        )}
                        {av.last_update_at && (
                          <p>Última atualização: {formatBrazilDateTime(av.last_update_at)}</p>
                        )}
                      </div>
                      {(av.threats_found || 0) > 0 && (
                        <Badge variant="destructive" className="mt-2">
                          {av.threats_found} ameaça(s) encontrada(s)
                        </Badge>
                      )}
                    </motion.div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-8">
                  Nenhum antivírus detectado
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
