import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Phone, Bell, RefreshCw, AlertTriangle, CheckCircle2, ArrowUpCircle, Clock, User } from 'lucide-react';
import { callEdgeFunction } from '@/lib/edge-function-client';
import { toast } from 'sonner';

interface OnCallUser {
  id: string;
  name: string;
  email: string;
  escalationLevel?: number;
}

interface OnCallAlert {
  id: string;
  incident_id: string;
  summary: string;
  severity: string;
  status: string;
  triggered_at: string;
  acknowledged_at: string | null;
  escalated_at: string | null;
}

export function OnCallDashboard() {
  const [oncall, setOncall] = useState<OnCallUser[]>([]);
  const [alerts, setAlerts] = useState<OnCallAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState('local');
  const [escalateDialog, setEscalateDialog] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState<OnCallAlert | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [oncallRes, alertsRes] = await Promise.all([
        callEdgeFunction('oncall-integration', { action: 'who-is-oncall' }),
        callEdgeFunction('oncall-integration', { action: 'alerts' }),
      ]);
      setOncall(oncallRes.oncall || []);
      setSource(oncallRes.source || 'local');
      setAlerts(alertsRes.alerts || []);
    } catch (e) {
      console.error('Failed to load on-call data:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [loadData]);

  const handleAcknowledge = async (alert: OnCallAlert) => {
    try {
      await callEdgeFunction('oncall-integration', {
        action: 'alert',
        summary: alert.summary,
        severity: 'low',
        details: { action: 'acknowledged', incident_id: alert.incident_id },
      });
      toast.success('Alerta reconhecido');
      loadData();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleEscalate = async () => {
    if (!selectedAlert) return;
    try {
      await callEdgeFunction('oncall-integration', {
        action: 'escalate',
        incidentId: selectedAlert.incident_id,
      });
      toast.success('Incidente escalado');
      setEscalateDialog(false);
      loadData();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const severityBadge = (severity: string) => {
    const map: Record<string, 'destructive' | 'secondary' | 'outline'> = {
      critical: 'destructive',
      high: 'destructive',
      medium: 'secondary',
      low: 'outline',
    };
    return <Badge variant={map[severity] || 'outline'}>{severity.toUpperCase()}</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* On-Call */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Phone className="h-5 w-5" />
              On-Call Atual
              <Badge variant="outline" className="ml-2">{source}</Badge>
            </span>
            <Button variant="ghost" size="sm" onClick={loadData} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </CardTitle>
          <CardDescription>Engenheiros de plantão para resposta a incidentes</CardDescription>
        </CardHeader>
        <CardContent>
          {oncall.length === 0 ? (
            <Alert>
              <AlertDescription>Nenhum schedule configurado. Configure via PagerDuty ou localmente.</AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-3">
              {oncall.map((user, i) => (
                <div key={user.id || i} className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{user.name}</p>
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                    </div>
                  </div>
                  {user.escalationLevel && (
                    <Badge variant="outline">L{user.escalationLevel}</Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Active Alerts */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Alertas Ativos
          </CardTitle>
        </CardHeader>
        <CardContent>
          {alerts.length === 0 ? (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>Todos os sistemas operacionais. Nenhum incidente ativo.</AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-3">
              {alerts.map(alert => (
                <div key={alert.id} className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {severityBadge(alert.severity)}
                      <span className="text-sm font-medium truncate">{alert.summary}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {new Date(alert.triggered_at).toLocaleString('pt-BR')}
                      <Badge variant="outline" className="text-xs">{alert.status}</Badge>
                    </div>
                  </div>
                  <div className="flex gap-1 ml-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleAcknowledge(alert)}
                      disabled={alert.status === 'acknowledged'}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => { setSelectedAlert(alert); setEscalateDialog(true); }}
                    >
                      <ArrowUpCircle className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Escalate Dialog */}
      <Dialog open={escalateDialog} onOpenChange={setEscalateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Escalar Incidente
            </DialogTitle>
            <DialogDescription>
              Isso notificará o próximo nível de resposta na cadeia de escalação.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm mb-2">Incidente: <strong>{selectedAlert?.summary}</strong></p>
            <Alert variant="destructive">
              <AlertDescription>
                A escalação irá pager o próximo respondente e notificar o gerente de engenharia.
              </AlertDescription>
            </Alert>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEscalateDialog(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleEscalate}>Escalar Agora</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
