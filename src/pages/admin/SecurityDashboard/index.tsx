import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, Shield, Ban, User, LayoutDashboard, Activity } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { motion } from 'framer-motion';
import { SecurityControlPlane } from '@/components/security/SecurityControlPlane';
import { ThreatIntelDashboard } from '@/components/security/ThreatIntelDashboard';
import { useSecurityDashboard } from './useSecurityDashboard';
import { SecurityStatsCards } from './components/SecurityStatsCards';
import { SecurityLogTable } from './components/SecurityLogTable';
import { BlockedIPsTable } from './components/BlockedIPsTable';
import { FailedAttemptsTable } from './components/FailedAttemptsTable';

export default function SecurityDashboard() {
  const {
    logs, isLoading, stats, blockedIPs, failedAttempts,
    unblockIPMutation, isSuperAdmin,
  } = useSecurityDashboard();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Monitoramento de Segurança</h1>
        <p className="text-muted-foreground">
          Acompanhamento em tempo real de tentativas de ataque e proteção do sistema
        </p>
      </div>

      <SecurityStatsCards stats={stats} />

      {logs && logs.filter(l => l.severity === 'critical').length > 0 && (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Atenção: Eventos Críticos Detectados</AlertTitle>
            <AlertDescription>
              {logs.filter(l => l.severity === 'critical').length} evento(s) crítico(s) detectado(s) recentemente.
              Revise os registros abaixo para tomar as ações necessárias.
            </AlertDescription>
          </Alert>
        </motion.div>
      )}

      <Tabs defaultValue="control-plane" className="space-y-4">
        <TabsList>
          {isSuperAdmin && (
            <TabsTrigger value="control-plane">
              <LayoutDashboard className="h-4 w-4 mr-2" />
              Control Plane
            </TabsTrigger>
          )}
          <TabsTrigger value="logs">
            <Shield className="h-4 w-4 mr-2" />
            Registros de Segurança
          </TabsTrigger>
          {isSuperAdmin && (
            <>
              <TabsTrigger value="blocked">
                <Ban className="h-4 w-4 mr-2" />
                IPs Bloqueados ({blockedIPs?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="attempts">
                <User className="h-4 w-4 mr-2" />
                Logins Falhados ({failedAttempts?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="threat-intel">
                <Activity className="h-4 w-4 mr-2" />
                Threat Intel
              </TabsTrigger>
            </>
          )}
        </TabsList>

        {isSuperAdmin && (
          <>
            <TabsContent value="control-plane">
              <SecurityControlPlane />
            </TabsContent>
            <TabsContent value="threat-intel">
              <ThreatIntelDashboard />
            </TabsContent>
          </>
        )}

        <TabsContent value="logs">
          <SecurityLogTable logs={logs} isLoading={isLoading} />
        </TabsContent>

        {isSuperAdmin && (
          <>
            <TabsContent value="blocked">
              <BlockedIPsTable blockedIPs={blockedIPs} unblockIPMutation={unblockIPMutation} />
            </TabsContent>
            <TabsContent value="attempts">
              <FailedAttemptsTable failedAttempts={failedAttempts} />
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}
