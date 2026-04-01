import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { BookOpen, Plus, Pencil, Trash2, Search } from 'lucide-react';
import { useSoftwareKnowledgeBase, useCreateKnowledgeRule, useUpdateKnowledgeRule, useDeleteKnowledgeRule, SoftwareKnowledgeRule } from '@/hooks/useSoftwareRisk';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const RISK_OPTIONS = [
  { value: 'low', label: 'Baixo', color: 'bg-success/10 text-success' },
  { value: 'medium', label: 'Médio', color: 'bg-amber-500/10 text-amber-600' },
  { value: 'high', label: 'Alto', color: 'bg-orange-500/10 text-orange-600' },
  { value: 'critical', label: 'Crítico', color: 'bg-destructive/10 text-destructive' },
];

const MATCH_TYPE_OPTIONS = [
  { value: 'exact', label: 'Exato', description: 'Nome deve ser idêntico' },
  { value: 'contains', label: 'Contém', description: 'Nome contém o padrão' },
  { value: 'regex', label: 'Regex', description: 'Expressão regular' },
];

const CATEGORY_OPTIONS = ['remote_access', 'p2p', 'browser', 'security', 'utility', 'business', 'meeting', 'messaging', 'development', 'vpn_free', 'adware', 'gaming', 'other'];

const CATEGORY_LABELS: Record<string, string> = {
  remote_access: 'Acesso Remoto', p2p: 'P2P / Torrent', browser: 'Navegador', security: 'Segurança',
  utility: 'Utilitário', business: 'Negócios', meeting: 'Reuniões', messaging: 'Mensagens',
  development: 'Desenvolvimento', vpn_free: 'VPN Gratuita', adware: 'Adware', gaming: 'Jogos', other: 'Outro',
};

interface RuleFormData {
  software_pattern: string; match_type: 'exact' | 'contains' | 'regex';
  category: string; default_risk_level: 'low' | 'medium' | 'high' | 'critical';
  description: string; is_active: boolean;
}

const emptyForm: RuleFormData = { software_pattern: '', match_type: 'contains', category: 'other', default_risk_level: 'low', description: '', is_active: true };

export default function SoftwareKnowledgeBase() {
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<SoftwareKnowledgeRule | null>(null);
  const [formData, setFormData] = useState<RuleFormData>(emptyForm);

  const { data: rules, isLoading } = useSoftwareKnowledgeBase();
  const createMutation = useCreateKnowledgeRule();
  const updateMutation = useUpdateKnowledgeRule();
  const deleteMutation = useDeleteKnowledgeRule();

  const filteredRules = rules?.filter(rule => {
    const matchesSearch = !searchTerm || rule.software_pattern.toLowerCase().includes(searchTerm.toLowerCase()) || rule.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || rule.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const handleCreate = async () => {
    if (!formData.software_pattern.trim()) { toast.error('Padrão de software é obrigatório'); return; }
    await createMutation.mutateAsync({ software_pattern: formData.software_pattern, match_type: formData.match_type, category: formData.category, default_risk_level: formData.default_risk_level, description: formData.description || null, is_active: formData.is_active, vendor_patterns: null });
    setFormData(emptyForm); setIsCreateOpen(false);
  };

  const handleUpdate = async () => {
    if (!editingRule) return;
    await updateMutation.mutateAsync({ id: editingRule.id, software_pattern: formData.software_pattern, match_type: formData.match_type, category: formData.category, default_risk_level: formData.default_risk_level, description: formData.description || null, is_active: formData.is_active });
    setEditingRule(null); setFormData(emptyForm);
  };

  const handleDelete = async (id: string) => { if (!confirm('Remover esta regra de classificação?')) return; await deleteMutation.mutateAsync(id); };

  const openEditDialog = (rule: SoftwareKnowledgeRule) => {
    setFormData({ software_pattern: rule.software_pattern, match_type: rule.match_type, category: rule.category, default_risk_level: rule.default_risk_level, description: rule.description || '', is_active: rule.is_active });
    setEditingRule(rule);
  };

  const RuleFormContent = () => (
    <div className="space-y-4">
      <div className="space-y-2"><Label>Padrão de Software *</Label><Input value={formData.software_pattern} onChange={(e) => setFormData({ ...formData, software_pattern: e.target.value })} placeholder="Ex: TeamViewer, uTorrent" /></div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2"><Label>Tipo de Match</Label><Select value={formData.match_type} onValueChange={(v) => setFormData({ ...formData, match_type: v as RuleFormData['match_type'] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{MATCH_TYPE_OPTIONS.map(opt => <SelectItem key={opt.value} value={opt.value}><div><div>{opt.label}</div><div className="text-xs text-muted-foreground">{opt.description}</div></div></SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2"><Label>Categoria</Label><Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CATEGORY_OPTIONS.map(cat => <SelectItem key={cat} value={cat}>{CATEGORY_LABELS[cat] || cat}</SelectItem>)}</SelectContent></Select></div>
      </div>
      <div className="space-y-2"><Label>Nível de Risco</Label><Select value={formData.default_risk_level} onValueChange={(v) => setFormData({ ...formData, default_risk_level: v as RuleFormData['default_risk_level'] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{RISK_OPTIONS.map(opt => <SelectItem key={opt.value} value={opt.value}><Badge variant="outline" className={cn("gap-1", opt.color)}>{opt.label}</Badge></SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-2"><Label>Descrição</Label><Textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="Descrição opcional da regra" rows={2} /></div>
      <div className="flex items-center justify-between"><Label>Regra Ativa</Label><Switch checked={formData.is_active} onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })} /></div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h2 className="text-3xl font-bold flex items-center gap-2"><BookOpen className="h-8 w-8" />Base de Conhecimento</h2><p className="text-muted-foreground">Regras de classificação automática de software</p></div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild><Button className="gap-2"><Plus className="h-4 w-4" />Nova Regra</Button></DialogTrigger>
          <DialogContent><DialogHeader><DialogTitle>Criar Regra de Classificação</DialogTitle><DialogDescription>Defina um padrão para classificar software automaticamente</DialogDescription></DialogHeader><RuleFormContent /><DialogFooter><Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancelar</Button><Button onClick={handleCreate} disabled={createMutation.isPending}>{createMutation.isPending ? 'Criando...' : 'Criar'}</Button></DialogFooter></DialogContent>
        </Dialog>
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <Card><CardContent className="pt-6"><div className="flex gap-4"><div className="flex-1 relative"><Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Buscar regras..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" /></div><Select value={categoryFilter} onValueChange={setCategoryFilter}><SelectTrigger className="w-48"><SelectValue placeholder="Categoria" /></SelectTrigger><SelectContent><SelectItem value="all">Todas as categorias</SelectItem>{CATEGORY_OPTIONS.map(cat => <SelectItem key={cat} value={cat}>{CATEGORY_LABELS[cat] || cat}</SelectItem>)}</SelectContent></Select></div></CardContent></Card>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card>
          <CardHeader><CardTitle>Regras de Classificação</CardTitle><CardDescription>{filteredRules?.length || 0} regras encontradas</CardDescription></CardHeader>
          <CardContent>
            {isLoading ? <div className="text-center py-8 text-muted-foreground">Carregando...</div> : filteredRules?.length === 0 ? <div className="text-center py-8 text-muted-foreground">Nenhuma regra encontrada</div> : (
              <Table><TableHeader><TableRow><TableHead>Padrão</TableHead><TableHead>Tipo</TableHead><TableHead>Categoria</TableHead><TableHead>Risco</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
                <TableBody>{filteredRules?.map((rule) => { const riskOpt = RISK_OPTIONS.find(r => r.value === rule.default_risk_level); return (<TableRow key={rule.id}><TableCell><div><div className="font-medium font-mono">{rule.software_pattern}</div>{rule.description && <div className="text-xs text-muted-foreground">{rule.description}</div>}</div></TableCell><TableCell><Badge variant="outline">{MATCH_TYPE_OPTIONS.find(m => m.value === rule.match_type)?.label}</Badge></TableCell><TableCell>{CATEGORY_LABELS[rule.category] || rule.category}</TableCell><TableCell><Badge variant="outline" className={cn("gap-1", riskOpt?.color)}>{riskOpt?.label || rule.default_risk_level}</Badge></TableCell><TableCell><Badge variant={rule.is_active ? "default" : "secondary"}>{rule.is_active ? 'Ativo' : 'Inativo'}</Badge></TableCell><TableCell className="text-right"><div className="flex justify-end gap-2"><Button variant="ghost" size="icon" onClick={() => openEditDialog(rule)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDelete(rule.id)}><Trash2 className="h-4 w-4" /></Button></div></TableCell></TableRow>); })}</TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </motion.div>

      <Dialog open={!!editingRule} onOpenChange={(open) => !open && setEditingRule(null)}>
        <DialogContent><DialogHeader><DialogTitle>Editar Regra</DialogTitle><DialogDescription>Modificar regra de classificação</DialogDescription></DialogHeader><RuleFormContent /><DialogFooter><Button variant="outline" onClick={() => setEditingRule(null)}>Cancelar</Button><Button onClick={handleUpdate} disabled={updateMutation.isPending}>{updateMutation.isPending ? 'Salvando...' : 'Salvar'}</Button></DialogFooter></DialogContent>
      </Dialog>
    </div>
  );
}
