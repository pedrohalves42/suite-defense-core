import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, HelpCircle, Shield, AlertTriangle } from 'lucide-react';
import type { AgentWithCapabilities } from '../useAgentVersionMonitor';

export function getStatusBadge(agent: AgentWithCapabilities) {
  if (!agent.last_heartbeat) {
    return <Badge variant="outline" className="text-muted-foreground">Nunca conectou</Badge>;
  }
  const diff = Date.now() - new Date(agent.last_heartbeat).getTime();
  if (diff < 5 * 60 * 1000) {
    return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Online</Badge>;
  }
  if (diff < 30 * 60 * 1000) {
    return <Badge variant="outline" className="text-yellow-500 border-yellow-500/20">Recente</Badge>;
  }
  return <Badge variant="outline" className="text-muted-foreground">Offline</Badge>;
}

export function getEd25519Badge(supported: boolean | null) {
  if (supported === true) {
    return <Badge className="bg-green-500/10 text-green-500 border-green-500/20"><CheckCircle className="h-3 w-3 mr-1" />Suportado</Badge>;
  }
  if (supported === false) {
    return <Badge variant="outline" className="text-orange-500 border-orange-500/20"><XCircle className="h-3 w-3 mr-1" />Não suportado</Badge>;
  }
  return <Badge variant="outline" className="text-muted-foreground"><HelpCircle className="h-3 w-3 mr-1" />N/A</Badge>;
}

export function getSignatureModeBadge(mode: string | null) {
  if (mode === 'strict') {
    return <Badge className="bg-primary/10 text-primary border-primary/20"><Shield className="h-3 w-3 mr-1" />Strict</Badge>;
  }
  if (mode === 'audit_only') {
    return <Badge variant="outline" className="text-yellow-500 border-yellow-500/20"><AlertTriangle className="h-3 w-3 mr-1" />Audit</Badge>;
  }
  return <Badge variant="outline" className="text-muted-foreground"><HelpCircle className="h-3 w-3 mr-1" />N/A</Badge>;
}
