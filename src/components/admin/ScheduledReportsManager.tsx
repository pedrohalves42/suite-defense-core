/**
 * Scheduled Reports Manager
 * 
 * UI for managing scheduled reports with:
 * - View existing schedules
 * - Create new schedules
 * - Configure frequency, recipients, content
 * - View last execution and next run
 */

import { useState } from "react";
import { useTenant } from "@/hooks/useTenant";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { 
  Calendar, Clock, Plus, Trash2, Loader2, Mail, 
  Play, Pause, RefreshCw, FileText, AlertCircle
} from "lucide-react";
import { toast } from "sonner";
import { formatBrazilDateTime } from "@/lib/date-utils";

interface ScheduledReport {
  id: string;
  tenant_id: string;
  name: string;
  report_type: string;
  is_active: boolean;
  created_at: string;
  day_of_week: number;
  hour: number;
  recipients: string[] | null;
}

const FREQUENCY_OPTIONS = [
  { value: "daily", label: "Diário", description: "Todos os dias às 6h" },
  { value: "weekly", label: "Semanal", description: "Toda segunda-feira" },
  { value: "biweekly", label: "Quinzenal", description: "A cada 14 dias" },
  { value: "monthly", label: "Mensal", description: "Todo dia 1º" },
];

const REPORT_TYPE_OPTIONS = [
  { value: "full_security", label: "Segurança Completo" },
  { value: "compliance_lgpd", label: "Compliance LGPD" },
  { value: "compliance_iso27001", label: "Compliance ISO 27001" },
  { value: "compliance_soc2", label: "Compliance SOC2-lite" },
  { value: "executive_summary", label: "Resumo Executivo" },
];

export function ScheduledReportsManager() {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newSchedule, setNewSchedule] = useState({
    name: "",
    report_type: "full_security",
    frequency: "weekly",
    recipients: "",
    is_active: true,
  });

  // Fetch scheduled reports
  const { data: schedules, isLoading, error } = useQuery({
    queryKey: ["scheduled-reports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scheduled_reports")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as ScheduledReport[];
    },
  });

  // Create new schedule
  const createSchedule = useMutation({
    mutationFn: async () => {
      const recipients = newSchedule.recipients
        .split(",")
        .map(e => e.trim())
        .filter(e => e.length > 0);

      if (recipients.length === 0) {
        throw new Error("Adicione pelo menos um destinatário");
      }

      // Calculate next_run_at based on frequency
      const now = new Date();
      let nextRun = new Date(now);
      
      switch (newSchedule.frequency) {
        case "daily":
          nextRun.setDate(nextRun.getDate() + 1);
          nextRun.setHours(6, 0, 0, 0);
          break;
        case "weekly":
          nextRun.setDate(nextRun.getDate() + (8 - nextRun.getDay()) % 7 || 7);
          nextRun.setHours(6, 0, 0, 0);
          break;
        case "biweekly":
          nextRun.setDate(nextRun.getDate() + 14);
          nextRun.setHours(6, 0, 0, 0);
          break;
        case "monthly":
          nextRun.setMonth(nextRun.getMonth() + 1);
          nextRun.setDate(1);
          nextRun.setHours(6, 0, 0, 0);
          break;
      }

      if (!tenant) throw new Error("Tenant não selecionado");

      const { error } = await supabase
        .from("scheduled_reports")
        .insert({
          tenant_id: tenant.id,
          name: newSchedule.name || `Relatório ${REPORT_TYPE_OPTIONS.find(r => r.value === newSchedule.report_type)?.label}`,
          report_type: newSchedule.report_type,
          frequency: newSchedule.frequency,
          recipients,
          is_active: newSchedule.is_active,
          next_run_at: nextRun.toISOString(),
          config: {},
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scheduled-reports"] });
      toast.success("Agendamento criado com sucesso!");
      setIsDialogOpen(false);
      setNewSchedule({
        name: "",
        report_type: "full_security",
        frequency: "weekly",
        recipients: "",
        is_active: true,
      });
    },
    onError: (error: Error) => {
      toast.error(`Erro ao criar agendamento: ${error.message}`);
    },
  });

  // Toggle schedule active status
  const toggleSchedule = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("scheduled_reports")
        .update({ is_active })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scheduled-reports"] });
      toast.success("Status atualizado!");
    },
    onError: (error: Error) => {
      toast.error(`Erro: ${error.message}`);
    },
  });

  // Delete schedule
  const deleteSchedule = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("scheduled_reports")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scheduled-reports"] });
      toast.success("Agendamento removido!");
    },
    onError: (error: Error) => {
      toast.error(`Erro: ${error.message}`);
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12 text-destructive">
          <AlertCircle className="h-5 w-5 mr-2" />
          Erro ao carregar agendamentos
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Relatórios Agendados
            </CardTitle>
            <CardDescription>
              Configure envio automático de relatórios por email
            </CardDescription>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Novo Agendamento
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Criar Agendamento</DialogTitle>
                <DialogDescription>
                  Configure um novo relatório automático
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome (opcional)</Label>
                  <Input
                    id="name"
                    placeholder="Ex: Relatório Semanal de Segurança"
                    value={newSchedule.name}
                    onChange={(e) => setNewSchedule({ ...newSchedule, name: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Tipo de Relatório</Label>
                  <Select
                    value={newSchedule.report_type}
                    onValueChange={(v) => setNewSchedule({ ...newSchedule, report_type: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REPORT_TYPE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Frequência</Label>
                  <Select
                    value={newSchedule.frequency}
                    onValueChange={(v) => setNewSchedule({ ...newSchedule, frequency: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FREQUENCY_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          <span className="flex flex-col">
                            <span>{opt.label}</span>
                            <span className="text-xs text-muted-foreground">{opt.description}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="recipients">Destinatários (emails separados por vírgula)</Label>
                  <Input
                    id="recipients"
                    placeholder="admin@empresa.com, gerente@empresa.com"
                    value={newSchedule.recipients}
                    onChange={(e) => setNewSchedule({ ...newSchedule, recipients: e.target.value })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="is_active">Ativar imediatamente</Label>
                  <Switch
                    id="is_active"
                    checked={newSchedule.is_active}
                    onCheckedChange={(checked) => setNewSchedule({ ...newSchedule, is_active: checked })}
                  />
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button 
                  onClick={() => createSchedule.mutate()}
                  disabled={createSchedule.isPending}
                >
                  {createSchedule.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  Criar Agendamento
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      
      <CardContent>
        {schedules && schedules.length > 0 ? (
          <div className="space-y-4">
            {schedules.map((schedule) => (
              <div
                key={schedule.id}
                className="flex items-center justify-between p-4 border rounded-lg"
              >
                <div className="flex items-center gap-4">
                  <div className={`p-2 rounded-lg ${schedule.is_active ? 'bg-primary/10' : 'bg-muted'}`}>
                    <FileText className={`h-5 w-5 ${schedule.is_active ? 'text-primary' : 'text-muted-foreground'}`} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{schedule.name}</span>
                      <Badge variant={schedule.is_active ? "default" : "secondary"}>
                        {schedule.is_active ? "Ativo" : "Pausado"}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground flex items-center gap-4 mt-1">
                      <span className="flex items-center gap-1">
                        <RefreshCw className="h-3 w-3" />
                        {schedule.day_of_week === 0 ? "Diário" : 
                         schedule.day_of_week === 1 ? "Semanal (Seg)" :
                         schedule.day_of_week === 5 ? "Semanal (Sex)" : "Personalizado"}
                      </span>
                      <span className="flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        {Array.isArray(schedule.recipients) ? schedule.recipients.length : 0} destinatário(s)
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        às {schedule.hour}h
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => toggleSchedule.mutate({ id: schedule.id, is_active: !schedule.is_active })}
                    title={schedule.is_active ? "Pausar" : "Ativar"}
                  >
                    {schedule.is_active ? (
                      <Pause className="h-4 w-4" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteSchedule.mutate(schedule.id)}
                    className="text-destructive hover:text-destructive"
                    title="Remover"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Nenhum agendamento configurado</p>
            <p className="text-sm">Crie um agendamento para receber relatórios automaticamente</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}