/**
 * MitreAttackDashboard — MITRE ATT&CK Coverage Dashboard (Sprint 28)
 * Visual mapping of detected techniques across the kill chain.
 */
import { AdminPageLayout } from '@/components/AdminPageLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Shield, Target, AlertTriangle, CheckCircle } from 'lucide-react';
import { useMitreAttackCoverage } from '@/hooks/useEdrTelemetry';
import { useMitreAttackTechniques } from '@/hooks/useDetectionRules';
import { useMemo } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

const TACTIC_ORDER = [
  'Initial Access',
  'Execution',
  'Persistence',
  'Privilege Escalation',
  'Defense Evasion',
  'Credential Access',
  'Discovery',
  'Lateral Movement',
  'Collection',
  'Command and Control',
  'Exfiltration',
  'Impact',
];

const TACTIC_COLORS: Record<string, string> = {
  'Initial Access': 'bg-blue-500/20 text-blue-400',
  'Execution': 'bg-purple-500/20 text-purple-400',
  'Persistence': 'bg-amber-500/20 text-amber-400',
  'Privilege Escalation': 'bg-orange-500/20 text-orange-400',
  'Defense Evasion': 'bg-yellow-500/20 text-yellow-400',
  'Credential Access': 'bg-red-500/20 text-red-400',
  'Discovery': 'bg-cyan-500/20 text-cyan-400',
  'Lateral Movement': 'bg-pink-500/20 text-pink-400',
  'Collection': 'bg-teal-500/20 text-teal-400',
  'Command and Control': 'bg-rose-500/20 text-rose-400',
  'Exfiltration': 'bg-violet-500/20 text-violet-400',
  'Impact': 'bg-destructive/20 text-destructive',
};

export default function MitreAttackDashboard() {
  const { data: coverage, isLoading: coverageLoading } = useMitreAttackCoverage();
  const { data: allTechniques, isLoading: techniquesLoading } = useMitreAttackTechniques();

  const isLoading = coverageLoading || techniquesLoading;

  // Group by tactic
  const tacticGroups = useMemo(() => {
    if (!allTechniques) return [];

    const groups = new Map<string, {
      tactic: string;
      total: number;
      detected: number;
      techniques: Array<{
        id: string;
        name: string;
        detectionCount: number;
        lastSeen?: string;
      }>;
    }>();

    // Initialize all tactics
    for (const tactic of TACTIC_ORDER) {
      groups.set(tactic, { tactic, total: 0, detected: 0, techniques: [] });
    }

    // Fill with techniques from reference table
    for (const tech of allTechniques) {
      const group = groups.get(tech.tactic);
      if (!group) continue;

      const coverageEntry = coverage?.find(c => c.techniqueId === tech.technique_id);
      group.total++;
      
      group.techniques.push({
        id: tech.technique_id,
        name: tech.technique_name,
        detectionCount: coverageEntry?.count || 0,
        lastSeen: coverageEntry?.lastSeen,
      });

      if (coverageEntry && coverageEntry.count > 0) {
        group.detected++;
      }
    }

    return Array.from(groups.values()).filter(g => g.total > 0);
  }, [allTechniques, coverage]);

  const totalTechniques = tacticGroups.reduce((sum, g) => sum + g.total, 0);
  const detectedTechniques = tacticGroups.reduce((sum, g) => sum + g.detected, 0);
  const coveragePercent = totalTechniques > 0 ? Math.round((detectedTechniques / totalTechniques) * 100) : 0;
  const totalDetections = coverage?.reduce((sum, c) => sum + c.count, 0) || 0;

  return (
    <AdminPageLayout
      title="MITRE ATT&CK"
      description="Cobertura de detecção mapeada ao framework MITRE ATT&CK"
      icon={Target}
    >
      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-3xl font-bold">{coveragePercent}%</p>
            <p className="text-xs text-muted-foreground">Cobertura</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-3xl font-bold">{detectedTechniques}/{totalTechniques}</p>
            <p className="text-xs text-muted-foreground">Técnicas Detectadas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-3xl font-bold text-destructive">{totalDetections}</p>
            <p className="text-xs text-muted-foreground">Detecções Total</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-3xl font-bold">{TACTIC_ORDER.length}</p>
            <p className="text-xs text-muted-foreground">Táticas Mapeadas</p>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32 w-full" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {tacticGroups.map(group => {
            const pct = group.total > 0 ? Math.round((group.detected / group.total) * 100) : 0;
            const colorClass = TACTIC_COLORS[group.tactic] || 'bg-muted text-muted-foreground';

            return (
              <Card key={group.tactic} className="overflow-hidden">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium">{group.tactic}</CardTitle>
                    <Badge className={`text-[10px] ${colorClass}`}>{pct}%</Badge>
                  </div>
                  <Progress value={pct} className="h-1.5 mt-1" />
                  <p className="text-[10px] text-muted-foreground">{group.detected}/{group.total} técnicas</p>
                </CardHeader>
                <CardContent className="pt-0">
                  <ScrollArea className="h-[120px]">
                    <div className="space-y-1">
                      {group.techniques.map(tech => (
                        <div
                          key={tech.id}
                          className={`flex items-center justify-between text-xs p-1.5 rounded ${tech.detectionCount > 0 ? 'bg-primary/5' : 'opacity-60'}`}
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            {tech.detectionCount > 0 ? (
                              <CheckCircle className="h-3 w-3 text-primary shrink-0" />
                            ) : (
                              <AlertTriangle className="h-3 w-3 text-muted-foreground shrink-0" />
                            )}
                            <span className="font-mono text-[10px] text-muted-foreground shrink-0">{tech.id}</span>
                            <span className="truncate">{tech.name}</span>
                          </div>
                          {tech.detectionCount > 0 && (
                            <Badge variant="outline" className="text-[10px] ml-1 shrink-0">
                              {tech.detectionCount}
                            </Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </AdminPageLayout>
  );
}
