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
  agentNames: string[];
  remediation?: string;
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

  // Fetch vulnerability data from vuln_findings (real agent scan data)
  const { data: vulnData, isLoading, refetch } = useQuery({
    queryKey: ['threat-intel-vulns', tenantId],
    queryFn: async () => {
      if (!tenantId) return null;

      // Query vuln_findings with agent info
      const { data: vulns } = await supabase
        .from('vuln_findings')
        .select('id, agent_id, severity, check_key, title, description, remediation, first_seen_at, last_seen_at')
        .eq('tenant_id', tenantId)
        .order('last_seen_at', { ascending: false });

      // Get agent names for correlation
      const agentIds = [...new Set((vulns || []).map((v) => v.agent_id))];
      const { data: agents } = await supabase
        .from('agents')
        .select('id, agent_name')
        .in('id', agentIds.length > 0 ? agentIds : ['none']);

      const agentMap = new Map((agents || []).map((a) => [a.id, a.agent_name]));

      // Also get CVE-based scans from agent_vulnerability_scans
      const { data: cveScans } = await supabase
        .from('agent_vulnerability_scans')
        .select('id, agent_id, cve_id, software_name, severity, cvss_score, remediation_status, detected_at')
        .eq('tenant_id', tenantId)
        .order('detected_at', { ascending: false });

      // Get alerts for MITRE mapping
      const { data: alerts } = await supabase
        .from('system_alerts')
        .select('id, alert_type, severity, message, created_at')
        .eq('tenant_id', tenantId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(50);

      return { vulns: vulns || [], cveScans: cveScans || [], alerts: alerts || [], agentMap };
    },
    enabled: !!tenantId,
  });

  // Generate threat feed from vuln_findings (baseline checks)
  type VulnFinding = { id: string; agent_id: string; severity: string; check_key: string; title: string; description: string; remediation: string; first_seen_at: string; last_seen_at: string };
  const baselineFeeds: ThreatFeed[] = [];
  const vulnsByKey = new Map<string, { ids: string[]; agents: Set<string>; finding: VulnFinding }>();
  
  for (const v of (vulnData?.vulns || []) as VulnFinding[]) {
    const baseKey = v.check_key?.replace(/^baseline-/, '') || v.title;
    const existing = vulnsByKey.get(baseKey);
    const agentName = vulnData?.agentMap?.get(v.agent_id) || 'Desconhecido';
    if (existing) {
      existing.ids.push(v.id);
      existing.agents.add(agentName);
    } else {
      vulnsByKey.set(baseKey, { ids: [v.id], agents: new Set([agentName]), finding: v });
    }
  }

  for (const [key, group] of vulnsByKey) {
    const v = group.finding;
    const severityMap: Record<string, number> = { critical: 9.5, high: 7.5, medium: 5.0, low: 2.5 };
    baselineFeeds.push({
      id: group.ids[0],
      cveId: v.check_key || key,
      severity: (v.severity || 'medium') as ThreatFeed['severity'],
      cvssScore: severityMap[v.severity] || 5.0,
      description: v.title || v.description || '',
      publishedAt: v.first_seen_at || v.last_seen_at,
      affectedSoftware: [key.split('-').slice(0, 2).join(' ')],
      mitreAttackIds: [],
      hasLocalMatch: true,
      matchedAgents: group.agents.size,
      agentNames: [...group.agents],
      remediation: v.remediation,
    });
  }

  // Add CVE-based scans
  type CveScan = { id: string; agent_id: string; cve_id: string; software_name: string; severity: string; cvss_score: number; remediation_status: string; detected_at: string };
  const cveFeeds: ThreatFeed[] = ((vulnData?.cveScans || []) as CveScan[])
    .filter((v) => v.cve_id)
    .reduce((acc: ThreatFeed[], v) => {
      const existing = acc.find(f => f.cveId === v.cve_id);
      const agentName = vulnData?.agentMap?.get(v.agent_id) || 'Desconhecido';
      if (existing) {
        existing.matchedAgents++;
        if (!existing.agentNames.includes(agentName)) existing.agentNames.push(agentName);
        return acc;
      }
      acc.push({
        id: v.id,
        cveId: v.cve_id,
        severity: (v.severity || 'medium') as ThreatFeed['severity'],
        cvssScore: v.cvss_score || 0,
        description: `Vulnerabilidade detectada em ${v.software_name}`,
        publishedAt: v.detected_at,
        affectedSoftware: [v.software_name],
        mitreAttackIds: [],
        hasLocalMatch: true,
        matchedAgents: 1,
        agentNames: [agentName],
      });
      return acc;
    }, []);

  // Merge both sources, deduplicate
  const threatFeeds = [...baselineFeeds, ...cveFeeds]
    .sort((a, b) => {
      const sevOrder: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
      return (sevOrder[b.severity] || 0) - (sevOrder[a.severity] || 0) || b.cvssScore - a.cvssScore;
    });

  // Correlate alerts with MITRE tactics
  const mitreTactics = MITRE_TACTICS.map(tactic => {
    const relatedAlerts = (vulnData?.alerts || []).filter((a) => {
      const desc = (a.message || '').toLowerCase();
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
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1">
                      <RefreshCw className="h-4 w-4" /> Atualizar
                    </Button>
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
                            {feed.severity.toUpperCase()}
                          </Badge>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium">{feed.description}</p>
                            {feed.remediation && (
                              <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">
                                💊 {feed.remediation}
                              </p>
                            )}
                            <div className="flex flex-wrap gap-1 mt-1">
                              {feed.agentNames.map((name, i) => (
                                <Badge key={i} variant="secondary" className="text-xs">
                                  {name}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-xs text-muted-foreground">
                            {feed.matchedAgents} agente{feed.matchedAgents > 1 ? 's' : ''}
                          </span>
                          {feed.cveId.startsWith('CVE-') && (
                            <Button variant="ghost" size="sm" asChild>
                              <a
                                href={`https://nvd.nist.gov/vuln/detail/${feed.cveId}`}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            </Button>
                          )}
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
