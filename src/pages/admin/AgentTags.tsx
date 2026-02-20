import { useState } from 'react';
import { AdminPageLayout } from '@/components/AdminPageLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tag,
  Plus,
  Trash2,
  Edit2,
  Search,
  Palette,
} from 'lucide-react';
import {
  useAgentTags,
  useCreateTag,
  useUpdateTag,
  useDeleteTag,
  AgentTag,
} from '@/hooks/useAgentTags';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const PRESET_COLORS = [
  '#3b82f6', '#ef4444', '#22c55e', '#f59e0b',
  '#8b5cf6', '#ec4899', '#06b6d4', '#f97316',
  '#14b8a6', '#6366f1', '#84cc16', '#a855f7',
];

export default function AgentTags() {
  const { data: tags, isLoading } = useAgentTags();
  const createTag = useCreateTag();
  const updateTag = useUpdateTag();
  const deleteTag = useDeleteTag();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedTag, setSelectedTag] = useState<AgentTag | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Form state
  const [tagName, setTagName] = useState('');
  const [tagColor, setTagColor] = useState('#3b82f6');
  const [tagDescription, setTagDescription] = useState('');

  const filteredTags = tags?.filter(t =>
    t.name.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const resetForm = () => {
    setTagName('');
    setTagColor('#3b82f6');
    setTagDescription('');
  };

  const handleCreate = async () => {
    if (!tagName.trim()) return;
    await createTag.mutateAsync({
      name: tagName.trim(),
      color: tagColor,
      description: tagDescription.trim() || undefined,
    });
    setIsCreateOpen(false);
    resetForm();
  };

  const handleEdit = async () => {
    if (!selectedTag || !tagName.trim()) return;
    await updateTag.mutateAsync({
      id: selectedTag.id,
      name: tagName.trim(),
      color: tagColor,
      description: tagDescription.trim() || undefined,
    });
    setIsEditOpen(false);
    resetForm();
  };

  const openEdit = (tag: AgentTag) => {
    setSelectedTag(tag);
    setTagName(tag.name);
    setTagColor(tag.color);
    setTagDescription(tag.description || '');
    setIsEditOpen(true);
  };

  const openDelete = (tag: AgentTag) => {
    setSelectedTag(tag);
    setIsDeleteOpen(true);
  };

  return (
    <AdminPageLayout
      title="Tags de Agentes"
      description="Organize seus agentes com tags personalizadas para filtragem rápida"
      icon={Tag}
      actions={
        <Button onClick={() => { resetForm(); setIsCreateOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          Nova Tag
        </Button>
      }
    >
      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar tags..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Tags Grid */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : filteredTags.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Tag className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              {searchTerm ? 'Nenhuma tag encontrada' : 'Nenhuma tag criada ainda'}
            </p>
            {!searchTerm && (
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => { resetForm(); setIsCreateOpen(true); }}
              >
                <Plus className="h-4 w-4 mr-2" />
                Criar primeira tag
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredTags.map((tag) => (
            <Card key={tag.id} className="group hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-4 h-4 rounded-full flex-shrink-0"
                      style={{ backgroundColor: tag.color }}
                    />
                    <CardTitle className="text-base">{tag.name}</CardTitle>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(tag)}>
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => openDelete(tag)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                {tag.description && (
                  <CardDescription className="text-xs mt-1">{tag.description}</CardDescription>
                )}
              </CardHeader>
              <CardContent className="pt-0">
                <Badge
                  variant="secondary"
                  className="text-xs"
                  style={{ backgroundColor: tag.color + '20', color: tag.color }}
                >
                  <Tag className="h-3 w-3 mr-1" />
                  {tag.name}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Criar Nova Tag</DialogTitle>
            <DialogDescription>
              Tags ajudam a organizar e filtrar seus agentes
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome *</Label>
              <Input
                value={tagName}
                onChange={(e) => setTagName(e.target.value)}
                placeholder="Ex: Servidores, Financeiro, Crítico"
                maxLength={50}
              />
            </div>
            <div>
              <Label>Cor</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    className={`w-8 h-8 rounded-full transition-all ${
                      tagColor === c ? 'ring-2 ring-offset-2 ring-primary scale-110' : 'hover:scale-105'
                    }`}
                    style={{ backgroundColor: c }}
                    onClick={() => setTagColor(c)}
                  />
                ))}
              </div>
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea
                value={tagDescription}
                onChange={(e) => setTagDescription(e.target.value)}
                placeholder="Descrição opcional..."
                rows={2}
              />
            </div>
            {/* Preview */}
            <div>
              <Label className="text-xs text-muted-foreground">Preview</Label>
              <div className="mt-1">
                <Badge
                  style={{ backgroundColor: tagColor + '20', color: tagColor }}
                >
                  <Tag className="h-3 w-3 mr-1" />
                  {tagName || 'Nome da tag'}
                </Badge>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={!tagName.trim() || createTag.isPending}>
              {createTag.isPending ? 'Criando...' : 'Criar Tag'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Tag</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome *</Label>
              <Input
                value={tagName}
                onChange={(e) => setTagName(e.target.value)}
                maxLength={50}
              />
            </div>
            <div>
              <Label>Cor</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    className={`w-8 h-8 rounded-full transition-all ${
                      tagColor === c ? 'ring-2 ring-offset-2 ring-primary scale-110' : 'hover:scale-105'
                    }`}
                    style={{ backgroundColor: c }}
                    onClick={() => setTagColor(c)}
                  />
                ))}
              </div>
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea
                value={tagDescription}
                onChange={(e) => setTagDescription(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>Cancelar</Button>
            <Button onClick={handleEdit} disabled={!tagName.trim() || updateTag.isPending}>
              {updateTag.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover Tag</AlertDialogTitle>
            <AlertDialogDescription>
              A tag "{selectedTag?.name}" será removida de todos os agentes. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (selectedTag) {
                  await deleteTag.mutateAsync(selectedTag.id);
                  setIsDeleteOpen(false);
                }
              }}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminPageLayout>
  );
}
