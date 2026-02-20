import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTenant } from '@/hooks/useTenant';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AdminPageLayout } from '@/components/AdminPageLayout';
import {
  Shield, Search, AlertTriangle, ExternalLink, RefreshCw,
  Target, Globe, Crosshair, Bug, Zap, TrendingUp,
  Clock, CheckCircle2, XCircle, Info
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface ThreatFeed {
  id: string;
  cveId: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  cvssScore: number;
  description: string;
  publishedAt: string;
  affectedSoftware: string[];
  mitreAttackIds: string[];
  hasLocalMatch: boolean;
  matchedAgents: number;
}

interface MitreAttack {
  id: string;
  technique: string;
  tactic: string;
  description: string;
  detectionCount: number;
  lastSeen: string | null;
}

const MITRE_TACTICS: MitreAttack[] = [
  { id: 'T1566', technique: 'Phishing', tactic: 'Initial Access', description: 'Tentativas de phishing detectadas via email ou web', detectionCount: 0, lastSeen: null },
  { id: 'T1059', technique: 'Command & Scripting', tactic: 'Execution', description: 'Execução de scripts maliciosos (PowerShell, CMD)', detectionCount: 0, lastSeen: null },
  { id: 'T1053', technique: 'Scheduled Task/Job', tactic: 'Persistence', description: 'Tarefas agendadas para persistência', detectionCount: 0, lastSeen: null },
  { id: 'T1078', technique: 'Valid Accounts', tactic: 'Privilege Escalation', description: 'Uso indevido de credenciais válidas', detectionCount: 0, lastSeen: null },
  { id: 'T1003', technique: 'OS Credential Dumping', tactic: 'Credential Access', description: 'Extração de credenciais do sistema', detectionCount: 0, lastSeen: null },
  { id: 'T1071', technique: 'Application Layer Protocol', tactic: 'Command and Control', description: 'Comunicação C2 via protocolos de aplicação', detectionCount: 0, lastSeen: null },
  { id: 'T1486', technique: 'Data Encrypted for Impact', tactic: 'Impact', description: 'Ransomware - criptografia de dados', detectionCount: 0, lastSeen: null },
  { id: 'T1021', technique: 'Remote Services', tactic: 'Lateral Movement', description: 'Movimentação lateral via serviços remotos', detectionCount: 0, lastSeen: null },
  { id: 'T1082', technique: 'System Information Discovery', tactic: 'Discovery', description: 'Coleta de informações do sistema', detectionCount: 0, lastSeen: null },
  { id: 'T1027', technique: 'Obfuscated Files', tactic: 'Defense Evasion', description: 'Ofuscação de arquivos ou informações', detectionCount: 0, lastSeen: null },
];

export default function ThreatIntelligence() {
  const { tenant } = useTenant();
  const tenantId = tenant?.id;
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('cve-feed');

  // Fetch vulnerability data to correlate with threat feeds
  const { data: vulnData, isLoading } = useQuery({
    queryKey: ['threat-intel-vulns', tenantId],
    queryFn: async () => {
      if (!tenantId) return null;
      const sb = supabase as any;

      const { data: vulns } = await sb
        .from('vulnerability_scans')
        .select('id, cve_id, severity, cvss_score, software_name, remediation_status, detected_at, agent_id')
        .eq('tenant_id', tenantId)
        .order('detected_at', { ascending: false })
        .limit(100);

      const { data: alerts } = await sb
        .from('system_alerts')
        .select('id, alert_type, severity, description, created_at')
        .eq('tenant_id', tenantId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(50);

      return { vulns: vulns || [], alerts: alerts || [] };
    },
    enabled: !!tenantId,
  });

  // Generate threat feed from actual vulnerability data
  const threatFeeds: ThreatFeed[] = (vulnData?.vulns || [])
    .filter((v: any) => v.cve_id)
    .reduce((acc: ThreatFeed[], v: any) => {
      const existing = acc.find(f => f.cveId === v.cve_id);
      if (existing) {
        existing.matchedAgents++;
        return acc;
      }
      acc.push({
        id: v.id,
        cveId: v.cve_id,
        severity: v.severity || 'medium',
        cvssScore: v.cvss_score || 0,
        description: `Vulnerabilidade detectada em ${v.software_name}`,
        publishedAt: v.detected_at,
        affectedSoftware: [v.software_name],
        mitreAttackIds: [],
        hasLocalMatch: true,
        matchedAgents: 1,
      });
      return acc;
    }, [])
    .sort((a: ThreatFeed, b: ThreatFeed) => b.cvssScore - a.cvssScore);

  // Correlate alerts with MITRE tactics
  const mitreTactics = MITRE_TACTICS.map(tactic => {
    const relatedAlerts = (vulnData?.alerts || []).filter((a: any) => {
      const desc = (a.description || '').toLowerCase();
      if (tactic.id === 'T1059' && (desc.includes('script') || desc.includes('powershell'))) return true;
      if (tactic.id === 'T1486' && desc.includes('ransomware')) return true;
      if (tactic.id === 'T1078' && (desc.includes('credential') || desc.includes('login'))) return true;
      if (tactic.id === 'T1082' && desc.includes('discovery')) return true;
      return false;
    });
    return {
      ...tactic,
      detectionCount: relatedAlerts.length,
      lastSeen: relatedAlerts[0]?.created_at || null,
    };
  });

  const filteredFeeds = threatFeeds.filter(f =>
    !searchQuery || f.cveId.toLowerCase().includes(searchQuery.toLowerCase()) ||
    f.affectedSoftware.some(s => s.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const severityColors = {
    critical: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 border-red-300',
    high: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200 border-orange-300',
    medium: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 border-amber-300',
    low: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 border-blue-300',
  };

  const totalVulns = threatFeeds.length;
  const criticalVulns = threatFeeds.filter(f => f.severity === 'critical').length;
  const highVulns = threatFeeds.filter(f => f.severity === 'high').length;
  const activeDetections = mitreTactics.filter(t => t.detectionCount > 0).length;

  if (isLoading) {
    return (
      <AdminPageLayout title="Threat Intelligence" description="Correlação de ameaças e vulnerabilidades">
        <div className="space-y-6">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </AdminPageLayout>
    );
  }

  return (
    <AdminPageLayout
      title="Threat Intelligence"
      description="Feeds CVE/MITRE ATT&CK correlacionados com vulnerabilidades dos agentes"
    >
      <div className="space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">CVEs Detectadas</p>
                  <p className="text-2xl font-bold">{totalVulns}</p>
                </div>
                <Bug className="h-8 w-8 text-muted-foreground/30" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Críticas</p>
                  <p className="text-2xl font-bold text-red-600">{criticalVulns}</p>
                </div>
                <AlertTriangle className="h-8 w-8 text-red-500/30" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Alta Severidade</p>
                  <p className="text-2xl font-bold text-orange-600">{highVulns}</p>
                </div>
                <Zap className="h-8 w-8 text-orange-500/30" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Táticas MITRE Ativas</p>
                  <p className="text-2xl font-bold text-primary">{activeDetections}</p>
                </div>
                <Target className="h-8 w-8 text-primary/30" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="cve-feed" className="gap-1">
              <Bug className="h-4 w-4" /> CVE Feed
            </TabsTrigger>
            <TabsTrigger value="mitre" className="gap-1">
              <Target className="h-4 w-4" /> MITRE ATT&CK
            </TabsTrigger>
          </TabsList>

          <TabsContent value="cve-feed" className="mt-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Feed de Vulnerabilidades (CVE)</CardTitle>
                    <CardDescription>Vulnerabilidades correlacionadas com seus agentes</CardDescription>
                  </div>
                  <div className="relative w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar CVE ou software..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {filteredFeeds.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Shield className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p className="font-medium">Nenhuma CVE encontrada</p>
                    <p className="text-sm">Seus agentes não possuem vulnerabilidades catalogadas</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredFeeds.map((feed) => (
                      <div
                        key={feed.id}
                        className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-3 flex-1">
                          <Badge className={cn('text-xs font-mono', severityColors[feed.severity])} variant="outline">
                            {feed.cvssScore.toFixed(1)}
                          </Badge>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm font-medium">{feed.cveId}</span>
                              {feed.hasLocalMatch && (
                                <Badge variant="destructive" className="text-xs">
                                  <Crosshair className="h-3 w-3 mr-1" />
                                  Match local
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">{feed.description}</p>
                            <div className="flex gap-1 mt-1">
                              {feed.affectedSoftware.map((sw, i) => (
                                <Badge key={i} variant="outline" className="text-xs">{sw}</Badge>
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground">
                            {feed.matchedAgents} agente{feed.matchedAgents > 1 ? 's' : ''}
                          </span>
                          <Button variant="ghost" size="sm" asChild>
                            <a
                              href={`https://nvd.nist.gov/vuln/detail/${feed.cveId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="mitre" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Matriz MITRE ATT&CK</CardTitle>
                <CardDescription>Táticas e técnicas mapeadas a partir dos alertas e detecções do seu ambiente</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {mitreTactics.map((tactic) => (
                    <div
                      key={tactic.id}
                      className={cn(
                        'flex items-center justify-between p-3 rounded-lg border transition-colors',
                        tactic.detectionCount > 0 ? 'bg-red-50/50 border-red-200 dark:bg-red-950/20 dark:border-red-800' : 'hover:bg-muted/50'
                      )}
                    >
                      <div className="flex items-center gap-3 flex-1">
                        <div className={cn(
                          'h-8 w-8 rounded-lg flex items-center justify-center text-xs font-mono font-bold',
                          tactic.detectionCount > 0
                            ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                            : 'bg-muted text-muted-foreground'
                        )}>
                          {tactic.detectionCount}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-muted-foreground">{tactic.id}</span>
                            <span className="font-medium text-sm">{tactic.technique}</span>
                            <Badge variant="outline" className="text-xs">{tactic.tactic}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">{tactic.description}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        {tactic.lastSeen ? (
                          <span className="text-xs text-muted-foreground">
                            <Clock className="h-3 w-3 inline mr-1" />
                            {format(new Date(tactic.lastSeen), 'dd/MM HH:mm')}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">Não detectado</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminPageLayout>
  );
}
