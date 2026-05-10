/**
 * RuntimeDiagnostics — Painel administrativo para inspecionar
 * canais Realtime, sincronização de tenant e fluxo de logs em tempo real.
 *
 * Acesso restrito a admin / super_admin.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useActiveTenant } from '@/hooks/useActiveTenant';
import { useUserRole } from '@/hooks/useUserRole';
import { Navigate } from 'react-router-dom';
import {
  realtimeChannelManager,
  type ChannelDiagnostic,
} from '@/lib/realtime-manager';
import {
  getDiagBuffer,
  getPersistedDiagEvents,
  clearDiagBuffer,
  subscribeDiagEvents,
  getLogCorrelation,
  type DiagEvent,
  type LogCategory,
  type LogLevel,
} from '@/lib/logger';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';

const CATEGORIES: (LogCategory | 'all')[] = ['all', 'realtime', 'tenant-sync', 'auth', 'query', 'general'];
const LEVELS: (LogLevel | 'all')[] = ['all', 'debug', 'info', 'warn', 'error'];

function statusVariant(status: ChannelDiagnostic['status']): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'subscribed': return 'default';
    case 'subscribing':
    case 'retrying': return 'secondary';
    case 'error':
    case 'timeout': return 'destructive';
    default: return 'outline';
  }
}

function levelVariant(level: LogLevel): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (level === 'error') return 'destructive';
  if (level === 'warn') return 'secondary';
  if (level === 'info') return 'default';
  return 'outline';
}

export default function RuntimeDiagnostics() {
  const { user } = useAuth();
  const { activeTenant } = useActiveTenant();
  const { role, isAdmin, isSuperAdmin, loading: roleLoading } = useUserRole();

  const [channels, setChannels] = useState<ChannelDiagnostic[]>([]);
  const [events, setEvents] = useState<DiagEvent[]>(() => getDiagBuffer());
  const [filterCategory, setFilterCategory] = useState<LogCategory | 'all'>('all');
  const [filterLevel, setFilterLevel] = useState<LogLevel | 'all'>('all');
  const [autoScroll, setAutoScroll] = useState(true);
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const tick = () => setChannels(realtimeChannelManager.getDiagnostics());
    tick();
    const id = setInterval(tick, 2000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const unsub = subscribeDiagEvents((evt) => {
      setEvents((prev) => {
        const next = [...prev, evt];
        if (next.length > 500) next.shift();
        return next;
      });
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (autoScroll && feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [events, autoScroll]);

  const filteredEvents = useMemo(() => {
    return events.filter(
      (e) =>
        (filterCategory === 'all' || e.category === filterCategory) &&
        (filterLevel === 'all' || e.level === filterLevel)
    );
  }, [events, filterCategory, filterLevel]);

  const persistedErrors = useMemo(() => getPersistedDiagEvents(), [events.length]);

  const correlation = getLogCorrelation();

  if (roleLoading) {
    return <div className="p-6 text-muted-foreground">Carregando…</div>;
  }
  if (!isAdmin && !isSuperAdmin) {
    return <Navigate to="/403" replace />;
  }

  const buildReport = () => ({
    generatedAt: new Date().toISOString(),
    correlation,
    user: { id: user?.id, email: user?.email, role },
    tenant: { id: activeTenant?.id, name: activeTenant?.name },
    channels,
    persistedErrors,
    recentEvents: events.slice(-200),
  });

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(buildReport(), null, 2));
      toast.success('Relatório copiado para a área de transferência');
    } catch {
      toast.error('Não foi possível copiar o relatório');
    }
  };

  const handleDownload = () => {
    const blob = new Blob([JSON.stringify(buildReport(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cybershield-diag-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClear = () => {
    clearDiagBuffer();
    setEvents([]);
    toast.success('Buffer limpo');
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Diagnóstico em Tempo Real</h1>
          <p className="text-sm text-muted-foreground">
            Inspecione canais Realtime, sincronização de tenant e fluxo de logs correlacionados por sessão.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleCopy}>Copiar relatório</Button>
          <Button variant="outline" onClick={handleDownload}>Baixar JSON</Button>
          <Button variant="destructive" onClick={handleClear}>Limpar buffer</Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Contexto da sessão</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-muted-foreground">Usuário</div>
            <div className="font-mono break-all">{user?.email ?? '—'}</div>
            <div className="font-mono break-all text-xs text-muted-foreground">{user?.id ?? '—'}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Tenant ativo</div>
            <div>{activeTenant?.name ?? '—'}</div>
            <div className="font-mono break-all text-xs text-muted-foreground">{activeTenant?.id ?? '—'}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Sessão / Role</div>
            <div className="font-mono break-all text-xs">{correlation.sessionId ?? 'sem sessão registrada'}</div>
            <Badge variant="secondary" className="mt-1">{role ?? '—'}</Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Canais Realtime ({channels.length})</CardTitle>
          <Badge variant="outline">
            {channels.filter(c => c.status === 'subscribed').length} ativos · {channels.filter(c => c.status === 'error' || c.status === 'timeout' || c.status === 'retrying').length} com problema
          </Badge>
        </CardHeader>
        <CardContent>
          {channels.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum canal registrado ainda.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Canal</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Inscritos</TableHead>
                  <TableHead>Erros</TableHead>
                  <TableHead>Tentativa</TableHead>
                  <TableHead>Último erro</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {channels.map((c) => (
                  <TableRow key={c.key}>
                    <TableCell className="font-mono text-xs break-all max-w-xs">{c.key}</TableCell>
                    <TableCell><Badge variant={statusVariant(c.status)}>{c.status}</Badge></TableCell>
                    <TableCell>{c.subscribers.length}</TableCell>
                    <TableCell>{c.errorCount}</TableCell>
                    <TableCell>{c.retryAttempt > 0 ? `#${c.retryAttempt}` : '—'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
                      {c.lastError ? `${new Date(c.lastError.ts).toLocaleTimeString()} — ${c.lastError.message}` : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const ok = realtimeChannelManager.forceReconnect(c.key);
                          toast[ok ? 'success' : 'error'](ok ? 'Reconexão iniciada' : 'Canal não encontrado');
                        }}
                      >
                        Reconectar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
          <CardTitle>Stream de logs ({filteredEvents.length}/{events.length})</CardTitle>
          <div className="flex gap-2 items-center">
            <Select value={filterCategory} onValueChange={(v) => setFilterCategory(v as LogCategory | 'all')}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}
              </SelectContent>
            </Select>
            <Select value={filterLevel} onValueChange={(v) => setFilterLevel(v as LogLevel | 'all')}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                {LEVELS.map((l) => (<SelectItem key={l} value={l}>{l}</SelectItem>))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant={autoScroll ? 'default' : 'outline'}
              onClick={() => setAutoScroll((v) => !v)}
            >
              Auto-scroll
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-96 rounded border">
            <div ref={feedRef} className="font-mono text-xs p-3 space-y-1">
              {filteredEvents.length === 0 && (
                <div className="text-muted-foreground">Nenhum evento corresponde aos filtros.</div>
              )}
              {filteredEvents.map((e, i) => (
                <div key={i} className="flex gap-2 items-start border-b border-border/40 pb-1">
                  <span className="text-muted-foreground shrink-0">{new Date(e.ts).toLocaleTimeString()}</span>
                  <Badge variant={levelVariant(e.level)} className="shrink-0">{e.level}</Badge>
                  <Badge variant="outline" className="shrink-0">{e.category}</Badge>
                  <span className="break-all">
                    {e.message}
                    {e.data && Object.keys(e.data).length > 0 && (
                      <span className="text-muted-foreground"> {JSON.stringify(e.data)}</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Erros persistidos ({persistedErrors.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {persistedErrors.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum erro persistido.</p>
          ) : (
            <ScrollArea className="h-64 rounded border">
              <div className="font-mono text-xs p-3 space-y-1">
                {persistedErrors.slice().reverse().map((e, i) => (
                  <div key={i} className="flex gap-2 items-start border-b border-border/40 pb-1">
                    <span className="text-muted-foreground shrink-0">{new Date(e.ts).toLocaleString()}</span>
                    <Badge variant={levelVariant(e.level)} className="shrink-0">{e.level}</Badge>
                    <Badge variant="outline" className="shrink-0">{e.category}</Badge>
                    <span className="break-all">{e.message}</span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
