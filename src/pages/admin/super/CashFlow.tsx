import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Wallet, Plus, TrendingUp, TrendingDown, DollarSign, Trash2 } from "lucide-react";

const CATEGORIES_INCOME = [
  "Assinaturas",
  "Serviços",
  "Consultoria",
  "Investimento",
  "Outros (Receita)",
];

const CATEGORIES_EXPENSE = [
  "Infraestrutura (Cloud)",
  "Ferramentas / SaaS",
  "Marketing",
  "Salários / Freelancers",
  "Impostos",
  "Jurídico / Contábil",
  "Domínios / Certificados",
  "Outros (Despesa)",
];

interface Transaction {
  id: string;
  type: "income" | "expense";
  category: string;
  description: string;
  amount_cents: number;
  transaction_date: string;
  is_recurring: boolean;
  recurrence_interval: string | null;
  notes: string | null;
  created_at: string;
}

function formatBRL(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function CashFlow() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [filterType, setFilterType] = useState<"all" | "income" | "expense">("all");

  // Form state
  const [form, setForm] = useState({
    type: "expense" as "income" | "expense",
    category: "",
    description: "",
    amount: "",
    transaction_date: new Date().toISOString().split("T")[0],
    is_recurring: false,
    recurrence_interval: "" as string,
    notes: "",
  });

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ["cash-flow-transactions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cash_flow_transactions")
        .select("*")
        .order("transaction_date", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as Transaction[];
    },
  });

  const addMutation = useMutation({
    mutationFn: async (tx: typeof form) => {
      const amountCents = Math.round(parseFloat(tx.amount) * 100);
      if (isNaN(amountCents) || amountCents <= 0) throw new Error("Valor inválido");

      const { error } = await supabase.from("cash_flow_transactions").insert({
        type: tx.type,
        category: tx.category,
        description: tx.description,
        amount_cents: amountCents,
        transaction_date: tx.transaction_date,
        is_recurring: tx.is_recurring,
        recurrence_interval: tx.is_recurring ? tx.recurrence_interval : null,
        notes: tx.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cash-flow-transactions"] });
      toast.success("Transação registrada!");
      setDialogOpen(false);
      setForm({
        type: "expense", category: "", description: "", amount: "",
        transaction_date: new Date().toISOString().split("T")[0],
        is_recurring: false, recurrence_interval: "", notes: "",
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("cash_flow_transactions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cash-flow-transactions"] });
      toast.success("Transação removida");
    },
  });

  const filtered = filterType === "all" ? transactions : transactions.filter((t) => t.type === filterType);

  const totalIncome = transactions.filter((t) => t.type === "income").reduce((s, t) => s + t.amount_cents, 0);
  const totalExpense = transactions.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount_cents, 0);
  const balance = totalIncome - totalExpense;

  const categories = form.type === "income" ? CATEGORIES_INCOME : CATEGORIES_EXPENSE;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fluxo de Caixa"
        description="Controle de receitas e despesas do negócio"
        icon={Wallet}
      >
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" /> Nova Transação</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Registrar Transação</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={form.type === "income" ? "default" : "outline"}
                  onClick={() => setForm({ ...form, type: "income", category: "" })}
                  className={form.type === "income" ? "bg-emerald-600 hover:bg-emerald-700" : ""}
                >
                  <TrendingUp className="h-4 w-4 mr-1" /> Receita
                </Button>
                <Button
                  type="button"
                  variant={form.type === "expense" ? "default" : "outline"}
                  onClick={() => setForm({ ...form, type: "expense", category: "" })}
                  className={form.type === "expense" ? "bg-red-600 hover:bg-red-700" : ""}
                >
                  <TrendingDown className="h-4 w-4 mr-1" /> Despesa
                </Button>
              </div>

              <div>
                <Label>Categoria</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Descrição</Label>
                <Input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Ex: Servidor AWS us-east-1"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Valor (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    placeholder="0,00"
                  />
                </div>
                <div>
                  <Label>Data</Label>
                  <Input
                    type="date"
                    value={form.transaction_date}
                    onChange={(e) => setForm({ ...form, transaction_date: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  checked={form.is_recurring}
                  onCheckedChange={(v) => setForm({ ...form, is_recurring: v })}
                />
                <Label>Recorrente</Label>
                {form.is_recurring && (
                  <Select value={form.recurrence_interval} onValueChange={(v) => setForm({ ...form, recurrence_interval: v })}>
                    <SelectTrigger className="w-32"><SelectValue placeholder="Intervalo" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Mensal</SelectItem>
                      <SelectItem value="quarterly">Trimestral</SelectItem>
                      <SelectItem value="yearly">Anual</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div>
                <Label>Observações</Label>
                <Textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                />
              </div>

              <Button
                className="w-full"
                disabled={!form.category || !form.description || !form.amount || addMutation.isPending}
                onClick={() => addMutation.mutate(form)}
              >
                {addMutation.isPending ? "Salvando..." : "Salvar Transação"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </PageHeader>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
              <TrendingUp className="h-4 w-4 text-emerald-500" /> Receitas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-emerald-500">{formatBRL(totalIncome)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
              <TrendingDown className="h-4 w-4 text-red-500" /> Despesas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-500">{formatBRL(totalExpense)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
              <DollarSign className="h-4 w-4" /> Saldo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${balance >= 0 ? "text-emerald-500" : "text-red-500"}`}>
              {formatBRL(balance)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filter & Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Transações</CardTitle>
          <Select value={filterType} onValueChange={(v) => setFilterType(v as any)}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="income">Receitas</SelectItem>
              <SelectItem value="expense">Despesas</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground text-center py-8">Carregando...</p>
          ) : filtered.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">Nenhuma transação registrada ainda.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell className="whitespace-nowrap">
                      {format(new Date(tx.transaction_date), "dd/MM/yyyy", { locale: ptBR })}
                    </TableCell>
                    <TableCell>
                      <Badge variant={tx.type === "income" ? "default" : "destructive"} className="text-xs">
                        {tx.type === "income" ? "Receita" : "Despesa"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{tx.category}</TableCell>
                    <TableCell className="text-sm max-w-[200px] truncate">
                      {tx.description}
                      {tx.is_recurring && (
                        <Badge variant="outline" className="ml-1 text-[10px]">
                          {tx.recurrence_interval === "monthly" ? "Mensal" : tx.recurrence_interval === "quarterly" ? "Trim." : "Anual"}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className={`text-right font-mono font-medium ${tx.type === "income" ? "text-emerald-500" : "text-red-500"}`}>
                      {tx.type === "income" ? "+" : "-"}{formatBRL(tx.amount_cents)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteMutation.mutate(tx.id)}
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
