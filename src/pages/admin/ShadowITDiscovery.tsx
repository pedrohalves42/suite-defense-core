import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Shield, Search, AlertTriangle, CheckCircle, Ban, Eye, RefreshCw, Cloud, Monitor, Globe } from "lucide-react";

const riskColors: Record<string, string> = {
  approved: "bg-green-500/10 text-green-400 border-green-500/30",
  review: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
  blocked: "bg-red-500/10 text-red-400 border-red-500/30",
  unknown: "bg-muted text-muted-foreground border-border",
};

const categoryIcons: Record<string, typeof Cloud> = {
  saas: Cloud, cloud_storage: Cloud, desktop: Monitor,
  browser_extension: Globe, communication: Globe, vpn: Shield,
  remote_access: AlertTriangle, ai_tool: Eye, development: Monitor, unknown: Search,
};

export default function ShadowITDiscovery() {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterRisk, setFilterRisk] = useState("all");

  const { data: catalog = [], isLoading } = useQuery({
    queryKey: ["shadow-it-catalog", tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shadow_it_catalog")
        .select("*")
        .eq("tenant_id", tenant!.id)
        .order("risk_score", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!tenant?.id,
  });

  const classifyMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("classify-shadow-it", {
        body: { tenant_id: tenant!.id },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      toast.success(`Shadow IT classificado: ${data?.classified ?? 0} apps analisados`);
      queryClient.invalidateQueries({ queryKey: ["shadow-it-catalog"] });
    },
    onError: () => toast.error("Erro ao classificar Shadow IT"),
  });

  const updateRiskMutation = useMutation({
    mutationFn: async ({ id, risk_level }: { id: string; risk_level: string }) => {
      const { error } = await supabase
        .from("shadow_it_catalog")
        .update({ risk_level, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Status atualizado");
      queryClient.invalidateQueries({ queryKey: ["shadow-it-catalog"] });
    },
  });

  const filtered = catalog.filter((app: any) => {
    const matchSearch = !search || app.app_name.toLowerCase().includes(search.toLowerCase());
    const matchRisk = filterRisk === "all" || app.risk_level === filterRisk;
    return matchSearch && matchRisk;
  });

  const stats = {
    total: catalog.length,
    approved: catalog.filter((a: any) => a.risk_level === "approved").length,
    review: catalog.filter((a: any) => a.risk_level === "review").length,
    blocked: catalog.filter((a: any) => a.risk_level === "blocked").length,
    unknown: catalog.filter((a: any) => a.risk_level === "unknown").length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Shadow IT Discovery</h1>
          <p className="text-muted-foreground">Descubra e classifique aplicações não autorizadas na sua organização</p>
        </div>
        <Button onClick={() => classifyMutation.mutate()} disabled={classifyMutation.isPending}>
          <RefreshCw className={`mr-2 h-4 w-4 ${classifyMutation.isPending ? "animate-spin" : ""}`} />
          {classifyMutation.isPending ? "Analisando..." : "Classificar com IA"}
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card><CardContent className="pt-4 text-center">
          <p className="text-2xl font-bold text-foreground">{stats.total}</p>
          <p className="text-xs text-muted-foreground">Total Descobertas</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 text-center">
          <p className="text-2xl font-bold text-green-400">{stats.approved}</p>
          <p className="text-xs text-muted-foreground">Aprovadas</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 text-center">
          <p className="text-2xl font-bold text-yellow-400">{stats.review}</p>
          <p className="text-xs text-muted-foreground">Em Revisão</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 text-center">
          <p className="text-2xl font-bold text-red-400">{stats.blocked}</p>
          <p className="text-xs text-muted-foreground">Bloqueadas</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 text-center">
          <p className="text-2xl font-bold text-muted-foreground">{stats.unknown}</p>
          <p className="text-xs text-muted-foreground">Desconhecidas</p>
        </CardContent></Card>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar aplicação..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Select value={filterRisk} onValueChange={setFilterRisk}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Filtrar risco" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="blocked">Bloqueadas</SelectItem>
            <SelectItem value="review">Em Revisão</SelectItem>
            <SelectItem value="approved">Aprovadas</SelectItem>
            <SelectItem value="unknown">Desconhecidas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Aplicação</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Risco</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Agentes</TableHead>
                <TableHead>Visto em</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  Nenhuma aplicação encontrada. Clique em "Classificar com IA" para iniciar.
                </TableCell></TableRow>
              ) : filtered.map((app: any) => {
                const Icon = categoryIcons[app.app_category] || Search;
                return (
                  <TableRow key={app.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        {app.app_name}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{app.app_category}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={riskColors[app.risk_level] || riskColors.unknown}>
                        {app.risk_level === "approved" && <CheckCircle className="mr-1 h-3 w-3" />}
                        {app.risk_level === "blocked" && <Ban className="mr-1 h-3 w-3" />}
                        {app.risk_level === "review" && <Eye className="mr-1 h-3 w-3" />}
                        {app.risk_level}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className={app.risk_score >= 70 ? "text-red-400" : app.risk_score >= 40 ? "text-yellow-400" : "text-green-400"}>
                        {app.risk_score}/100
                      </span>
                    </TableCell>
                    <TableCell>{app.agents_count}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(app.last_seen_at).toLocaleDateString("pt-BR")}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" className="h-7 text-xs text-green-400" onClick={() => updateRiskMutation.mutate({ id: app.id, risk_level: "approved" })}>
                          <CheckCircle className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs text-red-400" onClick={() => updateRiskMutation.mutate({ id: app.id, risk_level: "blocked" })}>
                          <Ban className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
