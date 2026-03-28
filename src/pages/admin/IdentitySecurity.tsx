import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { KeyRound, Search, AlertTriangle, ShieldAlert, UserX, Mail, RefreshCw, CheckCircle } from "lucide-react";

const severityColors: Record<string, string> = {
  critical: "bg-red-500/10 text-red-400 border-red-500/30",
  high: "bg-orange-500/10 text-orange-400 border-orange-500/30",
  medium: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
  low: "bg-blue-500/10 text-blue-400 border-blue-500/30",
};

export default function IdentitySecurity() {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const [domainInput, setDomainInput] = useState("");

  const { data: leaks = [], isLoading } = useQuery({
    queryKey: ["credential-leaks", tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credential_leaks")
        .select("*")
        .eq("tenant_id", tenant!.id)
        .order("detected_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!tenant?.id,
  });

  const { data: monitors = [] } = useQuery({
    queryKey: ["credential-monitors", tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credential_monitors")
        .select("*")
        .eq("tenant_id", tenant!.id);
      if (error) throw error;
      return data;
    },
    enabled: !!tenant?.id,
  });

  const addDomainMutation = useMutation({
    mutationFn: async (domain: string) => {
      const { error } = await supabase.from("credential_monitors").upsert({
        tenant_id: tenant!.id,
        email_domain: domain.trim().toLowerCase(),
        monitoring_enabled: true,
      }, { onConflict: "tenant_id,email_domain" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Domínio adicionado ao monitoramento");
      setDomainInput("");
      queryClient.invalidateQueries({ queryKey: ["credential-monitors"] });
    },
  });

  const checkLeaksMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("check-credential-leaks", {
        body: { tenant_id: tenant!.id },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      toast.success(`Verificação concluída: ${data?.leaks_found ?? 0} vazamentos encontrados`);
      queryClient.invalidateQueries({ queryKey: ["credential-leaks"] });
    },
    onError: () => toast.error("Erro ao verificar credenciais"),
  });

  const resolveMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!tenant?.id) throw new Error('No tenant');
      // V-1066 FIX: Add tenant_id filter
      const { error } = await supabase
        .from("credential_leaks")
        .update({ status: "resolved", resolved_at: new Date().toISOString() } )
        .eq("id", id)
        .eq("tenant_id", tenant.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Marcado como resolvido");
      queryClient.invalidateQueries({ queryKey: ["credential-leaks"] });
    },
  });

  const stats = {
    total: leaks.length,
    new: leaks.filter((l: any) => l.status === "new").length,
    critical: leaks.filter((l: any) => l.severity === "critical").length,
    domains: monitors.length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <KeyRound className="h-6 w-6 text-primary" /> Identity Security
          </h1>
          <p className="text-muted-foreground">Monitore credenciais vazadas e proteja identidades corporativas</p>
        </div>
        <Button onClick={() => checkLeaksMutation.mutate()} disabled={checkLeaksMutation.isPending}>
          <RefreshCw className={`mr-2 h-4 w-4 ${checkLeaksMutation.isPending ? "animate-spin" : ""}`} />
          Verificar Vazamentos
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4 text-center">
          <ShieldAlert className="h-6 w-6 mx-auto mb-1 text-red-400" />
          <p className="text-2xl font-bold text-foreground">{stats.total}</p>
          <p className="text-xs text-muted-foreground">Vazamentos Detectados</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 text-center">
          <AlertTriangle className="h-6 w-6 mx-auto mb-1 text-yellow-400" />
          <p className="text-2xl font-bold text-yellow-400">{stats.new}</p>
          <p className="text-xs text-muted-foreground">Novos (não tratados)</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 text-center">
          <UserX className="h-6 w-6 mx-auto mb-1 text-red-400" />
          <p className="text-2xl font-bold text-red-400">{stats.critical}</p>
          <p className="text-xs text-muted-foreground">Críticos</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 text-center">
          <Mail className="h-6 w-6 mx-auto mb-1 text-primary" />
          <p className="text-2xl font-bold text-foreground">{stats.domains}</p>
          <p className="text-xs text-muted-foreground">Domínios Monitorados</p>
        </CardContent></Card>
      </div>

      {/* Add Domain */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Adicionar Domínio ao Monitoramento</CardTitle></CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input placeholder="empresa.com.br" value={domainInput} onChange={(e) => setDomainInput(e.target.value)} />
            <Button onClick={() => domainInput && addDomainMutation.mutate(domainInput)} disabled={!domainInput}>
              Adicionar
            </Button>
          </div>
          {monitors.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {monitors.map((m: any) => (
                <Badge key={m.id} variant="outline">{m.email_domain}</Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Leaks Table */}
      <Card>
        <CardHeader><CardTitle>Credenciais Vazadas</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Fonte</TableHead>
                <TableHead>Severidade</TableHead>
                <TableHead>Dados Expostos</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Detectado</TableHead>
                <TableHead>Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
              ) : leaks.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  Nenhum vazamento detectado. Adicione domínios e clique em "Verificar".
                </TableCell></TableRow>
              ) : leaks.map((leak: any) => (
                <TableRow key={leak.id}>
                  <TableCell className="font-mono text-sm">{leak.email}</TableCell>
                  <TableCell>{leak.breach_name || leak.breach_source || "—"}</TableCell>
                  <TableCell>
                    <Badge className={severityColors[leak.severity]}>{leak.severity}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(leak.data_types_exposed || []).slice(0, 3).map((t: string) => (
                        <Badge key={t} variant="outline" className="text-xs">{t}</Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={leak.status === "resolved" ? "default" : "secondary"}>{leak.status}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(leak.detected_at).toLocaleDateString("pt-BR")}
                  </TableCell>
                  <TableCell>
                    {leak.status !== "resolved" && (
                      <Button size="sm" variant="ghost" onClick={() => resolveMutation.mutate(leak.id)}>
                        <CheckCircle className="h-3 w-3" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
