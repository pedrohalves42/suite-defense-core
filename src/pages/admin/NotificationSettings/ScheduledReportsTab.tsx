import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Send, FileText, Loader2, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { formatBrazilDateTime } from '@/lib/date-utils';
import type { ScheduledReport } from './types';
import { DAY_OF_WEEK_OPTIONS, HOUR_OPTIONS } from './types';
import type { NewReportState } from './useNotificationSettings';

interface ScheduledReportsTabProps {
  reports: ScheduledReport[];
  sendingReport: string | null;
  defaultNewReport: NewReportState;
  onAdd: (report: NewReportState) => Promise<boolean>;
  onDelete: (id: string) => void;
  onToggle: (id: string, isActive: boolean) => void;
  onSendNow: (report: ScheduledReport) => void;
}

const REPORT_SECTIONS = [
  { key: 'include_agents_summary', label: '🖥️ Status dos Computadores' },
  { key: 'include_vulnerabilities', label: '🔴 Vulnerabilidades' },
  { key: 'include_software_inventory', label: '📦 Inventário de Software' },
  { key: 'include_web_activity', label: '🌐 Atividade Web' },
  { key: 'include_antivirus', label: '🛡️ Status Antivírus' },
] as const;

export default function ScheduledReportsTab({
  reports,
  sendingReport,
  defaultNewReport,
  onAdd,
  onDelete,
  onToggle,
  onSendNow,
}: ScheduledReportsTabProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newRecipient, setNewRecipient] = useState('');
  const [newReport, setNewReport] = useState<NewReportState>({ ...defaultNewReport });

  const addRecipient = () => {
    if (!newRecipient || !newRecipient.includes('@')) return;
    if (newReport.recipients.includes(newRecipient)) return;
    setNewReport(prev => ({ ...prev, recipients: [...prev.recipients, newRecipient] }));
    setNewRecipient('');
  };

  const removeRecipient = (email: string) => {
    setNewReport(prev => ({ ...prev, recipients: prev.recipients.filter(r => r !== email) }));
  };

  const handleAdd = async () => {
    const success = await onAdd(newReport);
    if (success) {
      setDialogOpen(false);
      setNewReport({ ...defaultNewReport });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />Novo Relatório</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Agendar Relatório</DialogTitle>
              <DialogDescription>Configure um relatório automático de segurança por email.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
              <div className="space-y-2">
                <Label>Nome do Relatório</Label>
                <Input value={newReport.name} onChange={(e) => setNewReport(prev => ({ ...prev, name: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Frequência</Label>
                  <Select value={newReport.schedule} onValueChange={(v) => setNewReport(prev => ({ ...prev, schedule: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Diário</SelectItem>
                      <SelectItem value="weekly">Semanal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {newReport.schedule === 'weekly' && (
                  <div className="space-y-2">
                    <Label>Dia</Label>
                    <Select value={String(newReport.day_of_week)} onValueChange={(v) => setNewReport(prev => ({ ...prev, day_of_week: parseInt(v) }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {DAY_OF_WEEK_OPTIONS.map(d => <SelectItem key={d.value} value={String(d.value)}>{d.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Horário</Label>
                  <Select value={String(newReport.hour)} onValueChange={(v) => setNewReport(prev => ({ ...prev, hour: parseInt(v) }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {HOUR_OPTIONS.map(h => <SelectItem key={h.value} value={String(h.value)}>{h.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Destinatários</Label>
                <div className="flex gap-2">
                  <Input placeholder="email@exemplo.com" value={newRecipient} onChange={(e) => setNewRecipient(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addRecipient())} />
                  <Button type="button" onClick={addRecipient}>Adicionar</Button>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {newReport.recipients.map(r => (
                    <Badge key={r} variant="secondary" className="gap-1">
                      {r}
                      <X className="h-3 w-3 cursor-pointer" onClick={() => removeRecipient(r)} />
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Incluir no Relatório</Label>
                <div className="space-y-2">
                  {REPORT_SECTIONS.map(item => (
                    <div key={item.key} className="flex items-center gap-2">
                      <Checkbox
                        checked={newReport[item.key] as boolean}
                        onCheckedChange={(c) => setNewReport(prev => ({ ...prev, [item.key]: c }))}
                      />
                      <Label className="font-normal">{item.label}</Label>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button onClick={handleAdd}>Criar Relatório</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {reports.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Nenhum relatório agendado</h3>
            <p className="text-muted-foreground text-center mb-4">Configure relatórios automáticos de segurança por email.</p>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />Criar Relatório
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {reports.map((report) => (
            <Card key={report.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <FileText className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{report.name}</CardTitle>
                      <CardDescription>
                        {report.schedule === 'weekly' ? `Semanal - ${DAY_OF_WEEK_OPTIONS.find(d => d.value === report.day_of_week)?.label}` : 'Diário'} às {report.hour}:00
                      </CardDescription>
                    </div>
                  </div>
                  <Switch checked={report.is_active} onCheckedChange={(c) => onToggle(report.id, c)} />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-sm text-muted-foreground">
                  <strong>Destinatários:</strong> {report.recipients.join(', ')}
                </div>
                {report.last_sent_at && (
                  <div className="text-xs text-muted-foreground">
                    Último envio: {formatBrazilDateTime(report.last_sent_at, 'short')}
                  </div>
                )}
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" size="sm" onClick={() => onSendNow(report)} disabled={sendingReport === report.id}>
                    {sendingReport === report.id ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Send className="h-3 w-3 mr-1" />}
                    Enviar Agora
                  </Button>
                  <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => onDelete(report.id)}>
                    <Trash2 className="h-3 w-3 mr-1" />Remover
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
