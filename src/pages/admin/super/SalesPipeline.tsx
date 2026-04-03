import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { callGateway } from "@/lib/gateway";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Plus, DollarSign, Target, TrendingUp, Users, Trash2, Edit } from "lucide-react";

interface Deal {
  id: string;
  company: string;
  contact: string;
  stage: string;
  probability: number;
  value: number;
  expected_close: string;
  created_at: string;
}

interface PipelineData {
  deals: Deal[];
  deals_by_stage: Record<string, Deal[]>;
  metrics: {
    total_deals: number;
    open_deals: number;
    won_deals: number;
    lost_deals: number;
    total_value: number;
    open_value: number;
    weighted_value: number;
    win_rate: number;
  };
}

const STAGES = [
  { value: "lead", label: "Lead", color: "bg-slate-500" },
  { value: "qualified", label: "Qualificado", color: "bg-blue-500" },
  { value: "demo", label: "Demo", color: "bg-purple-500" },
  { value: "proposal", label: "Proposta", color: "bg-orange-500" },
  { value: "negotiation", label: "Negociação", color: "bg-amber-500" },
  { value: "won", label: "Ganho ✅", color: "bg-emerald-500" },
  { value: "lost", label: "Perdido ❌", color: "bg-red-500" },
];

export default function SalesPipeline() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null);
  const [formData, setFormData] = useState({
    company: "",
    contact: "",
    stage: "lead",
    probability: 10,
    value: 0,
    expected_close: "",
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["sales-pipeline"],
    queryFn: async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) throw new Error("Not authenticated");

      const response = await supabase.functions.invoke("sales-pipeline", {
        method: "GET",
      });

      if (response.error) throw response.error;
      return response.data as PipelineData;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (newDeal: typeof formData) => {
      const response = await supabase.functions.invoke("sales-pipeline", {
        method: "POST",
        body: newDeal,
      });
      if (response.error) throw response.error;
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-pipeline"] });
      toast.success("Deal criado com sucesso!");
      setIsDialogOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast.error(`Erro ao criar deal: ${error.message}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (deal: Partial<Deal> & { id: string }) => {
      const response = await supabase.functions.invoke("sales-pipeline", {
        method: "PATCH",
        body: deal,
      });
      if (response.error) throw response.error;
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-pipeline"] });
      toast.success("Deal atualizado!");
      setEditingDeal(null);
      setIsDialogOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast.error(`Erro ao atualizar: ${error.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (dealId: string) => {
      const response = await supabase.functions.invoke("sales-pipeline", {
        method: "DELETE",
        body: { id: dealId },
      });
      if (response.error) throw response.error;
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-pipeline"] });
      toast.success("Deal removido!");
    },
    onError: (error) => {
      toast.error(`Erro ao remover: ${error.message}`);
    },
  });

  const resetForm = () => {
    setFormData({
      company: "",
      contact: "",
      stage: "lead",
      probability: 10,
      value: 0,
      expected_close: "",
    });
    setEditingDeal(null);
  };

  const handleEdit = (deal: Deal) => {
    setEditingDeal(deal);
    setFormData({
      company: deal.company,
      contact: deal.contact,
      stage: deal.stage,
      probability: deal.probability,
      value: deal.value,
      expected_close: deal.expected_close?.split("T")[0] || "",
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingDeal) {
      updateMutation.mutate({ id: editingDeal.id, ...formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Pipeline de Vendas</h1>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Pipeline de Vendas</h1>
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive">Erro ao carregar dados: {error.message}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Pipeline de Vendas</h1>
          <p className="text-muted-foreground">Gerencie seus deals e oportunidades</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Novo Deal
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingDeal ? "Editar Deal" : "Novo Deal"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>Empresa</Label>
                <Input
                  value={formData.company}
                  onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label>Contato</Label>
                <Input
                  value={formData.contact}
                  onChange={(e) => setFormData({ ...formData, contact: e.target.value })}
                />
              </div>
              <div>
                <Label>Estágio</Label>
                <Select value={formData.stage} onValueChange={(v) => setFormData({ ...formData, stage: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STAGES.map((stage) => (
                      <SelectItem key={stage.value} value={stage.value}>
                        {stage.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Valor (R$)</Label>
                  <Input
                    type="number"
                    value={formData.value}
                    onChange={(e) => setFormData({ ...formData, value: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <Label>Probabilidade (%)</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={formData.probability}
                    onChange={(e) => setFormData({ ...formData, probability: parseInt(e.target.value) || 0 })}
                  />
                </div>
              </div>
              <div>
                <Label>Previsão de Fechamento</Label>
                <Input
                  type="date"
                  value={formData.expected_close}
                  onChange={(e) => setFormData({ ...formData, expected_close: e.target.value })}
                />
              </div>
              <Button type="submit" className="w-full" disabled={createMutation.isPending || updateMutation.isPending}>
                {editingDeal ? "Atualizar" : "Criar Deal"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total de Deals</CardTitle>
            <Target className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.metrics.total_deals || 0}</div>
            <p className="text-xs text-muted-foreground">{data?.metrics.open_deals || 0} em aberto</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Valor do Pipeline</CardTitle>
            <DollarSign className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">
              R$ {data?.metrics.open_value?.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) || "0,00"}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Valor Ponderado</CardTitle>
            <TrendingUp className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">
              R$ {data?.metrics.weighted_value?.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) || "0,00"}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Win Rate</CardTitle>
            <Users className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.metrics.win_rate || 0}%</div>
            <p className="text-xs text-muted-foreground">
              {data?.metrics.won_deals || 0} ganhos / {data?.metrics.lost_deals || 0} perdidos
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Kanban Board */}
      <div className="grid grid-cols-1 md:grid-cols-7 gap-4 overflow-x-auto">
        {STAGES.map((stage) => (
          <Card key={stage.value} className="min-w-[200px]">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${stage.color}`}></div>
                <CardTitle className="text-sm">{stage.label}</CardTitle>
                <span className="text-xs text-muted-foreground ml-auto">
                  ({data?.deals_by_stage[stage.value]?.length || 0})
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 max-h-96 overflow-y-auto">
              {data?.deals_by_stage[stage.value]?.map((deal) => (
                <div key={deal.id} className="p-3 bg-muted rounded-lg space-y-1 group">
                  <div className="flex justify-between items-start">
                    <p className="font-medium text-sm truncate">{deal.company}</p>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleEdit(deal)}>
                        <Edit className="h-3 w-3" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-6 w-6 text-destructive"
                        onClick={() => deleteMutation.mutate(deal.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">{deal.contact}</p>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-emerald-600">
                      R$ {deal.value?.toLocaleString("pt-BR")}
                    </span>
                    <span className="text-xs bg-background px-1.5 py-0.5 rounded">
                      {deal.probability}%
                    </span>
                  </div>
                </div>
              )) || (
                <p className="text-xs text-muted-foreground text-center py-4">Sem deals</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
